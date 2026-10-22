import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import { planRoast, type RoastPartRecipe } from '../../lib/roast';
import { CHRISTMAS_MAINS, DONENESS, MAINS, parseRoastChoice, parseRoastPart, suits, type Doneness, type RoastChoice, type RoastMain } from '../../lib/roastModel';
import type { Recipe } from '../../lib/types';
import { useAsync } from '../settings/useAsync';
import HeroImage from './HeroImage';

/** The sides each main starts with. Beef is the household's own roast (11 Oct 2026). Christmas starts with the
 *  classics until the household adds Christmas sides of its own (22 Oct 2026). */
const CHRISTMAS_SIDES = ['goose-fat-roasties', 'honey-citrus-carrots', 'braised-red-cabbage', 'greens-and-peas', 'sage-onion-stuffing-balls', 'bread-sauce', 'roast-gravy'];
export const DEFAULT_SIDES: Record<RoastMain, string[]> = {
  turkey: CHRISTMAS_SIDES,
  ham: CHRISTMAS_SIDES,
  beef: ['goose-fat-roasties', 'yorkshire-puddings', 'roast-mash', 'honey-citrus-carrots', 'bay-parsnips', 'cauliflower-cheese', 'roast-gravy'],
  chicken: ['goose-fat-roasties', 'honey-citrus-carrots', 'bay-parsnips', 'greens-and-peas', 'sage-onion-stuffing-balls', 'bread-sauce', 'roast-gravy'],
  lamb: ['goose-fat-roasties', 'honey-citrus-carrots', 'greens-and-peas', 'braised-red-cabbage', 'mint-sauce', 'roast-gravy'],
};
const NAME: Record<RoastMain, string> = { beef: 'Beef', chicken: 'Chicken', lamb: 'Lamb', turkey: 'Turkey', ham: 'Ham' };
type Occasion = 'sunday' | 'christmas';
// Christmas phases go by the day.
const CHRISTMAS_PHASE: Record<string, string> = {
  'Two days before': '23 December', 'Day before': 'Christmas Eve', 'Morning prep': 'Christmas morning', 'Out and about': 'Late morning',
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Build a roast: pick a main, sides, people and when to eat, and get one plan for that exact combination. */
export default function RoastBuilder() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, error, loading, reload } = useAsync(() => repo.listRecipes(hid), [hid]);
  const parts = useMemo(() => new Map((data ?? []).filter((r: Recipe) => parseRoastPart(r.roast)).map((r: Recipe) => [r.slug, r as RoastPartRecipe & Recipe])), [data]);
  // Opened from a planned roast (the day sheet), it starts with that combination.
  const [params] = useSearchParams();
  const start = parseRoastChoice({
    occasion: params.get('occasion'), main: params.get('main'), mains: (params.get('mains') ?? '').split(',').filter(Boolean),
    sides: (params.get('sides') ?? '').split(',').filter(Boolean), people: Number(params.get('people')), serve: params.get('serve'),
    cut: params.get('cut'), doneness: params.get('doneness'),
  });
  const [cut, setCut] = useState<string | null>(start?.cut ?? null);
  const [doneness, setDoneness] = useState<Doneness | null>(start?.doneness ?? null);
  const [occasion, setOccasion] = useState<Occasion>(start?.occasion ?? 'sunday');
  const [mains, setMains] = useState<RoastMain[]>(start?.mains ?? [start?.main ?? 'beef']);
  const main = mains[0];
  const [sides, setSides] = useState<string[]>(start?.sides ?? DEFAULT_SIDES.beef);
  const [people, setPeople] = useState(start?.people ?? 6);
  const [serve, setServe] = useState(start?.serve ?? '13:30');
  const [prepAt, setPrepAt] = useState('08:45');
  const christmasDay = useMemo(() => `${new Date().getUTCFullYear()}-12-25`, []);
  const days = useMemo(() => {
    const next = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + i); return isoDay(d); });
    return occasion === 'christmas' && !next.includes(christmasDay) ? [...next, christmasDay] : next;
  }, [occasion, christmasDay]);
  const [day, setDay] = useState(() => (start?.occasion === 'christmas' ? christmasDay : days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0) ?? days[0]));
  const [added, setAdded] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const mainPart = (m: RoastMain) => [...parts.values()].find((p) => { const r = parseRoastPart(p.roast)!; return r.part === 'main' && r.mains.includes(m); });
  const sideParts = [...parts.values()].filter((p) => { const r = parseRoastPart(p.roast)!; return r.part === 'side' && mains.some((m) => suits(r, m)); });
  const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const extras = mains.slice(1).map((m) => mainPart(m)?.slug).filter((s): s is string => !!s);
  // The meat's cuts (brisket, silverside, ribeye…): each a main of its own. The first is the default.
  const cuts = [...parts.values()].filter((p) => { const r = parseRoastPart(p.roast)!; return r.part === 'main' && r.mains.includes(main); });
  const cutPart = cuts.find((p) => p.slug === cut) ?? cuts[0];
  const cutDesc = cutPart ? parseRoastPart(cutPart.roast) : null;
  const how: Doneness | null = cutDesc?.doneness ? doneness ?? cutDesc.doneness : null;
  const choice: RoastChoice = {
    main, sides: sides.filter((s) => sideParts.some((p) => p.slug === s)), people, serve,
    ...(occasion === 'christmas' ? { occasion } : {}), ...(mains.length > 1 ? { mains, extras } : {}),
    ...(cuts.length > 1 && cutPart ? { cut: cutPart.slug } : {}), ...(how ? { doneness: how } : {}),
  };
  const plan = validTime(serve) && validTime(prepAt) ? planRoast({ ...choice, prepAt }, parts) : null;
  const phaseName = (n: string) => (occasion === 'christmas' ? CHRISTMAS_PHASE[n] ?? n : n);

  function pickMain(m: RoastMain) {
    if (occasion === 'sunday') { setMains([m]); setSides(DEFAULT_SIDES[m]); setCut(null); setDoneness(null); return; }
    // Christmas: any of the meats, at least one.
    setMains((list) => (list.includes(m) ? (list.length > 1 ? list.filter((x) => x !== m) : list) : [...list, m]));
  }
  function pickOccasion(o: Occasion) {
    if (o === occasion) return;
    setOccasion(o);
    const first = o === 'christmas' ? 'turkey' : 'beef';
    setMains([first]);
    setSides(DEFAULT_SIDES[first]);
    if (o === 'christmas') { setDay(christmasDay); setServe('14:00'); setPeople((n) => Math.max(n, 8)); }
  }
  const toggle = (slug: string) => setSides((list) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]));

  async function addToDay() {
    const m = cutPart ?? mainPart(main);
    if (!m || !plan) return;
    setProblem(null);
    try {
      await repo.addRoast(hid, day, choice, m.id);
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
      <h1 className="text-3xl font-bold">{occasion === 'christmas' ? 'Christmas dinner' : 'Build a roast'}</h1>
      <div role="tablist" aria-label="Occasion" className="flex w-max gap-1 rounded-xl bg-surface-2 p-1 print:hidden">
        {(['sunday', 'christmas'] as const).map((o) => (
          <button key={o} type="button" role="tab" aria-selected={occasion === o} onClick={() => pickOccasion(o)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${occasion === o ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
            {o === 'sunday' ? 'Sunday roast' : 'Christmas dinner'}
          </button>
        ))}
      </div>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <p className="text-muted">Loading…</p>}
      {data && parts.size === 0 && <p className="text-muted">No roast parts in your recipes yet.</p>}

      {parts.size > 0 && (
        <>
          <div className="grid gap-2 print:hidden">
            <h2 className="text-lg font-bold">{occasion === 'christmas' ? 'The meats (one or both)' : 'The main'}</h2>
            <div className="grid grid-cols-3 gap-2.5">
              {(occasion === 'christmas' ? CHRISTMAS_MAINS : MAINS).map((m) => {
                const r = mainPart(m);
                return (
                  <button key={m} type="button" aria-label={NAME[m]} aria-pressed={mains.includes(m)} disabled={!r} onClick={() => pickMain(m)} className={pill(mains.includes(m))}>
                    {r && <HeroImage recipe={r} className="aspect-[4/3] w-full" />}
                    <span className="block px-3 py-2 font-bold">{NAME[m]}{r ? <span className="block text-xs font-semibold text-muted">{r.title}</span> : null}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {occasion === 'sunday' && cuts.length > 1 && (
            <div className="grid gap-2 print:hidden">
              <div role="group" aria-label="Cut" className="flex flex-wrap gap-1.5">
                {cuts.map((p) => {
                  const on = p === cutPart;
                  return (
                    <button key={p.slug} type="button" aria-pressed={on} onClick={() => { setCut(p.slug); setDoneness(null); }}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}>
                      {parseRoastPart(p.roast)!.cut ?? p.title}
                    </button>
                  );
                })}
              </div>
              {how ? (
                <div role="radiogroup" aria-label="How do you like it?" className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-semibold">How do you like it?</span>
                  {DONENESS.filter((d) => cutDesc!.steps.some((st) => st.byDoneness?.[d.value] !== undefined) || d.value === cutDesc!.doneness).map((d) => (
                    <label key={d.value} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 ${how === d.value ? 'border-accent bg-accent-soft font-semibold' : 'border-line bg-surface'}`}>
                      <input type="radio" name="doneness" aria-label={d.label} className="sr-only" checked={how === d.value} onChange={() => setDoneness(d.value)} />
                      {d.label} <span className="text-xs text-muted">{d.core}°C</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-sm text-muted">Slow-cooked</p>
              )}
            </div>
          )}

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
            <section key={ph.name} aria-label={phaseName(ph.name)} className="grid gap-2">
              <h2 className="text-xl font-bold">{phaseName(ph.name)}</h2>
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
            <button type="button" disabled={!plan} onClick={() => void addToDay()} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">Add to the week</button>
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-line bg-surface px-4 py-2 font-semibold">Print</button>
            {added && <p role="status" className="m-0 w-full text-sm font-semibold text-accent">Added to {dayName(added)}. The shopping list includes every part.</p>}
            {problem && <p role="alert" className="m-0 w-full text-sm font-semibold text-warn">{problem}</p>}
          </div>
        </>
      )}
    </section>
  );
}
