// Snack makes (docs/superpowers/specs/2026-11-15-balance-snacks-design.md): snacks made in Today's cooking on prep
// days, each covering its make day and the days after while it keeps, as a morning or afternoon snack. Also the
// nutrition estimates Claude saves for recipes and for breakfasts and lunches that are names. Called "snack makes",
// never batches: meal_slots.batch means freezer batches.
import { parseNutrition } from './balance.ts';
import { addDays } from './planner.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface SnackMake { recipe: string; slot: 'snack_am' | 'snack_pm'; makeDate: string; covers: string[] }

const NAME = { snack_am: 'morning snack', snack_pm: 'afternoon snack' } as const;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

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

/** Claude's snack makes, checked: a make day it may use, covered days in the week from the make day on, and no
 *  morning or afternoon snack covered twice. */
export function parseSnacks(raw: unknown, week: { weekStart: string; days: number; makeDates: string[] }): SnackMake[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('"snacks" must be a list');
  const dates = Array.from({ length: week.days }, (_, i) => addDays(week.weekStart, i));
  const taken = new Set<string>();
  return raw.map((s: Record<string, unknown>) => {
    const recipe = typeof s?.recipe === 'string' && s.recipe.trim() ? s.recipe.trim() : null;
    if (!recipe) throw new Error('each snack needs a recipe');
    if (s.slot !== 'am' && s.slot !== 'pm') throw new Error(`${recipe}: slot must be am or pm`);
    const slot = s.slot === 'am' ? 'snack_am' : 'snack_pm';
    const makeDate = String(s.make_date ?? '');
    if (!week.makeDates.includes(makeDate)) throw new Error(`${makeDate || 'A snack with no make_date'} isn't a snack-making day. Use one of ${week.makeDates.join(', ')}.`);
    if (!Array.isArray(s.covers) || !s.covers.length) throw new Error(`${recipe}: "covers" must list the days it's eaten`);
    const covers = [...new Set(s.covers.map(String))].sort();
    for (const d of covers) {
      if (!dates.includes(d)) throw new Error(`${recipe}: ${d} isn't in the week`);
      if (d < makeDate) throw new Error(`${recipe}: ${d} is before it's made (${makeDate})`);
    }
    if (dates.includes(makeDate) && !covers.includes(makeDate)) throw new Error(`${recipe} is made on ${makeDate}, so it covers that day too: add it to "covers"`);
    for (const d of new Set([makeDate, ...covers])) {
      const key = `${slot}|${d}`;
      if (taken.has(key)) throw new Error(`The ${NAME[slot]} on ${d} is covered twice`);
      taken.add(key);
    }
    return { recipe, slot, makeDate, covers };
  });
}

/** The meal_slots rows for snack makes: the make on its day (portions for every day it covers) and each other day it
 *  covers as leftovers of it. Throws when a snack is covered past how long it keeps. */
export function snackRows(makes: SnackMake[], recipes: Map<string, { id: string; keeps_days: number | null; toddler_ok: boolean }>,
  people: { adults: number; children: number }): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const m of makes) {
    const r = recipes.get(m.recipe);
    if (!r) throw new Error(`No snack recipe "${m.recipe}"`);
    const keeps = r.keeps_days ?? 1;
    const last = m.covers[m.covers.length - 1];
    if (daysBetween(m.makeDate, last) > keeps - 1) throw new Error(`${m.recipe} keeps ${keeps} days from ${m.makeDate}, so not until ${last}`);
    const perDay = people.adults + (r.toddler_ok ? people.children : 0);
    rows.push({ date: m.makeDate, slot: m.slot, recipe_id: r.id, mode: 'cook', portions: m.covers.length * perDay, guests: 0, locked: false,
      reason: `Snack: made today for ${m.covers.length} day${m.covers.length === 1 ? '' : 's'}`, source_date: null });
    for (const d of m.covers) {
      if (d === m.makeDate) continue;
      rows.push({ date: d, slot: m.slot, recipe_id: r.id, mode: 'leftovers', portions: null, guests: 0, locked: false, reason: 'Snack', source_date: m.makeDate });
    }
  }
  return rows;
}

const ESTIMATE = 'protein_g, fibre_g, veg_portions and fruit_portions (0 or more), and true/false for healthy_fat, oily_fish, legumes, red_meat and processed_meat';

/** Saves Claude's estimates per adult portion: recipes by slug or title, and breakfasts or lunches that are names
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
