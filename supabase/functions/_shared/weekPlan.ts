// Planning a week with Claude (docs/playbooks/week-plan.md): everything the plan needs, and saving Claude's dinners
// (and any new recipes) as a draft week, all or nothing. Shared by the week CLI on the Mac and the Ask Claude
// connector, so the two can't drift. Pure TS with the database client passed in.
import { loadPlannerInput } from './loadPlan.ts';
import { MEAL_SPEC } from './mealSpec.ts';
import { slotRows } from './planInput.ts';
import { addDays, OFFICE_MAX, proposeWeek } from './planner.ts';
import { NEW_RECIPE_RULES } from './recipeRules.ts';
import { contentRows, recipeRow, type SeedRecipe, validateRecipeSeed } from './recipeSeed.ts';

// The Deno and Node Supabase clients have different types; only the query builder is used.
// deno-lint-ignore no-explicit-any
type Db = any;
type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const must = <T>(res: Res<T>, what: string): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
};
const list = <T>(res: Res<T[]>, what: string): T[] => must(res, what) ?? [];

export interface WeekPlan {
  summary: string;
  dinners: { date: string; recipe: string; reason: string }[]; // recipe: a slug, existing or new
  newRecipes: SeedRecipe[];
}

/** Everything the plan needs: the week, the household's specifications and rules, recipes, freezer, pantry, pack
 *  sizes, recent dinners, whether the week already has a draft or is approved, the rules for a new recipe, and the
 *  built-in planner's proposal as a starting point. */
