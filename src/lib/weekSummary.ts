// What each day tile on the week grid shows (spec §6: Home is a grid of day tiles).
import type { MealSlot, Recipe } from './types';

export type DayChip = 'office' | 'prep' | 'twice' | 'guests' | 'out' | 'cooked';

export interface DaySummary {
  breakfast: string;
  lunch: string;
  dinner: string;
  dinnerOut: boolean;
  chips: { kind: DayChip; label: string }[];
}

const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
/** 0 = Monday … 6 = Sunday, matching officeDays. */
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

export function daySummary(date: string, slots: MealSlot[], recipes: Map<string, Recipe>, officeDays: number[]): DaySummary {
  const find = (kind: MealSlot['slot'], d = date) => slots.find((s) => s.date === d && s.slot === kind);
  const title = (id: string | null | undefined) => (id ? recipes.get(id)?.title : undefined);
  const b = find('breakfast');
  const l = find('lunch');
  const d = find('dinner');
  const tomorrow = find('dinner', nextDay(date));

  // Tiles are small: the day sheet keeps the full suggestion.
  // A lunch offering leftovers or a sandwich shows what was picked (leftovers until you choose).
  const short = (r: string | null | undefined) =>
    r && /, or a chicken sandwich$/.test(r) ? (l?.routine_choice === 'Chicken sandwich' ? 'Chicken sandwich' : 'Leftovers')
      : r === 'Chicken sandwich on sourdough' ? 'Chicken sandwich' : r;
  const lunch = short(l?.reason)
    ?? (l?.mode === 'packed' ? 'Packed lunch'
      : l?.mode === 'reheat' && title(l.recipe_id) ? `Leftover ${title(l.recipe_id)}`
        : 'Home lunch');
  const dinner = d?.mode === 'out' ? 'Out tonight'
    : d?.mode === 'cook' && title(d.recipe_id) ? title(d.recipe_id)!
      : 'Leftovers night';

  const chips: DaySummary['chips'] = [];
  if (officeDays.includes(weekday(date))) chips.push({ kind: 'office', label: 'Office' });
  const tomorrowRecipe = tomorrow?.mode === 'cook' && tomorrow.recipe_id ? recipes.get(tomorrow.recipe_id) : undefined;
  const tomorrowBreakfast = find('breakfast', nextDay(date));
  const oatsTomorrow = (tomorrowBreakfast?.routine_choice ?? tomorrowBreakfast?.reason) === 'Overnight oats';
  if ((tomorrowRecipe && tomorrowRecipe.prep_minutes > 0) || oatsTomorrow) chips.push({ kind: 'prep', label: 'Prep tonight' });
  if (slots.some((s) => s.mode === 'reheat' && s.source_date === date)) chips.push({ kind: 'twice', label: 'Cook once ×2' });
  if (d?.guests) chips.push({ kind: 'guests', label: `+${d.guests} guest${d.guests === 1 ? '' : 's'}` });
  if (d?.mode === 'out') chips.push({ kind: 'out', label: 'Out tonight' });
  if (d?.cooked_at) chips.push({ kind: 'cooked', label: '✓ Cooked' });

  return {
    breakfast: b?.routine_choice ?? b?.reason ?? 'Eggs, porridge or baked oats',
    lunch,
    dinner,
    dinnerOut: d?.mode === 'out',
    chips,
  };
}

/** How many cooked dinners of each protein the week has, for the week tile. */
export type Balance = { chicken: number; fish: number; red_meat: number; veggie: number };

export function proteinBalance(slots: MealSlot[], recipes: Map<string, Recipe>): Balance {
  const out: Balance = { chicken: 0, fish: 0, red_meat: 0, veggie: 0 };
  for (const s of slots) {
    if (s.slot !== 'dinner' || s.mode !== 'cook' || !s.recipe_id) continue;
    const p = recipes.get(s.recipe_id)?.protein;
    if (p && p in out) out[p as keyof Balance] += 1;
  }
  return out;
}
