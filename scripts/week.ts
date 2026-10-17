// Helper for "Plan with Claude" (see docs/playbooks/week-plan.md). Runs on the owner's Mac with the service key from
// .env. Claude reads the household's picture with `context`, chooses the dinners, and pipes the plan into `save`;
// the built-in planner then fills breakfasts and lunches around those dinners.
//   npx tsx scripts/week.ts pending --household <id>       plan requests waiting (and Friday evening's own request)
//   npx tsx scripts/week.ts claim --request <id>           marks one 'planning' so no other check takes it
//   npx tsx scripts/week.ts context --request <id>         everything the plan needs, as JSON
//   npx tsx scripts/week.ts save --request <id> < plan.json {"summary", "dinners": [{date, recipe, reason}], "new_recipes"?}
//   npx tsx scripts/week.ts failed < failed.json           {"request": "<id>", "summary": "why"}
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { parseWeekFailed, parseWeekPlan } from './weekInput';
import { MEAL_SPEC } from '../src/lib/mealSpec';
import { loadPlannerInput } from '../supabase/functions/_shared/loadPlan';
import { slotRows } from '../supabase/functions/_shared/planInput';
import { addDays, proposeWeek } from '../supabase/functions/_shared/planner';
import { londonParts, nextMonday } from '../supabase/functions/_shared/schedule';
// @ts-expect-error plain JS helper
import { contentRows, recipeRow } from './recipeSeed.mjs';

const STALE_MS = 2 * 60 * 60 * 1000; // planning that started over 2 hours ago has stopped (Mac asleep)
const FRIDAY_FROM = 18;               // Friday from 6pm London time, Claude plans next week by itself
const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Request = { id: string; household_id: string; week_start: string; note: string | null; status: string; started_at: string | null };

async function loadRequest(id: string): Promise<Request> {
  return must<Request | null>(await db.from('week_plan_requests').select('id, household_id, week_start, note, status, started_at').eq('id', id).maybeSingle(), 'Finding the request')
    ?? fail(`No plan request with ID ${id}.`);
}

/** Requests waiting, oldest first. On Friday evening, next week gets its own request if it has no plan yet. */
async function pending() {
  const householdId = arg('household') ?? fail('--household is required');
  const { date, hour, weekday } = londonParts(new Date());
  if (weekday === 5 && hour >= FRIDAY_FROM) {
    const weekStart = nextMonday(date);
    const [week, asked] = await Promise.all([
      db.from('plan_weeks').select('id').eq('household_id', householdId).eq('week_start', weekStart).maybeSingle(),
      db.from('week_plan_requests').select('id').eq('household_id', householdId).eq('week_start', weekStart).limit(1),
    ]);
    // Only once: a week that was planned, or already asked for (even if that failed), is left alone.
    if (!must(week, 'Reading next week') && !must(asked, 'Reading requests')?.length) {
      const made = await db.from('week_plan_requests').insert({ household_id: householdId, week_start: weekStart, note: null });
      if (made.error && made.error.code !== '23505') fail(`Asking for Friday's plan: ${made.error.message}`);
    }
  }
  const rows = must<Request[]>(await db.from('week_plan_requests').select('id, household_id, week_start, note, status, started_at')
    .eq('household_id', householdId).in('status', ['requested', 'planning']).order('requested_at'), 'Reading requests');
  const waiting = [];
  for (const r of rows) {
    if (r.status === 'planning') {
      if (r.started_at && Date.now() - Date.parse(r.started_at) > STALE_MS) {
        must(await db.from('week_plan_requests').update({ status: 'failed', summary: 'Stopped part-way (the Mac may have slept).', finished_at: new Date().toISOString() }).eq('id', r.id), 'Closing a stalled request');
      }
      continue;
    }
    waiting.push({ id: r.id, weekStart: r.week_start, note: r.note });
  }
  console.log(JSON.stringify(waiting));
}