export async function planContext(db: Db, hid: string, weekStart: string) {
  const input = await loadPlannerInput(db, hid, weekStart);
  const [settings, members, rules, recipes, recent, freezer, pantry, products, existing] = await Promise.all([
    db.from('settings').select('data').eq('household_id', hid).maybeSingle(),
    db.from('members').select('name, kind, portion_weight').eq('household_id', hid),
    db.from('house_rules').select('kind, match, replacement, note').eq('household_id', hid),
    // Ingredients nested in each recipe, so a big library isn't cut off at the API's row limit.
    db.from('recipes').select('id, slug, title, subtitle, protein, finish_minutes, prep_minutes, reheats_well, freezes_well, tags, rating, status, base_portions, recipe_ingredients(name, qty, unit)').eq('household_id', hid).eq('kind', 'meal'),
    db.from('plan_weeks').select('week_start, meal_slots(date, slot, mode, recipe_id)').eq('household_id', hid).gte('week_start', addDays(weekStart, -28)).lt('week_start', weekStart),
    db.from('prepared_items').select('name, recipe_id, portions, use_by').eq('household_id', hid).eq('location', 'freezer').gt('portions', 0),
    db.from('pantry_items').select('staple_status, qty, unit, location, ingredients(name)').eq('household_id', hid),
    db.from('products').select('item_key, product_name, pack_size, pack_unit').eq('household_id', hid),
    db.from('plan_weeks').select('status').eq('household_id', hid).eq('week_start', weekStart).maybeSingle(),
  ]);
  const s = (must(settings, 'Reading settings') as { data: Record<string, unknown> } | null)?.data ?? {};
  type Ing = { name: string; qty: number | null; unit: string };
  const all = list(recipes, 'Reading recipes') as { id: string; slug: string; recipe_ingredients: Ing[]; [k: string]: unknown }[];
  const slugOf = new Map(all.map((x) => [x.id, x.slug]));
  const plannable = new Set(input.recipes.map((x) => x.id));
  const handsOnOf = new Map(input.recipes.map((x) => [x.id, { prepMinutes: x.prepMinutes ?? null, cookHandsOn: x.cookHandsOn ?? null }]));
  const lastCooked = new Map<string, string>();
  const recentDinners: { date: string; recipe: string | null; mode: string }[] = [];
  for (const w of list(recent, 'Reading recent weeks') as { meal_slots: { date: string; slot: string; mode: string; recipe_id: string | null }[] }[]) {
    for (const sl of w.meal_slots.filter((x) => x.slot === 'dinner')) {
      recentDinners.push({ date: sl.date, recipe: sl.recipe_id ? slugOf.get(sl.recipe_id) ?? null : null, mode: sl.mode });
      if (sl.mode === 'cook' && sl.recipe_id && (lastCooked.get(sl.recipe_id) ?? '') < sl.date) lastCooked.set(sl.recipe_id, sl.date);
    }
  }
  const nameOf = (i: unknown) => (Array.isArray(i) ? i[0]?.name : (i as { name?: string } | null)?.name) ?? '';
  const proposal = proposeWeek(input).filter((x) => x.slot === 'dinner')
    .map((x) => ({ date: x.date, recipe: x.recipeId ? slugOf.get(x.recipeId) ?? null : null, reason: x.reason }));
  const week = must(existing, 'Reading the week') as { status: string } | null;

  return {
    week: {
      start: weekStart, days: input.days,
      dates: Array.from({ length: input.days }, (_, i) => ({ date: addDays(weekStart, i), day: DAY[i], office: input.officeDays.includes(i) })),
      householdPortions: input.householdPortions,
      existing: !week ? 'none' : week.status === 'approved' ? 'approved' : 'draft',
    },
    rules: {
      proteinBalance: input.balance, weekdayDinnerMaxMinutes: input.weekdayMaxMin, officeDayMaxMinutes: Math.min(OFFICE_MAX, input.weekdayMaxMin),
      // Today's cooking: each day's time for cooking (the dinner's cook, the next day's prep, the extras).
      cookingTime: (input.dayMinutes ?? Array(7).fill(60)).slice(0, input.days).map((minutes, i) => ({ date: addDays(weekStart, i), day: DAY[i], minutes })),
      dayRules: s.day_rules ?? [], otherShops: s.other_shops ?? [], newRecipesAllowed: s.adventure ?? 1,
      whatMakesAMeal: MEAL_SPEC, houseRules: list(rules, 'Reading house rules'), privateRules: Array.isArray(s.private_rules) ? s.private_rules : [],
    },
    newRecipeRules: NEW_RECIPE_RULES,
    members: list(members, 'Reading members'),
    recipes: all.filter((x) => plannable.has(x.id)).map(({ id, recipe_ingredients: ings, ...x }) => ({
      ...x, ...(handsOnOf.get(id) ?? { prepMinutes: null, cookHandsOn: null }), lastCooked: lastCooked.get(id) ?? null,
      ingredients: (ings ?? []).map((i) => [i.qty, i.unit, i.name].filter((v) => v !== null && v !== '').join(' ')),
    })),
    recentDinners: recentDinners.sort((a, b) => a.date.localeCompare(b.date)),
    freezer: (list(freezer, 'Reading the freezer') as { name: string; recipe_id: string | null; portions: number; use_by: string | null }[])
      .map((f) => ({ name: f.name, recipe: f.recipe_id ? slugOf.get(f.recipe_id) ?? null : null, portions: f.portions, useBy: f.use_by })),
    pantry: (list(pantry, 'Reading the pantry') as { staple_status: string | null; qty: number | null; unit: string | null; location: string; ingredients: unknown }[])
      .map((p) => ({ name: nameOf(p.ingredients), location: p.location, ...(p.staple_status ? { staple: p.staple_status } : { qty: p.qty, unit: p.unit }) })),
    packSizes: (list(products, 'Reading products') as { item_key: string; product_name: string; pack_size: number | null; pack_unit: string }[])
      .filter((p) => p.pack_size).map((p) => ({ item: p.item_key.split('|')[0], pack: `${p.pack_size}${p.pack_unit}`, product: p.product_name })),
    builtInProposal: proposal,
  };
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const need = (v: string | null, what: string) => v ?? (() => { throw new Error(`"${what}" is required`); })();

/** Claude's plan: a summary, a dinner for some or all nights, and up to `adventure` new recipes. */
export function parsePlan(input: unknown, week: { weekStart: string; days: number; adventure: number }): WeekPlan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The plan must be an object');
  const o = input as Record<string, unknown>;
  const summary = need(text(o.summary, 600), 'summary');
  if (!Array.isArray(o.dinners) || !o.dinners.length) throw new Error('"dinners" must be a list with at least one dinner');
  const dates = Array.from({ length: week.days }, (_, i) => addDays(week.weekStart, i));
  const seen = new Set<string>();
  const dinners = o.dinners.map((d: Record<string, unknown>) => {
    const date = need(text(d?.date, 10), 'dinners[].date');
    if (!dates.includes(date)) throw new Error(`${date} is not in the week (${dates[0]} to ${dates[dates.length - 1]})`);
    if (seen.has(date)) throw new Error(`two dinners on ${date}`);
    seen.add(date);
    return { date, recipe: need(text(d.recipe, 100), 'dinners[].recipe'), reason: need(text(d.reason, 200), 'dinners[].reason') };
  });
  const raw = o.new_recipes ?? [];
  if (!Array.isArray(raw)) throw new Error('"new_recipes" must be a list');
  if (raw.length > week.adventure) throw new Error(`at most ${week.adventure} new recipe${week.adventure === 1 ? '' : 's'} a week (Settings → adventure)`);
  const newRecipes = raw.map((r) => ({ ...(r as Record<string, unknown>), source: 'claude', status: 'active' }) as SeedRecipe);
  if (newRecipes.length) {
    const problems = validateRecipeSeed({ recipes: newRecipes });
    if (problems.length) throw new Error(`A new recipe has problems:\n- ${problems.join('\n- ')}`);
  }
  return { summary, dinners, newRecipes };
}

