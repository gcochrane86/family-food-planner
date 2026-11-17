import { useEffect, useRef, useState } from 'react';
import { repo } from '../../lib/repo';
import type { RecipeRework } from '../../lib/types';

/** The Claude app, asked to rework one recipe through the Family Food Planner connector (get_recipe_to_rework,
 *  rework_recipe). */
export function reworkUrl(title: string, request: string): string {
  const ask = `Rework my recipe "${title}" in the Family Food Planner. What should change: ${request.trim()}`;
  return `https://claude.ai/new?q=${encodeURIComponent(ask)}`;
}

/** "Rework with Claude": the request dialog (while `asking`) and the latest request on the recipe card. Sending opens
 *  the Claude app, which saves the reworked recipe once the household approves it there; coming back to the app picks
 *  that up (`onReworked` reloads the recipe). */
export default function ReworkRecipe({ recipeId, title, householdId, asking, onClose, onReworked }: {
  recipeId: string; title: string; householdId: string; asking: boolean; onClose: () => void; onReworked?: () => void;
}) {
  const [rework, setRework] = useState<RecipeRework | null>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const status = useRef<string | null>(null);
  const reworked = useRef(onReworked);
  reworked.current = onReworked;

  useEffect(() => {
    let live = true;
    const check = () => repo.getRework(recipeId).then((w) => {
      if (!live) return;
      // A request still open when the page was opened, now done: the recipe changed underneath.
      if (w?.status === 'done' && (status.current === 'requested' || status.current === 'working')) reworked.current?.();
      status.current = w?.status ?? null;
      setRework(w);
    }, () => {});
    void check();
    const onBack = () => { if (document.visibilityState !== 'hidden' && (status.current === 'requested' || status.current === 'working')) void check(); };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => { live = false; window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onBack); };
  }, [recipeId]);
  useEffect(() => {
    if (!asking) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [asking, onClose]);

  const openClaude = (request: string) => window.open(reworkUrl(title, request), '_blank', 'noopener');

  async function send() {
    const request = text.trim();
    if (!request) { setProblem('Say what should change.'); return; }
    // Opened before anything is awaited, so the phone doesn't block it; the request carries what Claude needs.
    openClaude(request);
    try {
      const w = await repo.requestRework(householdId, recipeId, request);
      status.current = w.status;
      setRework(w);
    } catch {
      setRework({ id: '', household_id: householdId, recipe_id: recipeId, request, status: 'requested', summary: null, requested_at: '', started_at: null, finished_at: null } as RecipeRework);
      status.current = 'requested';
    }
    setText(''); setProblem(null); onClose();
  }

  async function act(what: 'retry' | 'dismiss') {
    if (!rework) return;
    if (what === 'retry') openClaude(rework.request);
    try {
      if (what === 'retry') { await repo.retryRework(rework.id); status.current = 'requested'; setRework({ ...rework, status: 'requested', summary: null }); }
      else { if (rework.id) await repo.dismissRework(rework.id); status.current = null; setRework(null); }
    } catch { /* leave it as it was; the next visit shows the real state */ }
  }

  const open = rework && (rework.status === 'requested' || rework.status === 'working');
  return (
    <>
      {rework && (
        <div role="status" aria-label="Rework" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm print:hidden">
          <span>
            {open && <>Reworking in the Claude app. Approve the change there and it's saved here. <a href={reworkUrl(title, rework.request)} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">Open Claude again</a></>}
            {rework.status === 'done' && <span><b className="text-accent">✓ Reworked.</b> {rework.summary}</span>}
            {rework.status === 'failed' && <span className="text-warn">Couldn't rework it: {rework.summary ?? 'something went wrong.'}</span>}
          </span>
          <span className="flex gap-2">
            {rework.status === 'failed' && <button type="button" onClick={() => void act('retry')} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Try again</button>}
            <button type="button" aria-label="Dismiss" onClick={() => void act('dismiss')} className="rounded-lg px-2 py-1.5 font-semibold text-muted">×</button>
          </span>
        </div>
      )}
      {asking && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" onClick={onClose}>
          <div role="dialog" aria-modal="true" aria-label="Rework this recipe" onClick={(e) => e.stopPropagation()}
            className="grid w-full max-w-md gap-3 rounded-2xl bg-surface p-5 shadow-xl">
            <h2 className="m-0 text-xl font-bold">Rework this recipe</h2>
            <label className="grid gap-1 text-sm font-semibold">
              What should change?
              <textarea ref={box} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Use the Anova oven for the chicken instead of the TM7"
                className="min-h-24 rounded-lg border border-line bg-bg px-3 py-2 text-base font-normal" />
            </label>
            <p className="m-0 text-sm text-muted">Claude rewrites it in the Claude app and shows you the changes; it's saved here when you approve. For a small change, Edit recipe is quicker.</p>
            {problem && <p role="alert" className="m-0 text-sm font-semibold text-warn">{problem}</p>}
            <span className="flex gap-2">
              <button type="button" onClick={() => void send()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Open the Claude app</button>
              <button type="button" onClick={onClose} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
