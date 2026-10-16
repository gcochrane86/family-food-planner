import { useEffect, useRef, useState } from 'react';
import { repo } from '../../lib/repo';
import type { RecipeRework } from '../../lib/types';

/** "Rework with Claude": the request dialog (while `asking`) and the latest request's progress on the recipe card.
 *  Claude on the owner's Mac picks it up within 15 minutes and rewrites the recipe. */
export default function ReworkRecipe({ recipeId, householdId, asking, onClose }: {
  recipeId: string; householdId: string; asking: boolean; onClose: () => void;
}) {
  const [rework, setRework] = useState<RecipeRework | null>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { repo.getRework(recipeId).then(setRework, () => {}); }, [recipeId]);
  useEffect(() => {
    if (!asking) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [asking, onClose]);

  async function send() {
    const request = text.trim();
    if (!request) { setProblem('Say what should change.'); return; }
    try {
      setRework(await repo.requestRework(householdId, recipeId, request));
      setText(''); setProblem(null); onClose();
    } catch {
      setProblem("Couldn't send that. Check your connection and try again.");
    }
  }

  async function act(what: 'retry' | 'dismiss') {
    if (!rework) return;
    try {
      if (what === 'retry') { await repo.retryRework(rework.id); setRework({ ...rework, status: 'requested', summary: null }); }
      else { await repo.dismissRework(rework.id); setRework(null); }
    } catch { /* leave it as it was; the next visit shows the real state */ }
  }

  return (
    <>
      {rework && (
        <div role="status" aria-label="Rework" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm print:hidden">
          <span>
            {rework.status === 'requested' && 'Waiting for Claude to rework this recipe. It starts within 15 minutes while your Mac is on.'}
            {rework.status === 'working' && 'Claude is reworking this recipe now…'}
            {rework.status === 'done' && <span><b className="text-accent">✓ Reworked.</b> {rework.summary}</span>}
            {rework.status === 'failed' && <span className="text-warn">Couldn't rework it: {rework.summary ?? 'something went wrong.'}</span>}
          </span>
          <span className="flex gap-2">
            {rework.status === 'failed' && <button type="button" onClick={() => void act('retry')} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Try again</button>}
            {(rework.status === 'done' || rework.status === 'failed') && (
              <button type="button" aria-label="Dismiss" onClick={() => void act('dismiss')} className="rounded-lg px-2 py-1.5 font-semibold text-muted">×</button>
            )}
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
            <p className="m-0 text-sm text-muted">Claude rewrites the recipe within about 15 minutes while your Mac is on. For a small change, Edit recipe is quicker.</p>
            {problem && <p role="alert" className="m-0 text-sm font-semibold text-warn">{problem}</p>}
            <span className="flex gap-2">
              <button type="button" onClick={() => void send()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Send to Claude</button>
              <button type="button" onClick={onClose} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
