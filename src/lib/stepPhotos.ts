// Makes the AI step photos for a liked recipe, one step at a time (spec §5 Images).
// Lives outside any screen, so a run keeps going when the day sheet closes; opening the recipe again
// joins the run or, if the app was closed, carries on with just the steps that still have no photo.
import { repo } from './repo';
import { isCartoonStep } from '../../supabase/functions/_shared/stepPhoto.ts';

type StepLike = { id?: string; image_path: string | null; image_source?: string | null };
/** An AI step photo from before the cartoon style, to be drawn again. Your own photos are never touched. */
export const needsRedraw = (s: StepLike) => !!s.image_path && s.image_source === 'generated' && !isCartoonStep(s.image_path);

export type Progress = (done: number, total: number, stepId?: string, path?: string) => void;
interface Run { promise: Promise<{ made: number; error: string | null }>; listeners: Set<Progress> }

const running = new Map<string, Run>();

/** `asked`: chosen from the recipe's ⚙︎ menu after seeing the cost, so the recipe needn't be 👍. */
export function makeStepPhotos(recipeId: string, steps: StepLike[], onProgress: Progress,
  { asked = false, hints = {} as Record<string, string>, redraw = false } = {}) {
  const existing = running.get(recipeId);
  if (existing) {
    existing.listeners.add(onProgress);
    return existing.promise;
  }
  const listeners = new Set<Progress>([onProgress]);
  const tell: Progress = (...args) => listeners.forEach((l) => l(...args));
  // `redraw`: older realistic photos too, made again in the cartoon style.
  const todo = steps.filter((s): s is StepLike & { id: string } => !!s.id && (!s.image_path || (redraw && needsRedraw(s))));

  const promise = (async () => {
    let made = 0;
    tell(0, todo.length);
    for (const step of todo) {
      try {
        const hint = hints[step.id]?.trim();
        const again = !!step.image_path;
        const path = hint ? await repo.generateStepPhoto(recipeId, step.id, again, asked, { hint })
          : await repo.generateStepPhoto(recipeId, step.id, again, asked);
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
