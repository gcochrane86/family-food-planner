// Turns database rows into the planner's input, and the planner's output into rows to save.
// Shared by the propose-week Edge Function and the app (for swaps), so both see the same week.
import { weekMinutes } from './cookingTime.ts';
import type { Balance, PlannerInput, PlannerRecipe, Protein, ProposedSlot } from './planner.ts';

export const DEFAULT_BALANCE: Balance = { chicken: 2, fish: 1, red_meat: 1, veggie: 1 };

interface Rows {
  frozen?: { recipe_id: string | null; portions: number }[]; // in-date freezer portions
  weekStart: string;
  householdId: string;
  settings: { default_plan_days?: number; weekday_dinner_max_min?: number; hour_minutes?: number; cooking_minutes?: unknown; balance?: Partial<Balance>; breakfasts?: unknown[]; day_rules?: { weekday: number; protein: Protein; note?: string | null }[] } | null;
  members: { id: string; kind: string; portion_weight: number | string }[];
  pattern: { member_id: string; weekday: number; office: boolean }[];
  recipes: {
    id: string; title: string; kind: string; status: string; protein: string | null;
    finish_minutes: number; prep_minutes?: number | null; hands_off_minutes?: number | null; reheats_well: boolean; base_portions: number | string; rating?: string | null; tags?: string[] | null;
  }[];
  recentDinnerRecipeIds: (string | null)[];
  /** The week's own cooking times by date (plan_weeks.cooking_minutes), when it has any. */
  cookingMinutes?: Record<string, unknown> | null;
}

/** A number from the household and week, so each week's proposal varies but can be recreated. */
export function weekSeed(householdId: string, weekStart: string): number {
  let h = 2166136261;
  for (const c of `${householdId}|${weekStart}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Freezer portions per recipe (items not tied to a recipe are left out). */
function frozenTotals(items: { recipe_id: string | null; portions: number }[]): { recipeId: string; portions: number }[] {
  const by = new Map<string, number>();
  for (const i of items) if (i.recipe_id && i.portions > 0) by.set(i.recipe_id, (by.get(i.recipe_id) ?? 0) + i.portions);
  return [...by.entries()].map(([recipeId, portions]) => ({ recipeId, portions }));
}

export function buildPlannerInput(rows: Rows): PlannerInput {
  const adults = new Set(rows.members.filter((m) => m.kind === 'adult').map((m) => m.id));
  const officeDays = [...new Set(rows.pattern.filter((p) => p.office && adults.has(p.member_id)).map((p) => p.weekday))].sort();
  const portions = rows.members.reduce((sum, m) => sum + Number(m.portion_weight), 0);
  const recipes: PlannerRecipe[] = rows.recipes
    // Roast parts and hosting meals (a 15-person Sunday roast) are only planned by hand, never picked by the planner.
    .filter((r) => r.kind === 'meal' && r.status !== 'archived' && r.rating !== 'down' && !(r.tags ?? []).some((t) => t === 'Roast' || t === 'Hosting'))
    .map((r) => ({
      id: r.id, title: r.title, protein: (r.protein as Protein | null) ?? null, finishMinutes: r.finish_minutes,
      reheatsWell: r.reheats_well, basePortions: Number(r.base_portions),
      // Today's cooking: the prep is done the evening before; the cook's hands-on part is its finish less the waits.
      ...(typeof r.prep_minutes === 'number' && typeof r.hands_off_minutes === 'number'
        ? { prepMinutes: Math.max(0, r.prep_minutes), cookHandsOn: Math.max(0, r.finish_minutes - r.hands_off_minutes) } : {}),
    }));
  const s = rows.settings ?? {};
  return {
    weekStart: rows.weekStart,
    days: s.default_plan_days === 5 ? 5 : 7,
    recipes,
    recentRecipeIds: [...new Set(rows.recentDinnerRecipeIds.filter((x): x is string => !!x))],
    officeDays,
    balance: { ...DEFAULT_BALANCE, ...(s.balance ?? {}) },
    weekdayMaxMin: s.weekday_dinner_max_min ?? 30,
    // Today's cooking: each day's time (Settings, and the week's own times).
    dayMinutes: weekMinutes(rows.weekStart, s, rows.cookingMinutes),
    householdPortions: Math.round(portions * 100) / 100 || 3,
    seed: weekSeed(rows.householdId, rows.weekStart),
    ...(Array.isArray(s.breakfasts) && s.breakfasts.length ? { breakfasts: s.breakfasts.filter((b: unknown): b is string => typeof b === 'string') } : {}),
    ...(rows.frozen ? { frozen: frozenTotals(rows.frozen) } : {}),
    dayRules: Array.isArray(s.day_rules) ? s.day_rules.filter((d: { weekday?: unknown; protein?: unknown }) => Number.isInteger(d?.weekday) && typeof d?.protein === 'string') : [],
  };
}

export function slotRows(planWeekId: string, plan: ProposedSlot[]) {
  return plan.map((s) => ({
    plan_week_id: planWeekId, date: s.date, slot: s.slot, recipe_id: s.recipeId, mode: s.mode, portions: s.portions,
    guests: s.guests, locked: s.locked, reason: s.reason, source_date: s.sourceDate, ...(s.batch ? { batch: s.batch } : {}),
  }));
}
