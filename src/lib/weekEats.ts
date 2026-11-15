// A week's snacks and meal partners for each person (docs/superpowers/specs/2026-11-15-person-snacks-design.md): the
// stored snacks plus the partners that come with its planned breakfasts and lunches, and the family's makes from them.
import { makeSlots, partnerEats, type SnackInfo } from '../../supabase/functions/_shared/snackEats.ts';
import { snackMakeDates } from '../../supabase/functions/_shared/snackPlan.ts';
import { addDays } from '../../supabase/functions/_shared/planner.ts';
import { DEFAULT_BREAKFASTS, HOME_LUNCHES } from './mealPhotos';
import type { Eat, MealSlot, PlanWeek, Recipe, Settings } from './types';

type Week = { week: PlanWeek | null; slots: MealSlot[]; eats?: Eat[] };

/** The days the week's snacks can be made: its prep days (Sunday means the Sunday before), else any evening. */
export function weekMakeDates(week: PlanWeek, settings: Settings | null | undefined): string[] {
  return snackMakeDates(week.week_start, week.days, week.prep_days ?? settings?.prep_days ?? []);
}

/** Everyone's eats this week: the stored snacks and the partners worked out from the planned breakfasts and lunches. */
export function weekEats(w: Week, settings: Settings | null | undefined, recipes: Recipe[]): Eat[] {
  if (!w.week) return [];
  const snacks = new Map<string, SnackInfo>(recipes.filter((r) => r.kind === 'snack')
    .map((r) => [r.slug, { id: r.id, keeps_days: r.keeps_days ?? null, toddler_ok: r.toddler_ok !== false }]));
  const dates = Array.from({ length: w.week.days }, (_, i) => addDays(w.week!.week_start, i));
  const partners = partnerEats(dates, w.slots, settings?.meal_partners, snacks, weekMakeDates(w.week, settings), new Map(recipes.map((r) => [r.id, r])), {
    breakfasts: settings?.breakfasts?.length ? settings.breakfasts : DEFAULT_BREAKFASTS,
    homeLunches: settings?.lunches?.length ? settings.lunches : HOME_LUNCHES,
  });
  return [...(w.eats ?? []), ...partners];
}

/** The family's snack makes for the week, as slots that shopping and Today's cooking read. */
export function weekMakes(w: Week, settings: Settings | null | undefined, recipes: Recipe[]): MealSlot[] {
  if (!w.week) return [];
  return makeSlots(weekEats(w, settings, recipes)).map((m) => ({ ...m, plan_week_id: w.week!.id, guests: 0, locked: false }) as unknown as MealSlot);
}
