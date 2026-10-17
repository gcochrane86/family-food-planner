// Loads recipe files into Supabase. Safe to re-run: recipes are matched by slug, their ingredients and
// steps are replaced, and photos you've taken of steps are kept (matched by phase + step title).
//   npm run seed:recipes -- --household <household-id> [--dir seed/private/recipes]
import { readdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';
import { contentRows, recipeRow, validateRecipeSeed } from './recipeSeed.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const fail = (msg) => { console.error(msg); process.exit(1); };
const householdId = arg('household');
const dir = arg('dir', 'seed/private/recipes');
const replaceExisting = args.includes('--update');
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
let skipped = 0;
const saved = [];
let keptPhotos = 0;
for (const r of recipes) {
  const row = recipeRow(householdId, r);
  // Status is only set for new recipes, so anything you've archived or changed in the app stays that way.
  const existing = must(await db.from('recipes').select('id').eq('household_id', householdId).eq('slug', r.slug).maybeSingle(), `Finding ${r.slug}`);
  if (existing && !replaceExisting) { skipped++; continue; }
  const { status, ...update } = row;
  const { id } = existing
    ? must(await db.from('recipes').update(update).eq('id', existing.id).select('id').single(), `Updating ${r.slug}`)
    : must(await db.from('recipes').insert({ ...update, status }).select('id').single(), `Adding ${r.slug}`);

  const { ingredients: ingredientRows, steps: stepRows } = contentRows(r);
  // One database call: either everything is replaced or nothing changes. Matching step photos are kept.
  keptPhotos += must(await db.rpc('replace_recipe_contents', { p_recipe_id: id, p_ingredients: ingredientRows, p_steps: stepRows }),
    `Saving ${r.slug} ingredients and steps`);
  steps += stepRows.length;
  saved.push(r);
}

if (skipped) console.log(`Left ${skipped} existing recipes as they are (use --update to replace them from the files).`);
console.log(`Seeded ${saved.length} recipes (${saved.filter((r) => r.kind === 'meal').length} meals, `
  + `${saved.filter((r) => r.kind === 'component').length} components), ${steps} steps, ${keptPhotos} step photos kept.`);
