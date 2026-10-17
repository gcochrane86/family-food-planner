// Helper for keeping the pantry up to date from Sainsbury's deliveries (see docs/playbooks/sainsburys-basket.md,
// "After a delivery"). Runs on the owner's Mac with the service key from .env. It never reads Sainsbury's itself:
// Claude reads the delivered order in Chrome and pipes it in.
//   npx tsx scripts/pantry.ts recorded --household <id>                  order numbers already added
//   npx tsx scripts/pantry.ts record-order --household <id> < order.json  {"order", "items": [{name, ingredient?, qty, url?, location}]}
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { parseOrder } from './pantryInput';
import { pantryLabel } from '../src/lib/recipes';
import type { StapleStatus } from '../src/lib/types';

async function recorded() {
  const householdId = arg('household') ?? fail('--household is required');
  const rows = must<{ order_ref: string; recorded_at: string }[]>(
    await db.from('pantry_orders').select('order_ref, recorded_at').eq('household_id', householdId).order('recorded_at', { ascending: false }).limit(20),
    'Reading recorded orders');
  console.log(JSON.stringify(rows));
}

/** Adds a delivered order to the pantry, once: staples become "have", other things are added to the fridge or
 *  cupboard (or the freezer), with the number of packs. */
async function recordOrder() {
  const householdId = arg('household') ?? fail('--household is required');
  const { order, items } = read(parseOrder, await stdin());
  const done = must<{ order_ref: string } | null>(
    await db.from('pantry_orders').select('order_ref').eq('household_id', householdId).eq('order_ref', order).maybeSingle(), 'Checking the order');
  if (done) fail(`Order ${order} is already in the pantry.`);

  const products = must<{ item_key: string; product_url: string | null }[]>(
    await db.from('products').select('item_key, product_url').eq('household_id', householdId), 'Reading saved products');
  type Row = { id: string; staple_status: StapleStatus | null; qty: number | null; location: string; ingredient_id: string; ingredients: { name: string } | { name: string }[] };
  const pantry = must<Row[]>(await db.from('pantry_items').select('id, staple_status, qty, location, ingredient_id, ingredients(name)').eq('household_id', householdId), 'Reading the pantry');
  const nameOf = (i: Row['ingredients']) => (Array.isArray(i) ? i[0]?.name : i?.name) ?? '';
  const staples = pantry.filter((p) => p.staple_status).map((p) => ({ id: p.id, ingredient_id: p.ingredient_id, name: nameOf(p.ingredients), status: 'have' as const }));

  const counts = { staples: 0, added: 0, frozen: 0 };
  for (const it of items) {
    // The plain ingredient name: given, or from the saved product it was bought as, or the product name itself.
    const saved = it.url ? products.find((p) => p.product_url === it.url) : undefined;
    const name = it.ingredient ?? (saved ? saved.item_key.split('|')[0] : it.name);
    const staple = staples.find((s) => pantryLabel(name, [s]) === 'In pantry');
    if (staple) {
      must(await db.from('pantry_items').update({ staple_status: 'have' }).eq('id', staple.id), `Marking ${staple.name} in stock`);
      counts.staples++;
      continue;
    }
    if (it.location === 'freezer') {
      must(await db.from('prepared_items').insert({ household_id: householdId, recipe_id: null, name, portions: Math.max(1, Math.round(it.qty)), location: 'freezer' }), `Adding ${name} to the freezer`);
      counts.frozen++;
      continue;
    }
    const ing = must<{ id: string }>(await db.from('ingredients').upsert({ household_id: householdId, name }, { onConflict: 'household_id,name' }).select('id').single(), `Saving ${name}`);
    const existing = pantry.find((p) => !p.staple_status && p.ingredient_id === ing.id && p.location === it.location);
    if (existing) {
      must(await db.from('pantry_items').update({ qty: Number(existing.qty ?? 0) + it.qty }).eq('id', existing.id), `Topping up ${name}`);
    } else {
      must(await db.from('pantry_items').insert({ household_id: householdId, ingredient_id: ing.id, qty: it.qty, unit: 'pack', location: it.location }), `Adding ${name}`);
    }
    counts.added++;
  }
  must(await db.from('pantry_orders').insert({ household_id: householdId, order_ref: order }), 'Recording the order');
  console.log(`Order ${order}: ${counts.staples} staples marked in stock, ${counts.added} added to the fridge or cupboard, ${counts.frozen} to the freezer.`);
}

const commands: Record<string, () => Promise<void>> = { recorded, 'record-order': recordOrder };
await (commands[command] ?? (() => fail('Use: recorded | record-order')))();
