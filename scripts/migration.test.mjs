// @vitest-environment node
// Runs the Supabase migrations in an in-memory Postgres with a stand-in auth schema, then checks the access rules.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const OWNER = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';
let db;

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('request.uid', '${uid}', false); set role authenticated;`);
  return (await db.query(sql)).rows;
}
const one = async (uid, sql) => Object.values((await as(uid, sql))[0])[0];
const fails = async (uid, sql) => as(uid, sql).then(() => null, (e) => e.message);

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    -- Stand-in for Supabase Storage's tables (RLS is on there by default).
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant all on storage.objects, storage.buckets to anon, authenticated;
    grant execute on function storage.foldername(text) to anon, authenticated;`);
  // 0004_schedule needs Supabase's pg_cron/pg_net/Vault, which the in-memory Postgres doesn't have; it holds no tables or rules.
  for (const f of readdirSync('supabase/migrations').sort().filter((f) => !f.includes('_schedule'))) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  }
  // Supabase grants table privileges to these roles by default; RLS is what limits rows.
  await db.exec(`grant all on all tables in schema public to anon, authenticated;
    insert into auth.users values ('${OWNER}'), ('${PARTNER}'), ('${STRANGER}');`);
});

test('a stranger sees and changes nothing in another household', async () => {
  const hid = await one(OWNER, `select create_household('Home')`);
  await as(OWNER, `insert into members (household_id, name, kind, portion_weight) values ('${hid}', 'You', 'adult', 1.25)`);
  expect(await as(STRANGER, 'select * from members')).toHaveLength(0);
  expect(await as(STRANGER, 'select * from households')).toHaveLength(0);
  expect(await fails(STRANGER, `insert into members (household_id, name, kind, portion_weight) values ('${hid}', 'X', 'adult', 1)`))
    .toMatch(/row-level security/);
});

test('signed-out callers cannot create a household', async () => {
  expect(await fails('', `select create_household('x')`)).toMatch(/not_signed_in/);
});

test('invite codes are 10 characters from an unambiguous alphabet', async () => {
  await one(OWNER, `select create_household('Home')`);
  const code = await one(OWNER, 'select invite_code from households');
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
});

test('the partner joins with the code, in any case', async () => {
  await one(OWNER, `select create_household('Home')`);
  const code = await one(OWNER, 'select invite_code from households');
  await one(PARTNER, `select join_household('${code.toLowerCase()}')`);
  expect(await as(PARTNER, 'select * from households')).toHaveLength(1);
});

test('a wrong code returns null, and the sixth wrong code in an hour is refused', async () => {
  await one(OWNER, `select create_household('Home')`);
  for (let i = 0; i < 5; i++) expect(await one(STRANGER, `select join_household('WRONGCODE${i}')`)).toBeNull();
  const code = await one(OWNER, 'select invite_code from households');
  expect(await fails(STRANGER, `select join_household('${code}')`)).toMatch(/too_many_attempts/);
});

test('creating a second household is refused', async () => {
  await one(OWNER, `select create_household('Home')`);
  expect(await fails(OWNER, `select create_household('Again')`)).toMatch(/already_member/);
});

test('joining another household leaves the old one, deleting it when nobody else is in it', async () => {
  await one(OWNER, `select create_household('Home')`);
  const code = await one(OWNER, 'select invite_code from households');
  const mistake = await one(PARTNER, `select create_household('Oops')`);
  await one(PARTNER, `select join_household('${code}')`);
  expect(await as(PARTNER, 'select household_id from household_users')).toHaveLength(1);
  await db.exec('reset role');
  expect((await db.query(`select * from households where id = '${mistake}'`)).rows).toHaveLength(0);
});

test('a staple can only be tracked once per ingredient', async () => {
  const hid = await one(OWNER, `select create_household('Home')`);
  const ing = await one(OWNER, `insert into ingredients (household_id, name, is_staple) values ('${hid}', 'Olive oil', true) returning id`);
  await as(OWNER, `insert into pantry_items (household_id, ingredient_id, staple_status) values ('${hid}', '${ing}', 'have')`);
  expect(await fails(OWNER, `insert into pantry_items (household_id, ingredient_id, staple_status) values ('${hid}', '${ing}', 'have')`))
    .toMatch(/duplicate key/);
});

