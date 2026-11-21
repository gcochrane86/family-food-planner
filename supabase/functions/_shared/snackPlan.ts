// Snack make days (docs/superpowers/specs/2026-11-15-balance-snacks-design.md; who eats what is in snackEats.ts), and
// the nutrition estimates Claude saves for recipes and for breakfasts and lunches that are names. Called "snack makes",
// never batches: meal_slots.batch means freezer batches.
import { FREE_SUGARS, parseNutrition } from './balance.ts';
import { addDays } from './planner.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

/** The days a snack can be made: the week's prep days (Sunday means the Sunday before the week, and that week's own
 *  Sunday when it's planned), or with no prep days, any evening from the Sunday before. */
export function snackMakeDates(weekStart: string, days: number, prepDays: number[]): string[] {
  const before = addDays(weekStart, -1);
  const any = [before, ...Array.from({ length: days }, (_, i) => addDays(weekStart, i))];
  const out = new Set<string>();
  for (const d of prepDays) {
    if (d === 6) out.add(before);
    if (d < days) out.add(addDays(weekStart, d));
  }
  // No prep day falls in the plan (a Saturday on a 5-day plan): any evening will do.
  return out.size ? [...out].sort() : any;
}

const ESTIMATE = 'protein_g, fibre_g, veg_portions and fruit_portions (0 or more), true/false for healthy_fat, oily_fish, legumes, red_meat and processed_meat, and (0 or more) kcal, fat_g, sat_fat_g, carbs_g, sugars_g, ' + FREE_SUGARS + ' and salt_g';

/** Saves Claude's estimates per serving: recipes by slug or title, and breakfasts or lunches that are names
 *  (into settings.routine_nutrition). All or nothing. */
export async function saveNutrition(db: Db, hid: string, a: { recipes?: unknown; routines?: unknown }): Promise<string> {
  const recipeItems = Array.isArray(a?.recipes) ? a.recipes as { recipe?: unknown; nutrition?: unknown }[] : [];
  const routineItems = Array.isArray(a?.routines) ? a.routines as { name?: unknown; nutrition?: unknown }[] : [];
  if (!recipeItems.length && !routineItems.length) return 'Give "recipes" and/or "routines" to save. Nothing was saved.';
  const res = await db.from('recipes').select('id, slug, title').eq('household_id', hid);
  if (res.error) throw new Error(`Reading recipes: ${res.error.message}`);
  const all = (res.data ?? []) as { id: string; slug: string; title: string }[];
  const updates: { id: string; nutrition: unknown }[] = [];
  for (const item of recipeItems) {
    const wanted = String(item?.recipe ?? '').trim().toLowerCase();
    const hit = all.find((r) => r.slug === wanted) ?? all.find((r) => r.title.toLowerCase() === wanted);
    if (!hit) return `No recipe called "${item?.recipe}". Nothing was saved.`;
    const n = parseNutrition(item?.nutrition);
    if (!n) return `${item?.recipe}'s estimate needs ${ESTIMATE}. Nothing was saved.`;
    updates.push({ id: hit.id, nutrition: n });
  }
  const routines: Record<string, unknown> = {};
  for (const item of routineItems) {
    const name = String(item?.name ?? '').trim();
    const n = parseNutrition(item?.nutrition);
    if (!name || !n) return `${name || 'A breakfast or lunch'}'s estimate needs a name and ${ESTIMATE}. Nothing was saved.`;
    routines[name] = n;
  }
  for (const u of updates) {
    const w = await db.from('recipes').update({ nutrition: u.nutrition }).eq('id', u.id).eq('household_id', hid);
    if (w?.error) throw new Error(`Saving an estimate: ${w.error.message}`);
  }
  if (Object.keys(routines).length) {
    const s = await db.from('settings').select('data').eq('household_id', hid).maybeSingle();
    if (s.error) throw new Error(`Reading settings: ${s.error.message}`);
    const data = (s.data?.data ?? {}) as Record<string, unknown>;
    const merged = { ...((data.routine_nutrition as Record<string, unknown>) ?? {}), ...routines };
    const w = await db.from('settings').update({ data: { ...data, routine_nutrition: merged } }).eq('household_id', hid);
    if (w?.error) throw new Error(`Saving settings: ${w.error.message}`);
  }
  const r = updates.length, b = Object.keys(routines).length;
  return `Saved estimates for ${r} recipe${r === 1 ? '' : 's'} and ${b} breakfast${b === 1 ? '' : 's'} or lunch${b === 1 ? '' : 'es'}.`;
}
