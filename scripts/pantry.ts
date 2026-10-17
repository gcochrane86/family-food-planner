// Helper for keeping the pantry up to date from Sainsbury's deliveries (see docs/playbooks/sainsburys-basket.md,
// "After a delivery"). Runs on the owner's Mac with the service key from .env. It never reads Sainsbury's itself:
// Claude reads the delivered order in Chrome and pipes it in.
//   npx tsx scripts/pantry.ts recorded --household <id>                  order numbers already added
//   npx tsx scripts/pantry.ts record-order --household <id> < order.json  {"order", "items": [{name, ingredient?, qty, url?, location}]}
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { parseOrder } from './pantryInput';
import { pantryLabel } from '../src/lib/recipes';
import type { StapleStatus } from '../src/lib/types';

/** A query's data, or an error thrown for that one item (so the rest of the order still goes in). */
function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

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
  // Claim the order first: a second run (or a rerun after a problem) stops here instead of adding it all again.
  const claimed = await db.from('pantry_orders').insert({ household_id: householdId, order_ref: order });
  if (claimed.error?.code === '23505') fail(`Order ${order} is already in the pantry.`);
  if (claimed.error) fail(`Recording the order: ${claimed.error.message}`);

  const products = must<{ item_key: string; product_url: string | null }[]>(
    await db.from('products').select('item_key, product_url').eq('household_id', householdId), 'Reading saved products');
  type Row = { id: string; staple_status: StapleStatus | null; qty: number | null; location: string; ingredient_id: string; ingredients: { name: string } | { name: string }[] };
  const pantry = must<Row[]>(await db.from('pantry_items').select('id, staple_status, qty, location, ingredient_id, ingredients(name)').eq('household_id', householdId), 'Reading the pantry');
  const nameOf = (i: Row['ingredients']) => (Array.isArray(i) ? i[0]?.name : i?.name) ?? '';
  const staples = pantry.filter((p) => p.staple_status).map((p) => ({ id: p.id, ingredient_id: p.ingredient_id, name: nameOf(p.ingredients), status: 'have' as const }));

  const counts = { staples: 0, added: 0, frozen: 0 };
  const problems: string[] = [];
  for (const it of items) {
   try {
    // The plain ingredient name: given, or from the saved product it was bought as, or the product name itself.
    const saved = it.url ? products.find((p) => p.product_url === it.url) : undefined;
    const name = it.ingredient ?? (saved ? saved.item_key.split('|')[0] : it.name);
    const staple = staples.find((s) => pantryLabel(name, [s]) === 'In pantry');
    if (staple) {
      check(await db.from('pantry_items').update({ staple_status: 'have' }).eq('id', staple.id));
      counts.staples++;
      continue;
    }
    if (it.location === 'freezer') {
      check(await db.from('prepared_items').insert({ household_id: householdId, recipe_id: null, name, portions: Math.max(1, Math.round(it.qty)), location: 'freezer' }));
      counts.frozen++;
      continue;
    }
    const ing = check<{ id: string }>(await db.from('ingredients').upsert({ household_id: householdId, name }, { onConflict: 'household_id,name' }).select('id').single());
    const existing = pantry.find((p) => !p.staple_status && p.ingredient_id === ing.id && p.location === it.location);
    if (existing) {
      check(await db.from('pantry_items').update({ qty: Number(existing.qty ?? 0) + it.qty }).eq('id', existing.id));
      existing.qty = Number(existing.qty ?? 0) + it.qty;
    } else {
      const row = check<{ id: string }>(await db.from('pantry_items').insert({ household_id: householdId, ingredient_id: ing.id, qty: it.qty, unit: 'pack', location: it.location }).select('id').single());
      pantry.push({ id: row.id, staple_status: null, qty: it.qty, location: it.location, ingredient_id: ing.id, ingredients: { name } });
    }
    counts.added++;
   } catch (e) {
    problems.push(`${it.name}: ${(e as Error).message}`);
   }
  }
  console.log(`Order ${order}: ${counts.staples} staples marked in stock, ${counts.added} added to the fridge or cupboard, ${counts.frozen} to the freezer.`);
  // The order stays recorded; anything that failed is listed so it can be added by hand on the Pantry tab.
  if (problems.length) fail(`Not added (add these on the Pantry tab):\n- ${problems.join('\n- ')}`);
}

const commands: Record<string, () => Promise<void>> = { recorded, 'record-order': recordOrder };
await (commands[command] ?? (() => fail('Use: recorded | record-order')))();
