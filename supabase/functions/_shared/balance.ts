// The daily balance (docs/superpowers/specs/2026-11-15-balance-snacks-design.md): how each planned day measures up to
// a Mediterranean pattern with protein-first breakfasts, from estimates per serving (each person eats their portion share). Estimates spot patterns;
// they're never shown as precise figures. Pure: shared by the app and the connector.

export interface Nutrition {
  protein_g: number;
  fibre_g: number;
  veg_portions: number;
  fruit_portions: number;
  healthy_fat: boolean;
  oily_fish: boolean;
  legumes: boolean;
  red_meat: boolean;
  processed_meat: boolean;
  /** Fuller estimates (per-person macros); older estimates may not have them. */
  kcal?: number;
  fat_g?: number;
  sat_fat_g?: number;
  carbs_g?: number;
  sugars_g?: number;
  salt_g?: number;
}
export type Mark = 'ok' | 'low' | 'unknown';
export interface DayBalance {
  breakfastProtein: Mark;
  vegFruit: Mark;
  healthyFat: Mark;
  fibre: Mark;
  /** The low markers, in words, for the day's tile. */
  low: string[];
  totals: Partial<Nutrition>;
}
export interface WeekBalance {
  oilyFish: { count: number; mark: Mark };
  legumes: { count: number; mark: Mark };
  redMeat: { count: number; mark: Mark };
  processed: { count: number; mark: Mark };
}
export interface BalanceSlot {
  date: string; slot: string; mode: string; recipe_id: string | null;
  routine_choice?: string | null; reason?: string | null; source_date?: string | null;
}
type Recipes = Map<string, { nutrition?: unknown; reheats_well?: boolean; toddler_ok?: boolean }>;
/** The household's home lunches, first one the default (settings.lunches, or the app's list). */
export interface BalanceOptions { homeLunches?: string[]; /** The adult portion share the markers are judged for (1 when not given). */ share?: number }

export const BREAKFAST_PROTEIN_G = 25;
export const VEG_FRUIT_PORTIONS = 5;
export const FIBRE_G = 30;
const NUMBERS = ['protein_g', 'fibre_g', 'veg_portions', 'fruit_portions'] as const;
const FLAGS = ['healthy_fat', 'oily_fish', 'legumes', 'red_meat', 'processed_meat'] as const;
/** The numbers each person's day adds up, in the order they're shown. */
export const MACROS = ['kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'fibre_g', 'salt_g'] as const;
export type Macro = (typeof MACROS)[number];
const OPTIONAL = ['kcal', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'salt_g'] as const;
export const SNACK_SLOTS = ['snack_am', 'snack_pm'] as const;

/** A whole estimate, or null: four numbers of 0 or more and five yes/no flags. */
export function parseNutrition(v: unknown): Nutrition | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (!NUMBERS.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]) && (r[k] as number) >= 0)) return null;
  if (!FLAGS.every((k) => typeof r[k] === 'boolean')) return null;
  if (!OPTIONAL.every((k) => r[k] === undefined || r[k] === null || (typeof r[k] === 'number' && Number.isFinite(r[k]) && (r[k] as number) >= 0))) return null;
  const extra = OPTIONAL.filter((k) => typeof r[k] === 'number').map((k) => [k, r[k]]);
  return Object.fromEntries([...[...NUMBERS, ...FLAGS].map((k) => [k, r[k]]), ...extra]) as unknown as Nutrition;
}

/** "Overnight oats (made Sunday)" → "Overnight oats": routine estimates are kept by the plain name. */
export const routineName = (name: string | null | undefined) => (name ?? '').split(' (')[0].trim();

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function recipeEstimate(recipes: Recipes, id: string | null | undefined): Nutrition | null {
  return id ? parseNutrition(recipes.get(id)?.nutrition) : null;
}
function routineEstimate(routines: Record<string, unknown>, name: string | null | undefined): Nutrition | null {
  const n = routineName(name);
  return n ? parseNutrition(routines[n]) : null;
}