// The week can't be saved any more: the request is closed with why, so the app says so.
const CLOSED: Record<string, string> = {
  week_approved: 'That week was approved while planning, so it was left as it is.',
  week_exists: 'A menu for that week was made in the meantime. Tap Replan with Claude to replace it.',
};

/** Adds the plan's new recipes, plans the week around its dinners, and saves it through save_claude_week for a
 *  request that's being planned: all or nothing (new recipes are removed again if the week isn't saved). Throws an
 *  Error the household can read. `deps` is for tests. */
export async function saveWeekPlan(db: Db, hid: string, requestId: string, weekStart: string, plan: WeekPlan,
  deps: { loadInput?: typeof loadPlannerInput; propose?: (input: Awaited<ReturnType<typeof loadPlannerInput>>, chosen: { date: string; recipeId: string; reason: string }[]) => Record<string, unknown>[] } = {}): Promise<{ added: number }> {
  const loadInput = deps.loadInput ?? loadPlannerInput;
  const propose = deps.propose ?? ((input, chosenDinners) => slotRows('', proposeWeek({ ...input, chosenDinners })).map(({ plan_week_id: _, ...s }) => s));
  const existing = list<{ id: string; slug: string }>(await db.from('recipes').select('id, slug').eq('household_id', hid), 'Reading recipes');
  const bySlug = new Map(existing.map((x) => [x.slug, x.id]));
  for (const n of plan.newRecipes) if (bySlug.has(n.slug)) throw new Error(`A recipe with the slug "${n.slug}" already exists. Pick another slug.`);
  const newSlugs = new Set(plan.newRecipes.map((n) => n.slug));
  for (const d of plan.dinners) if (!bySlug.has(d.recipe) && !newSlugs.has(d.recipe)) throw new Error(`No recipe "${d.recipe}" (${d.date}). Use a recipe from the context, or add it as a new recipe.`);

  const added: string[] = [];
  try {
    // New recipes first, so the planner can use them.
    for (const n of plan.newRecipes) {
      const row = await db.from('recipes').insert(recipeRow(hid, n)).select('id').single();
      if (row.error || !row.data?.id) throw new Error(`Adding ${n.title}: ${row.error?.message ?? 'no id came back'}`);
      added.push(row.data.id);
      bySlug.set(n.slug, row.data.id);
      const { ingredients, steps } = contentRows(n);
      const saved = await db.rpc('replace_recipe_contents', { p_recipe_id: row.data.id, p_ingredients: ingredients, p_steps: steps });
      if (saved.error) throw new Error(`Saving ${n.title}'s ingredients and steps: ${saved.error.message}`);
    }
    const input = await loadInput(db, hid, weekStart);
    const plannable = new Set(input.recipes.map((x) => x.id));
    const chosen = plan.dinners.map((d) => ({ date: d.date, recipeId: bySlug.get(d.recipe)!, reason: d.reason }));
    const left = plan.dinners.filter((d) => !plannable.has(bySlug.get(d.recipe)!));
    if (left.length) throw new Error(`Not plannable (archived, rated 👎, or a roast or hosting recipe): ${left.map((d) => d.recipe).join(', ')}.`);
    const res = await db.rpc('save_claude_week', { p_request: requestId, p_days: input.days, p_slots: propose(input, chosen), p_summary: plan.summary });
    if (res.error) {
      const code = Object.keys(CLOSED).find((k) => res.error.message.includes(k));
      if (code) {
        await db.from('week_plan_requests').update({ status: 'failed', summary: CLOSED[code], finished_at: new Date().toISOString() })
          .eq('id', requestId).in('status', ['requested', 'planning']);
        throw new Error(CLOSED[code]);
      }
      if (res.error.message.includes('not_planning')) throw new Error('The plan request was cancelled or closed while planning. Nothing was saved.');
      throw new Error(`Saving the week: ${res.error.message}`);
    }
    return { added: added.length };
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    // A save that went through but whose reply was lost keeps its new recipes (the week uses them).
    const req = added.length ? await db.from('week_plan_requests').select('status').eq('id', requestId).maybeSingle() : null;
    if (req?.data?.status === 'done') return { added: added.length };
    if (added.length) {
      const gone = await db.from('recipes').delete().in('id', added);
      if (gone?.error) msg += `\nAlso couldn't remove the new recipes (${added.join(', ')}): ${gone.error.message}`;
    }
    throw new Error(msg);
  }
}
