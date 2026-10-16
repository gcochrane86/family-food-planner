// Helper for syncing approved menus to Cookidoo (see docs/playbooks/cookidoo.md). It never touches Cookidoo itself:
// Claude does that in Chrome. Record/finish commands read JSON on stdin so page text never goes through a shell.
//   npx tsx scripts/cookidoo.ts pending --household <id>          waiting syncs (cheap: no browsing)
//   npx tsx scripts/cookidoo.ts claim --run <id>                  marks a sync 'filling' so no other check takes it
//   npx tsx scripts/cookidoo.ts plan --run <id>                   what to send and what to change in My Week
//   npx tsx scripts/cookidoo.ts record-recipe --household <id> < r.json   {"recipeId","url","portions"}
//   npx tsx scripts/cookidoo.ts record-day --run <id> < d.json            {"date","recipeId"|null}
//   npx tsx scripts/cookidoo.ts finish < f.json                           {"run","status":"done"|"failed","summary"}
import { cookidooRecipe, myWeekChanges, portionsToSend } from '../src/lib/cookidoo';
import type { MealSlot, RecipeDetail } from '../src/lib/types';
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { parseCookidooFinish, parseRecordDay, parseRecordRecipe } from './cookidooInput';

const STALE_MS = 2 * 60 * 60 * 1000;
type Run = { id: string; plan_week_id: string; status: string; started_at: string | null };

async function pending() {
  const householdId = arg('household') ?? fail('--household is required');
  const weeks = must<{ id: string; week_start: string }[]>(await db.from('plan_weeks').select('id, week_start').eq('household_id', householdId), 'Reading weeks');
  const start = new Map(weeks.map((w) => [w.id, w.week_start]));
  const runs = must<Run[]>(await db.from('cookidoo_runs').select('id, plan_week_id, status, started_at')
    .in('plan_week_id', weeks.length ? weeks.map((w) => w.id) : ['00000000-0000-0000-0000-000000000000'])
    .in('status', ['requested', 'filling']).order('requested_at'), 'Reading syncs');
  const waiting = [];
  for (const r of runs) {
    if (r.status === 'filling') {
      if (r.started_at && Date.now() - Date.parse(r.started_at) > STALE_MS) {
        must(await db.from('cookidoo_runs').update({ status: 'failed', summary: 'Stopped part-way (the Mac may have slept). It will try again after the next change.', finished_at: new Date().toISOString() }).eq('id', r.id), 'Closing a stalled sync');
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
  const run = must<Run | null>(await db.from('cookidoo_runs').select('id, plan_week_id, status, started_at').eq('id', id).maybeSingle(), 'Reading the sync')
    ?? fail('No such sync.');
  const week = must<{ id: string; week_start: string; household_id: string; status: string }>(
    await db.from('plan_weeks').select('id, week_start, household_id, status').eq('id', run.plan_week_id).single(), 'Reading the week');
  const slots = must<MealSlot[]>(await db.from('meal_slots').select('*').eq('plan_week_id', week.id).eq('slot', 'dinner').order('date'), 'Reading dinners')
    .map((s) => ({ ...s, portions: s.portions === null ? null : Number(s.portions) }));
  return { run, week, slots };
}

async function plan() {
  const { run, week, slots } = await loadRun(arg('run') ?? fail('--run is required'));
  const cooked = slots.filter((s) => s.mode === 'cook' && s.recipe_id);
  const ids = [...new Set(cooked.map((s) => s.recipe_id!))];
  const allIds = [...new Set([...ids, ...slots.map((s) => s.cookidoo_recipe_id).filter((x): x is string => !!x)])];
  const recipes = must<(RecipeDetail & { cookidoo_status: string; cookidoo_url: string | null; cookidoo_portions: number | null })[]>(
    await db.from('recipes').select('*').in('id', allIds.length ? allIds : ['00000000-0000-0000-0000-000000000000']), 'Reading recipes');
  const byId = new Map(recipes.map((r) => [r.id, r]));
  type Ing = RecipeDetail['ingredients'][number] & { recipe_id: string };
  type Step = RecipeDetail['steps'][number] & { recipe_id: string };
  const [ingRes, stepRes] = await Promise.all([
    db.from('recipe_ingredients').select('*').in('recipe_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('position'),
    db.from('recipe_steps').select('*').in('recipe_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('position'),
  ]);
  const ings = must<Ing[]>(ingRes, 'Reading ingredients');
  const steps = must<Step[]>(stepRes, 'Reading steps');
  const send = [];
  for (const id of ids) {
    const r = byId.get(id)!;
    const portions = portionsToSend(slots, id);
    const why = !r.cookidoo_url || r.cookidoo_status === 'none' ? 'new'
      : r.cookidoo_status === 'outdated' ? 'outdated'
        : Number(r.cookidoo_portions) !== portions ? 'portions' : null;
    if (!why) continue;
    const detail: RecipeDetail = {
      ...r, base_portions: Number(r.base_portions),
      ingredients: ings.filter((i) => i.recipe_id === id).map((i) => ({ ...i, qty: i.qty === null ? null : Number(i.qty) })),
      steps: steps.filter((s) => s.recipe_id === id),
    };
    send.push({ recipeId: id, why, url: r.cookidoo_url, text: cookidooRecipe(detail, portions) });
  }
  const changes = myWeekChanges(cooked.map((s) => ({ date: s.date, recipeId: s.recipe_id! })), slots.map((s) => ({ date: s.date, recipeId: s.cookidoo_recipe_id ?? null })));
  const named = (d: { date: string; recipeId: string }) => ({ ...d, title: byId.get(d.recipeId)?.title ?? '?', url: byId.get(d.recipeId)?.cookidoo_url ?? null });
  console.log(JSON.stringify({ run: { id: run.id, weekStart: week.week_start, approved: week.status === 'approved' }, send, myWeek: { add: changes.add.map(named), remove: changes.remove.map(named) } }, null, 2));
}

async function recordRecipe() {
  const householdId = arg('household') ?? fail('--household is required');
  const r = read(parseRecordRecipe, await stdin());
  const rows = must<{ id: string }[]>(await db.from('recipes').update({ cookidoo_status: 'sent', cookidoo_url: r.url, cookidoo_portions: r.portions })
    .eq('id', r.recipeId).eq('household_id', householdId).select('id'), 'Saving the Cookidoo link');
  if (!rows.length) fail('That recipe is not in this household.');
  console.log(`Recorded ${r.recipeId} → ${r.url}`);
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
  must(await db.from('cookidoo_runs').update({ status: f.status, summary: f.summary, finished_at: new Date().toISOString() }).eq('id', f.run), 'Closing the sync');
  console.log(`Sync ${f.run} marked ${f.status}.`);
}

const commands: Record<string, () => Promise<void>> = { pending, claim, plan, 'record-recipe': recordRecipe, 'record-day': recordDay, finish };
await (commands[command] ?? (() => fail('Use: pending | claim | plan | record-recipe | record-day | finish')))();
