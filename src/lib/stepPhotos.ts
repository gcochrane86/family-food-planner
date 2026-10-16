// Makes the AI step photos for a liked recipe, one step at a time (spec §5 Images).
// Lives outside any screen, so a run keeps going when the day sheet closes; opening the recipe again
// joins the run or, if the app was closed, carries on with just the steps that still have no photo.
import { repo } from './repo';

export type Progress = (done: number, total: number, stepId?: string, path?: string) => void;
interface Run { promise: Promise<{ made: number; error: string | null }>; listeners: Set<Progress> }

const running = new Map<string, Run>();

export function makeStepPhotos(recipeId: string, steps: { id?: string; image_path: string | null }[], onProgress: Progress) {
  const existing = running.get(recipeId);
  if (existing) {
    existing.listeners.add(onProgress);
    return existing.promise;
  }
  const listeners = new Set<Progress>([onProgress]);
  const tell: Progress = (...args) => listeners.forEach((l) => l(...args));
  const todo = steps.filter((s): s is { id: string; image_path: null } => !!s.id && !s.image_path);

  const promise = (async () => {
    let made = 0;
    tell(0, todo.length);
    for (const step of todo) {
      try {
        const path = await repo.generateStepPhoto(recipeId, step.id);
        made += 1;
        tell(made, todo.length, step.id, path);
      } catch (e) {
        return { made, error: e instanceof Error ? e.message : String(e) }; // stop at the first failure: no runaway cost
      }
    }
    return { made, error: null };
  })().finally(() => running.delete(recipeId));

  running.set(recipeId, { promise, listeners });
  return promise;
}
