import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';
import { useAsync } from '../settings/useAsync';
import AddRecipe from './AddRecipe';
import QuickSnack from './QuickSnack';
import { GROUPS, isOnePan, recipeGroups, type RecipeGroup } from '../../lib/recipeGroups';
import HeroImage from './HeroImage';

export default function RecipeLibrary() {
  const { householdId } = useAuth();
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
  const pick = (g: RecipeGroup | null) => { setGroup(g); setOnePan(false); };
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((r) => {
    const text = [r.title, r.subtitle ?? '', ...r.tags].join(' ').toLowerCase();
    return words.every((w) => text.includes(w)) && (!group || inGroup(r, group)) && (!onePan || isOnePan(r));
  });
  const chips: { key: string; label: string; count: number; on: boolean; tap: () => void; sub?: boolean }[] = [
    { key: 'all', label: 'All', count: all.length, on: !group, tap: () => pick(null) },
    ...GROUPS.flatMap((g) => {
      const mine = all.filter((r) => inGroup(r, g.key));
      const chip = { key: g.key, label: g.label, count: mine.length, on: group === g.key, tap: () => pick(g.key) };
      return g.key === 'weeknight' && group === 'weeknight'
        ? [chip, { key: 'one-pan', label: 'One-pan', count: mine.filter(isOnePan).length, on: onePan, tap: () => setOnePan((x) => !x), sub: true }]
        : [chip];
    }),
  ];
  const narrowed = !!group || words.length > 0;

  return (
    <section className="grid gap-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">Recipes</h1>
        {data && data.length > 0 && <span className="text-sm font-semibold text-muted">{narrowed ? `${shown.length} of ${all.length} recipes` : `${all.length} recipes`}</span>}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <AddRecipe householdId={householdId!} />
        <QuickSnack householdId={householdId!} onAdded={(r) => setData((list) => [...(list ?? []), r])} />
        <Link to="/recipes/roast" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold no-underline">Build a roast</Link>
      </div>
      <input type="search" aria-label="Search recipes" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-base" />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <button key={c.key} type="button" aria-pressed={c.on} onClick={c.tap}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold ${c.sub ? 'border-dashed' : ''} ${c.on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'}`}>
            {c.sub && <span aria-hidden="true">↳ </span>}{c.label} <span className={c.on ? 'opacity-70' : 'text-muted'}>{c.count}</span>
          </button>
        ))}
      </div>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {photoError && <ErrorBanner message={photoError} />}
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
          <li key={r.id}>
            <Link to={`/recipes/${r.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface no-underline">
              <HeroImage recipe={r} className="aspect-[4/3] w-full" />
              <span className="grid gap-1 p-3">
                <span className="font-display text-[17px] font-semibold leading-tight">{r.title}</span>
                <span className="flex flex-wrap gap-x-3 text-[12.5px] text-muted">
                  <span><b className="text-ink">{r.finish_minutes}</b> min dinner</span>
                  {r.prep_minutes > 0 && <span><b className="text-ink">{r.prep_minutes}</b> min prep</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
