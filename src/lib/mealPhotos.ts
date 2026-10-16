// Breakfasts and lunches are small recipes in the library, so they get photos the same way dinners do.
import type { Recipe } from './types';

export const ROUTINE_SLUGS: Record<string, string> = {
  'Overnight oats': 'overnight-oats',
  'Baked oats': 'baked-oats',
  'Eggs & porridge': 'eggs-and-porridge',
  'Chicken sandwich': 'chicken-sandwich',
  'Packed lunch': 'burrito-bowl',
};

/** The recipe behind a breakfast or lunch name (e.g. "Baked oats"), if it's in the library. */
export function routineRecipe(name: string, recipes: Map<string, Recipe>): Recipe | undefined {
  const slug = ROUTINE_SLUGS[name];
  if (!slug) return undefined;
  for (const r of recipes.values()) if (r.slug === slug) return r;
  return undefined;
}
