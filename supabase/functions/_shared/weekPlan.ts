// Planning a week with Claude (docs/playbooks/week-plan.md): everything the plan needs, and saving Claude's dinners
// (and any new recipes) as a draft week, all or nothing. Shared by the week CLI on the Mac and the Ask Claude
// connector, so the two can't drift. Pure TS with the database client passed in.
import { MAX_MINUTES, MIN_MINUTES } from './cookingTime.ts';
import { loadPlannerInput } from './loadPlan.ts';
import { parseChoices, type PlanChoices } from './planChoices.ts';
import { compareTargets, dayBalance, parseNutrition, personDay } from './balance.ts';
import { parseSnacks, snackMakeDates, snackRows, type SnackMake } from './snackPlan.ts';
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
  /** Today's cooking: the week's own time for some days, from the household's note; null when there are none. */
  cookingMinutes: Record<string, number> | null;
  /** Snack makes (daily balance): made on prep days, covering the days after while they keep. */
  snacks: SnackMake[];
}

/** Everything the plan needs: the week, the household's specifications and rules, recipes, freezer, pantry, pack
 *  sizes, recent dinners, whether the week already has a draft or is approved, the rules for a new recipe, and the
 *  built-in planner's proposal as a starting point. */
export async function planContext(db: Db, hid: string, weekStart: string) {
  const made = await weekChoices(db, hid, weekStart);
  const choices = made?.choices ?? null;
  const input = await loadPlannerInput(db, hid, weekStart, choices);
  const [settings, members, rules, recipes, recent, freezer, pantry, products, existing] = await Promise.all([
    db.from('settings').select('data').eq('household_id', hid).maybeSingle(),
    db.from('members').select('name, kind, portion_weight, targets').eq('household_id', hid),
    db.from('house_rules').select('kind, match, replacement, note').eq('household_id', hid),
    // Ingredients nested in each recipe, so a big library isn't cut off at the API's row limit.
    db.from('recipes').select('id, slug, title, subtitle, kind, protein, finish_minutes, prep_minutes, reheats_well, freezes_well, tags, rating, status, base_portions, nutrition, keeps_days, toddler_ok, recipe_ingredients(name, qty, unit)').eq('household_id', hid).in('kind', ['meal', 'snack']),
    db.from('plan_weeks').select('week_start, meal_slots(date, slot, mode, recipe_id)').eq('household_id', hid).gte('week_start', addDays(weekStart, -28)).lt('week_start', weekStart),
    db.from('prepared_items').select('name, recipe_id, portions, use_by').eq('household_id', hid).eq('location', 'freezer').gt('portions', 0),
    db.from('pantry_items').select('staple_status, qty, unit, location, ingredients(name)').eq('household_id', hid),
    db.from('products').select('item_key, product_name, pack_size, pack_unit').eq('household_id', hid),
    db.from('plan_weeks').select('status').eq('household_id', hid).eq('week_start', weekStart).maybeSingle(),
  ]);
  const s = (must(settings, 'Reading settings') as { data: Record<string, unknown> } | null)?.data ?? {};
  type Ing = { name: string; qty: number | null; unit: string };
  const everything = list(recipes, 'Reading recipes') as { id: string; slug: string; kind?: string; recipe_ingredients: Ing[]; [k: string]: unknown }[];
  const all = everything.filter((x) => (x.kind ?? 'meal') === 'meal');
  const snacks = everything.filter((x) => x.kind === 'snack' && x.status !== 'archived');
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
  const proposed = proposeWeek(input);
  const proposal = proposed.filter((x) => x.slot === 'dinner')
    .map((x) => ({ date: x.date, recipe: x.recipeId ? slugOf.get(x.recipeId) ?? null : null, reason: x.reason }));
  // Daily balance: what the built-in proposal would give each day, so snacks can be aimed at the gaps.
  const routines = (s.routine_nutrition && typeof s.routine_nutrition === 'object' ? s.routine_nutrition : {}) as Record<string, unknown>;
  const estimates = new Map(everything.map((x) => [x.id, { nutrition: x.nutrition, reheats_well: x.reheats_well === true, toddler_ok: x.toddler_ok !== false }]));
  const homeLunches = Array.isArray(s.lunches) && s.lunches.length ? s.lunches as string[] : ['Chicken sandwich'];
  const balanceSlots = proposed.map((x) => ({ date: x.date, slot: x.slot, mode: x.mode, recipe_id: x.recipeId, reason: x.reason, source_date: x.sourceDate }));
  const people = list(members, 'Reading members') as { name: string; kind: string; portion_weight: number | string; targets?: Record<string, number> | null }[];
  const builtInBalance = Array.from({ length: input.days }, (_, i) => addDays(weekStart, i)).map((date) => {
    const b = dayBalance(date, balanceSlots, estimates, routines, { homeLunches, share: Number(people.find((m) => m.kind === 'adult')?.portion_weight) || 1.25 });
    return {
      date, low: b.low, unknown: (['breakfastProtein', 'vegFruit', 'healthyFat', 'fibre'] as const).filter((k) => b[k] === 'unknown'),
      // Each person's day (meals by their portion share) against their own targets.
      people: people.map((m) => {
        const d = personDay(date, balanceSlots, estimates, routines, m, { homeLunches });
        const states = compareTargets(d.totals, m.targets, d.unknown);
        return { name: m.name, totals: d.totals, targets: m.targets ?? {}, off: Object.entries(states).filter(([, v]) => v === 'under' || v === 'over').map(([k, v]) => `${v} ${k}`) };
      }),
    };
  });
  const names = [...new Set([...(Array.isArray(s.breakfasts) ? s.breakfasts : []), ...(Array.isArray(s.lunches) ? s.lunches : []), 'Packed lunch']
    .filter((n): n is string => typeof n === 'string' && !!n.trim()))];
  const week = must(existing, 'Reading the week') as { status: string } | null;

  return {
    week: {
      start: weekStart, days: input.days,
      dates: Array.from({ length: input.days }, (_, i) => ({
        date: addDays(weekStart, i), day: DAY[i], office: input.officeDays.includes(i),
        nightOff: (choices?.nightsOff ?? []).includes(addDays(weekStart, i)), prepDay: (choices?.prepDays ?? []).includes(i),
      })),
      householdPortions: input.householdPortions,
      existing: !week ? 'none' : week.status === 'approved' ? 'approved' : 'draft',
    },
    rules: {
      proteinBalance: input.balance, weekdayDinnerMaxMinutes: input.weekdayMaxMin, officeDayMaxMinutes: Math.min(OFFICE_MAX, input.weekdayMaxMin),
      // Today's cooking: each day's time for cooking (the dinner's cook, the next day's prep, the extras).
      // Snack makes: the days a snack can be made (the Sunday before the week stands for a Sunday prep day).
      snackMakeDates: snackMakeDates(weekStart, input.days, choices?.prepDays ?? (Array.isArray(s.prep_days) ? s.prep_days as number[] : [])),
      cookingTime: (input.dayMinutes ?? Array(7).fill(60)).slice(0, input.days).map((minutes, i) => ({ date: addDays(weekStart, i), day: DAY[i], minutes })),
      dayRules: s.day_rules ?? [], otherShops: s.other_shops ?? [], newRecipesAllowed: choices ? choices.newRecipes : s.adventure ?? 1,
      // Plan with Claude: the week's choices (none without an open request from the app).
      choicesMadeOn: made?.madeOn ?? null,
      nightsOff: choices?.nightsOff ?? [], prepDays: (choices?.prepDays ?? []).map((d) => DAY[d]), useUp: choices?.useUp ?? [],
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
    builtInBalance,
    snackRecipes: snacks.map(({ id: _id, recipe_ingredients: ings, kind: _k, ...x }) => ({
      slug: x.slug, title: x.title, keepsDays: x.keeps_days ?? null, toddlerOk: x.toddler_ok !== false, nutrition: parseNutrition(x.nutrition),
      ingredients: (ings ?? []).map((i) => [i.qty, i.unit, i.name].filter((v) => v !== null && v !== '').join(' ')),
    })),
    // Estimates still to make (save_nutrition): plannable dinners, and breakfasts and lunches that are names.
    nutritionMissing: {
      recipes: [...all.filter((x) => plannable.has(x.id)), ...snacks].filter((x) => !parseNutrition(x.nutrition)).map((x) => x.slug),
      routines: names.filter((n) => !parseNutrition(routines[n])),
    },
  };
}

/** The summary on a request the household cancelled (src/lib/types.ts CANCELLED). */
const CANCELLED = 'Cancelled';

/** The choices the week was planned with on the app's Plan with Claude screen: the newest request for the week that
 *  carries some, whether still open or already saved (so a second save in the same chat keeps them), unless the
 *  household cancelled it. With the day they were made; null for the usual week. */
export async function weekChoices(db: Db, hid: string, weekStart: string): Promise<{ choices: PlanChoices; madeOn: string } | null> {
  const res = await db.from('week_plan_requests').select('choices, summary, requested_at').eq('household_id', hid).eq('week_start', weekStart)
    .not('choices', 'is', null).order('requested_at', { ascending: false }).limit(1);
  // No choices column before migration 0022: the usual week.
  if (res.error) return null;
  const latest = (res.data ?? [])[0] as { choices: unknown; summary: string | null; requested_at: string } | undefined;
  if (!latest || latest.summary === CANCELLED) return null;
  const choices = parseChoices(latest.choices, weekStart);
  return choices ? { choices, madeOn: String(latest.requested_at).slice(0, 10) } : null;
}

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A dinner Claude put on a night off, as words to fix, or null. */
export function nightOffDinner(plan: WeekPlan, choices: PlanChoices | null | undefined): string | null {
  const hit = plan.dinners.find((d) => (choices?.nightsOff ?? []).includes(d.date));
  return hit ? `${shortDay(hit.date)} is a night off. Leave it out.` : null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const need = (v: string | null, what: string) => v ?? (() => { throw new Error(`"${what}" is required`); })();

/** Claude's plan: a summary, a dinner for some or all nights, and up to `adventure` new recipes. */
export function parsePlan(input: unknown, week: { weekStart: string; days: number; adventure: number; snackDates?: string[] }): WeekPlan {
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
  // The week's own cooking times: days in the week, 30–240 minutes; anything else is left out.
  const cooking: Record<string, number> = {};
  if (o.cooking_minutes && typeof o.cooking_minutes === 'object' && !Array.isArray(o.cooking_minutes)) {
    for (const [date, m] of Object.entries(o.cooking_minutes as Record<string, unknown>)) {
      if (dates.includes(date) && typeof m === 'number' && m >= MIN_MINUTES && m <= MAX_MINUTES) cooking[date] = Math.round(m);
    }
  }
  const snacks = parseSnacks(o.snacks, { weekStart: week.weekStart, days: week.days, makeDates: week.snackDates ?? snackMakeDates(week.weekStart, week.days, []) });
  return { summary, dinners, newRecipes, cookingMinutes: Object.keys(cooking).length ? cooking : null, snacks };
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
  deps: { loadInput?: typeof loadPlannerInput; propose?: (input: Awaited<ReturnType<typeof loadPlannerInput>>, chosen: { date: string; recipeId: string; reason: string }[]) => Record<string, unknown>[];
    /** The week's choices from the app's Plan with Claude screen. */
    choices?: PlanChoices | null } = {}): Promise<{ added: number }> {
  const loadInput = deps.loadInput ?? loadPlannerInput;
  const propose = deps.propose ?? ((input, chosenDinners) => slotRows('', proposeWeek({ ...input, chosenDinners })).map(({ plan_week_id: _, ...s }) => s));
  const existing = list<{ id: string; slug: string; keeps_days?: number | null; toddler_ok?: boolean }>(await db.from('recipes').select('id, slug, keeps_days, toddler_ok').eq('household_id', hid), 'Reading recipes');
  const bySlug = new Map(existing.map((x) => [x.slug, x.id]));
  const snackInfo = new Map(existing.map((x) => [x.slug, { keeps_days: x.keeps_days ?? null, toddler_ok: x.toddler_ok !== false }]));
  for (const n of plan.newRecipes) snackInfo.set(n.slug, { keeps_days: n.keeps_days ?? null, toddler_ok: n.toddler_ok !== false });
  for (const n of plan.newRecipes) if (bySlug.has(n.slug)) throw new Error(`A recipe with the slug "${n.slug}" already exists. Pick another slug.`);
  const newSlugs = new Set(plan.newRecipes.map((n) => n.slug));
  for (const d of plan.dinners) if (!bySlug.has(d.recipe) && !newSlugs.has(d.recipe)) throw new Error(`No recipe "${d.recipe}" (${d.date}). Use a recipe from the context, or add it as a new recipe.`);
  const off = nightOffDinner(plan, deps.choices);
  if (off) throw new Error(`${off} Nothing was saved.`);
  for (const sn of plan.snacks ?? []) if (!bySlug.has(sn.recipe) && !newSlugs.has(sn.recipe)) throw new Error(`No snack recipe "${sn.recipe}". Use one from snackRecipes, or add it as a new snack recipe.`);
  // Who the snacks are for: the adults, and the children on a toddler-friendly snack.
  const kinds = (plan.snacks ?? []).length ? list<{ kind: string }>(await db.from('members').select('kind').eq('household_id', hid), 'Reading members') : [];
  const people = { adults: kinds.filter((m) => m.kind === 'adult').length || 2, children: kinds.filter((m) => m.kind === 'child').length };
  // Checked before anything is written (ids for new recipes are filled in once they're added).
  snackRows(plan.snacks ?? [], new Map((plan.snacks ?? []).map((sn) => [sn.recipe, { id: sn.recipe, ...(snackInfo.get(sn.recipe) ?? { keeps_days: null, toddler_ok: true }) }])), people);

  const added: string[] = [];
  try {
    // New recipes first, so the planner can use them.
    for (const n of plan.newRecipes) {
      const row = await db.from('recipes').insert({ ...recipeRow(hid, n), planned_for: weekStart }).select('id').single();
      if (row.error || !row.data?.id) throw new Error(`Adding ${n.title}: ${row.error?.message ?? 'no id came back'}`);
      added.push(row.data.id);
      bySlug.set(n.slug, row.data.id);
      const { ingredients, steps } = contentRows(n);
      const saved = await db.rpc('replace_recipe_contents', { p_recipe_id: row.data.id, p_ingredients: ingredients, p_steps: steps });
      if (saved.error) throw new Error(`Saving ${n.title}'s ingredients and steps: ${saved.error.message}`);
    }
    const loaded = await loadInput(db, hid, weekStart, deps.choices);
    // The week's own times win over the days' settings for the planning around Claude's dinners.
    const own = plan.cookingMinutes;
    const input = own && loaded.dayMinutes ? { ...loaded, dayMinutes: loaded.dayMinutes.map((m, i) => own[addDays(weekStart, i)] ?? m) } : loaded;
    const plannable = new Set(input.recipes.map((x) => x.id));
    const chosen = plan.dinners.map((d) => ({ date: d.date, recipeId: bySlug.get(d.recipe)!, reason: d.reason }));
    const left = plan.dinners.filter((d) => !plannable.has(bySlug.get(d.recipe)!));
    if (left.length) throw new Error(`Not plannable (archived, rated 👎, or a roast or hosting recipe): ${left.map((d) => d.recipe).join(', ')}.`);
    const snackSlots = snackRows(plan.snacks ?? [], new Map((plan.snacks ?? []).map((sn) => [sn.recipe, { id: bySlug.get(sn.recipe)!, ...(snackInfo.get(sn.recipe) ?? { keeps_days: null, toddler_ok: true }) }])), people);
    const res = await db.rpc('save_claude_week', { p_request: requestId, p_days: input.days, p_slots: [...propose(input, chosen), ...snackSlots], p_summary: plan.summary, p_cooking: plan.cookingMinutes,
      ...(deps.choices ? { p_office: deps.choices.office, p_prep: deps.choices.prepDays } : {}) });
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
