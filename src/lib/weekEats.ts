// A week's snacks and meal partners for each person (docs/superpowers/specs/2026-11-15-person-snacks-design.md): the
// stored snacks plus the partners that come with its planned breakfasts and lunches, and the family's makes from them.
import { makeSlots, partnerEats, type SnackInfo } from '../../supabase/functions/_shared/snackEats.ts';
import { isSnack, snackFactor } from '../../supabase/functions/_shared/snackRules.ts';
import { snackMakeDates } from '../../supabase/functions/_shared/snackPlan.ts';
import { addDays } from '../../supabase/functions/_shared/planner.ts';
import { DEFAULT_BREAKFASTS, HOME_LUNCHES } from './mealPhotos';
import type { Eat, MealSlot, Partners, PlanWeek, Recipe, Settings } from './types';

type Week = { week: PlanWeek | null; slots: MealSlot[]; eats?: Eat[] };

/** The days the week's snacks can be made: its prep days (Sunday means the Sunday before), else any evening. */
export function weekMakeDates(week: PlanWeek, settings: Settings | null | undefined): string[] {
  return snackMakeDates(week.week_start, week.days, week.prep_days ?? settings?.prep_days ?? []);
}

/** The partners that apply to a week: the saved ones, and for a draft the ones Claude proposed with it (each person's
 *  list for a meal replaces theirs, as approving does); only for people still in the household when `memberIds` is given. */
function partnersFor(week: PlanWeek, settings: Settings | null | undefined, memberIds?: string[]): Partners {
  const out: Partners = JSON.parse(JSON.stringify(settings?.meal_partners ?? {}));
  if (week.status === 'draft') for (const [meal, by] of Object.entries(week.new_partners ?? {})) out[meal] = { ...(out[meal] ?? {}), ...by };
  if (memberIds) for (const by of Object.values(out)) for (const id of Object.keys(by)) if (!memberIds.includes(id)) delete by[id];
  return out;
}

/** Everyone's eats this week: the stored snacks and the partners worked out from the planned breakfasts and lunches. */
export function weekEats(w: Week, settings: Settings | null | undefined, recipes: Recipe[], memberIds?: string[]): Eat[] {
  if (!w.week) return [];
  const snacks = new Map<string, SnackInfo>(recipes.filter((r) => isSnack(r))
    .map((r) => [r.slug, { id: r.id, keeps_days: r.keeps_days ?? null, toddler_ok: r.toddler_ok !== false, quick: r.quick === true }]));
  const dates = Array.from({ length: w.week.days }, (_, i) => addDays(w.week!.week_start, i));
  const partners = partnerEats(dates, w.slots, partnersFor(w.week, settings, memberIds), snacks, weekMakeDates(w.week, settings), new Map(recipes.map((r) => [r.id, r])), {
    breakfasts: settings?.breakfasts?.length ? settings.breakfasts : DEFAULT_BREAKFASTS,
    homeLunches: settings?.lunches?.length ? settings.lunches : HOME_LUNCHES,
  });
  return [...(w.eats ?? []), ...partners];
}

/** The family's snack makes for the week, as slots that shopping and Today's cooking read. */
export function weekMakes(w: Week, settings: Settings | null | undefined, recipes: Recipe[]): MealSlot[] {
  if (!w.week) return [];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return makeSlots(weekEats(w, settings, recipes), (id) => snackFactor(byId.get(id))).map((m) => {
    // A snack recipe is always made as whole batches (14 balls needed → the recipe's 20); the rest are spare.
    const r = byId.get(m.recipe_id);
    const base = Number(r?.base_portions);
    const batch = r?.kind === 'snack' && !r.quick && base > 0 ? base : null;
    const sized = batch ? { needed: m.portions, batch_size: batch, portions: wholeBatches(m.portions, batch) } : {};
    return { ...m, ...sized, plan_week_id: w.week!.id, guests: 0, locked: false } as unknown as MealSlot;
  });
}

/** Portions made as whole batches of `batch`. */
const wholeBatches = (needed: number, batch: number) => Math.max(1, Math.ceil(needed / batch - 1e-9)) * batch;
type Make = MealSlot & { needed?: number; batch_size?: number };

/** Makes of the same recipe on the same day (one for each week they feed) as one make, portions added up. */
export function mergeMakes(makes: MealSlot[]): MealSlot[] {
  const by = new Map<string, MealSlot>();
  for (const m of makes) {
    const key = `${m.date}|${m.recipe_id}`;
    const seen = by.get(key);
    if (!seen) { by.set(key, { ...m }); continue; }
    // Whole-batch snacks: what both weeks need, made as whole batches (not a batch for each week).
    const a = seen as Make, b = m as Make;
    by.set(key, a.batch_size && b.batch_size
      ? { ...a, needed: (a.needed ?? 0) + (b.needed ?? 0), portions: wholeBatches((a.needed ?? 0) + (b.needed ?? 0), a.batch_size) } as Make
      : { ...seen, portions: (seen.portions ?? 0) + (m.portions ?? 0) });
  }
  return [...by.values()];
}

/** The makes that are cooked: quick snacks are bought for the day, never made, so they stay out of Today's cooking. */
export function cookedMakes(makes: MealSlot[], recipes: Recipe[]): MealSlot[] {
  const quick = new Set(recipes.filter((r) => r.quick).map((r) => r.id));
  return makes.filter((m) => !quick.has(m.recipe_id ?? ''));
}

/** The make a snack recipe is cooked at: today's (all of it), else the next one planned; null when none is left. */
export function nextMake(makes: MealSlot[], recipeId: string, today: string): MealSlot | null {
  const ahead = mergeMakes(makes.filter((m) => m.recipe_id === recipeId && m.date >= today)).sort((a, b) => a.date.localeCompare(b.date));
  return ahead[0] ?? null;
}
