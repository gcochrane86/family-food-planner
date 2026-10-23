// Helper for adding recipes from a web link (see docs/playbooks/recipe-import.md). Runs on the owner's Mac with
// the service key from .env. It never reads the web page itself: Claude does that, then pipes the converted recipe in.
//   npx tsx scripts/recipes.ts pending --household <id>          links and rework requests waiting (cheap: no browsing)
//   npx tsx scripts/recipes.ts claim --import <id>               marks one 'importing' so no other check takes it
//   npx tsx scripts/recipes.ts claim-rework --rework <id>        marks a rework request 'working'
//   npx tsx scripts/recipes.ts show --rework <id>                the recipe to rework, in the seed format
//   npx tsx scripts/recipes.ts rework --rework <id> < recipe.json {"recipe": {seed format}, "summary": "what changed"}
//   npx tsx scripts/recipes.ts rework-failed < failed.json       {"rework": "<id>", "summary": "why"}
//   npx tsx scripts/recipes.ts context --household <id>          members, equipment, house rules and existing recipes
//   npx tsx scripts/recipes.ts add --import <id> < recipe.json   {"recipe": {seed format}, "summary": "..."}
//   npx tsx scripts/recipes.ts failed < failed.json              {"import": "<id>", "summary": "why"}
//   npx tsx scripts/recipes.ts youtube --import <id>            a YouTube link's subtitles as plain text (needs yt-dlp)
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { MEAL_SPEC } from '../src/lib/mealSpec';
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseImport, parseImportFailed, parseRework, parseReworkFailed, vttToText, youTubeId } from './importInput';
// @ts-expect-error plain JS helper
import { contentRows, recipeRow, seedFromDetail } from './recipeSeed.mjs';

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
    waiting.push({ type: 'import', id: r.id, url: r.url, note: r.note });
  }
  const reworks = must<{ id: string; recipe_id: string; request: string; status: string; started_at: string | null }[]>(
    await db.from('recipe_reworks').select('id, recipe_id, request, status, started_at').eq('household_id', householdId)
      .in('status', ['requested', 'working']).order('requested_at'), 'Reading rework requests');
  for (const r of reworks) {
    if (r.status === 'working') {
      if (r.started_at && Date.now() - Date.parse(r.started_at) > STALE_MS) {
        must(await db.from('recipe_reworks').update({ status: 'failed', summary: 'Stopped part-way (the Mac may have slept).', finished_at: new Date().toISOString() }).eq('id', r.id), 'Closing a stalled rework');
      }
      continue;
    }
    waiting.push({ type: 'rework', id: r.id, recipeId: r.recipe_id, request: r.request });
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
  const settings = must<{ data: { private_rules?: unknown } } | null>(await db.from('settings').select('data').eq('household_id', householdId).maybeSingle(), 'Reading settings');
  const privateRules = Array.isArray(settings?.data?.private_rules) ? settings!.data.private_rules : [];
  const recipes = must<{ slug: string; title: string }[]>(
    await db.from('recipes').select('slug, title').eq('household_id', householdId).order('title'), 'Reading recipes');
  const portions = members.reduce((sum, m) => sum + Number(m.portion_weight), 0);
  console.log(JSON.stringify({ householdPortions: Math.round(portions * 100) / 100, members, equipment, whatMakesAMeal: MEAL_SPEC, houseRules: rules, privateRules, existingRecipes: recipes }, null, 2));
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

async function claimRework() {
  const id = arg('rework') ?? fail('--rework is required');
  const rows = must<{ id: string }[]>(await db.from('recipe_reworks').update({ status: 'working', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'requested').select('id'), 'Claiming the rework');
  if (!rows.length) fail('That rework is already being done or is finished.');
  console.log(`Rework ${id} claimed.`);
}

/** The rework request and its recipe. The recipe must belong to the request's household. */
async function loadRework(id: string) {
  const w = must<{ id: string; household_id: string; recipe_id: string; request: string; status: string } | null>(
    await db.from('recipe_reworks').select('id, household_id, recipe_id, request, status').eq('id', id).maybeSingle(), 'Finding the rework')
    ?? fail(`No rework with ID ${id}.`);
  const recipe = must<Record<string, unknown> & { id: string; household_id: string; slug: string; source: string } | null>(
    await db.from('recipes').select('*').eq('id', w.recipe_id).maybeSingle(), 'Reading the recipe') ?? fail('That recipe no longer exists.');
  if (recipe.household_id !== w.household_id) fail('That recipe belongs to another household.');
  return { w, recipe };
}

async function show() {
  const { w, recipe } = await loadRework(arg('rework') ?? fail('--rework is required'));
  const ingredients = must<unknown[]>(await db.from('recipe_ingredients').select('position, group_name, name, qty, unit, note, qty_approx').eq('recipe_id', recipe.id), 'Reading ingredients');
  const steps = must<unknown[]>(await db.from('recipe_steps').select('phase, position, at_minute, title, body, machine, settings, timer_minutes').eq('recipe_id', recipe.id), 'Reading steps');
  console.log(JSON.stringify({ request: w.request, recipe: seedFromDetail({ ...recipe, ingredients, steps }) }, null, 2));
}

/** Replaces a recipe's contents with the reworked version. Its slug, source and status stay as they were; step
 *  photos stay with steps whose phase and title are unchanged. */
async function rework() {
  const id = arg('rework') ?? fail('--rework is required');
  const { recipe: next, summary } = read(parseRework, await stdin());
  const { w, recipe } = await loadRework(id);
  if (w.status !== 'working') fail(`That rework is ${w.status}, not working. Claim it first.`);
  // save_recipe never changes slug, source, status or household, and saves everything or nothing.
  const { ingredients, steps } = contentRows(next);
  must(await db.rpc('save_recipe', { p_recipe_id: recipe.id, p_fields: recipeRow(w.household_id, next), p_ingredients: ingredients, p_steps: steps }), 'Saving the recipe');
  const closed = must<{ id: string }[]>(await db.from('recipe_reworks').update({ status: 'done', summary, finished_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'working').select('id'), 'Closing the rework');
  if (!closed.length) fail('The recipe was saved, but the rework was no longer marked working.');
  console.log(`Reworked ${next.title}.`);
}

async function reworkFailed() {
  const f = read(parseReworkFailed, await stdin());
  const closed = must<{ id: string }[]>(await db.from('recipe_reworks').update({ status: 'failed', summary: f.summary, finished_at: new Date().toISOString() })
    .eq('id', f.rework).eq('status', 'working').select('id'), 'Closing the rework');
  if (!closed.length) fail('That rework is not being done (finished, or never claimed). Not changing it.');
  console.log(`Rework ${f.rework} marked failed.`);
}

/** Where yt-dlp is: YTDLP in the environment, the household's own install, or on the PATH. */
function ytDlp(): string {
  const own = join(homedir(), '.local/share/ffp-yt-dlp/bin/yt-dlp');
  try { readFileSync(own); return process.env.YTDLP ?? own; } catch { return process.env.YTDLP ?? 'yt-dlp'; }
}

/** A claimed YouTube import's subtitles, as plain text on stdout. The link is rebuilt from the checked video id, and
 *  yt-dlp runs without a shell, fetching subtitles only (never the video). */
async function youtube() {
  const id = arg('import') ?? fail('--import is required');
  const imp = must<{ url: string; status: string } | null>(await db.from('recipe_imports').select('url, status').eq('id', id).maybeSingle(), 'Finding the link')
    ?? fail(`No link with ID ${id}.`);
  if (imp.status !== 'importing') fail(`That link is ${imp.status}, not importing. Claim it first.`);
  const video = youTubeId(imp.url) ?? fail('That link is not a YouTube video.');
  const dir = mkdtempSync(join(tmpdir(), 'ffp-yt-'));
  try {
    await new Promise<void>((done, reject) => execFile(ytDlp(), [
      // English as written or spoken only: "en.*" also asks for YouTube's machine translations, which it rate-limits.
      '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'en,en-GB,en-US,en-orig', '--sub-format', 'vtt',
      '--no-playlist', '-o', join(dir, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${video}`,
    ], { timeout: 120_000 }, (err) => {
      // A failure after some subtitles arrived (one track refused) still leaves something to read.
      if (err && !readdirSync(dir).some((f) => f.endsWith('.vtt'))) reject(err); else done();
    }));
    // Prefer subtitles someone wrote (en) over automatic ones (en-orig, en-…).
    const files = readdirSync(dir).filter((f) => f.endsWith('.vtt')).sort((a, b) => Number(/\.en\.vtt$/.test(b)) - Number(/\.en\.vtt$/.test(a)));
    if (!files.length) fail('That video has no English subtitles.');
    console.log(vttToText(readFileSync(join(dir, files[0]), 'utf8')));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    fail(err.code === 'ENOENT' ? 'yt-dlp is not installed on this Mac (see docs/playbooks/recipe-import.md).' : `Reading the subtitles: ${err.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const commands: Record<string, () => Promise<void>> = {
  youtube,
  pending, claim, context, add, failed, 'claim-rework': claimRework, show, rework, 'rework-failed': reworkFailed,
};
await (commands[command] ?? (() => fail('Use: pending | claim | context | add | failed | youtube | claim-rework | show | rework | rework-failed')))();
