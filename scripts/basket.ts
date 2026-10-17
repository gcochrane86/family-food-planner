// Helper for filling the Sainsbury's basket (see docs/playbooks/sainsburys-basket.md). Runs on the owner's Mac
// with the service key from .env. It never touches Sainsbury's itself: Claude does that in Chrome.
//   npx tsx scripts/basket.ts list   --household <id> --delivery sun|tue
//   npx tsx scripts/basket.ts record --household <id> < product.json   {"key","name","url","size","unit","price","pin"?}
//   npx tsx scripts/basket.ts finish < finish.json                      {"run","status":"done"|"failed","summary"}
//   npx tsx scripts/basket.ts pending --household <id>                  requests waiting to be filled (cheap: no browsing)
//   npx tsx scripts/basket.ts claim --run <run id>                      marks a request 'filling' so no other check takes it
//   npx tsx scripts/basket.ts spar --household <id> < item.json         {"name","note"?} onto the Spar list
// record, finish and spar read JSON on stdin so text copied from web pages never goes through a shell command line.
import { createClient } from '@supabase/supabase-js';
import { buildShoppingList, pickShoppingWeek, tickKey } from '../src/lib/shopping';
import { londonParts, nextMonday } from '../supabase/functions/_shared/schedule';
import { packsNeeded } from '../src/lib/packs';
import { validateSettings } from '../src/lib/household';
import { parseFinish, parseProduct, parseSpar } from './basketInput';
import { parseRoastChoice } from '../src/lib/roastModel';
import type { MealSlot, PlanWeek, Product, RecipeDetail, Staple, WeeklyBasic } from '../src/lib/types';
// @ts-expect-error plain JS helper
import { loadEnv } from './env.mjs';

const [command, ...rest] = process.argv.slice(2);
const arg = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const fail = (msg: string): never => { console.error(msg); process.exit(1); };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const env = loadEnv();
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
const db = createClient(new URL(env.VITE_SUPABASE_URL.trim()).origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) fail(`${what}: ${r.error.message}`);
  return r.data as T;
}

