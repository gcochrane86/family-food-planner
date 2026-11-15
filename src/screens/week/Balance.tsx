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
  const fix = w.nudge(date);
  if (!b && !snacks.length && !fix) return null;
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
          <button type="button" className="justify-self-start rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-ink"
            onClick={() => void w.addSnack(date, fix.memberId, fix.recipe_id, fix.slot)}>Yes, add it</button>
        </div>
      )}
      {byPerson.map((id) => (
        <p key={id} className="m-0 text-sm">{w.memberName(id)}: {snacks.filter((e) => e.member_id === id).sort((x, y) => x.slot.localeCompare(y.slot)).map((e) => {
          const r = w.recipes.get(e.recipe_id);
          const made = e.make_date === date ? 'made today' : `made ${e.make_date < w.weekStart ? 'Sunday' : weekdayOf(e.make_date)}`;
          return `${e.slot === 'snack_am' ? 'morning' : 'afternoon'} ${e.qty} × ${r?.title ?? 'snack'} (${made})`;
        }).join(' · ')}</p>
      ))}
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
