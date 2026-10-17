// Batch-and-freeze: a recipe's make-ahead part that freezes well (a curry paste, a sauce, shredded beef), how many to
// make at once, and how long it keeps. One frozen portion covers one dinner of that recipe.
import type { MealSlot, PreparedItem, Recipe, RecipeBatch } from './types';

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback);

/** A recipe's batch, or null when it isn't a valid one. makes is 2–8 (default 4); freezer_days 1–365 (default 90). */
export function parseBatch(raw: unknown): RecipeBatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.name !== 'string' || !b.name.trim() || typeof b.group !== 'string' || !b.group.trim()) return null;
  if (!Array.isArray(b.steps) || !b.steps.every((s) => typeof s === 'string')) return null;
  return { name: b.name, group: b.group, steps: b.steps as string[], makes: clamp(b.makes, 2, 8, 4), freezer_days: clamp(b.freezer_days, 1, 365, 90) };
}

export function isBatchIngredient(recipe: Pick<Recipe, 'batch'>, ing: { group_name: string | null }): boolean {
  const b = parseBatch(recipe.batch);
  return !!b && ing.group_name === b.group;
}

export function isBatchStep(recipe: Pick<Recipe, 'batch'>, step: { title: string }): boolean {
  const b = parseBatch(recipe.batch);
  return !!b && b.steps.includes(step.title);
}

/** Portions of a recipe's batch in the freezer and still in date. */
export function freezerPortions(recipeId: string, items: PreparedItem[], today: string): number {
  return items.filter((i) => i.recipe_id === recipeId && i.location === 'freezer' && (!i.use_by || i.use_by >= today))
    .reduce((n, i) => n + i.portions, 0);
}

/** Frozen portions not yet promised to a dinner: dinners planned from the freezer but not checked yet still need one
 *  (checked ones already took theirs). */
export function availablePortions(recipeId: string, items: PreparedItem[], slots: MealSlot[], today: string): number {
  const promised = slots.filter((s) => s.slot === 'dinner' && s.recipe_id === recipeId && s.batch === 'frozen').length;
  return Math.max(0, freezerPortions(recipeId, items, today) - promised);
}
