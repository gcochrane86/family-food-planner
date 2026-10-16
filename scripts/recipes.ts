// Helper for adding recipes from a web link (see docs/playbooks/recipe-import.md). Runs on the owner's Mac with
// the service key from .env. It never reads the web page itself: Claude does that, then pipes the converted recipe in.
//   npx tsx scripts/recipes.ts pending --household <id>          links waiting to be converted (cheap: no browsing)
//   npx tsx scripts/recipes.ts claim --import <id>               marks one 'importing' so no other check takes it
//   npx tsx scripts/recipes.ts context --household <id>          members, equipment, house rules and existing recipes
//   npx tsx scripts/recipes.ts add --import <id> < recipe.json   {"recipe": {seed format}, "summary": "..."}
//   npx tsx scripts/recipes.ts failed < failed.json              {"import": "<id>", "summary": "why"}
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { parseImport, parseImportFailed } from './importInput';
// @ts-expect-error plain JS helper
import { contentRows, recipeRow } from './recipeSeed.mjs';

const STALE_MS = 2 * 60 * 60 * 1000; // an import that started over 2 hours ago has stopped (Mac asleep)

/** Links waiting, oldest first. A stalled import is marked failed so the app offers "Try again". */
async function pending() {
  const householdId = arg('household') ?? fail('--household is required');
  const rows = must<{ id: string; url: string; note: string | null; status: string; started_at: string | null }[]>(
    await db.from('recipe_imports').select('id, url, note, status, started_at').eq('household_id', householdId)
      .in('status', ['requested', 'importing']).order('requested_at'), 'Reading links');
  const waiting = [];
  for (const r of rows) {
    if (r.status === 'importing') {
      if (r.started_at && Date.now() - Date.parse(r.started_at) > STALE_MS) {
        must(await db.from('recipe_imports').update({ status: 'failed', summary: 'Stopped part-way (the Mac may have slept).', finished_at: new Date().toISOString() }).eq('id', r.id), 'Closing a stalled import');
      }
      continue;
    }
    waiting.push({ id: r.id, url: r.url, note: r.note });
  }
  console.log(JSON.stringify(waiting));
}

async function claim() {
  const id = arg('import') ?? fail('--import is required');
  const rows = must<{ id: string }[]>(await db.from('recipe_imports').update({ status: 'importing', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'requested').select('id'), 'Claiming the link');
  if (!rows.length) fail('That link is already being converted or is finished.');
  console.log(`Import ${id} claimed.`);
}

/** What a conversion needs to know about the household. */
async function context() {
  const householdId = arg('household') ?? fail('--household is required');
  const members = must<{ name: string; kind: string; portion_weight: number }[]>(
    await db.from('members').select('name, kind, portion_weight').eq('household_id', householdId), 'Reading members');
  const equipment = must<{ code: string; name: string; capabilities: unknown }[]>(
    await db.from('equipment').select('code, name, capabilities').eq('household_id', householdId), 'Reading equipment');
  const rules = must<{ kind: string; match: string; replacement: string | null; note: string | null }[]>(
    await db.from('house_rules').select('kind, match, replacement, note').eq('household_id', householdId), 'Reading house rules');
  const recipes = must<{ slug: string; title: string }[]>(
    await db.from('recipes').select('slug, title').eq('household_id', householdId).order('title'), 'Reading recipes');
  const portions = members.reduce((sum, m) => sum + Number(m.portion_weight), 0);
  console.log(JSON.stringify({ householdPortions: Math.round(portions * 100) / 100, members, equipment, houseRules: rules, existingRecipes: recipes }, null, 2));
}

/** Saves a converted recipe as a new recipe and marks the link done. Never changes an existing recipe. */
async function add() {
  const id = arg('import') ?? fail('--import is required');
  const { recipe, summary } = read(parseImport, await stdin());
  const imp = must<{ id: string; household_id: string; url: string; status: string } | null>(
    await db.from('recipe_imports').select('id, household_id, url, status').eq('id', id).maybeSingle(), 'Finding the link')
    ?? fail(`No link with ID ${id}.`);
  if (imp.status !== 'importing') fail(`That link is ${imp.status}, not importing. Claim it first.`);
  const clash = must<{ id: string } | null>(
    await db.from('recipes').select('id').eq('household_id', imp.household_id).eq('slug', recipe.slug).maybeSingle(), 'Checking the slug');
  if (clash) fail(`A recipe with the slug "${recipe.slug}" already exists. Pick another slug.`);

  const { id: recipeId } = must<{ id: string }>(
    await db.from('recipes').insert({ ...recipeRow(imp.household_id, recipe), source: 'web', source_url: imp.url }).select('id').single(), 'Adding the recipe');
  const { ingredients, steps } = contentRows(recipe);
  const saved = await db.rpc('replace_recipe_contents', { p_recipe_id: recipeId, p_ingredients: ingredients, p_steps: steps });
  if (saved.error) {
    await db.from('recipes').delete().eq('id', recipeId); // don't leave an empty recipe behind
    fail(`Saving ingredients and steps: ${saved.error.message}`);
  }
  must(await db.from('recipe_imports').update({ status: 'done', recipe_id: recipeId, summary, finished_at: new Date().toISOString() }).eq('id', id), 'Closing the link');
  console.log(`Added ${recipe.title} (${recipeId}).`);
}

async function failed() {
  const f = read(parseImportFailed, await stdin());
  const closed = must<{ id: string }[]>(await db.from('recipe_imports').update({ status: 'failed', summary: f.summary, finished_at: new Date().toISOString() })
    .eq('id', f.import).eq('status', 'importing').select('id'), 'Closing the link');
  if (!closed.length) fail('That link is not being converted (finished, or never claimed). Not changing it.');
  console.log(`Import ${f.import} marked failed.`);
}

const commands: Record<string, () => Promise<void>> = { pending, claim, context, add, failed };
await (commands[command] ?? (() => fail('Use: pending | claim | context | add | failed')))();
