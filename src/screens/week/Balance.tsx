import type { Macro, Mark, TargetState } from '../../../supabase/functions/_shared/balance.ts';
import { addDays } from './useWeek';
import type { WeekState } from './useWeek';

const MARK: Record<Mark, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'text-accent' },
  low: { label: 'Low', className: 'text-warn' },
  unknown: { label: 'Not known', className: 'text-muted' },
};
const SNACK = { snack_am: 'Morning snack', snack_pm: 'Afternoon snack' } as const;
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

/** In a day's sheet: the day's snacks and how it measures up (breakfast protein, veg and fruit, healthy fats, fibre). */
export function DayBalanceCard({ date, w }: { date: string; w: WeekState }) {
  const b = w.balance(date);
  const snacks = w.slots.filter((s) => s.date === date && (s.slot === 'snack_am' || s.slot === 'snack_pm') && s.recipe_id)
    .sort((a, b2) => a.slot.localeCompare(b2.slot));
  if (!b && !snacks.length) return null;
  const rows: [string, Mark | undefined, string][] = b ? [
    ['Breakfast protein', b.breakfastProtein, 'about 25g or more'],
    ['Veg & fruit', b.vegFruit, '5 or more portions, at least half veg'],
    ['Healthy fats', b.healthyFat, 'olive oil, oily fish, nuts or seeds, avocado'],
    ['Fibre', b.fibre, 'about 30g'],
  ] : [];
  return (
    <section aria-label="Balance" className="grid gap-2 rounded-2xl bg-surface px-4 py-3 shadow-sm">
      <h3 className="m-0 text-base font-bold">Balance</h3>
      {snacks.map((s) => {
        const r = w.recipes.get(s.recipe_id!);
        const made = s.mode === 'cook' ? 'made today' : s.source_date ? `made ${s.source_date < w.weekStart ? 'Sunday' : weekdayOf(s.source_date)}` : '';
        return <p key={s.slot} className="m-0 text-sm">{SNACK[s.slot as keyof typeof SNACK]}: <b>{r?.title ?? 'Snack'}</b>{made && <span className="text-muted"> · {made}</span>}</p>;
      })}
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

/** Above the week: oily fish, beans or lentils, and red meat across the week. */
export function WeekBalanceStrip({ w, days }: { w: WeekState; days: number }) {
  const b = w.weekBalance(Array.from({ length: days }, (_, i) => addDays(w.weekStart, i)));
  if (!b) return null;
  const items: [string, Mark][] = [
    [`Oily fish ${b.oilyFish.count} of 2`, b.oilyFish.mark],
    [`Beans or lentils ${b.legumes.count} of 3 days`, b.legumes.mark],
    [`Red meat ${b.redMeat.count} (2 at most)`, b.redMeat.mark],
    ...(b.processed.count ? [[`Processed meat ${b.processed.count} (1 at most)`, b.processed.mark] as [string, Mark]] : []),
  ];
  return (
    <section aria-label="This week's balance" className="flex flex-wrap gap-1.5">
      {items.map(([text, mark]) => (
        <span key={text} className={`rounded-full px-3 py-1 text-[13px] font-semibold ${mark === 'low' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent'}`}>{text}</span>
      ))}
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

const WORD: Partial<Record<Macro, string>> = { kcal: 'calories', protein_g: 'protein', fat_g: 'fat', sat_fat_g: 'saturated fat', carbs_g: 'carbs', sugars_g: 'sugars', fibre_g: 'fibre', salt_g: 'salt' };
/** For a day's tile: how many people are under or over each target, e.g. "Under protein: 2 · Over sugars: 1". */
export function offTargets(people: ReturnType<WeekState['people']>): string | null {
  const parts: string[] = [];
  for (const [k] of ROWS) {
    for (const s of ['under', 'over'] as const) {
      const n = people.filter((p) => p.states[k] === s).length;
      if (n) parts.push(`${s === 'under' ? 'Under' : 'Over'} ${WORD[k]}: ${n}`);
    }
  }
  return parts.length ? parts.slice(0, 3).join(' · ') : null;
}
