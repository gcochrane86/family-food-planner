import { useState } from 'react';
import type { Recipe } from '../../lib/types';
import QuickSnack from './QuickSnack';

/** "Add a recipe": four ways in, each opening the Claude app with the request typed in. Claude writes or reads the
 *  recipe (Gemini watches a video), rewrites it for the household, shows it, and adds it through the connector when you
 *  say so, with its main photo. Cookidoo hides the method from anyone not signed in, so its recipe is pasted in
 *  (docs/superpowers/specs/2026-11-21-add-recipe-options-design.md). Quick snacks are added here too. */
type Way = 'create' | 'youtube' | 'web' | 'cookidoo';
const WAYS: [Way, string, string][] = [
  ['create', 'Create with Claude', 'Describe it; Claude writes it to your house rules'],
  ['youtube', 'From a YouTube video', 'Gemini watches it for Claude'],
  ['web', 'From a website', 'A recipe page'],
  ['cookidoo', 'From Cookidoo', 'Paste it in from Cookidoo'],
];
/** The longest pasted recipe, so the link to the Claude app stays a size it takes. */
const MAX_PASTE = 6000;
const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s);
const isYouTube = (s: string) => /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i.test(s);
const isCookidoo = (s: string) => /^https?:\/\/([a-z0-9-]+\.)*cookidoo\.[a-z.]+\//i.test(s);

const box = 'rounded-lg border border-line bg-bg px-3 py-2 text-base font-normal';
const field = 'grid gap-1 text-sm font-semibold';
const quiet = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold';

export default function AddRecipe({ householdId, onSnackAdded }: { householdId: string; onSnackAdded: (r: Recipe) => void }) {
  const [open, setOpen] = useState(false);
  const [way, setWay] = useState<Way | null>(null);
  const [link, setLink] = useState('');
  const [part, setPart] = useState('');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  /** A Cookidoo recipe: kept as Cookidoo has it, or rewritten for the household's kit. */
  const [asIs, setAsIs] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  function reset() { setWay(null); setLink(''); setPart(''); setNote(''); setText(''); setAsIs(true); setProblem(null); }
  const change = () => (note.trim() ? ` ${note.trim()}` : '');

  /** The request for the Claude app, or why it can't go yet. */
  function request(): { ask: string } | { problem: string } {
    const url = link.trim();
    if (way === 'create') {
      if (!text.trim()) return { problem: 'Say what you would like.' };
      return { ask: `Create a new recipe for the Family Food Planner: ${text.trim()}` };
    }
    if (way === 'youtube') {
      if (!isYouTube(url)) return { problem: 'Paste a YouTube link (youtube.com or youtu.be).' };
      return { ask: `Add this recipe to the Family Food Planner: ${url}${part.trim() ? ` (${part.trim()})` : ''}.${change()}` };
    }
    if (way === 'cookidoo') {
      if (!isCookidoo(url)) return { problem: 'Paste the Cookidoo link (from the recipe page).' };
      if (!text.trim()) return { problem: 'Paste the recipe in from Cookidoo too.' };
      const how = asIs
        ? " Keep it exactly as Cookidoo has it: the same ingredients, amounts, steps and Thermomix settings, only put into the app's format."
        : ' Rewrite it for our household and kit, as for any other recipe.';
      return { ask: `Add this Cookidoo recipe to the Family Food Planner (source_url ${url}).${how}${change()} Here it is, pasted from Cookidoo:\n\n${text.trim()}` };
    }
    if (!isLink(url)) return { problem: 'Paste a link to the recipe page (starting https://).' };
    return { ask: `Add this recipe to the Family Food Planner: ${url}.${change()}` };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = request();
    if ('problem' in r) { setProblem(r.problem); return; }
    window.open(`https://claude.ai/new?q=${encodeURIComponent(r.ask)}`, '_blank', 'noopener');
    reset(); setOpen(false);
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-2xl bg-accent font-bold text-accent-ink">Add a recipe</button>;
  }

  if (!way) {
    return (
      <div role="group" aria-label="Add a recipe" className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
        <p className="m-0 font-semibold">Add a recipe</p>
        {WAYS.map(([key, label, hint]) => (
          <button key={key} type="button" onClick={() => setWay(key)} className="grid rounded-xl bg-surface-2 px-3 py-2.5 text-left">
            <span className="font-semibold">{label}</span>
            <span className="text-[12.5px] text-muted">{hint}</span>
          </button>
        ))}
        <span className="flex flex-wrap items-start gap-2">
          <QuickSnack householdId={householdId} onAdded={(r) => { onSnackAdded(r); setOpen(false); }} />
          <button type="button" onClick={() => setOpen(false)} className={quiet}>Cancel</button>
        </span>
      </div>
    );
  }

  const title = WAYS.find(([k]) => k === way)![1];
  return (
    <form aria-label={title} noValidate onSubmit={submit} className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
      <p className="m-0 font-semibold">{title}</p>
      {way === 'create' ? (
        <label className={field}>
          What would you like?
          <textarea rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. a quick salmon traybake the little one will eat" className={box} />
        </label>
      ) : (
        <label className={field}>
          {way === 'youtube' ? 'Video link' : way === 'cookidoo' ? 'Cookidoo link' : 'Recipe link'}
          <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={box} />
        </label>
      )}
      {way === 'youtube' && (
        <label className={field}>
          Which part? (optional, for a long video)
          <input type="text" maxLength={200} value={part} onChange={(e) => setPart(e.target.value)} placeholder='e.g. "the curry, from 1:12:00"' className={box} />
        </label>
      )}
      {way === 'cookidoo' && (
        <label className={field}>
          The recipe, pasted from Cookidoo
          <textarea rows={6} maxLength={MAX_PASTE} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="On the recipe page in Cookidoo: select all, copy, and paste here" className={box} />
          <span className="text-xs font-normal text-muted">Cookidoo only shows the method when you're signed in, so Claude needs it pasted. Up to {MAX_PASTE.toLocaleString('en-GB')} characters.</span>
        </label>
      )}
      {way === 'cookidoo' && (
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">How should it come in?</legend>
          {([[true, 'Keep it as Cookidoo has it', 'The same ingredients, amounts, steps and settings'],
            [false, 'Rewrite it for our kit', 'Claude adapts it to your household and equipment, as for other recipes']] as const).map(([v, label, hint]) => (
            <label key={label} className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <input type="radio" name="cookidoo-how" checked={asIs === v} onChange={() => setAsIs(v)} className="mt-1" />
              <span><span className="block text-sm font-semibold">{label}</span><span className="block text-[12.5px] text-muted">{hint}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      {way !== 'create' && (
        <label className={field}>
          Anything to change? (optional)
          <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no mushrooms, make it milder" className={box} />
        </label>
      )}
      <p className="m-0 text-sm text-muted">It opens the Claude app: Claude {way === 'create' ? 'writes it for your household and kit' : way === 'cookidoo' && asIs ? "puts it in the app's format" : 'rewrites it for your household and kit'} and shows you the recipe. Say "add it" and it's saved here with its main photo.</p>
      {problem && <p role="alert" className="m-0 text-sm font-semibold text-warn">{problem}</p>}
      <span className="flex gap-2">
        <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">{way === 'create' ? 'Create with Claude' : 'Add with Claude'}</button>
        <button type="button" onClick={reset} className={quiet}>Back</button>
      </span>
    </form>
  );
}
