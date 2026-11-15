import { useState } from 'react';
import type { Macro, Mark, Nutrition, TargetState } from '../../../supabase/functions/_shared/balance.ts';
import type { WeekState } from './useWeek';

const MARK: Record<Mark, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'text-accent' },
  low: { label: 'Low', className: 'text-warn' },
  unknown: { label: 'Not known', className: 'text-muted' },
};
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

/** In a day's sheet: the day's snacks and how it measures up (breakfast protein, veg and fruit, healthy fats, fibre). */
export function DayBalanceCard({ date, w }: { date: string; w: WeekState }) {
  const b = w.balance(date);
  // Each person's snacks that day, with when they're made.
  const snacks = w.eatsOn(date).filter((e) => e.slot === 'snack_am' || e.slot === 'snack_pm');
  const byPerson = [...new Set(snacks.map((e) => e.member_id))];
  const [away, setAway] = useState(false);
  const [adding, setAdding] = useState(false);
  const fix = away ? null : w.nudge(date);
  const [adding2, setAdding2] = useState(false);
  if (!b && !snacks.length && !fix && !w.week) return null;
  const rows: [string, Mark | undefined, string][] = b ? [
    ['Breakfast protein', b.breakfastProtein, 'about 25g or more'],
    ['Veg & fruit', b.vegFruit, '5 or more portions, at least half veg'],
    ['Healthy fats', b.healthyFat, 'olive oil, oily fish, nuts or seeds, avocado'],
    ['Fibre', b.fibre, 'about 30g'],
  ] : [];
  return (
    <section aria-label="Balance" className="grid gap-2 rounded-2xl bg-surface px-4 py-3 shadow-sm">
      <h3 className="m-0 text-base font-bold">Balance</h3>
      {fix && (
        <div role="region" aria-label="Suggestion" className="grid gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-sm">
          <p className="m-0">{fix.name} is {fix.gap}{UNIT[fix.macro]} under {WORD[fix.macro]}: add {fix.title} as {fix.slot === 'snack_am' ? 'a morning' : 'an afternoon'} snack?</p>
          <span className="flex flex-wrap gap-2">
            <button type="button" disabled={adding} className="rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-ink disabled:opacity-60"
              onClick={() => { setAdding(true); void w.addSnack(date, fix.memberId, fix.recipe_id, fix.slot).finally(() => setAdding(false)); }}>Yes, add it</button>
            <button type="button" className="rounded-xl border border-line bg-surface px-3.5 py-2 font-semibold" onClick={() => setAway(true)}>Not now</button>
          </span>
        </div>
      )}
      {byPerson.map((id) => (
        <p key={id} className="m-0 text-sm">{w.memberName(id)}: {snacks.filter((e) => e.member_id === id).sort((x, y) => x.slot.localeCompare(y.slot)).map((e, i) => {
          const r = w.recipes.get(e.recipe_id);
          const when = e.slot === 'snack_am' ? 'morning' : 'afternoon';
          const made = r?.quick ? 'bought' : e.make_date === date ? 'made today' : `made ${e.make_date < w.weekStart ? 'Sunday' : weekdayOf(e.make_date)}`;
          return (
            <span key={e.id ?? `${e.slot}${i}`}>{i > 0 && ' · '}{`${when} ${e.qty} × ${r?.title ?? 'snack'} (${made}${e.added_by === 'household' ? ', added by you' : ''})`}
              {e.id && <button type="button" aria-label={`Remove ${w.memberName(id)}'s ${when} ${r?.title ?? 'snack'}`} onClick={() => void w.removeSnack(e.id!)}
                className="ml-1 rounded-full px-1.5 text-muted">✕</button>}
            </span>
          );
        })}</p>
      ))}
      {w.week && (adding2
        ? <AddSnack date={date} w={w} onDone={() => setAdding2(false)} />
        : <button type="button" onClick={() => setAdding2(true)} className="justify-self-start text-sm font-semibold text-accent underline">+ Add a snack</button>)}
      {rows.length > 0 && (
        <ul className="m-0 grid list-none gap-1 p-0 text-sm">
          {rows.map(([label, mark, aim]) => (
            <li key={label} className="flex items-baseline justify-between gap-3">
              <span><span>{label}</span> <span className="text-[12px] text-muted">({aim})</span></span>
              <span className={`font-semibold ${MARK[mark ?? 'unknown'].className}`}>{MARK[mark ?? 'unknown'].label}</span>
            </li>
          ))}
        </ul>
      )}
      <PeopleTable date={date} w={w} />
      {rows.length > 0 && <p className="m-0 text-[12px] text-muted">Estimates from the ingredients, for spotting patterns. The markers are for an adult's share.</p>}
    </section>
  );
}

const ROWS: [Macro, string, string][] = [
  ['kcal', 'Calories', ''], ['protein_g', 'Protein', 'g'], ['fat_g', 'Fat', 'g'], ['sat_fat_g', 'Saturated fat', 'g'],
  ['carbs_g', 'Carbs', 'g'], ['sugars_g', 'Sugars', 'g'], ['fibre_g', 'Fibre', 'g'], ['salt_g', 'Salt', 'g'],
];
const STATE: Record<TargetState, string> = { under: 'text-warn', over: 'text-warn', ok: 'text-accent', unknown: 'text-muted' };
const round = (k: Macro, v: number) => (k === 'salt_g' ? Math.round(v * 10) / 10 : Math.round(v));

/** Each person's day: their totals, against their own targets where they've set them. */
function PeopleTable({ date, w }: { date: string; w: WeekState }) {
  const people = w.people(date);
  if (!people.length) return null;
  return (
    <div className="overflow-x-auto">
      <table aria-label="Each person" className="w-full border-collapse text-[13px]">
        <thead>
          <tr><th className="py-1 text-left font-semibold text-muted"><span className="sr-only">Number</span></th>
            {people.map((p) => <th key={p.id} scope="col" className="py-1 text-right font-semibold">{p.name}</th>)}</tr>
        </thead>
        <tbody>
          {ROWS.map(([k, label, unit]) => (
            <tr key={k} className="border-t border-line">
              <th scope="row" className="py-1 text-left font-normal">{label}</th>
              {people.map((p) => {
                const v = p.totals[k];
                const t = p.targets[k];
                const state = p.states[k];
                const shown = v === undefined ? '–' : `${p.unknown.includes(k) ? '≥' : ''}${round(k, v)}${typeof t === 'number' ? ` / ${t}` : ''}${unit}`;
                return <td key={p.id} className={`whitespace-nowrap py-1 pl-2 text-right tabular-nums ${state ? STATE[state] : ''}`}>{shown}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const UNIT: Partial<Record<Macro, string>> = { kcal: ' kcal', protein_g: 'g', fibre_g: 'g' };
const WORD: Partial<Record<Macro, string>> = { kcal: 'calories', protein_g: 'protein', fat_g: 'fat', sat_fat_g: 'saturated fat', carbs_g: 'carbs', sugars_g: 'sugars', fibre_g: 'fibre', salt_g: 'salt' };

/** Under a meal: its numbers for one person's share, e.g. "Each adult: 625 kcal · 25g protein · …". */
export function MealNumbers({ n, share, who = 'Each adult' }: { n: Nutrition | null | undefined; share: number; who?: string }) {
  if (n === undefined) return null;
  if (n === null) return <span className="text-[13px] text-muted">No estimate yet</span>;
  const g = (v: number | undefined, label: string) => (typeof v === 'number' ? `${Math.round(v * share)}g ${label}` : null);
  const parts = [
    typeof n.kcal === 'number' ? `${Math.round(n.kcal * share)} kcal` : null,
    g(n.protein_g, 'protein'), g(n.fat_g, 'fat'), g(n.carbs_g, 'carbs'), g(n.sugars_g, 'sugars'), g(n.fibre_g, 'fibre'),
  ].filter(Boolean);
  return <span className="text-[13px] text-muted tabular-nums">{who}: {parts.join(' · ')}</span>;
}

/** "+ Add a snack": who (one or more people), morning or afternoon, which snack, and how many each. */
function AddSnack({ date, w, onDone }: { date: string; w: WeekState; onDone: () => void }) {
  const [who, setWho] = useState<string[]>([]);
  const [slot, setSlot] = useState<'snack_am' | 'snack_pm'>('snack_am');
  const [recipe, setRecipe] = useState(w.snackRecipes[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people = w.people(date).length ? w.people(date) : w.members.map((m) => ({ id: m.id, name: m.name }));
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const wrong = await w.addSnacks(date, who, recipe, slot, Number(qty.replace(',', '.')));
    setBusy(false);
    if (wrong) setProblem(wrong); else onDone();
  }
  if (!w.snackRecipes.length) {
    return <p className="m-0 text-sm text-muted">No snacks yet: add one on the Recipes tab (Quick snack, or "Can be a snack" on a recipe).</p>;
  }
  return (
    <form aria-label="Add a snack" onSubmit={(e) => void add(e)} className="grid gap-2 rounded-xl border border-line p-3 text-sm">
      <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0"><legend className="mb-1 font-semibold">Who</legend>
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5">
            <input type="checkbox" checked={who.includes(p.id)} onChange={(e) => setWho((list) => (e.target.checked ? [...list, p.id] : list.filter((x) => x !== p.id)))} />{p.name}
          </label>
        ))}
      </fieldset>
      <fieldset className="m-0 flex gap-3 border-0 p-0"><legend className="mb-1 font-semibold">When</legend>
        <label className="flex items-center gap-1.5"><input type="radio" name={`when-${date}`} checked={slot === 'snack_am'} onChange={() => setSlot('snack_am')} />Morning</label>
        <label className="flex items-center gap-1.5"><input type="radio" name={`when-${date}`} checked={slot === 'snack_pm'} onChange={() => setSlot('snack_pm')} />Afternoon</label>
      </fieldset>
      <label className="grid gap-1 font-semibold">Snack
        <select value={recipe} onChange={(e) => setRecipe(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1.5 font-normal">
          {w.snackRecipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 font-semibold">How many each
        <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="w-16 rounded-lg border border-line bg-bg px-2 py-1 text-right font-normal" />
      </label>
      {problem && <p role="alert" className="m-0 font-semibold text-warn">{problem}</p>}
      <span className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">Add</button>
        <button type="button" onClick={onDone} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Cancel</button>
      </span>
    </form>
  );
}