async function claim() {
  const id = arg('request') ?? fail('--request is required');
  const rows = must<Request[]>(await db.from('week_plan_requests').update({ status: 'planning', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'requested').select('id, household_id, week_start'), 'Claiming the request');
  if (!rows.length) fail('That request is already being planned or is finished.');
  const week = must<{ status: string } | null>(await db.from('plan_weeks').select('status').eq('household_id', rows[0].household_id).eq('week_start', rows[0].week_start).maybeSingle(), 'Reading the week');
  if (week?.status === 'approved') {
    must(await db.from('week_plan_requests').update({ status: 'failed', summary: 'That week is already approved, so it was left as it is.', finished_at: new Date().toISOString() }).eq('id', id), 'Closing the request');
    fail('That week is already approved. The request is closed as failed.');
  }
  console.log(`Request ${id} claimed.`);
}

/** Everything the plan needs: the week, the household's specifications and rules, recipes, freezer, pantry, pack
 *  sizes, recent dinners, and the built-in planner's proposal as a starting point. */
async function context() {
  const r = await loadRequest(arg('request') ?? fail('--request is required'));
  const hid = r.household_id;
  const input = await loadPlannerInput(db, hid, r.week_start);
  const [settings, members, rules, recipes, ingredients, recent, freezer, pantry, products] = await Promise.all([
    db.from('settings').select('data').eq('household_id', hid).maybeSingle(),
    db.from('members').select('name, kind, portion_weight').eq('household_id', hid),
    db.from('house_rules').select('kind, match, replacement, note').eq('household_id', hid),
    db.from('recipes').select('id, slug, title, subtitle, protein, finish_minutes, prep_minutes, reheats_well, freezes_well, tags, rating, status, base_portions').eq('household_id', hid).eq('kind', 'meal'),
    db.from('recipe_ingredients').select('recipe_id, name, qty, unit, recipes!inner(household_id, kind)').eq('recipes.household_id', hid).eq('recipes.kind', 'meal'),
    db.from('plan_weeks').select('week_start, meal_slots(date, slot, mode, recipe_id)').eq('household_id', hid).gte('week_start', addDays(r.week_start, -28)).lt('week_start', r.week_start),
    db.from('prepared_items').select('name, recipe_id, portions, use_by').eq('household_id', hid).eq('location', 'freezer').gt('portions', 0),
    db.from('pantry_items').select('staple_status, qty, unit, location, ingredients(name)').eq('household_id', hid),
    db.from('products').select('item_key, product_name, pack_size, pack_unit').eq('household_id', hid),
  ]);
  const data = <T>(res: { data: T | null; error: { message: string } | null }, what: string) => must(res, what) ?? ([] as unknown as T);
  const s = (must(settings, 'Reading settings') as { data: Record<string, unknown> } | null)?.data ?? {};
  const all = data(recipes, 'Reading recipes') as { id: string; slug: string; [k: string]: unknown }[];
  const slugOf = new Map(all.map((x) => [x.id, x.slug]));
  const plannable = new Set(input.recipes.map((x) => x.id));
  const ings = data(ingredients, 'Reading ingredients') as { recipe_id: string; name: string; qty: number | null; unit: string }[];
  const lastCooked = new Map<string, string>();
  const recentDinners: { date: string; recipe: string | null; mode: string }[] = [];
  for (const w of data(recent, 'Reading recent weeks') as { meal_slots: { date: string; slot: string; mode: string; recipe_id: string | null }[] }[]) {
    for (const sl of w.meal_slots.filter((x) => x.slot === 'dinner')) {
      recentDinners.push({ date: sl.date, recipe: sl.recipe_id ? slugOf.get(sl.recipe_id) ?? null : null, mode: sl.mode });
      if (sl.mode === 'cook' && sl.recipe_id && (lastCooked.get(sl.recipe_id) ?? '') < sl.date) lastCooked.set(sl.recipe_id, sl.date);
    }
  }
  const nameOf = (i: unknown) => (Array.isArray(i) ? i[0]?.name : (i as { name?: string } | null)?.name) ?? '';
  const proposal = proposeWeek(input).filter((x) => x.slot === 'dinner')
    .map((x) => ({ date: x.date, recipe: x.recipeId ? slugOf.get(x.recipeId) ?? null : null, reason: x.reason }));

  console.log(JSON.stringify({
    request: { id: r.id, note: r.note },
    week: {
      start: r.week_start, days: input.days,
      dates: Array.from({ length: input.days }, (_, i) => ({ date: addDays(r.week_start, i), day: DAY[i], office: input.officeDays.includes(i) })),
      householdPortions: input.householdPortions,
    },
    rules: {
      proteinBalance: input.balance, weekdayDinnerMaxMinutes: input.weekdayMaxMin, officeDayMaxMinutes: Math.min(20, input.weekdayMaxMin),
      dayRules: s.day_rules ?? [], otherShops: s.other_shops ?? [], newRecipesAllowed: s.adventure ?? 1,
      whatMakesAMeal: MEAL_SPEC, houseRules: data(rules, 'Reading house rules'), privateRules: Array.isArray(s.private_rules) ? s.private_rules : [],
    },
    members: data(members, 'Reading members'),
    recipes: all.filter((x) => plannable.has(x.id)).map(({ id, ...x }) => ({
      ...x, lastCooked: lastCooked.get(id) ?? null,
      ingredients: ings.filter((i) => i.recipe_id === id).map((i) => [i.qty, i.unit, i.name].filter((v) => v !== null && v !== '').join(' ')),
    })),
    recentDinners: recentDinners.sort((a, b) => a.date.localeCompare(b.date)),
    freezer: (data(freezer, 'Reading the freezer') as { name: string; recipe_id: string | null; portions: number; use_by: string | null }[])
      .map((f) => ({ name: f.name, recipe: f.recipe_id ? slugOf.get(f.recipe_id) ?? null : null, portions: f.portions, useBy: f.use_by })),
    pantry: (data(pantry, 'Reading the pantry') as { staple_status: string | null; qty: number | null; unit: string | null; location: string; ingredients: unknown }[])
      .map((p) => ({ name: nameOf(p.ingredients), location: p.location, ...(p.staple_status ? { staple: p.staple_status } : { qty: p.qty, unit: p.unit }) })),
    packSizes: (data(products, 'Reading products') as { item_key: string; product_name: string; pack_size: number | null; pack_unit: string }[])
      .filter((p) => p.pack_size).map((p) => ({ item: p.item_key.split('|')[0], pack: `${p.pack_size}${p.pack_unit}`, product: p.product_name })),
    builtInProposal: proposal,
  }, null, 2));
}

/** Adds Claude's new recipes, plans the week around Claude's dinners, and saves it all, or nothing. */
async function save() {
  const r = await loadRequest(arg('request') ?? fail('--request is required'));
  if (r.status !== 'planning') fail(`That request is ${r.status}, not planning. Claim it first.`);
  const hid = r.household_id;
  const settings = must<{ data: { adventure?: number } } | null>(await db.from('settings').select('data').eq('household_id', hid).maybeSingle(), 'Reading settings');
  const before = await loadPlannerInput(db, hid, r.week_start);
  const plan = read((t) => parseWeekPlan(t, { weekStart: r.week_start, days: before.days, adventure: settings?.data?.adventure ?? 1 }), await stdin());

  const existing = must<{ id: string; slug: string }[]>(await db.from('recipes').select('id, slug').eq('household_id', hid), 'Reading recipes');
  const bySlug = new Map(existing.map((x) => [x.slug, x.id]));
  for (const n of plan.newRecipes) if (bySlug.has(n.slug)) fail(`A recipe with the slug "${n.slug}" already exists. Pick another slug.`);
  const newSlugs = new Set(plan.newRecipes.map((n) => n.slug));
  for (const d of plan.dinners) if (!bySlug.has(d.recipe) && !newSlugs.has(d.recipe)) fail(`No recipe "${d.recipe}" (${d.date}). Use a slug from context, or add it under new_recipes.`);

  // New recipes first, so the planner can use them; they go again if anything after this fails.
  const added: string[] = [];
  const undo = async (msg: string): Promise<never> => {
    if (added.length) await db.from('recipes').delete().in('id', added);
    return fail(msg);
  };
  for (const n of plan.newRecipes) {
    const row = await db.from('recipes').insert(recipeRow(hid, n)).select('id').single();
    if (row.error) await undo(`Adding ${n.title}: ${row.error.message}`);
    added.push(row.data!.id);
    bySlug.set(n.slug, row.data!.id);
    const { ingredients, steps } = contentRows(n);
    const saved = await db.rpc('replace_recipe_contents', { p_recipe_id: row.data!.id, p_ingredients: ingredients, p_steps: steps });
    if (saved.error) await undo(`Saving ${n.title}'s ingredients and steps: ${saved.error.message}`);
  }

  const input = await loadPlannerInput(db, hid, r.week_start);
  const plannable = new Set(input.recipes.map((x) => x.id));
  const chosenDinners = plan.dinners.map((d) => ({ date: d.date, recipeId: bySlug.get(d.recipe)!, reason: d.reason }));
  const left = chosenDinners.filter((c) => !plannable.has(c.recipeId));
  if (left.length) await undo(`Not plannable (archived, rated 👎, or a roast or hosting recipe): ${left.map((c) => plan.dinners.find((d) => d.date === c.date)!.recipe).join(', ')}.`);
  const slots = slotRows('', proposeWeek({ ...input, chosenDinners })).map(({ plan_week_id: _, ...s }) => s);
  const res = await db.rpc('save_claude_week', { p_request: r.id, p_days: input.days, p_slots: slots, p_summary: plan.summary });
  if (res.error) {
    const why = res.error.message.includes('week_approved') ? 'That week was approved while planning, so it was left as it is.' : res.error.message;
    await undo(`Saving the week: ${why}`);
  }
  console.log(`Planned the week of ${r.week_start}${added.length ? ` with ${added.length} new recipe${added.length === 1 ? '' : 's'}` : ''}.`);
}

async function failed() {
  const f = read(parseWeekFailed, await stdin());
  const closed = must<{ id: string }[]>(await db.from('week_plan_requests').update({ status: 'failed', summary: f.summary, finished_at: new Date().toISOString() })
    .eq('id', f.request).eq('status', 'planning').select('id'), 'Closing the request');
  if (!closed.length) fail('That request is not being planned (finished, or never claimed). Not changing it.');
  console.log(`Request ${f.request} marked failed.`);
}

const commands: Record<string, () => Promise<void>> = { pending, claim, context, save, failed };
await (commands[command] ?? (() => fail('Use: pending | claim | context | save | failed')))();