test('portion weights outside 0.1–3 are rejected', async () => {
  const hid = await one(OWNER, `select create_household('Home')`);
  expect(await fails(OWNER, `insert into members (household_id, name, kind, portion_weight) values ('${hid}', 'Big', 'adult', 5)`))
    .toMatch(/check constraint/);
});

// Phase 2: recipes and images ------------------------------------------------

async function recipeFor(uid, slug = 'honey-chilli') {
  const hid = await one(uid, `select create_household('Home')`);
  const rid = await one(uid, `insert into recipes (household_id, slug, title, kind, source, base_portions)
    values ('${hid}', '${slug}', 'Honey chilli chicken', 'meal', 'own_doc', 6) returning id`);
  return { hid, rid };
}

test("a stranger cannot read another household's recipes, ingredients or steps", async () => {
  const { rid } = await recipeFor(OWNER);
  await as(OWNER, `insert into recipe_ingredients (recipe_id, position, name, qty, unit) values ('${rid}', 1, 'chicken', 1200, 'g')`);
  await as(OWNER, `insert into recipe_steps (recipe_id, phase, position, title, body) values ('${rid}', 'finish', 1, 'Rice on', 'Rinse the rice')`);
  expect(await as(OWNER, 'select * from recipe_steps')).toHaveLength(1);
  for (const t of ['recipes', 'recipe_ingredients', 'recipe_steps']) expect(await as(STRANGER, `select * from ${t}`)).toHaveLength(0);
  expect(await fails(STRANGER, `insert into recipe_steps (recipe_id, phase, position, title, body) values ('${rid}', 'finish', 2, 'x', 'x')`))
    .toMatch(/row-level security/);
});

test('a slug is unique within a household', async () => {
  const { hid } = await recipeFor(OWNER);
  expect(await fails(OWNER, `insert into recipes (household_id, slug, title, kind, source, base_portions)
    values ('${hid}', 'honey-chilli', 'Again', 'meal', 'own_doc', 6)`)).toMatch(/duplicate key/);
});

test('deleting a recipe removes its ingredients and steps', async () => {
  const { rid } = await recipeFor(OWNER);
  await as(OWNER, `insert into recipe_ingredients (recipe_id, position, name) values ('${rid}', 1, 'rice')`);
  await as(OWNER, `insert into recipe_steps (recipe_id, phase, position, title, body) values ('${rid}', 'prep_8pm', 1, 't', 'b')`);
  await as(OWNER, `delete from recipes where id = '${rid}'`);
  expect(await as(OWNER, 'select * from recipe_ingredients')).toHaveLength(0);
  expect(await as(OWNER, 'select * from recipe_steps')).toHaveLength(0);
});

test('a bad step phase or machine is rejected', async () => {
  const { rid } = await recipeFor(OWNER);
  expect(await fails(OWNER, `insert into recipe_steps (recipe_id, phase, position, title, body) values ('${rid}', 'lunch', 1, 't', 'b')`))
    .toMatch(/check constraint/);
  expect(await fails(OWNER, `insert into recipe_steps (recipe_id, phase, position, title, body, machine) values ('${rid}', 'finish', 1, 't', 'b', 'toaster')`))
    .toMatch(/check constraint/);
});

test('images can only be saved into your own household folder', async () => {
  const { hid } = await recipeFor(OWNER);
  await as(OWNER, `insert into storage.objects (bucket_id, name) values ('recipe-images', '${hid}/hero/x.jpg')`);
  expect(await fails(STRANGER, `insert into storage.objects (bucket_id, name) values ('recipe-images', '${hid}/hero/y.jpg')`))
    .toMatch(/row-level security/);
  await db.exec('reset role');
  expect((await db.query(`select public from storage.buckets where id = 'recipe-images'`)).rows[0].public).toBe(true);
});

