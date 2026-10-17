import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import { planRoast, type RoastPartRecipe } from '../../lib/roast';
import { MAINS, parseRoastPart, type RoastMain } from '../../lib/roastModel';
import type { Recipe } from '../../lib/types';
import { useAsync } from '../settings/useAsync';
import HeroImage from './HeroImage';

/** The sides each main starts with. Beef is the household's own roast (11 Oct 2026). */
export const DEFAULT_SIDES: Record<RoastMain, string[]> = {
  beef: ['goose-fat-roasties', 'yorkshire-puddings', 'roast-mash', 'honey-citrus-carrots', 'bay-parsnips', 'cauliflower-cheese', 'roast-gravy'],
  chicken: ['goose-fat-roasties', 'honey-citrus-carrots', 'bay-parsnips', 'greens-and-peas', 'sage-onion-stuffing-balls', 'bread-sauce', 'roast-gravy'],
  lamb: ['goose-fat-roasties', 'honey-citrus-carrots', 'greens-and-peas', 'braised-red-cabbage', 'mint-sauce', 'roast-gravy'],
};
const NAME: Record<RoastMain, string> = { beef: 'Beef', chicken: 'Chicken', lamb: 'Lamb' };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Build a roast: pick a main, sides, people and when to eat, and get one plan for that exact combination. */
export default function RoastBuilder() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, error, loading, reload } = useAsync(() => repo.listRecipes(hid), [hid]);
  const parts = useMemo(() => new Map((data ?? []).filter((r: Recipe) => parseRoastPart(r.roast)).map((r: Recipe) => [r.slug, r as RoastPartRecipe & Recipe])), [data]);
  const [main, setMain] = useState<RoastMain>('beef');
  const [sides, setSides] = useState<string[]>(DEFAULT_SIDES.beef);
  const [people, setPeople] = useState(6);
  const [serve, setServe] = useState('13:30');
  const [prepAt, setPrepAt] = useState('08:45');
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + i); return isoDay(d); }), []);
  const [day, setDay] = useState(() => days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0) ?? days[0]);
  const [added, setAdded] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const mainPart = (m: RoastMain) => [...parts.values()].find((p) => { const r = parseRoastPart(p.roast)!; return r.part === 'main' && r.mains.includes(m); });
  const sideParts = [...parts.values()].filter((p) => { const r = parseRoastPart(p.roast)!; return r.part === 'side' && r.mains.includes(main); });
  const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const plan = validTime(serve) && validTime(prepAt) ? planRoast({ main, sides: sides.filter((s) => sideParts.some((p) => p.slug === s)), people, serve, prepAt }, parts) : null;

  function pickMain(m: RoastMain) { setMain(m); setSides(DEFAULT_SIDES[m]); }
  const toggle = (slug: string) => setSides((list) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]));

  async function addToDay() {
    const m = mainPart(main);
    if (!m) return;
    setProblem(null);
    try {
      await repo.addRoast(hid, day, { main, sides: sides.filter((s) => sideParts.some((p) => p.slug === s)), people, serve }, m.id);
      setAdded(day);
    } catch (e) {
      setProblem(e instanceof Error && e.message === 'no_week' ? `There's no plan for the week of ${dayName(day)} yet. Plan that week first, then add the roast.` : "Couldn't add it. Check your connection and try again.");
    }
  }

  const card = 'rounded-2xl border border-line bg-surface';
  const pill = (on: boolean) => `overflow-hidden rounded-2xl border-[3px] bg-surface text-left ${on ? 'border-accent' : 'border-transparent'}`;
  return (
    <section className="grid gap-5 py-4">
      <Link to="/recipes" className="text-sm font-semibold text-muted no-underline print:hidden">← Recipes</Link>
      <h1 className="text-3xl font-bold">Build a roast</h1>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <p className="text-muted">Loading…</p>}
      {data && parts.size === 0 && <p className="text-muted">No roast parts in your recipes yet.</p>}

      {parts.size > 0 && (
        <>
          <div className="grid gap-2 print:hidden">
            <h2 className="text-lg font-bold">The main</h2>
            <div className="grid grid-cols-3 gap-2.5">
              {MAINS.map((m) => {
                const r = mainPart(m);
                return (
                  <button key={m} type="button" aria-label={NAME[m]} aria-pressed={main === m} disabled={!r} onClick={() => pickMain(m)} className={pill(main === m)}>
                    {r && <HeroImage recipe={r} className="aspect-[4/3] w-full" />}
                    <span className="block px-3 py-2 font-bold">{NAME[m]}{r ? <span className="block text-xs font-semibold text-muted">{r.title}</span> : null}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div role="group" aria-label="Sides" className="grid gap-2 print:hidden">
            <h2 className="text-lg font-bold">Sides</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
              {sideParts.map((p) => (
                <button key={p.slug} type="button" aria-label={p.title} aria-pressed={sides.includes(p.slug)} onClick={() => toggle(p.slug)} className={pill(sides.includes(p.slug))}>
                  <HeroImage recipe={p} className="aspect-[4/3] w-full" />
                  <span className="block px-3 py-2 text-sm font-bold leading-snug">{p.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`${card} flex flex-wrap items-end gap-4 p-4 print:hidden`}>
            <span className="grid gap-1 text-sm font-semibold">People
              <span className="flex items-center gap-2">
                <button type="button" aria-label="Fewer people" disabled={people <= 1} onClick={() => setPeople((n) => Math.max(1, n - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-lg font-bold disabled:opacity-40">−</button>
                <b className="min-w-[2ch] text-center tabular-nums">{people}</b>
                <button type="button" aria-label="More people" disabled={people >= 40} onClick={() => setPeople((n) => Math.min(40, n + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-lg font-bold disabled:opacity-40">+</button>
              </span>
            </span>
            <label className="grid gap-1 text-sm font-semibold">Eat at<input type="time" value={serve} onChange={(e) => setServe(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2 text-base" /></label>
            <label className="grid gap-1 text-sm font-semibold">Prep from<input type="time" value={prepAt} onChange={(e) => setPrepAt(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2 text-base" /></label>
          </div>

          {plan && plan.warnings.length > 0 && (
            <div role="alert" className="grid gap-1 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
              {plan.warnings.map((w) => <p key={w} className="m-0">{w}</p>)}
            </div>
          )}

          {plan && plan.phases.map((ph) => (
            <section key={ph.name} aria-label={ph.name} className="grid gap-2">
              <h2 className="text-xl font-bold">{ph.name}</h2>
              {ph.steps.length === 0 && <p className="m-0 text-muted">{ph.name === 'Out and about' ? 'Nothing to do: everything holds or waits in the fridge.' : 'Nothing at this point.'}</p>}
              <ol className="m-0 grid list-none gap-2 p-0">
                {ph.steps.map((s) => {
                  const r = parts.get(s.part);
                  return (
                    <li key={`${s.part}-${s.title}`} aria-label={`${s.time} ${s.partTitle}: ${s.title}`} className={`${card} grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 p-2.5 md:grid-cols-[110px_minmax(0,1fr)]`}>
                      {r && <HeroImage recipe={r} className="aspect-square w-full rounded-xl" />}
                      <span className="grid gap-0.5">
                        <span className="font-mono text-sm font-bold">{s.time}{s.quick ? ' · quick job' : ''}</span>
                        <b className="leading-snug">{s.partTitle}: {s.title}</b>
                        {s.kit && <span className="text-sm text-muted">{s.kit}{s.trays ? ` · ${s.trays} shel${s.trays === 1 ? 'f' : 'ves'}` : ''}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {plan && (
            <section aria-label="Kit timeline" className="grid gap-2">
              <h2 className="text-xl font-bold">Kit timeline</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(plan.kit).map(([kit, rows]) => (
                  <div key={kit} className={`${card} p-3`}>
                    <h3 className="m-0 mb-1 text-sm font-bold uppercase tracking-[0.06em] text-muted">{kit}</h3>
                    <ul className="m-0 grid list-none gap-0.5 p-0 text-sm">{rows.map((k) => <li key={k.time + k.label}><span className="font-mono font-bold">{k.time}</span> {k.label}</li>)}</ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className={`${card} flex flex-wrap items-end gap-3 p-4 print:hidden`}>
            <label className="grid gap-1 text-sm font-semibold">Day
              <select value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2 text-base">
                {days.map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void addToDay()} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink">Add to the week</button>
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-line bg-surface px-4 py-2 font-semibold">Print</button>
            {added && <p role="status" className="m-0 w-full text-sm font-semibold text-accent">Added to {dayName(added)}. The shopping list includes every part.</p>}
            {problem && <p role="alert" className="m-0 w-full text-sm font-semibold text-warn">{problem}</p>}
          </div>
        </>
      )}
    </section>
  );
}
