// The Recipes tab's groups: what kind of eating a recipe is for, worked out from what each recipe already says
// (its kind, its part in a meal, its tags and whether it is a roast part). A recipe can be in more than one group,
// and every recipe is in at least one.
import { isSnack, type SnackLike } from '../../supabase/functions/_shared/snackRules.ts';

export type RecipeGroup = 'weeknight' | 'centrepiece' | 'sides' | 'breakfast' | 'lunch' | 'snack';

export const GROUPS: { key: RecipeGroup; label: string }[] = [
  { key: 'weeknight', label: 'Weeknight dinners' },
  { key: 'centrepiece', label: 'Roasts & centrepieces' },
  { key: 'sides', label: 'Sides & sauces' },
  { key: 'breakfast', label: 'Breakfasts' },
  { key: 'lunch', label: 'Lunches' },
  { key: 'snack', label: 'Snacks & treats' },
];

export interface Groupable extends SnackLike {
  kind: string;
  component_role: string | null;
  tags: string[];
  roast?: unknown;
}

const has = (r: { tags: string[] }, re: RegExp) => r.tags.some((t) => re.test(t));

export function isOnePan(r: { tags: string[] }): boolean {
  return has(r, /one[- ](pot|pan|tray|machine)|foil-bag/i);
}

export function recipeGroups(r: Groupable): RecipeGroup[] {
  const snack = isSnack(r);
  const breakfast = has(r, /breakfast|brunch/i);
  // A part that only goes with something else (a sauce, a side, a wrap) isn't a lunch on its own.
  const lunch = has(r, /lunch/i) && !(r.kind === 'component' && ['sauce', 'veg', 'bread'].includes(r.component_role ?? ''));
  const centrepiece = r.kind === 'meal'
    ? has(r, /^(sunday roast|hosting|weekend)$/i)
    : r.kind === 'component' && r.component_role === 'protein' && (!!r.roast || has(r, /^roast$/i));
  const out: RecipeGroup[] = [];
  if (r.kind === 'meal' && !centrepiece && !snack) out.push('weeknight');
  if (centrepiece) out.push('centrepiece');
  if (r.kind === 'component' && !centrepiece && !breakfast && !lunch && !snack) out.push('sides');
  if (breakfast) out.push('breakfast');
  if (lunch) out.push('lunch');
  if (snack) out.push('snack');
  return out;
}
