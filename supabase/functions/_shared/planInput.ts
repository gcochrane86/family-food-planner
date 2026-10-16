// Turns database rows into the planner's input, and the planner's output into rows to save.
// Shared by the propose-week Edge Function and the app (for swaps), so both see the same week.
import type { Balance, PlannerInput, PlannerRecipe, Protein, ProposedSlot } from './planner.ts';

export const DEFAULT_BALANCE: Balance = { chicken: 2, fish: 1, red_meat: 1, veggie: 1 };

interface Rows {
  weekStart: string;
  householdId: string;
  settings: { default_plan_days?: number; weekday_dinner_max_min?: number; balance?: Partial<Balance> } | null;
  members: { id: string; kind: string; portion_weight: number | string }[];
  pattern: { member_id: string; weekday: number; office: boolean }[];
  recipes: {
    id: string; title: string; kind: string; status: string; protein: string | null;
    finish_minutes: number; reheats_well: boolean; base_portions: number | string;
  }[];
  recentDinnerRecipeIds: (string | null)[];
}

/** A number from the household and week, so each week's proposal varies but can be recreated. */
export function weekSeed(householdId: string, weekStart: string): number {
  let h = 2166136261;
  for (const c of `${householdId}|${weekStart}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function buildPlannerInput(rows: Rows): PlannerInput {
  const adults = new Set(rows.members.filter((m) => m.kind === 'adult').map((m) => m.id));
  const officeDays = [...new Set(rows.pattern.filter((p) => p.office && adults.has(p.member_id)).map((p) => p.weekday))].sort();
  const portions = rows.members.reduce((sum, m) => sum + Number(m.portion_weight), 0);
  const recipes: PlannerRecipe[] = rows.recipes
    .filter((r) => r.kind === 'meal' && r.status !== 'archived')
    .map((r) => ({
      id: r.id, title: r.title, protein: (r.protein as Protein | null) ?? null, finishMinutes: r.finish_minutes,
      reheatsWell: r.reheats_well, basePortions: Number(r.base_portions),
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
    householdPortions: Math.round(portions * 100) / 100 || 3,
    seed: weekSeed(rows.householdId, rows.weekStart),
  };
}

export function slotRows(planWeekId: string, plan: ProposedSlot[]) {
  return plan.map((s) => ({
    plan_week_id: planWeekId, date: s.date, slot: s.slot, recipe_id: s.recipeId, mode: s.mode, portions: s.portions,
    guests: s.guests, locked: s.locked, reason: s.reason, source_date: s.sourceDate,
  }));
}