/** The day's parts: undefined where there's nothing to count, null where there's something without an estimate. */
function parts(date: string, slots: BalanceSlot[], recipes: Recipes, routines: Record<string, unknown>, opts: BalanceOptions = {}) {
  const on = (slot: string) => slots.find((s) => s.date === date && s.slot === slot);
  const b = on('breakfast');
  const breakfast = !b ? undefined : b.recipe_id ? recipeEstimate(recipes, b.recipe_id) : routineEstimate(routines, b.routine_choice ?? b.reason);
  const l = on('lunch');
  let lunch: Nutrition | null | undefined;
  if (!l) lunch = undefined;
  else if (l.recipe_id) lunch = recipeEstimate(recipes, l.recipe_id);
  else if (l.source_date || l.routine_choice === 'Leftovers') {
    const from = slots.find((s) => s.date === (l.source_date ?? addDays(date, -1)) && s.slot === 'dinner');
    lunch = recipeEstimate(recipes, from?.recipe_id);
  } else if (l.mode === 'routine' && !l.routine_choice) {
    // Not picked yet: as the app shows it, last night's dinner if it reheats well, otherwise the first home lunch.
    const from = slots.find((s) => s.date === addDays(date, -1) && s.slot === 'dinner' && s.mode === 'cook');
    lunch = from?.recipe_id && recipes.get(from.recipe_id)?.reheats_well
      ? recipeEstimate(recipes, from.recipe_id)
      : routineEstimate(routines, opts.homeLunches?.[0] ?? l.reason);
  } else lunch = routineEstimate(routines, l.routine_choice ?? l.reason);
  const d = on('dinner');
  const out = !d || d.mode === 'out' || !d.recipe_id;
  const dinner = out ? null : recipeEstimate(recipes, d!.recipe_id);
  const snacks = SNACK_SLOTS.map((k) => on(k)).filter((s): s is BalanceSlot => !!s?.recipe_id).map((s) => recipeEstimate(recipes, s.recipe_id));
  return { breakfast, lunch, dinner, snacks, out };
}

/** How the day measures up: breakfast protein, veg and fruit, healthy fats and fibre, each ok, low or unknown. */
export function dayBalance(date: string, slots: BalanceSlot[], recipes: Recipes, routines: Record<string, unknown>, opts: BalanceOptions = {}): DayBalance {
  const p = parts(date, slots, recipes, routines, opts);
  const share = opts.share ?? 1;
  const breakfastProtein: Mark = p.breakfast ? (p.breakfast.protein_g * share >= BREAKFAST_PROTEIN_G ? 'ok' : 'low') : 'unknown';
  const all = [p.breakfast, p.lunch, p.dinner, ...p.snacks];
  const known = !p.out && [p.breakfast, p.lunch, p.dinner, ...p.snacks].every((x) => x !== null);
  const eaten = all.filter((x): x is Nutrition => !!x);
  const sum = (k: (typeof NUMBERS)[number]) => Math.round(eaten.reduce((t, n) => t + n[k], 0) * share * 10) / 10;
  const totals: Partial<Nutrition> = {
    protein_g: sum('protein_g'), fibre_g: sum('fibre_g'), veg_portions: sum('veg_portions'), fruit_portions: sum('fruit_portions'),
    healthy_fat: eaten.some((n) => n.healthy_fat),
  };
  const veg = totals.veg_portions!, fruit = totals.fruit_portions!;
  const vegFruit: Mark = !known ? 'unknown' : veg + fruit >= VEG_FRUIT_PORTIONS && veg >= (veg + fruit) / 2 ? 'ok' : 'low';
  // A healthy fat anywhere is enough, even on a day that isn't fully known.
  const healthyFat: Mark = totals.healthy_fat ? 'ok' : known ? 'low' : 'unknown';
  const fibre: Mark = !known ? 'unknown' : totals.fibre_g! >= FIBRE_G ? 'ok' : 'low';
  const low = ([[breakfastProtein, 'breakfast protein'], [vegFruit, 'veg & fruit'], [healthyFat, 'healthy fats'], [fibre, 'fibre']] as const)
    .filter(([m]) => m === 'low').map(([, label]) => label);
  return { breakfastProtein, vegFruit, healthyFat, fibre, low, totals };
}

/** The week: oily fish dinners (2 or more), days with beans or lentils (3 or more), red meat (2 or fewer) and
 *  processed meat (1 or fewer) dinners. */
