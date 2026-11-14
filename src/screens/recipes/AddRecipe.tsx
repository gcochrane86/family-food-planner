import { useState } from 'react';

/** "Add recipe": a recipe page or YouTube link (and anything to change) opens the Claude app with it typed in. Claude
 *  reads it (Gemini watches a video), rewrites it for the household, shows it, and adds it through the connector when
 *  you say so, with its main photo (docs/superpowers/specs/2026-11-14-recipe-import-in-claude-design.md). */
export default function AddRecipe(_props: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (!/^https?:\/\/\S+$/i.test(link)) { setProblem('Paste a link to the recipe page or video (starting https://).'); return; }
    setProblem(null);
    const ask = `Add this recipe to the Family Food Planner: ${link}.${note.trim() ? ` ${note.trim()}` : ''}`;
    window.open(`https://claude.ai/new?q=${encodeURIComponent(ask)}`, '_blank', 'noopener');
    setOpen(false); setUrl(''); setNote('');
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
          <p className="-mt-1 m-0 text-xs text-muted">A recipe page, or a YouTube video (Gemini watches it; for a long one, say which part, e.g. "the curry, from 1:12:00").</p>
          <label className="grid gap-1 text-sm font-semibold">
            Anything to change? (optional)
            <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no mushrooms, make it milder"
              className="rounded-lg border border-line bg-bg px-3 py-2 text-base font-normal" />
          </label>
          <p className="m-0 text-sm text-muted">It opens the Claude app: Claude rewrites it for your household and kit and shows you the recipe. Say "add it" and it's saved here with its main photo.</p>
          {problem && <p role="alert" className="m-0 text-sm font-semibold text-warn">{problem}</p>}
          <span className="flex gap-2">
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Add with Claude</button>
            <button type="button" onClick={() => { setOpen(false); setProblem(null); }} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
          </span>
        </form>
      )}
    </div>
  );
}
