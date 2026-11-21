import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { householdPortions } from '../../lib/household';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';
import { useAsync } from '../settings/useAsync';
import AddRecipe from './AddRecipe';
import { GROUPS, isOnePan, recipeGroups, type RecipeGroup } from '../../lib/recipeGroups';
import HeroImage from './HeroImage';
import { easyTonight, type EasyTonight } from '../../lib/easyTonight';
import type { Staple } from '../../lib/types';
import { SAVE_ERROR } from '../settings/useAsync';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Makes a recipe a day's lunch (from the + on the day's lunch options), at the household's portions. */
async function saveLunchRecipe(hid: string, date: string, recipeId: string): Promise<void> {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const [{ slots }, members] = await Promise.all([repo.getWeek(hid, d.toISOString().slice(0, 10)), repo.listMembers(hid)]);
  const lunch = slots.find((s) => s.date === date && s.slot === 'lunch');
  if (!lunch) throw new Error('That day has no lunch in the plan.');
  await repo.saveSlots([{ ...lunch, mode: 'cook', recipe_id: recipeId, portions: householdPortions(members), source_date: null, routine_choice: null, reason: null }]);
}

export default function RecipeLibrary() {
  const { householdId } = useAuth();
  const navigate = useNavigate();
  // Opened from a day's lunch options: tapping a recipe makes it that day's lunch.
  const lunchFor = useSearchParams()[0].get('lunch');
  const lunchDay = lunchFor && /^\d{4}-\d{2}-\d{2}$/.test(lunchFor) ? WEEKDAYS[new Date(`${lunchFor}T00:00:00Z`).getUTCDay()] : null;
  const [pickError, setPickError] = useState<string | null>(null);
  async function pickLunch(r: Recipe) {
    setPickError(null);
    try { await saveLunchRecipe(householdId!, lunchFor!, r.id); navigate(-1); } catch { setPickError(SAVE_ERROR); }
  }
  const { data, setData, error, loading, reload } = useAsync(() => repo.listRecipes(householdId!), [householdId], { keep: `ffp.recipes.${householdId}` });
  const [photos, setPhotos] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Quick snacks have no picture.
  const missing = (data ?? []).filter((r) => !r.hero_image_path && !r.quick);

  /** Makes photos one at a time and stops at the first failure, so a problem can't run up a bill. */
  async function makePhotos() {
    const todo = missing;
    setPhotos('running');
    setPhotoError(null);
    let made = 0;
    for (const r of todo) {
      setProgress(made);
      try {
        const path = await repo.generateHero(r.id);
        made++;
        setData((list) => (list ?? []).map((x) => (x.id === r.id ? { ...x, hero_image_path: path, hero_image_source: 'generated' } : x)));
      } catch (e) {
        setPhotoError(`Stopped after ${made} of ${todo.length}: ${e instanceof Error ? e.message : String(e)}`);
        setPhotos('idle');
        return;
      }
    }
    setPhotos('done');
  }
  const [group, setGroup] = useState<RecipeGroup | null>(null);
  const [onePan, setOnePan] = useState(false);
  const [query, setQuery] = useState('');

  const all = data ?? [];
  const inGroup = (r: Recipe, g: RecipeGroup) => recipeGroups(r).includes(g);
  // Easy tonight: weeknight dinners the cupboard and a walk to the Spar can cover.
  const [easy, setEasy] = useState(false);
  const [cupboard, setCupboard] = useState<{ names: Record<string, string[]>; staples: Staple[] } | null>(null);
  const [onSpar, setOnSpar] = useState<string[]>([]);
  const [sparError, setSparError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([repo.listIngredientNames(householdId!), repo.listStaples(householdId!)])
      .then(([names, staples]) => { if (live) setCupboard({ names, staples }); })
      .catch(() => { /* Easy tonight just shows no count */ });
    return () => { live = false; };
  }, [householdId]);
  const fits = new Map<string, EasyTonight>();
  let bigShop = 0;
  if (cupboard) for (const r of all.filter((x) => inGroup(x, 'weeknight'))) {
    const f = easyTonight((cupboard.names[r.id] ?? []).map((name) => ({ name })), cupboard.staples);
    if (f.bigShop.length === 0) fits.set(r.id, f); else bigShop++;
  }
  async function addToSpar(r: Recipe, items: string[]) {
    setSparError(null);
    try {
      for (const name of items) await repo.addQuick(householdId!, name, `For ${r.title}`);
      setOnSpar((x) => [...x, r.id]);
    } catch {
      setSparError(SAVE_ERROR);
    }
  }

  const pick = (g: RecipeGroup | null) => { setGroup(g); setOnePan(false); setEasy(false); };
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = all.filter((r) => {
    const text = [r.title, r.subtitle ?? '', ...r.tags].join(' ').toLowerCase();
    return words.every((w) => text.includes(w)) && (!group || inGroup(r, group)) && (!onePan || isOnePan(r)) && (!easy || fits.has(r.id));
  });
  // One-pan and foil-bag dinners first, then the fewest things to fetch.
  const shown = easy
    ? [...matched].sort((a, b) => Number(isOnePan(b)) - Number(isOnePan(a)) || fits.get(a.id)!.spar.length - fits.get(b.id)!.spar.length)
    : matched;
  const chips: { key: string; label: string; count: number | null; on: boolean; tap: () => void; sub?: boolean }[] = [
    { key: 'all', label: 'All', count: all.length, on: !group && !easy, tap: () => pick(null) },
    { key: 'easy', label: 'Easy tonight', count: cupboard ? fits.size : null, on: easy, tap: () => { pick(null); setEasy(true); } },
    ...GROUPS.flatMap((g) => {
      const mine = all.filter((r) => inGroup(r, g.key));
      const chip = { key: g.key, label: g.label, count: mine.length, on: group === g.key, tap: () => pick(g.key) };
      return g.key === 'weeknight' && group === 'weeknight'
        ? [chip, { key: 'one-pan', label: 'One-pan', count: mine.filter(isOnePan).length, on: onePan, tap: () => setOnePan((x) => !x), sub: true }]
        : [chip];
    }),
  ];
  const narrowed = !!group || easy || words.length > 0;

  return (
    <section className="grid gap-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">Recipes</h1>
        {data && data.length > 0 && <span className="text-sm font-semibold text-muted">{narrowed ? `${shown.length} of ${all.length} recipes` : `${all.length} recipes`}</span>}
      </div>
      {lunchDay && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-accent-ink">
          <span className="grid"><b>Pick {lunchDay}'s lunch</b><span className="text-sm opacity-90">Tap a recipe to have it for lunch</span></span>
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-ink">Cancel</button>
        </div>
      )}
      {pickError && <ErrorBanner message={pickError} />}
      {!lunchDay && <AddRecipe householdId={householdId!} onSnackAdded={(r) => setData((list) => [...(list ?? []), r])} />}
      <input type="search" aria-label="Search recipes" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-base" />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <button key={c.key} type="button" aria-pressed={c.on} onClick={c.tap}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold ${c.sub ? 'border-dashed' : ''} ${c.on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'}`}>
            {c.sub && <span aria-hidden="true">↳ </span>}{c.label} {c.count !== null && <span className={c.on ? 'opacity-70' : 'text-muted'}>{c.count}</span>}
          </button>
        ))}
        <Link to="/recipes/roast" className="whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold no-underline">Roasts</Link>
      </div>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {photoError && <ErrorBanner message={photoError} />}
      {sparError && <ErrorBanner message={sparError} />}
      {easy && <p className="m-0 text-sm text-muted">Dinners you can make from the cupboard plus a walk to the Spar for everyday things.
        {bigShop > 0 && <> <span className="font-semibold text-ink">{bigShop} more {bigShop === 1 ? 'needs' : 'need'} the big shop</span></>}</p>}
      {photos === 'done' && missing.length === 0 && <p className="text-sm font-semibold text-accent">All recipes have photos.</p>}
      {missing.length > 0 && photos !== 'done' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          <span>
            {photos === 'running'
              ? `Making photos… ${progress + 1} of ${missing.length + progress}`
              : `${missing.length} recipe${missing.length === 1 ? ' has' : 's have'} no photo yet (about £${(missing.length * 0.034 * 0.79).toFixed(2)}).`}
          </span>
          {photos === 'idle' && (
            <button type="button" onClick={() => setPhotos('confirm')} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Make photos</button>
          )}
          {photos === 'confirm' && (
            <span className="flex gap-2">
              <button type="button" onClick={() => void makePhotos()} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">
                Make {missing.length} photo{missing.length === 1 ? '' : 's'}
              </button>
              <button type="button" onClick={() => setPhotos('idle')} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Cancel</button>
            </span>
          )}
        </div>
      )}
      {loading && !error && <p className="text-muted">Loading…</p>}
      {!loading && !error && data?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="font-semibold">No recipes yet</p>
          <p className="mt-1 text-sm text-muted">Your recipes appear here once they've been imported.</p>
        </div>
      )}
      {!loading && data && data.length > 0 && shown.length === 0 && <p className="text-muted">No recipes match.</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {shown.map((r) => (
          <li key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            {lunchDay && (
              <button type="button" aria-label={`Use ${r.title} for lunch`} onClick={() => void pickLunch(r)}
                className="order-last m-3 mt-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Use for lunch</button>
            )}
            <Link to={`/recipes/${r.id}`} className="flex flex-1 flex-col no-underline">
              <HeroImage recipe={r} className="aspect-[4/3] w-full" />
              <span className="grid gap-1 p-3">
                <span className="font-display text-[17px] font-semibold leading-tight">{r.title}</span>
                <span className="flex flex-wrap gap-x-3 text-[12.5px] text-muted">
                  <span><b className="text-ink">{r.finish_minutes}</b> min dinner</span>
                  {r.prep_minutes > 0 && <span><b className="text-ink">{r.prep_minutes}</b> min prep</span>}
                </span>
              </span>
            </Link>
            {easy && fits.has(r.id) && <EasyLine fit={fits.get(r.id)!} added={onSpar.includes(r.id)} onAdd={() => void addToSpar(r, fits.get(r.id)!.spar)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** On an Easy tonight card: what to fetch from the Spar, what can be skipped, and a tap to put it on the Spar list. */
function EasyLine({ fit, added, onAdd }: { fit: EasyTonight; added: boolean; onAdd: () => void }) {
  return (
    <div className="grid justify-items-start gap-1.5 border-t border-line px-3 py-2.5 text-[13px]">
      {fit.spar.length === 0
        ? <span className="font-semibold text-accent">All in the cupboard</span>
        : <span>From the Spar: {fit.spar.join(', ')}</span>}
      {fit.skip.length > 0 && <span className="text-muted">Skip if they've none: {fit.skip.join(', ')}</span>}
      {fit.spar.length > 0 && (added
        ? <span className="font-semibold text-accent">On the Spar list</span>
        : <button type="button" onClick={onAdd} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-semibold">Add {fit.spar.length} to the Spar list</button>)}
    </div>
  );
}
