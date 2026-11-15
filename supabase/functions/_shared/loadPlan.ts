// Reads what the planner needs for one household's week. Shared by the propose-week Edge Function and the owner's
// Mac (scripts/week.ts), so the built-in planner and Claude's plans start from the same picture.
import { applyChoices, type PlanChoices } from './planChoices.ts';
import { buildPlannerInput } from './planInput.ts';
import { addDays, type PlannerInput } from './planner.ts';

// The Deno and Node Supabase clients have different types; only the query builder is used.
// deno-lint-ignore no-explicit-any
type Db = any;

/** With `choices` (Plan with Claude), the week is planned with them; otherwise with the week's own office days when it
 *  was planned with some, else the usual week. */
export async function loadPlannerInput(db: Db, householdId: string, weekStart: string, choices?: PlanChoices | null): Promise<PlannerInput> {
  const [settings, members, recipes, weeks] = await Promise.all([
    db.from('settings').select('data').eq('household_id', householdId).maybeSingle(),
    db.from('members').select('id, kind, portion_weight').eq('household_id', householdId),
    db.from('recipes').select('id, title, kind, status, protein, finish_minutes, prep_minutes, hands_off_minutes, reheats_well, base_portions, rating, tags').eq('household_id', householdId),
    db.from('plan_weeks').select('id').eq('household_id', householdId).gte('week_start', addDays(weekStart, -14)).lt('week_start', weekStart),
  ]);
  for (const r of [settings, members, recipes, weeks]) if (r.error) throw r.error;
  const memberIds = (members.data ?? []).map((m: { id: string }) => m.id);
  const weekIds = (weeks.data ?? []).map((w: { id: string }) => w.id);
  const [pattern, recent, own] = await Promise.all([
    memberIds.length ? db.from('member_week_pattern').select('member_id, weekday, office').in('member_id', memberIds) : { data: [], error: null },
    weekIds.length ? db.from('meal_slots').select('recipe_id').in('plan_week_id', weekIds).eq('slot', 'dinner').eq('mode', 'cook') : { data: [], error: null },
    choices ? { data: null, error: null } : db.from('plan_weeks').select('office_days').eq('household_id', householdId).eq('week_start', weekStart).maybeSingle(),
  ]);
  if (pattern.error) throw pattern.error;
  if (recent.error) throw recent.error;

  // In-date batch portions in the freezer (none if the table isn't there yet, so the menu still arrives).
  const frozen = await db.from('prepared_items').select('recipe_id, portions').eq('household_id', householdId).eq('location', 'freezer')
    .gt('portions', 0).or(`use_by.is.null,use_by.gte.${weekStart}`);
  const input = buildPlannerInput({
    weekStart, householdId, settings: settings.data?.data ?? null, members: members.data ?? [], pattern: pattern.data ?? [],
    // No office_days column before migration 0022: the usual week.
    weekOffice: own?.error ? null : own?.data?.office_days ?? null,
    recipes: recipes.data ?? [], recentDinnerRecipeIds: (recent.data ?? []).map((r: { recipe_id: string | null }) => r.recipe_id),
    ...(frozen.error ? {} : { frozen: frozen.data ?? [] }),
  });
  if (!choices) return input;
  // Office days only count for the household's adults (as with the usual pattern).
  const adults = new Set((members.data ?? []).filter((m: { kind: string }) => m.kind === 'adult').map((m: { id: string }) => m.id));
  return applyChoices(input, { ...choices, office: Object.fromEntries(Object.entries(choices.office).filter(([id]) => adults.has(id))) });
}
