// Breakfasts and lunches are small recipes in the library, so they get photos the same way dinners do.
import type { Recipe } from './types';

/** What a home lunch can be (besides last night's leftovers), in the order the day sheet offers them. */
export const HOME_LUNCHES = ['Chicken sandwich', 'Roast beef sandwich', 'Egg sandwich', 'Tuna & sweetcorn sandwich', 'Mexican beef poke bowl'];

export const ROUTINE_SLUGS: Record<string, string> = {
  'Overnight oats': 'overnight-oats',
  'Baked oats': 'baked-oats',
  'Eggs & porridge': 'eggs-and-porridge',
  'Packed lunch': 'burrito-bowl',
  'Chicken sandwich': 'chicken-sandwich',
  'Roast beef sandwich': 'roast-beef-sandwich',
  'Egg sandwich': 'egg-sandwich',
  'Tuna & sweetcorn sandwich': 'tuna-sweetcorn-sandwich',
  'Mexican beef poke bowl': 'mexican-beef-poke-bowl',
};

/** The recipe behind a breakfast or lunch name (e.g. "Baked oats"), if it's in the library. */
export function routineRecipe(name: string, recipes: Map<string, Recipe>): Recipe | undefined {
  const slug = ROUTINE_SLUGS[name];
  if (!slug) return undefined;
  for (const r of recipes.values()) if (r.slug === slug) return r;
  return undefined;
}
