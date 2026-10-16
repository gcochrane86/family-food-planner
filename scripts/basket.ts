// Helper for filling the Sainsbury's basket (see docs/playbooks/sainsburys-basket.md). Runs on the owner's Mac
// with the service key from .env. It never touches Sainsbury's itself: Claude does that in Chrome.
//   npx tsx scripts/basket.ts list   --household <id> --delivery sun|tue
//   npx tsx scripts/basket.ts record --household <id> --key "<item key>" --name "<product>" --url <url> --size 500 --unit g [--price 1.75] [--pin]
//   npx tsx scripts/basket.ts finish --run <run id> --status done|failed --summary "<what happened>"
import { createClient } from '@supabase/supabase-js';
import { buildShoppingList, pickShoppingWeek, tickKey } from '../src/lib/shopping';
import { londonParts, nextMonday } from '../supabase/functions/_shared/schedule';
import { packsNeeded } from '../src/lib/packs';
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
  const run = must<{ id: string; status: string } | null>(
    await db.from('basket_runs').select('id, status').eq('plan_week_id', week.id).eq('delivery', delivery).maybeSingle(), 'Finding the basket request')
    ?? fail(`No "Ready for Sainsbury's" request for the ${delivery === 'sun' ? 'Sunday' : 'Tuesday'} delivery of the week of ${week.week_start}. Tap the button on the Shop tab first.`);
  if (run.status !== 'requested') fail(`The ${delivery === 'sun' ? 'Sunday' : 'Tuesday'} basket for the week of ${week.week_start} is already marked ${run.status}. Tap "Fill again" on the Shop tab to request it again.`);

  const slots = must<MealSlot[]>(await db.from('meal_slots').select('*').eq('plan_week_id', week.id), 'Reading the menu');
  const ids = [...new Set(slots.filter((s) => s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id).map((s) => s.recipe_id!))];
  const recipes = must<RecipeDetail[]>(await db.from('recipes').select('*').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']), 'Reading recipes');
  const ingredients = must<(RecipeDetail['ingredients'][number] & { recipe_id: string })[]>(
    await db.from('recipe_ingredients').select('recipe_id, position, group_name, name, qty, unit, note, qty_approx').in('recipe_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('position'),
    'Reading ingredients');
  const details = new Map(recipes.map((r) => [r.id, {
    ...r, base_portions: Number(r.base_portions), steps: [],
    ingredients: ingredients.filter((i) => i.recipe_id === r.id).map((i) => ({ ...i, qty: i.qty === null ? null : Number(i.qty) })),
  } as RecipeDetail]));
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
  const list = buildShoppingList(slots.map((s) => ({ ...s, portions: s.portions === null ? null : Number(s.portions) })), details, staples, shops, basics);
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
  console.log(JSON.stringify({ run: { id: run.id, weekStart: week.week_start, delivery, deliveryDate }, items }, null, 2));
}

async function record() {
  const householdId = arg('household') ?? fail('--household is required');
  const row = {
    household_id: householdId,
    item_key: arg('key') ?? fail('--key is required'),
    product_name: arg('name') ?? fail('--name is required'),
    product_url: arg('url') ?? null,
    pack_size: arg('size') ? Number(arg('size')) : null,
    pack_unit: arg('unit') ?? '',
    price: arg('price') ? Number(arg('price')) : null,
    pinned: rest.includes('--pin'),
    updated_at: new Date().toISOString(),
  };
  const existing = must<{ pinned: boolean } | null>(
    await db.from('products').select('pinned').eq('household_id', householdId).eq('item_key', row.item_key).maybeSingle(), 'Reading product');
  if (existing?.pinned && !row.pinned) fail(`"${row.item_key}" has a pinned product; not replacing it.`);
  must(await db.from('products').upsert(row, { onConflict: 'household_id,item_key' }), 'Saving product');
  console.log(`Saved ${row.item_key} → ${row.product_name}`);
}

async function finish() {
  const id = arg('run') ?? fail('--run is required');
  const status = arg('status') ?? fail('--status done|failed is required');
  if (!['done', 'failed'].includes(status)) fail('--status must be done or failed');
  must(await db.from('basket_runs').update({ status, summary: arg('summary') ?? null, finished_at: new Date().toISOString() }).eq('id', id), 'Closing the run');
  console.log(`Run ${id} marked ${status}.`);
}

const commands: Record<string, () => Promise<void>> = { list, record, finish };
await (commands[command] ?? (() => fail('Use: list | record | finish')))();