async function list() {
  const householdId = arg('household') ?? fail('--household is required');
  const delivery = (arg('delivery') ?? fail('--delivery sun|tue is required')) as 'sun' | 'tue';
  // Same week as the Shop tab: next week once approved, otherwise this week if approved.
  const { date, weekday } = londonParts(new Date());
  const thisMonday = addDays(date, 1 - weekday);
  const loadWeek = async (start: string) => ({
    week: must<PlanWeek | null>(await db.from('plan_weeks').select('*').eq('household_id', householdId).eq('week_start', start).maybeSingle(), 'Reading weeks'),
    slots: [] as MealSlot[],
  });
  const chosen = pickShoppingWeek(await loadWeek(nextMonday(date)), await loadWeek(thisMonday));
  const week = chosen?.week ?? fail('No approved menu for this week or next. Approve the week in the app first.');
  const run = must<{ id: string; status: string; empty_first: boolean } | null>(
    await db.from('basket_runs').select('id, status, empty_first').eq('plan_week_id', week.id).eq('delivery', delivery).maybeSingle(), 'Finding the basket request')
    ?? fail(`No "Ready for Sainsbury's" request for the ${delivery === 'sun' ? 'Sunday' : 'Tuesday'} delivery of the week of ${week.week_start}. Tap the button on the Shop tab first.`);
  if (run.status !== 'requested' && run.status !== 'filling') fail(`The ${delivery === 'sun' ? 'Sunday' : 'Tuesday'} basket for the week of ${week.week_start} is already marked ${run.status}. Tap "Fill again" on the Shop tab to request it again.`);

  const slots = must<MealSlot[]>(await db.from('meal_slots').select('*').eq('plan_week_id', week.id), 'Reading the menu');
  const ids = [...new Set(slots.filter((s) => s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id).map((s) => s.recipe_id!))];
  // A roast's sides are recipes of their own, found by slug.
  const sideSlugs = [...new Set(slots.flatMap((s) => parseRoastChoice(s.roast)?.sides ?? []))];
  if (sideSlugs.length) {
    const sides = must<{ id: string }[]>(await db.from('recipes').select('id').eq('household_id', householdId).in('slug', sideSlugs), 'Reading roast sides');
    for (const r of sides) if (!ids.includes(r.id)) ids.push(r.id);
  }
  const recipes = must<RecipeDetail[]>(await db.from('recipes').select('*').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']), 'Reading recipes');
  const ingredients = must<(RecipeDetail['ingredients'][number] & { recipe_id: string })[]>(
    await db.from('recipe_ingredients').select('recipe_id, position, group_name, name, qty, unit, note, qty_approx').in('recipe_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('position'),
    'Reading ingredients');
  const details = new Map(recipes.map((r) => [r.id, {
    ...r, base_portions: Number(r.base_portions), steps: [],
    ingredients: ingredients.filter((i) => i.recipe_id === r.id).map((i) => ({ ...i, qty: i.qty === null ? null : Number(i.qty) })),
  } as RecipeDetail]));
  // A dinner planned from the freezer leaves its paste off the list; never buy on that guess until someone has checked.
  const unchecked = slots.filter((s) => s.slot === 'dinner' && s.batch === 'frozen');
  if (unchecked.length) {
    fail(`Check the freezer in the app first: ${unchecked.map((s) => details.get(s.recipe_id ?? '')?.title ?? 'a dinner').join(', ')} ${unchecked.length === 1 ? 'is' : 'are'} planned from the freezer.`);
  }
  const pantry = must<{ id: string; ingredient_id: string; staple_status: Staple['status']; ingredients: { name: string } | { name: string }[] }[]>(
    await db.from('pantry_items').select('id, ingredient_id, staple_status, ingredients(name)').eq('household_id', householdId).not('staple_status', 'is', null),
    'Reading staples');
  const staples: Staple[] = pantry.map((p) => ({ id: p.id, ingredient_id: p.ingredient_id, status: p.staple_status, name: (Array.isArray(p.ingredients) ? p.ingredients[0]?.name : p.ingredients?.name) ?? '' }));
  const settings = must<{ data: { shops_per_week?: number } } | null>(await db.from('settings').select('data').eq('household_id', householdId).maybeSingle(), 'Reading settings');
  const basics = must<WeeklyBasic[]>(await db.from('weekly_basics').select('*').eq('household_id', householdId).order('position'), 'Reading basics')
    .map((b) => ({ ...b, qty: b.qty === null ? null : Number(b.qty) }));
  const products = new Map(must<Product[]>(await db.from('products').select('*').eq('household_id', householdId), 'Reading saved products').map((p) => [p.item_key, p]));
  const ticks = new Set(must<{ item_key: string }[]>(
    await db.from('shopping_ticks').select('item_key').eq('plan_week_id', week.id).eq('delivery', delivery).eq('ticked', true), 'Reading ticks').map((t) => t.item_key));

  const shops = settings?.data?.shops_per_week === 1 ? 1 : 2;
  // Things bought at other shops (the fishmonger, the farm shop in weeks you go) aren't for the Sainsbury's trolley.
  const otherShops = validateSettings(settings?.data).other_shops;
  const list = buildShoppingList(slots.map((s) => ({ ...s, portions: s.portions === null ? null : Number(s.portions) })), details, staples, shops, basics,
    { shops: otherShops, weekStart: week.week_start });
  const items = list[delivery].map((item) => {
    const p = products.get(item.key);
    return {
      key: item.key, name: item.name, qty: item.qty, unit: item.unit, approx: item.approx, for: item.forMeals,
      alreadyTicked: ticks.has(tickKey(item)), // same rule as the Shop tab: a changed quantity counts as not bought
      saved: p ? { name: p.product_name, url: p.product_url, size: p.pack_size, unit: p.pack_unit, price: p.price, pinned: p.pinned } : null,
      packs: p && p.pack_size ? packsNeeded(item.qty, item.unit, Number(p.pack_size), p.pack_unit) : null,
    };
  });
  const deliveryDate = addDays(week.week_start, delivery === 'sun' ? -1 : 1);
  console.log(JSON.stringify({ run: { id: run.id, weekStart: week.week_start, delivery, deliveryDate, emptyFirst: run.empty_first }, items }, null, 2));
}

async function stdin(): Promise<string> {
  if (process.stdin.isTTY) fail('Pipe the JSON in, e.g. npm run -s basket -- record --household <id> < product.json');
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}
function read<T>(parser: (text: string) => T, text: string): T {
  try { return parser(text); } catch (e) { return fail((e as Error).message); }
}

async function record() {
  const householdId = arg('household') ?? fail('--household is required');
  const p = read(parseProduct, await stdin());
  const row = {
    household_id: householdId, item_key: p.key, product_name: p.name, product_url: p.url,
    pack_size: p.size, pack_unit: p.unit, price: p.price, pinned: p.pin, updated_at: new Date().toISOString(),
  };
  const existing = must<{ pinned: boolean } | null>(
    await db.from('products').select('pinned').eq('household_id', householdId).eq('item_key', row.item_key).maybeSingle(), 'Reading product');
  if (existing?.pinned && !row.pinned) fail(`"${row.item_key}" has a pinned product; not replacing it.`);
  must(await db.from('products').upsert(row, { onConflict: 'household_id,item_key' }), 'Saving product');
  console.log(`Saved ${row.item_key} → ${row.product_name}`);
}

async function finish() {
  const f = read(parseFinish, await stdin());
  const closed = must<{ id: string }[]>(await db.from('basket_runs').update({ status: f.status, summary: f.summary, finished_at: new Date().toISOString() })
    .eq('id', f.run).eq('status', 'filling').select('id'), 'Closing the run');
  // A newer request (e.g. Empty and refill tapped meanwhile) reset the run; leave it for the next check.
  if (!closed.length) fail('That run is no longer filling (a newer request replaced it). Not closing it.');
  console.log(`Run ${f.run} marked ${f.status}.`);
}

const STALE_MS = 2 * 60 * 60 * 1000; // a fill that started over 2 hours ago has stopped (Mac asleep, Chrome closed)

/** Requests waiting to be filled, oldest first. A fill that stalled is marked failed so the app offers "Fill again". */
async function pending() {
  const householdId = arg('household') ?? fail('--household is required');
  const weeks = must<{ id: string; week_start: string }[]>(
    await db.from('plan_weeks').select('id, week_start').eq('household_id', householdId), 'Reading weeks');
  const byId = new Map(weeks.map((w) => [w.id, w.week_start]));
  const runs = must<{ id: string; plan_week_id: string; delivery: 'sun' | 'tue'; status: string; empty_first: boolean; started_at: string | null; requested_at: string }[]>(
    await db.from('basket_runs').select('id, plan_week_id, delivery, status, empty_first, started_at, requested_at')
      .in('plan_week_id', weeks.length ? weeks.map((w) => w.id) : ['00000000-0000-0000-0000-000000000000'])
      .in('status', ['requested', 'filling']).order('requested_at'), 'Reading requests');
  const waiting = [];
  for (const r of runs) {
    if (r.status === 'filling') {
      if (r.started_at && Date.now() - Date.parse(r.started_at) > STALE_MS) {
        must(await db.from('basket_runs').update({ status: 'failed', summary: 'Stopped part-way (the Mac may have slept). Tap "Fill again" to finish it.', finished_at: new Date().toISOString() }).eq('id', r.id), 'Closing a stalled fill');
      }
      continue;
    }
    const weekStart = byId.get(r.plan_week_id)!;
    waiting.push({ id: r.id, delivery: r.delivery, weekStart, deliveryDate: addDays(weekStart, r.delivery === 'sun' ? -1 : 1), emptyFirst: r.empty_first });
  }
  console.log(JSON.stringify(waiting));
}

/** Takes a request for this fill; fails if another check already took it. */
async function claim() {
  const id = arg('run') ?? fail('--run is required');
  const rows = must<{ id: string }[]>(await db.from('basket_runs').update({ status: 'filling', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'requested').select('id'), 'Claiming the request');
  if (!rows.length) fail('That request is already being filled or is finished.');
  console.log(`Run ${id} claimed.`);
}

async function spar() {
  const householdId = arg('household') ?? fail('--household is required');
  const item = read(parseSpar, await stdin());
  must(await db.from('quick_shop_items').insert({ household_id: householdId, name: item.name, note: item.note }), 'Adding to the Spar list');
  console.log(`Added ${item.name} to the Spar list.`);
}

/** "Start fresh" requests (Settings) still waiting for the trolley to be emptied. */
async function freshPending() {
  const householdId = arg('household') ?? fail('--household is required');
  const rows = must<{ id: string; requested_at: string }[]>(await db.from('fresh_starts').select('id, requested_at')
    .eq('household_id', householdId).eq('trolley_status', 'requested').order('requested_at'), 'Reading start-fresh requests');
  console.log(JSON.stringify(rows));
}

/** Marks a start-fresh request's trolley as emptied (done) or not (failed). */
async function freshDone() {
  const id = arg('id') ?? fail('--id is required');
  const status = arg('status');
  if (status !== 'done' && status !== 'failed') fail('--status must be done or failed');
  must(await db.from('fresh_starts').update({ trolley_status: status }).eq('id', id), 'Closing the request');
  console.log(`Trolley for start-fresh ${id}: ${status}.`);
}

const commands: Record<string, () => Promise<void>> = { list, record, finish, pending, claim, spar, 'fresh-pending': freshPending, 'fresh-done': freshDone };
await (commands[command] ?? (() => fail('Use: list | record | finish | pending | claim | spar | fresh-pending | fresh-done')))();