export function weekBalance(dates: string[], slots: BalanceSlot[], recipes: Recipes, routines: Record<string, unknown>, opts: BalanceOptions = {}): WeekBalance {
  const dinners = dates.map((d) => slots.find((s) => s.date === d && s.slot === 'dinner' && s.mode !== 'out'))
    .map((s) => recipeEstimate(recipes, s?.recipe_id)).filter((n): n is Nutrition => !!n);
  const count = (k: 'oily_fish' | 'red_meat' | 'processed_meat') => dinners.filter((n) => n[k]).length;
  const legumes = dates.filter((d) => {
    const p = parts(d, slots, recipes, routines, opts);
    return [p.breakfast, p.lunch, p.dinner, ...p.snacks].some((n) => n?.legumes);
  }).length;
  const atLeast = (n: number, min: number): Mark => (n >= min ? 'ok' : 'low');
  const atMost = (n: number, max: number): Mark => (n <= max ? 'ok' : 'low');
  return {
    oilyFish: { count: count('oily_fish'), mark: atLeast(count('oily_fish'), 2) },
    legumes: { count: legumes, mark: atLeast(legumes, 3) },
    redMeat: { count: count('red_meat'), mark: atMost(count('red_meat'), 2) },
    processed: { count: count('processed_meat'), mark: atMost(count('processed_meat'), 1) },
  };
}

export type Targets = Partial<Record<Macro, number>>;
export type TargetState = 'under' | 'ok' | 'over' | 'unknown';
/** Protein and fibre: at least; sugars, saturated fat and salt: at most; calories, fat and carbs: about (within 10%). */
const AT_LEAST: Macro[] = ['protein_g', 'fibre_g'];
const AT_MOST: Macro[] = ['sugars_g', 'sat_fat_g', 'salt_g'];

/** One person's day: each meal times their portion share, and one of each snack they have (a toddler only has
 *  toddler-friendly ones, scaled to their share). `unknown` lists the numbers some part of the day has no estimate for. */
export function personDay(date: string, slots: BalanceSlot[], recipes: Recipes, routines: Record<string, unknown>,
  member: { kind: string; portion_weight: number | string }, opts: BalanceOptions = {}): { totals: Partial<Record<Macro, number>>; unknown: Macro[] } {
  const share = Number(member.portion_weight) || 1;
  const p = parts(date, slots, recipes, routines, opts);
  const eats: [Nutrition | null | undefined, number][] = [[p.breakfast, share], [p.lunch, share], [p.dinner, share]];
  const on = (slot: string) => slots.find((s) => s.date === date && s.slot === slot);
  for (const k of SNACK_SLOTS) {
    const s = on(k);
    if (!s?.recipe_id) continue;
    if (member.kind === 'child' && recipes.get(s.recipe_id)?.toddler_ok === false) continue;
    eats.push([recipeEstimate(recipes, s.recipe_id), Math.min(1, share)]);
  }
  const totals: Partial<Record<Macro, number>> = {};
  const unknown = new Set<Macro>(p.out ? MACROS : []);
  for (const k of MACROS) {
    let t = 0;
    for (const [n, f] of eats) {
      if (n === undefined) continue;
      const v = n?.[k];
      if (typeof v !== 'number') { unknown.add(k); continue; }
      t += v * f;
    }
    totals[k] = Math.round(t * 10) / 10;
  }
  return { totals, unknown: MACROS.filter((k) => unknown.has(k)) };
}

/** Each number with a target, against it. A day with an unknown part can't be short, but it can already be over. */
export function compareTargets(totals: Partial<Record<Macro, number>>, targets: Targets | null | undefined, unknown: Macro[]): Partial<Record<Macro, TargetState>> {
  const out: Partial<Record<Macro, TargetState>> = {};
  for (const k of MACROS) {
    const target = targets?.[k];
    if (typeof target !== 'number' || target <= 0) continue;
    const v = totals[k] ?? 0;
    const partial = unknown.includes(k);
    let state: TargetState;
    if (AT_LEAST.includes(k)) state = v >= target ? 'ok' : 'under';
    else if (AT_MOST.includes(k)) state = v > target ? 'over' : 'ok';
    else state = v > target * 1.1 ? 'over' : v < target * 0.9 ? 'under' : 'ok';
    if (partial && state !== 'over') state = 'unknown';
    out[k] = state;
  }
  return out;
}
