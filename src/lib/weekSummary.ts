import { parseRoastChoice, type RoastChoice } from './roastModel';

/** A roast's short name: "Roast · beef", or "Christmas · turkey & ham". */
export const roastName = (r: RoastChoice) => `${r.occasion === 'christmas' ? 'Christmas' : 'Roast'} · ${(r.mains ?? [r.main]).join(' & ')}`;
import { HOME_LUNCHES } from './mealPhotos';
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

/** Last night's dinner when today's lunch can be its leftovers: a home (routine) lunch after a cooked dinner that
 *  reheats well. The tile and the day sheet both use this, so they always agree. */
export function lunchLeftover(date: string, slots: MealSlot[], recipes: Map<string, Recipe>): Recipe | undefined {
  const lunch = slots.find((s) => s.date === date && s.slot === 'lunch');
  if (lunch?.mode !== 'routine') return undefined;
  const prev = new Date(`${date}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1);
  const dinner = slots.find((s) => s.date === prev.toISOString().slice(0, 10) && s.slot === 'dinner');
  const r = dinner?.mode === 'cook' && dinner.recipe_id ? recipes.get(dinner.recipe_id) : undefined;
  return r?.reheats_well ? r : undefined;
}

/** A home lunch: whatever was picked, else last night's leftovers when there are some, else a chicken sandwich. */
export function homeLunchChoice(choice: string | null, leftovers: boolean, first: string = HOME_LUNCHES[0]): string {
  if (choice && choice !== 'Leftovers') return choice;
  return leftovers ? 'Leftovers' : first;
}

/** Portions a dinner adds for the next day's lunch: the household's share again (guests don't come to lunch), when
 *  the dinner reheats well and that lunch is its leftovers (picked, the default, or packed for an office day). */
export function leftoverLunchPortions(dinner: MealSlot, slots: MealSlot[], recipes: Map<string, Recipe>): number {
  if (dinner.slot !== 'dinner' || dinner.mode !== 'cook' || !dinner.recipe_id || !recipes.get(dinner.recipe_id)?.reheats_well) return 0;
  const next = new Date(`${dinner.date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const lunch = slots.find((s) => s.date === next.toISOString().slice(0, 10) && s.slot === 'lunch');
  const takes = lunch?.mode === 'routine'
    ? homeLunchChoice(lunch.routine_choice, true) === 'Leftovers'
    : (lunch?.mode === 'packed' || lunch?.mode === 'reheat') && lunch.source_date === dinner.date;
  return takes ? Math.max(0, (dinner.portions ?? 0) - dinner.guests * 1.25) : 0;
}

export function daySummary(date: string, slots: MealSlot[], recipes: Map<string, Recipe>, officeDays: number[]): DaySummary {
  const find = (kind: MealSlot['slot'], d = date) => slots.find((s) => s.date === d && s.slot === kind);
  const title = (id: string | null | undefined) => (id ? recipes.get(id)?.title : undefined);
  const b = find('breakfast');
  const l = find('lunch');
  const d = find('dinner');
  const tomorrow = find('dinner', nextDay(date));

  // Tiles are small: the day sheet keeps the full suggestion.
  const leftover = lunchLeftover(date, slots, recipes);
  const lunch = l?.mode === 'routine'
    ? homeLunchChoice(l.routine_choice, !!leftover)
    : l?.reason ?? (l?.mode === 'packed' ? 'Packed lunch' : l?.mode === 'reheat' && title(l.recipe_id) ? `Leftover ${title(l.recipe_id)}` : 'Home lunch');
  const roast = d?.mode === 'cook' ? parseRoastChoice(d.roast) : null;
  const dinner = d?.mode === 'out' ? 'Out tonight'
    : roast ? roastName(roast)
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
