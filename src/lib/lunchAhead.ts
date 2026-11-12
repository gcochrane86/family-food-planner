// Home lunches with a part made the evening before (the chicken sandwich's roast chicken): Today's hour does that
// part, and only once for as many days as it covers (one roast chicken does two days of sandwiches).
import type { MealSlot, Recipe } from './types';
import { homeLunchChoice, lunchLeftover } from './weekSummary';

/** How many days running one evening's part covers, by recipe slug (1 when not listed). */
export const AHEAD_COVERS: Record<string, number> = { 'chicken-sandwich': 2 };

const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** The recipe a home (routine) lunch on `date` is, by its name ("Chicken sandwich" → Chicken Sandwich); null for
 *  leftovers, a packed lunch, or a name with no recipe. */
export function homeLunchOn(date: string, slots: MealSlot[], recipes: Recipe[], byId: Map<string, Recipe>): Recipe | null {
  const lunch = slots.find((s) => s.date === date && s.slot === 'lunch');
  if (lunch?.mode !== 'routine') return null;
  const choice = homeLunchChoice(lunch.routine_choice, !!lunchLeftover(date, slots, byId));
  if (choice === 'Leftovers') return null;
  return recipes.find((r) => r.title.toLowerCase() === choice.toLowerCase()) ?? null;
}

/** The home lunch whose evening-before part tonight's hour should do for tomorrow (`date`), or null: when tomorrow's
 *  lunch has such a part (`hasAhead`) and the days just before were not still covered by an earlier evening's. */
export function aheadRecipeId(date: string, slots: MealSlot[], recipes: Recipe[], byId: Map<string, Recipe>, hasAhead: (id: string) => boolean): string | null {
  const r = homeLunchOn(date, slots, recipes, byId);
  if (!r || !hasAhead(r.id)) return null;
  const covers = AHEAD_COVERS[r.slug] ?? 1;
  // Days running just before tomorrow with the same lunch: the part is made again every `covers` days.
  let run = 0;
  for (let d = dayBefore(date); run < 14 && homeLunchOn(d, slots, recipes, byId)?.id === r.id; d = dayBefore(d)) run++;
  return run % covers === 0 ? r.id : null;
}
