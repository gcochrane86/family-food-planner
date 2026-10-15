import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';
import { useAsync } from '../settings/useAsync';
import HeroImage from './HeroImage';

const FILTERS: { label: string; test: (r: Recipe) => boolean }[] = [
  { label: 'All', test: () => true },
  { label: 'TM7', test: (r) => r.equipment.includes('tm7') },
  { label: '≤30 min', test: (r) => r.finish_minutes <= 30 },
  { label: 'Make-ahead', test: (r) => r.prep_minutes > 0 },
  { label: 'Reheats well', test: (r) => r.reheats_well },
  { label: 'Toddler OK', test: (r) => r.toddler_ok },
  { label: 'Components', test: (r) => r.kind === 'component' },
];

const SOURCE: Record<Recipe['source'], string> = { own_doc: 'Your recipe', hellofresh: 'HelloFresh, converted', claude: 'New · written by Claude' };

export default function RecipeLibrary() {
  const { householdId } = useAuth();
  const { data, error, loading, reload } = useAsync(() => repo.listRecipes(householdId!), [householdId]);
  const [filters, setFilters] = useState<string[]>([]);

  const toggle = (label: string) =>
    setFilters((f) => (label === 'All' ? [] : f.includes(label) ? f.filter((x) => x !== label) : [...f, label]));
  const shown = (data ?? []).filter((r) => filters.every((f) => FILTERS.find((x) => x.label === f)!.test(r)));

  return (
    <section className="grid gap-4 py-4">
      <h1 className="text-3xl font-bold">Recipes</h1>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const on = f.label === 'All' ? filters.length === 0 : filters.includes(f.label);
          return (
            <button key={f.label} type="button" aria-pressed={on} onClick={() => toggle(f.label)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'}`}>
              {f.label}
            </button>
          );
        })}
      </div>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !error && <p className="text-muted">Loading…</p>}
      {!loading && !error && data?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="font-semibold">No recipes yet</p>
          <p className="mt-1 text-sm text-muted">Your recipes appear here once they've been imported.</p>
        </div>
      )}
      {!loading && data && data.length > 0 && shown.length === 0 && <p className="text-muted">No recipes match those filters.</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {shown.map((r) => (
          <li key={r.id}>
            <Link to={`/recipes/${r.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface no-underline">
              <HeroImage recipe={r} className="aspect-[4/3] w-full" />
              <span className="grid gap-1 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {SOURCE[r.source]}{r.status === 'draft' ? ' · draft' : ''}
                </span>
                <span className="font-display text-[17px] font-semibold leading-tight">{r.title}</span>
                <span className="flex flex-wrap gap-x-3 text-[12.5px] text-muted">
                  <span><b className="text-ink">{r.finish_minutes}</b> min dinner</span>
                  {r.prep_minutes > 0 && <span><b className="text-ink">{r.prep_minutes}</b> min prep</span>}
                  {r.toddler_ok && <span>Toddler OK</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
