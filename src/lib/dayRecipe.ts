// A recipe as it's cooked on a given day: opened from that day (…?day=YYYY-MM-DD&slot=dinner), it carries that day's
// tonight's version, if any. Opened from anywhere else, it's the saved recipe.
import { applyVersion } from '../../supabase/functions/_shared/slotVersion.ts';
import { addDays } from '../../supabase/functions/_shared/planner.ts';
import { repo } from './repo';
import type { RecipeDetail, SlotKind } from './types';

export type DayRecipe = RecipeDetail & { versionNote?: string; changedIngredients?: Set<string>; changedSteps?: Set<number> };

const SLOTS: SlotKind[] = ['breakfast', 'lunch', 'dinner'];
const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

/** The day and slot a recipe was opened from, if the link carried them. */
export function dayParams(params: URLSearchParams): { day: string; slot: SlotKind } | null {
  const day = params.get('day') ?? '';
  const slot = params.get('slot') as SlotKind;
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && SLOTS.includes(slot) ? { day, slot } : null;
}

/** The saved recipe, with that day's tonight's version applied. If the day can't be read, the saved recipe. */
export async function loadDayRecipe(id: string, householdId: string | null | undefined, at: { day: string; slot: SlotKind } | null): Promise<DayRecipe | null> {
  const recipe = await repo.getRecipe(id);
  if (!recipe || !at || !householdId) return recipe;
  const week = await repo.getWeek(householdId, mondayOf(at.day)).catch(() => null);
  const slot = week?.slots.find((s) => s.date === at.day && s.slot === at.slot);
  return slot?.recipe_id === id ? applyVersion(recipe, slot.version) : recipe;
}

/** The query string that keeps the day with a link (empty when there's none). */
export const dayQuery = (at: { day: string; slot: SlotKind } | null) => (at ? `day=${at.day}&slot=${at.slot}` : '');
