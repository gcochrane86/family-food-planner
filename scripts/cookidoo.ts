// Helper for syncing approved menus to Cookidoo (see docs/playbooks/cookidoo.md). It never touches Cookidoo itself:
// Claude does that in Chrome. Record/finish commands read JSON on stdin so page text never goes through a shell.
//   npx tsx scripts/cookidoo.ts pending --household <id>          waiting syncs (cheap: no browsing)
//   npx tsx scripts/cookidoo.ts claim --run <id>                  marks a sync 'filling' so no other check takes it
//   npx tsx scripts/cookidoo.ts plan --run <id>                   what to send and what to change in My Week
//   npx tsx scripts/cookidoo.ts record-recipe --household <id> < r.json   {"recipeId","url","portions"}
//   npx tsx scripts/cookidoo.ts record-day --run <id> < d.json            {"date","recipeId"|null}
//   npx tsx scripts/cookidoo.ts finish < f.json                           {"run","status":"done"|"failed","summary"}
//   npx tsx scripts/cookidoo.ts record-own --household <id> < o.json      {"slug","url"} an imported recipe's original
import { cookidooRecipe, finishStatus, hasTm7Steps, myWeekChanges, portionsToSend, textHash, whyToSend } from '../src/lib/cookidoo';
import type { MealSlot, RecipeDetail } from '../src/lib/types';
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { parseCookidooFinish, parseRecordDay, parseRecordOwn, parseRecordRecipe } from './cookidooInput';

const STALE_MS = 2 * 60 * 60 * 1000;
type Run = { id: string; plan_week_id: string; status: string; started_at: string | null; requested_at: string };
type CookidooRecipe = RecipeDetail & { cookidoo_status: string; cookidoo_url: string | null; cookidoo_portions: number | null; cookidoo_hash: string | null; cookidoo_own_url: string | null };
type Ing = RecipeDetail['ingredients'][number] & { recipe_id: string };
type Step = RecipeDetail['steps'][number] & { recipe_id: string };
const NONE = ['00000000-0000-0000-0000-000000000000'];

/** Recipes with their ingredients and steps, for the Cookidoo text. */
async function loadRecipes(ids: string[]): Promise<Map<string, CookidooRecipe>> {
  const list = ids.length ? ids : NONE;
  const [r, i, st] = await Promise.all([
    db.from('recipes').select('*').in('id', list),
    db.from('recipe_ingredients').select('*').in('recipe_id', list).order('position'),
    db.from('recipe_steps').select('*').in('recipe_id', list).order('position'),
  ]);
  const ings = must<Ing[]>(i, 'Reading ingredients');
  const steps = must<Step[]>(st, 'Reading steps');
  return new Map(must<CookidooRecipe[]>(r, 'Reading recipes').map((x) => [x.id, {
    ...x, base_portions: Number(x.base_portions),
    ingredients: ings.filter((g) => g.recipe_id === x.id).map((g) => ({ ...g, qty: g.qty === null ? null : Number(g.qty) })),
    steps: steps.filter((s) => s.recipe_id === x.id),
  }]));
}

