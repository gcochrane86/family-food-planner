// Turns a recipe into the text Claude types into Cookidoo's Created Recipes, and works out My Week changes (spec §10).
import { formatQty, machineLabel, scaleFactor } from './recipes';
import type { MealSlot, RecipeDetail } from './types';

const PHASE_ORDER: Record<string, number> = { prep_8pm: 0, finish: 1, reheat: 2 };

export interface CookidooText { title: string; portions: number; ingredients: string[]; steps: string[] }

export function cookidooRecipe(recipe: RecipeDetail, portions: number): CookidooText {
  const factor = scaleFactor(portions, recipe.base_portions);
  const ingredients = recipe.ingredients.map((i) => {
    const qty = formatQty(i.qty === null ? null : i.qty * factor, i.unit, i.qty_approx);
    return [qty, i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');
  });
  const steps = [...recipe.steps]
    .sort((a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9) || a.position - b.position)
    .map((s) => {
      const body = s.body.replace(/\*\*/g, '');
      // Cookidoo writes TM settings as "13 min/100°C/speed 3"; other machines are named in words.
      const settings = !s.settings ? '' : s.machine === 'tm7' ? ` ${s.settings.split(' · ').join('/')}`
        : ` (${s.machine ? machineLabel(s.machine) : 'Settings'}: ${s.settings})`;
      return `${s.phase === 'prep_8pm' ? 'The night before: ' : ''}${body}${settings}`;
    });
  return { title: recipe.title, portions, ingredients, steps };
}

type Day = { date: string; recipeId: string };

/** What to add to and remove from My Week. `current` is only what Claude put there, so hand-added entries are never touched. */
export function myWeekChanges(wanted: Day[], current: { date: string; recipeId: string | null }[]): { add: Day[]; remove: Day[] } {
  const now = new Map(current.filter((c): c is Day => !!c.recipeId).map((c) => [c.date, c.recipeId]));
  const want = new Map(wanted.map((w) => [w.date, w.recipeId]));
  const remove = [...now].filter(([date, id]) => want.get(date) !== id).map(([date, recipeId]) => ({ date, recipeId }));
  const add = [...want].filter(([date, id]) => now.get(date) !== id).map(([date, recipeId]) => ({ date, recipeId }));
  return { add, remove };
}

/** A recipe planned more than once in a week is sent once, at the larger portions. */
export function portionsToSend(slots: MealSlot[], recipeId: string): number {
  return Math.max(0, ...slots.filter((s) => s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id === recipeId).map((s) => Number(s.portions ?? 0)));
}
