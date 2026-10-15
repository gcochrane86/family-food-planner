// Loads household preferences into Supabase. Safe to run more than once: rows are matched by name or code.
//   npm run seed -- --household <household-id> [--file seed/private/household.json]
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (the service key never leaves this machine).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';
import { validateSeed } from './seedSchema.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const householdId = arg('household');
const file = arg('file', 'seed/private/household.json');
const fail = (msg) => { console.error(msg); process.exit(1); };

if (!householdId) fail('Usage: npm run seed -- --household <household-id>   (copy the ID from Settings → Household)');

let seed;
try {
  seed = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  fail(`Couldn't read ${file}: ${e.message}`);
}
const problems = validateSeed(seed);
if (problems.length) fail(`${file} has problems:\n- ${problems.join('\n- ')}`);

const env = loadEnv();
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const must = ({ data, error }, what) => {
  if (error) fail(`${what}: ${error.message}`);
  return data;
};

const household = must(await db.from('households').select('id, name').eq('id', householdId).maybeSingle(), 'Finding household');
if (!household) fail(`No household with ID ${householdId}. Copy it from Settings → Household in the app.`);
const hid = household.id;

const members = must(
  await db.from('members')
    .upsert(seed.members.map((m) => ({ household_id: hid, name: m.name, kind: m.kind, portion_weight: m.portion_weight, birthdate: m.birthdate ?? null })),
      { onConflict: 'household_id,name' })
    .select('id, name'),
  'Saving members',
);
const memberId = Object.fromEntries(members.map((m) => [m.name, m.id]));

if (seed.office_days?.length) {
  must(await db.from('member_week_pattern')
    .upsert(seed.office_days.map((d) => ({ member_id: memberId[d.member], weekday: d.weekday, office: true }))), 'Saving office days');
}

must(await db.from('settings').upsert({ household_id: hid, data: seed.settings }), 'Saving settings');

if (seed.equipment?.length) {
  must(await db.from('equipment')
    .upsert(seed.equipment.map((e) => ({ household_id: hid, code: e.code, name: e.name })), { onConflict: 'household_id,code' }), 'Saving equipment');
}

if (seed.house_rules?.length) {
  must(await db.from('house_rules')
    .upsert(seed.house_rules.map((r) => ({ household_id: hid, kind: r.kind, match: r.match, replacement: r.replacement ?? null, note: r.note ?? null })),
      { onConflict: 'household_id,kind,match' }), 'Saving house rules');
}

let newStaples = 0;
if (seed.staples?.length) {
  const ingredients = must(
    await db.from('ingredients')
      .upsert(seed.staples.map((name) => ({ household_id: hid, name, is_staple: true })), { onConflict: 'household_id,name' })
      .select('id, name'),
    'Saving staple ingredients',
  );
  const existing = must(
    await db.from('pantry_items').select('ingredient_id').eq('household_id', hid).not('staple_status', 'is', null),
    'Reading pantry',
  );
  const have = new Set(existing.map((p) => p.ingredient_id));
  const missing = ingredients.filter((i) => !have.has(i.id));
  if (missing.length) {
    must(await db.from('pantry_items').insert(missing.map((i) => ({ household_id: hid, ingredient_id: i.id, staple_status: 'have' }))), 'Saving staples');
  }
  newStaples = missing.length;
}

console.log(`Seeded "${household.name}": ${members.length} people, ${seed.office_days?.length ?? 0} office days, `
  + `${seed.equipment?.length ?? 0} equipment, ${seed.house_rules?.length ?? 0} house rules, `
  + `${seed.staples?.length ?? 0} staples (${newStaples} new).`);
