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
    create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
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