test('replacing a recipe keeps step photos and is all-or-nothing', async () => {
  const { rid } = await recipeFor(OWNER);
  await as(OWNER, `insert into recipe_ingredients (recipe_id, position, name) values ('${rid}', 1, 'old rice')`);
  await as(OWNER, `insert into recipe_steps (recipe_id, phase, position, title, body, image_path)
    values ('${rid}', 'finish', 1, 'Rice on', 'old', 'h/steps/s-1.jpg')`);
  const ingredients = JSON.stringify([{ position: 1, name: 'basmati rice', qty: 400, unit: 'g' }]);
  const steps = JSON.stringify([{ phase: 'finish', position: 1, title: 'Rice on', body: 'new', at_minute: 0, timer_minutes: 20 }]);
  expect(await one(OWNER, `select replace_recipe_contents('${rid}', '${ingredients}', '${steps}')`)).toBe(1);
  expect(await as(OWNER, 'select name from recipe_ingredients')).toEqual([{ name: 'basmati rice' }]);
  expect(await as(OWNER, 'select body, image_path from recipe_steps')).toEqual([{ body: 'new', image_path: 'h/steps/s-1.jpg' }]);

  const bad = JSON.stringify([{ phase: 'lunch', position: 1, title: 'x', body: 'x' }]);
  expect(await fails(OWNER, `select replace_recipe_contents('${rid}', '[]', '${bad}')`)).toMatch(/check constraint/);
  expect(await as(OWNER, 'select name from recipe_ingredients')).toEqual([{ name: 'basmati rice' }]);
  expect(await as(OWNER, 'select body from recipe_steps')).toEqual([{ body: 'new' }]);
});

test("a stranger cannot replace another household's recipe", async () => {
  const { rid } = await recipeFor(OWNER);
  await as(OWNER, `insert into recipe_ingredients (recipe_id, position, name) values ('${rid}', 1, 'rice')`);
  await as(STRANGER, `select replace_recipe_contents('${rid}', '[]', '[]')`).catch(() => {});
  expect(await as(OWNER, 'select name from recipe_ingredients')).toEqual([{ name: 'rice' }]);
});

// Phase 3: plans ---------------------------------------------------------------

async function weekFor(uid) {
  const { hid, rid } = await recipeFor(uid);
  const wid = await one(uid, `insert into plan_weeks (household_id, week_start, days) values ('${hid}', '2026-10-19', 7) returning id`);
  await as(uid, `insert into meal_slots (plan_week_id, date, slot, recipe_id, mode, portions, reason)
    values ('${wid}', '2026-10-19', 'dinner', '${rid}', 'cook', 6, 'Chicken night')`);
  await as(uid, `insert into shopping_ticks (plan_week_id, delivery, item_key, ticked) values ('${wid}', 'sun', 'onion|', true)`);
  return { hid, rid, wid };
}

test("a stranger cannot see or change another household's plans", async () => {
  const { wid } = await weekFor(OWNER);
  for (const t of ['plan_weeks', 'meal_slots', 'shopping_ticks']) expect(await as(STRANGER, `select * from ${t}`)).toHaveLength(0);
  expect(await fails(STRANGER, `insert into meal_slots (plan_week_id, date, slot, mode) values ('${wid}', '2026-10-20', 'dinner', 'out')`))
    .toMatch(/row-level security/);
});

test('one plan per household per week', async () => {
  const { hid } = await weekFor(OWNER);
  expect(await fails(OWNER, `insert into plan_weeks (household_id, week_start, days) values ('${hid}', '2026-10-19', 5)`)).toMatch(/duplicate key/);
});

test('approving a week twice is harmless', async () => {
  const { wid } = await weekFor(OWNER);
  await as(OWNER, `select approve_week('${wid}')`);
  const first = await one(OWNER, `select approved_at from plan_weeks where id = '${wid}'`);
  await as(OWNER, `select approve_week('${wid}')`);
  expect(await one(OWNER, `select status from plan_weeks where id = '${wid}'`)).toBe('approved');
  expect(await one(OWNER, `select approved_at from plan_weeks where id = '${wid}'`)).toEqual(first);
});

test("a stranger cannot approve someone else's week", async () => {
  const { wid } = await weekFor(OWNER);
  await as(STRANGER, `select approve_week('${wid}')`).catch(() => {});
  expect(await one(OWNER, `select status from plan_weeks where id = '${wid}'`)).toBe('draft');
});

