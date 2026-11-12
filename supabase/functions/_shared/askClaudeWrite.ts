// Ask Claude: the changes Claude can make, each approved by the household in the Claude app (docs/spec.md §10,
// "Ask Claude: changes you approve"). Only this week and next, from today; only this household's slots and staples.
// Every reply says plainly what changed and what follows from it.
import { makeReader, pickRecipe } from './askClaude.ts';
import { loadPlannerInput } from './loadPlan.ts';
import { addDays, applyOut, applySwap, type ProposedSlot } from './planner.ts';
import { londonParts } from './schedule.ts';
import { mergePlan, toProposed, type SlotLike } from './slotMerge.ts';
import { buildVersion, parseVersion, type VersionInput } from './slotVersion.ts';

// The Deno and Node Supabase clients have different types; only the query builder is used.
// deno-lint-ignore no-explicit-any
type Db = any;
type Slot = SlotLike & { id?: string; plan_week_id: string; cookidoo_recipe_id?: string | null; [k: string]: unknown };

const SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
const STATUSES = ['have', 'low', 'out'] as const;
const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

export const COOKIDOO_LINE = 'Cookidoo will re-sync this dinner.';
export const BASKET_LINE = "The Sainsbury's basket is already filled: use Empty and refill, or a Spar trip.";
export const VERSION_COOKIDOO_LINE = "Tonight's version isn't sent to Cookidoo; Cookidoo keeps the saved recipe.";

/** The week a change on `date` belongs to, if it's today or later and no later than next Sunday (London time). */
export function changeWindow(date: string, now: Date): { weekStart: string } | { error: string } {
  if (!isDate(date)) return { error: 'Use a date like 2026-11-16.' };
  const today = londonParts(now).date;
  if (date < today) return { error: 'That day has passed.' };
  if (date > addDays(mondayOf(today), 13)) return { error: 'Only this week and next can be changed.' };
  return { weekStart: mondayOf(date) };
}

