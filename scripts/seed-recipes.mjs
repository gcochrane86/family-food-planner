// Loads recipe files into Supabase. Safe to re-run: recipes are matched by slug, their ingredients and
// steps are replaced, and photos you've taken of steps are kept (matched by phase + step title).
//   npm run seed:recipes -- --household <household-id> [--dir seed/private/recipes]
import { readdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';
import { validateRecipeSeed } from './recipeSeed.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const fail = (msg) => { console.error(msg); process.exit(1); };
const householdId = arg('household');
const dir = arg('dir', 'seed/private/recipes');
if (!householdId) fail('Usage: npm run seed:recipes -- --household <household-id>');

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
if (!files.length) fail(`No .json recipe files in ${dir}`);
const recipes = [];
for (const f of files) {
  const file = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const problems = validateRecipeSeed(file);
  if (problems.length) fail(`${dir}/${f} has problems:\n- ${problems.join('\n- ')}`);
  recipes.push(...file.recipes);
}
const slugs = recipes.map((r) => r.slug);
const dupe = slugs.find((s, i) => slugs.indexOf(s) !== i);
if (dupe) fail(`The slug "${dupe}" appears in more than one file.`);

const env = loadEnv();
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
const db = createClient(new URL(env.VITE_SUPABASE_URL.trim()).origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }, what) => { if (error) fail(`${what}: ${error.message}`); return data; };

const household = must(await db.from('households').select('id').eq('id', householdId).maybeSingle(), 'Finding household');
if (!household) fail(`No household with ID ${householdId}.`);

let steps = 0;
let keptPhotos = 0;
for (const r of recipes) {
  const row = {
    household_id: householdId, slug: r.slug, title: r.title, subtitle: r.subtitle ?? null, kind: r.kind,
    component_role: r.component_role ?? null, source: r.source, base_portions: r.base_portions,
    reheats_well: !!r.reheats_well, freezes_well: !!r.freezes_well, toddler_ok: r.toddler_ok !== false,
    toddler_note: r.toddler_note ?? null, salt_per_portion_g: r.salt_per_portion_g ?? null,
    prep_minutes: r.prep_minutes ?? 0, finish_minutes: r.finish_minutes ?? 0, hands_off_minutes: r.hands_off_minutes ?? 0,
    tags: r.tags ?? [], equipment: r.equipment ?? [], reheat: r.reheat ?? null, status: r.status ?? 'active',
  };
  // Status is only set for new recipes, so anything you've archived or changed in the app stays that way.
  const existing = must(await db.from('recipes').select('id').eq('household_id', householdId).eq('slug', r.slug).maybeSingle(), `Finding ${r.slug}`);
  const { status, ...update } = row;
  const { id } = existing
    ? must(await db.from('recipes').update(update).eq('id', existing.id).select('id').single(), `Updating ${r.slug}`)
    : must(await db.from('recipes').insert({ ...update, status }).select('id').single(), `Adding ${r.slug}`);

  const position = { prep_8pm: 0, finish: 0, reheat: 0 };
  const stepRows = r.steps.map((s) => ({
    phase: s.phase, position: ++position[s.phase], at_minute: s.at ?? null, title: s.title, body: s.body,
    machine: s.machine ?? null, settings: s.settings ?? null, timer_minutes: s.timer ?? null,
  }));
  const ingredientRows = r.ingredients.map((g, i) => ({
    position: i + 1, group_name: g.group ?? null, name: g.name, qty: g.qty ?? null,
    unit: g.unit ?? '', note: g.note ?? null, qty_approx: !!g.approx,
  }));
  // One database call: either everything is replaced or nothing changes. Matching step photos are kept.
  keptPhotos += must(await db.rpc('replace_recipe_contents', { p_recipe_id: id, p_ingredients: ingredientRows, p_steps: stepRows }),
    `Saving ${r.slug} ingredients and steps`);
  steps += stepRows.length;
}

console.log(`Seeded ${recipes.length} recipes (${recipes.filter((r) => r.kind === 'meal').length} meals, `
  + `${recipes.filter((r) => r.kind === 'component').length} components), ${steps} steps, ${keptPhotos} step photos kept.`);
