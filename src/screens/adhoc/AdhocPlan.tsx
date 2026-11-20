import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { weekMealsToPick, type WeekPick } from '../../lib/adhoc';
import { householdPortions } from '../../lib/household';
import { formatPortions } from '../settings/Household';
import { repo } from '../../lib/repo';
import type { AdhocMeal, Recipe } from '../../lib/types';
import { SAVE_ERROR, useAsync } from '../settings/useAsync';
import { weekStarts } from '../week/useWeek';

const MEALS = [['lunch', 'Lunch'], ['dinner', 'Dinner']] as const;
const quiet = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold';
const loud = 'rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink';

/** The Plan tab in ad-hoc: the meals a quick trip to the shops is for, with no days. Shop makes their list. */
export default function AdhocPlan() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(async () => {
    const [adhoc, recipes, members, week] = await Promise.all([
      repo.listAdhoc(hid), repo.listRecipes(hid), repo.listMembers(hid), repo.getWeek(hid, weekStarts().thisWeek)]);
    const portions = householdPortions(members);
    // This week's cooked meals, to pick from when the week has slipped.
    const fromWeek = week.week ? weekMealsToPick(week.slots, recipes, portions) : null;
    return { meals: adhoc.meals, items: adhoc.items.length, ticks: adhoc.ticks.size, recipes, portions, fromWeek };
  }, [hid]);
  const [banner, setBanner] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<Recipe | null>(null);
  const [clearing, setClearing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const inPlan = (p: WeekPick) => !!data?.meals.some((m) => m.recipe_id === p.recipe_id && m.meal === p.meal);
  // Every recipe names its meal (an archived one too); only active ones can be added.
  const byId = new Map((data?.recipes ?? []).map((r) => [r.id, r]));
  const active = (data?.recipes ?? []).filter((r) => r.status === 'active');
  const setMeals = (f: (m: AdhocMeal[]) => AdhocMeal[]) => setData((d) => (d ? { ...d, meals: f(d.meals) } : d));

  async function add(meal: 'lunch' | 'dinner') {
    if (!data || !picked) return;
    setBanner(null);
    try {
      const saved = await repo.addAdhocMeal(hid, picked.id, meal, data.portions);
      setMeals((m) => [...m, saved]);
      setAdding(false); setPicked(null); setFind('');
    } catch { setBanner(SAVE_ERROR); }
  }

  /** Adds the ticked meals from the week, one by one; any that saved stay if a later one fails. */
  async function addFromWeek() {
    if (!data?.fromWeek) return;
    setBanner(null);
    for (const p of data.fromWeek.filter((x) => chosen.has(x.key))) {
      try {
        const saved = await repo.addAdhocMeal(hid, p.recipe_id, p.meal, p.portions);
        setMeals((m) => [...m, saved]);
        setChosen((c) => { const n = new Set(c); n.delete(p.key); return n; });
      } catch { setBanner(SAVE_ERROR); return; }
    }
    setPicking(false); setChosen(new Set());
  }

  async function remove(m: AdhocMeal) {
    setBanner(null);
    setMeals((list) => list.filter((x) => x.id !== m.id));
    try {
      await repo.removeAdhocMeal(m.id);
      // The last of the plan gone: clear it, so its ticks and cupboard answers don't carry over to the next trip.
      if (data && data.meals.length === 1 && data.items === 0) { await repo.clearAdhoc(hid); setData((d) => (d ? { ...d, ticks: 0 } : d)); }
    } catch { setMeals((list) => [...list, m]); setBanner(SAVE_ERROR); }
  }

  async function clear() {
    setBanner(null);
    try { await repo.clearAdhoc(hid); setData((d) => (d ? { ...d, meals: [], items: 0, ticks: 0 } : d)); setClearing(false); } catch { setBanner(SAVE_ERROR); }
  }

  const q = find.trim().toLowerCase();
  const matches = q ? active.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 8) : [];

  return (
    <section className="grid gap-4 py-4">
      <div>
        <h1 className="text-3xl font-bold">Ad-hoc plan</h1>
        <p className="m-0 mt-1 text-sm text-muted">The meals for a quick shop. Your weekly plan is kept. Switch back in Settings.</p>
      </div>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {banner && <ErrorBanner message={banner} />}
      {loading && !error && <p className="text-muted">Loading…</p>}
      {data && (
        <>
          {data.items > 0 && <p className="m-0 text-sm text-muted">Plus {data.items} item{data.items === 1 ? '' : 's'} added on the shop.</p>}
          {data.meals.length === 0 && (
            <p className="m-0 rounded-2xl border border-dashed border-line p-6 font-semibold">Nothing planned yet. Add a meal here or from a recipe.</p>
          )}
          {MEALS.map(([key, label]) => {
            const list = data.meals.filter((m) => m.meal === key);
            return list.length > 0 && (
              <section key={key} aria-label={label} className="grid gap-2">
                <h2 className="m-0 text-xl font-bold">{label}</h2>
                <ul className="m-0 list-none divide-y divide-line rounded-2xl border border-line bg-surface p-0">
                  {list.map((m) => {
                    const title = byId.get(m.recipe_id)?.title ?? 'A recipe';
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <Link to={`/recipes/${m.recipe_id}`} className="min-w-0 flex-1 no-underline">
                          <span className="block font-semibold">{title}</span>
                          <span className="block text-[12.5px] text-muted">{formatPortions(m.portions)} portions</span>
                        </Link>
                        <button type="button" aria-label={`Remove ${title}`} onClick={() => void remove(m)} className="text-sm font-semibold text-muted underline">Remove</button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {adding ? (
            <div className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
              {picked ? (
                <>
                  <p className="m-0 font-semibold">{picked.title}</p>
                  <span className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void add('lunch')} className={loud}>Add as lunch</button>
                    <button type="button" onClick={() => void add('dinner')} className={loud}>Add as dinner</button>
                    <button type="button" onClick={() => setPicked(null)} className={quiet}>Back</button>
                  </span>
                </>
              ) : (
                <>
                  <input type="search" aria-label="Find a recipe" placeholder="Find a recipe" value={find} onChange={(e) => setFind(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5" autoFocus />
                  {matches.map((r) => (
                    <button key={r.id} type="button" onClick={() => setPicked(r)} className="rounded-xl bg-surface-2 px-3 py-2 text-left font-semibold">{r.title}</button>
                  ))}
                  {q && matches.length === 0 && <p className="m-0 text-sm text-muted">No recipe has that in its name.</p>}
                  <button type="button" onClick={() => { setAdding(false); setFind(''); }} className={`${quiet} justify-self-start`}>Cancel</button>
                </>
              )}
            </div>
          ) : picking ? (
            <div role="group" aria-label="From this week" className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
              <p className="m-0 font-semibold">From this week</p>
              {!data.fromWeek ? <p className="m-0 text-sm text-muted">There's no plan for this week.</p>
                : data.fromWeek.length === 0 ? <p className="m-0 text-sm text-muted">This week has no meals to cook.</p>
                : data.fromWeek.map((p) => {
                  const added = inPlan(p);
                  return (
                    <label key={p.key} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                      <input type="checkbox" checked={added || chosen.has(p.key)} disabled={added}
                        onChange={(e) => setChosen((c) => { const n = new Set(c); if (e.target.checked) n.add(p.key); else n.delete(p.key); return n; })} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{p.day} · {p.title}</span>
                        <span className="block text-[12.5px] text-muted">{p.meal === 'lunch' ? 'Lunch' : 'Dinner'} · {formatPortions(p.portions)} portions</span>
                      </span>
                      {added && <span className="text-sm text-muted">Added</span>}
                    </label>
                  );
                })}
              <span className="flex flex-wrap gap-2">
                {chosen.size > 0 && <button type="button" onClick={() => void addFromWeek()} className={loud}>Add {chosen.size} to the plan</button>}
                <button type="button" onClick={() => { setPicking(false); setChosen(new Set()); }} className={quiet}>Cancel</button>
              </span>
            </div>
          ) : (
            <span className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAdding(true)} className="min-h-11 rounded-2xl bg-accent font-bold text-accent-ink">Add a meal</button>
              <button type="button" onClick={() => setPicking(true)} className="min-h-11 rounded-2xl border border-line bg-surface font-bold">From this week</button>
            </span>
          )}
          {(data.meals.length > 0 || data.items > 0 || data.ticks > 0) && (clearing ? (
            <div role="group" aria-label="Clear the plan?" className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
              <p className="m-0">This clears the ad-hoc meals, the items you added and what's ticked on its shop. Your weekly plan stays.</p>
              <span className="flex gap-2">
                <button type="button" onClick={() => void clear()} className={loud}>Yes, clear it</button>
                <button type="button" onClick={() => setClearing(false)} className={quiet}>Cancel</button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setClearing(true)} className="justify-self-start text-sm font-semibold text-muted underline">Clear the plan</button>
          ))}
        </>
      )}
    </section>
  );
}
