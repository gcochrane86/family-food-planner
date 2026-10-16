import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { RecipeImport } from '../../lib/types';

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** "Add recipe": paste a recipe page's link and Claude, on the owner's Mac, converts it for the household's
 *  portions and equipment. Pasted links show here until dismissed. */
export default function AddRecipe({ householdId }: { householdId: string }) {
  const [imports, setImports] = useState<RecipeImport[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.listImports(householdId).then(setImports, () => setError("Couldn't load your recipe links."));
  }, [householdId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (!/^https?:\/\/\S+$/i.test(link)) { setProblem('Paste a link to the recipe page (starting https://).'); return; }
    setProblem(null);
    try {
      const row = await repo.requestImport(householdId, link, note.trim() || null);
      setImports((list) => [row, ...list]);
      setOpen(false); setUrl(''); setNote('');
    } catch {
      setProblem("Couldn't send that. Check your connection and try again.");
    }
  }

  async function act(id: string, what: 'retry' | 'dismiss') {
    setError(null);
    try {
      if (what === 'retry') {
        await repo.retryImport(id);
        setImports((list) => list.map((x) => (x.id === id ? { ...x, status: 'requested', summary: null } : x)));
      } else {
        await repo.dismissImport(id);
        setImports((list) => list.filter((x) => x.id !== id));
      }
    } catch {
      setError("Couldn't save that. Try again.");
    }
  }

  return (
    <div className="grid gap-2">
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="justify-self-start rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">
          Add recipe
        </button>
      )}
      {open && (
        <form aria-label="Add a recipe from a link" noValidate onSubmit={submit} className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
          <label className="grid gap-1 text-sm font-semibold">
            Recipe link
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
              className="rounded-lg border border-line bg-bg px-3 py-2 text-base font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Anything to change? (optional)
            <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no mushrooms, make it milder"
              className="rounded-lg border border-line bg-bg px-3 py-2 text-base font-normal" />
          </label>
          <p className="m-0 text-sm text-muted">Claude scales it for your household and rewrites the steps for your TM7, APO and air-fryer. It starts within 15 minutes while your Mac is on.</p>
          {problem && <p role="alert" className="m-0 text-sm font-semibold text-warn">{problem}</p>}
          <span className="flex gap-2">
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Add recipe</button>
            <button type="button" onClick={() => { setOpen(false); setProblem(null); }} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
          </span>
        </form>
      )}
      {error && <ErrorBanner message={error} />}
      {imports.map((i) => (
        <div key={i.id} role="status" aria-label={`Recipe from ${host(i.url)}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0">
            <b>{host(i.url)}</b>{' · '}
            {i.status === 'requested' && 'Waiting for Claude. It starts within 15 minutes while your Mac is on.'}
            {i.status === 'importing' && 'Claude is converting it now…'}
            {i.status === 'done' && <span className="text-accent">✓ {i.summary ?? 'Added.'}</span>}
            {i.status === 'failed' && <span className="text-warn">Couldn't add it: {i.summary ?? 'something went wrong.'}</span>}
          </span>
          <span className="flex gap-2">
            {i.status === 'done' && i.recipe_id && (
              <Link to={`/recipes/${i.recipe_id}`} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink no-underline">Open recipe</Link>
            )}
            {i.status === 'failed' && (
              <button type="button" onClick={() => void act(i.id, 'retry')} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Try again</button>
            )}
            {(i.status === 'done' || i.status === 'failed') && (
              <button type="button" aria-label="Dismiss" onClick={() => void act(i.id, 'dismiss')} className="rounded-lg px-2 py-1.5 font-semibold text-muted">×</button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