async function pending() {
  const householdId = arg('household') ?? fail('--household is required');
  const weeks = must<{ id: string; week_start: string }[]>(await db.from('plan_weeks').select('id, week_start').eq('household_id', householdId), 'Reading weeks');
  const start = new Map(weeks.map((w) => [w.id, w.week_start]));
  const runs = must<Run[]>(await db.from('cookidoo_runs').select('id, plan_week_id, status, started_at, requested_at')
    .in('plan_week_id', weeks.length ? weeks.map((w) => w.id) : ['00000000-0000-0000-0000-000000000000'])
    .in('status', ['requested', 'filling']).order('requested_at'), 'Reading syncs');
  const waiting = [];
  for (const r of runs) {
    if (r.status === 'filling') {
      if (r.started_at && Date.now() - Date.parse(r.started_at) > STALE_MS) {
        must(await db.from('cookidoo_runs').update({ status: 'failed', summary: 'Stopped part-way (the Mac may have slept). Tap Try again on the week.', finished_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'filling'), 'Closing a stalled sync');
      }
      continue;
    }
    waiting.push({ id: r.id, weekStart: start.get(r.plan_week_id) });
  }
  console.log(JSON.stringify(waiting));
}

async function claim() {
  const id = arg('run') ?? fail('--run is required');
  const rows = must<{ id: string }[]>(await db.from('cookidoo_runs').update({ status: 'filling', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'requested').select('id'), 'Claiming the sync');
  if (!rows.length) fail('That sync is already under way or finished.');
  console.log(`Sync ${id} claimed.`);
}

async function loadRun(id: string) {
  const run = must<Run | null>(await db.from('cookidoo_runs').select('id, plan_week_id, status, started_at, requested_at').eq('id', id).maybeSingle(), 'Reading the sync')
    ?? fail('No such sync.');
  const week = must<{ id: string; week_start: string; household_id: string; status: string }>(
    await db.from('plan_weeks').select('id, week_start, household_id, status').eq('id', run.plan_week_id).single(), 'Reading the week');
  const slots = must<MealSlot[]>(await db.from('meal_slots').select('*').eq('plan_week_id', week.id).eq('slot', 'dinner').order('date'), 'Reading dinners')
    .map((s) => ({ ...s, portions: s.portions === null ? null : Number(s.portions) }));
  return { run, week, slots };
}

async function plan() {
  const { run, week, slots } = await loadRun(arg('run') ?? fail('--run is required'));
  const planned = slots.filter((s) => s.mode === 'cook' && s.recipe_id);
  const byId = await loadRecipes([...new Set([...planned.map((s) => s.recipe_id!), ...slots.map((s) => s.cookidoo_recipe_id).filter((x): x is string => !!x)])]);
  // Only recipes with Thermomix steps go to Cookidoo (and My Week); the rest stay in the app only.
  const cooked = planned.filter((s) => { const r = byId.get(s.recipe_id!); return !!r && (hasTm7Steps(r) || !!r.cookidoo_own_url); });
  const ids = [...new Set(cooked.map((s) => s.recipe_id!))];
  const send = [];
  for (const id of ids) {
    const r = byId.get(id)!;
    const text = cookidooRecipe(r, portionsToSend(slots, id, r.base_portions));
    const hash = textHash(text);
    const why = whyToSend(r, hash);
    if (!why && r.cookidoo_status === 'outdated') {
      // Re-seeded with no real change: nothing to send, so it's up to date again.
      must(await db.from('recipes').update({ cookidoo_status: 'sent' }).eq('id', id), 'Marking an unchanged recipe up to date');
    }
    if (why) send.push({ recipeId: id, why, url: r.cookidoo_url, text });
  }
  const changes = myWeekChanges(cooked.map((s) => ({ date: s.date, recipeId: s.recipe_id! })), slots.map((s) => ({ date: s.date, recipeId: s.cookidoo_recipe_id ?? null })));
  const named = (d: { date: string; recipeId: string }) => {
    const r = byId.get(d.recipeId);
    return { ...d, title: r?.title ?? '?', url: r?.cookidoo_own_url ?? r?.cookidoo_url ?? null };
  };
  console.log(JSON.stringify({ run: { id: run.id, weekStart: week.week_start, approved: week.status === 'approved' }, send, myWeek: { add: changes.add.map(named), remove: changes.remove.map(named) } }, null, 2));
}

async function recordRecipe() {
  const householdId = arg('household') ?? fail('--household is required');
  const r = read(parseRecordRecipe, await stdin());
  const recipe = (await loadRecipes([r.recipeId])).get(r.recipeId);
  if (!recipe || recipe.household_id !== householdId) fail('That recipe is not in this household.');
  // The fingerprint of exactly what was sent, so later syncs only edit it when the text really changes.
  const hash = textHash(cookidooRecipe(recipe!, r.portions));
  must(await db.from('recipes').update({ cookidoo_status: 'sent', cookidoo_url: r.url, cookidoo_portions: r.portions, cookidoo_hash: hash })
    .eq('id', r.recipeId).eq('household_id', householdId), 'Saving the Cookidoo link');
  console.log(`Recorded ${r.recipeId} → ${r.url} (use this link for My Week)`);
}

async function recordDay() {
  const { week } = await loadRun(arg('run') ?? fail('--run is required'));
  const d = read(parseRecordDay, await stdin());
  const rows = must<{ id: string }[]>(await db.from('meal_slots').update({ cookidoo_recipe_id: d.recipeId })
    .eq('plan_week_id', week.id).eq('date', d.date).eq('slot', 'dinner').select('id'), 'Saving the My Week entry');
  if (!rows.length) fail(`No dinner on ${d.date} in that week.`);
  console.log(`My Week ${d.date}: ${d.recipeId ?? 'cleared'}`);
}

async function finish() {
  const f = read(parseCookidooFinish, await stdin());
  const run = must<Run | null>(await db.from('cookidoo_runs').select('id, plan_week_id, status, started_at, requested_at').eq('id', f.run).maybeSingle(), 'Reading the sync')
    ?? fail('No such sync.');
  if (run.status !== 'filling') fail(`That sync is ${run.status}, not under way: nothing to finish.`);
  const status = finishStatus(run, f.status);
  const rows = must<{ id: string }[]>(await db.from('cookidoo_runs')
    .update({ status, summary: f.summary, finished_at: status === 'requested' ? null : new Date().toISOString(), started_at: status === 'requested' ? null : run.started_at })
    .eq('id', f.run).eq('status', 'filling').eq('started_at', run.started_at!).select('id'), 'Closing the sync');
  if (!rows.length) fail('That sync changed hands while finishing; leave it.');
  console.log(status === 'requested' ? `Sync ${f.run}: the week changed meanwhile, so it's queued to run again.` : `Sync ${f.run} marked ${status}.`);
}

async function recordOwn() {
  const householdId = arg('household') ?? fail('--household is required');
  const o = read(parseRecordOwn, await stdin());
  const rows = must<{ id: string }[]>(await db.from('recipes').update({ cookidoo_own_url: o.url })
    .eq('household_id', householdId).eq('slug', o.slug).select('id'), 'Saving the original Cookidoo link');
  if (!rows.length) fail(`No recipe "${o.slug}" in this household.`);
  console.log(`Linked ${o.slug} to its original in your Cookidoo.`);
}

const commands: Record<string, () => Promise<void>> = { pending, claim, plan, 'record-recipe': recordRecipe, 'record-day': recordDay, finish, 'record-own': recordOwn };
await (commands[command] ?? (() => fail('Use: pending | claim | plan | record-recipe | record-day | finish | record-own')))();
