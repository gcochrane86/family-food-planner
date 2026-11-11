// Small copies of the household's photos (see src/lib/photos.ts). Runs on the owner's Mac with the service key from
// .env and macOS's own `sips`. Add-only: it never changes or deletes an original, or a copy that's already there.
//   npx tsx scripts/photos.ts small-copies --household <id> [--dry-run]
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arg, command, db, fail, must, rest } from './cliShared';
import { SMALL_EDGE, smallPath } from '../src/lib/photos';

const BUCKET = 'recipe-images';
const run = (file: string, args: string[]) => new Promise<void>((done, reject) => execFile(file, args, (e) => (e ? reject(e) : done())));

async function smallCopies() {
  const householdId = arg('household') ?? fail('--household is required');
  const dry = rest.includes('--dry-run');
  const heroes = must<{ hero_image_path: string | null }[]>(await db.from('recipes').select('hero_image_path').eq('household_id', householdId).not('hero_image_path', 'is', null), 'Reading recipe photos');
  const steps = must<{ image_path: string | null }[]>(await db.from('recipe_steps').select('image_path, recipes!inner(household_id)').eq('recipes.household_id', householdId).not('image_path', 'is', null), 'Reading step photos');
  const paths = [...new Set([...heroes.map((r) => r.hero_image_path), ...steps.map((s) => s.image_path)].filter((p): p is string => !!p))];

  // What's already in each folder, so only missing copies are made.
  const have = new Set<string>();
  for (const folder of new Set(paths.map((p) => p.slice(0, p.lastIndexOf('/'))))) {
    for (let offset = 0; ; offset += 1000) {
      const page = must(await db.storage.from(BUCKET).list(folder, { limit: 1000, offset }), `Listing ${folder}`);
      for (const f of page) have.add(`${folder}/${f.name}`);
      if (page.length < 1000) break;
    }
  }
  const todo = paths.filter((p) => have.has(p) && !have.has(smallPath(p)));
  console.log(`${paths.length} photos, ${paths.filter((p) => have.has(smallPath(p))).length} already have a small copy, ${todo.length} to make.`);
  if (dry || !todo.length) return;

  const dir = mkdtempSync(join(tmpdir(), 'ffp-photos-'));
  let made = 0, before = 0, after = 0;
  const problems: string[] = [];
  try {
    for (const path of todo) {
      try {
        const original = await db.storage.from(BUCKET).download(path);
        if (original.error) throw original.error;
        const inFile = join(dir, 'in'); const outFile = join(dir, 'out.jpg');
        const bytes = Buffer.from(await original.data.arrayBuffer());
        writeFileSync(inFile, bytes);
        await run('/usr/bin/sips', ['-Z', String(SMALL_EDGE), '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', inFile, '--out', outFile]);
        const small = readFileSync(outFile);
        const up = await db.storage.from(BUCKET).upload(smallPath(path), small, { upsert: false, contentType: 'image/jpeg' });
        if (up.error && !/exists/i.test(up.error.message)) throw up.error;
        made++; before += bytes.length; after += small.length;
      } catch (e) {
        problems.push(`${path}: ${(e as Error).message}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`Made ${made} small copies: ${Math.round(before / 1024 / 1024)}MB of originals as ${Math.round(after / 1024 / 1024)}MB of copies.`);
  if (problems.length) fail(`Couldn't make:\n- ${problems.join('\n- ')}`);
}

const commands: Record<string, () => Promise<void>> = { 'small-copies': smallCopies };
await (commands[command] ?? (() => fail('Use: small-copies')))();