export function makeChanger(db: Db, householdId: string, now = new Date()) {
  const reader = makeReader(db, householdId);
  const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.data as T;
  };

  /** The week (only ever this household's) and its slots. */
  async function load(date: string) {
    const w = changeWindow(date, now);
    if ('error' in w) return { error: w.error };
    const week = must<{ id: string; status: string } | null>(await db.from('plan_weeks').select('id, week_start, status, days')
      .eq('household_id', householdId).eq('week_start', w.weekStart).maybeSingle(), 'Reading the week');
    if (!week?.id) return { error: 'No plan for that week yet.' };
    const slots = must<Slot[]>(await db.from('meal_slots').select('*').eq('plan_week_id', week.id), 'Reading the days') ?? [];
    return { week, slots, weekStart: w.weekStart };
  }
  const basketFilled = async (weekId: string) =>
    (must<{ status: string }[]>(await db.from('basket_runs').select('delivery, status').eq('plan_week_id', weekId), 'Reading baskets') ?? [])
      .some((b) => b.status === 'done');

  return {
    /** Swaps a dinner for another recipe, or eating out, with the app's own rules. */
    async swapMeal(a: { date?: unknown; recipe?: unknown; out?: unknown }): Promise<string> {
      const date = str(a?.date);
      const got = await load(date);
      if ('error' in got) return got.error!;
      const { week, slots, weekStart } = got;
      const dinner = slots.find((s) => s.date === date && s.slot === 'dinner');
      if (!dinner) return `There's no dinner on ${day(date)} in that plan.`;
      const recipes = await reader.recipes();
      const titleOf = (id: string | null) => recipes.find((r) => r.id === id)?.title ?? 'a recipe';
      const before = dinner.mode === 'cook' && dinner.recipe_id ? titleOf(dinner.recipe_id) : dinner.mode === 'out' ? 'eating out' : dinner.mode;

      let plan: ProposedSlot[];
      let after: string;
      if (a?.out === true || str(a?.out) === 'true') {
        plan = applyOut(slots.map(toProposed), date);
        after = 'eating out';
      } else {
        const wanted = str(a?.recipe);
        if (!wanted) return 'Say which recipe, or out for eating out.';
        const picked = pickRecipe(recipes, wanted);
        if ('text' in picked) return picked.text;
        const r = recipes.find((x) => x.id === picked.id)!;
        if (r.kind === 'component') return `${r.title} is part of a meal, not a dinner on its own.`;
        plan = applySwap(slots.map(toProposed), date, picked.id, await loadPlannerInput(db, householdId, weekStart));
        after = r.title;
      }
      const { changed } = mergePlan(slots, plan);
      if (!changed.length) return `${day(date)} dinner is already ${after}.`;
      const rows = changed.map(({ id: _id, cookidoo_recipe_id: _c, ...s }) => s);
      must(await db.from('meal_slots').upsert(rows, { onConflict: 'plan_week_id,date,slot' }), 'Saving the change');

      const lines = [`${day(date)} dinner: ${before} → ${after}.`];
      for (const l of changed.filter((s) => s.slot === 'lunch')) lines.push(`${day(l.date)} lunch goes back to its usual routine (it was going to be the leftovers).`);
      if (parseVersion(dinner.version) && changed.some((s) => s.slot === 'dinner' && s.version === null)) lines.push("Tonight's version for it was cleared.");
      if (week.status === 'approved') lines.push(COOKIDOO_LINE);
      if (await basketFilled(week.id)) lines.push(BASKET_LINE);
      return lines.join('\n');
    },

    /** Saves tonight's version of a day's recipe, checked against the saved recipe. */
    async setVersion(a: { date?: unknown; slot?: unknown } & Partial<VersionInput>): Promise<string> {
      const date = str(a?.date);
      const kind = str(a?.slot) || 'dinner';
      if (!SLOTS.includes(kind as typeof SLOTS[number])) return 'Slot must be breakfast, lunch or dinner.';
      const got = await load(date);
      if ('error' in got) return got.error!;
      const slot = got.slots.find((s) => s.date === date && s.slot === kind);
      if (!slot?.recipe_id || slot.mode === 'out' || slot.mode === 'reheat') return "There's nothing cooked then to change.";
      const saved = await reader.recipe(slot.recipe_id);
      if (!saved) return "That day's recipe isn't in your list any more.";
      const built = buildVersion({ id: saved.recipe.id, ingredients: saved.ingredients, steps: saved.steps }, {
        note: str(a?.note), ingredients: Array.isArray(a?.ingredients) ? a.ingredients : [], steps: Array.isArray(a?.steps) ? a.steps : [],
        removed_ingredients: Array.isArray(a?.removed_ingredients) ? a.removed_ingredients.map(str) : [],
        removed_steps: Array.isArray(a?.removed_steps) ? a.removed_steps.map(str) : [],
      });
      if ('error' in built) return built.error;
      must(await db.from('meal_slots').update({ version: built.version }).eq('plan_week_id', got.week.id).eq('date', date).eq('slot', kind), 'Saving tonight\'s version');

      const v = built.version;
      const lines = [`Saved tonight's version of ${saved.recipe.title} for ${day(date)} ${kind}: ${v.note}.`];
      const ing = v.ingredients.filter((i) => i.changed).map((i) => i.name);
      const st = v.steps.filter((s) => s.changed).map((s) => s.title);
      if (ing.length) lines.push(`Ingredients changed: ${ing.join(', ')}.`);
      if (st.length) lines.push(`Steps changed: ${st.join(', ')}.`);
      lines.push('Cook mode, the recipe card and Today\'s hour show it when opened from that day.', VERSION_COOKIDOO_LINE);
      if (ing.length && await basketFilled(got.week.id)) lines.push(BASKET_LINE);
      return lines.join('\n');
    },

    /** Puts a day back to the saved recipe. */
    async clearVersion(a: { date?: unknown; slot?: unknown }): Promise<string> {
      const date = str(a?.date);
      const kind = str(a?.slot) || 'dinner';
      if (!SLOTS.includes(kind as typeof SLOTS[number])) return 'Slot must be breakfast, lunch or dinner.';
      const got = await load(date);
      if ('error' in got) return got.error!;
      const slot = got.slots.find((s) => s.date === date && s.slot === kind);
      if (!parseVersion(slot?.version)) return "There's no tonight's version on that day.";
      must(await db.from('meal_slots').update({ version: null }).eq('plan_week_id', got.week.id).eq('date', date).eq('slot', kind), 'Clearing tonight\'s version');
      return `${day(date)} ${kind} is back to the saved recipe.`;
    },

    /** Marks a staple as have, low or out. Other pantry items are changed in the app. */
    async setPantry(a: { item?: unknown; status?: unknown }): Promise<string> {
      const status = str(a?.status).toLowerCase();
      if (!STATUSES.includes(status as typeof STATUSES[number])) return 'Status must be have, low or out.';
      const item = str(a?.item);
      if (!item) return 'Say which item.';
      const rows = must<{ id: string; staple_status: string | null; ingredients: unknown }[]>(
        await db.from('pantry_items').select('id, staple_status, ingredients(name)').eq('household_id', householdId), 'Reading the pantry') ?? [];
      const named = rows.map((r) => ({ ...r, name: (Array.isArray(r.ingredients) ? r.ingredients[0]?.name : (r.ingredients as { name?: string } | null)?.name) ?? '' }))
        .filter((r) => r.name);
      const want = item.toLowerCase();
      const exact = named.filter((r) => r.name.toLowerCase() === want);
      const hits = exact.length ? exact : named.filter((r) => r.name.toLowerCase().includes(want));
      if (!hits.length) return `Nothing in the pantry is called "${item}".`;
      if (hits.length > 1) return ['Several items match:', ...hits.slice(0, 8).map((r) => `- ${r.name}`)].join('\n');
      const hit = hits[0];
      if (!hit.staple_status) return `${hit.name} isn't a staple: change it in the app's Pantry.`;
      must(await db.from('pantry_items').update({ staple_status: status }).eq('household_id', householdId).eq('id', hit.id), 'Saving the pantry');
      return `${hit.name}: ${status}.${status === 'have' ? '' : ' It goes on the next shopping list.'}`;
    },
  };
}