test('deleting a week removes its slots and ticks', async () => {
  const { wid } = await weekFor(OWNER);
  await as(OWNER, `delete from plan_weeks where id = '${wid}'`);
  expect(await as(OWNER, 'select * from meal_slots')).toHaveLength(0);
  expect(await as(OWNER, 'select * from shopping_ticks')).toHaveLength(0);
});

test('recipe protein only accepts the known kinds', async () => {
  const { rid } = await recipeFor(OWNER);
  await as(OWNER, `update recipes set protein = 'fish' where id = '${rid}'`);
  expect(await fails(OWNER, `update recipes set protein = 'tofu' where id = '${rid}'`)).toMatch(/check constraint/);
});

// Phase 4: basics, Spar list, products, basket runs ------------------------------

test("a stranger cannot see or change another household's basics, Spar list, products or basket runs", async () => {
  const { hid, wid } = await weekFor(OWNER);
  await as(OWNER, `insert into weekly_basics (household_id, position, name, qty, unit, delivery) values ('${hid}', 1, 'Eggs', 18, '', 'sun')`);
  await as(OWNER, `insert into quick_shop_items (household_id, name) values ('${hid}', 'Coriander')`);
  await as(OWNER, `insert into products (household_id, item_key, product_name, pack_size, pack_unit) values ('${hid}', 'egg|', 'Free range eggs x12', 12, '')`);
  await as(OWNER, `insert into basket_runs (plan_week_id, delivery) values ('${wid}', 'sun')`);
  for (const t of ['weekly_basics', 'quick_shop_items', 'products', 'basket_runs']) {
    expect(await as(OWNER, `select * from ${t}`)).toHaveLength(1);
    expect(await as(STRANGER, `select * from ${t}`)).toHaveLength(0);
  }
  expect(await fails(STRANGER, `insert into quick_shop_items (household_id, name) values ('${hid}', 'x')`)).toMatch(/row-level security/);
  expect(await fails(STRANGER, `insert into basket_runs (plan_week_id, delivery) values ('${wid}', 'tue')`)).toMatch(/row-level security/);
});

test('one basket run per delivery per week', async () => {
  const { wid } = await weekFor(OWNER);
  await as(OWNER, `insert into basket_runs (plan_week_id, delivery) values ('${wid}', 'sun')`);
  expect(await fails(OWNER, `insert into basket_runs (plan_week_id, delivery) values ('${wid}', 'sun')`)).toMatch(/duplicate key/);
});

test('a Spar item needs a name of 1 to 80 characters', async () => {
  const { hid } = await recipeFor(OWNER);
  expect(await fails(OWNER, `insert into quick_shop_items (household_id, name) values ('${hid}', '  ')`)).toMatch(/check constraint/);
  expect(await fails(OWNER, `insert into quick_shop_items (household_id, name) values ('${hid}', '${'x'.repeat(81)}')`)).toMatch(/check constraint/);
});

test('0006 adds rating and image_source with their checks', async () => {
  const { rid } = await recipeFor(OWNER);
  await as(OWNER, `update recipes set rating = 'up' where id = '${rid}'`);
  expect(await fails(OWNER, `update recipes set rating = 'meh' where id = '${rid}'`)).toMatch(/check constraint/);
  expect(await fails(OWNER, `insert into recipe_steps (recipe_id, phase, position, title, body, image_path, image_source)
    values ('${rid}', 'finish', 1, 'x', 'x', 'p.jpg', 'ai')`)).toMatch(/check constraint/);
});

test('replace_recipe_contents keeps a generated photo and its source', async () => {
  const { rid } = await recipeFor(OWNER);
  await as(OWNER, `insert into recipe_steps (recipe_id, phase, position, title, body, image_path, image_source)
    values ('${rid}', 'finish', 1, 'Simmer', 'old', 'x.jpg', 'generated')`);
  const steps = JSON.stringify([{ phase: 'finish', position: 1, title: 'Simmer', body: 'new' }]);
  await one(OWNER, `select replace_recipe_contents('${rid}', '[]', '${steps}')`);
  expect(await as(OWNER, 'select image_path, image_source from recipe_steps')).toEqual([{ image_path: 'x.jpg', image_source: 'generated' }]);
});
