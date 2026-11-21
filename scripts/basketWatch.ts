// Watches for "Ready for Sainsbury's" / "Fill again" / "Start fresh" taps and starts Claude on this Mac straight away,
// instead of waiting for a scheduled task. Checking costs nothing (one small database read every few seconds); Claude
// only runs when there's a request. Runs in the background under launchd (docs/playbooks/sainsburys-basket.md,
// "The watcher"). Claude follows the same instructions as the scheduled fill task, read from its task file.
//   npx tsx scripts/basketWatch.ts            (BASKET_HOUSEHOLD_ID, BASKET_TASK_FILE and CLAUDE_BIN from the environment)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { decide, fillPrompt } from './basketWatchLogic';
// @ts-expect-error plain JS helper
import { loadEnv } from './env.mjs';

const env = loadEnv();
const household = env.BASKET_HOUSEHOLD_ID;
const taskFile = env.BASKET_TASK_FILE ?? join(homedir(), '.claude/scheduled-tasks/sainsburys-basket-fill/SKILL.md');
const claude = env.CLAUDE_BIN ?? join(homedir(), '.local/bin/claude');
const workDir = join(homedir(), '.food-planner-basket');
const EVERY_MS = 10_000;
if (!household || !env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Needs BASKET_HOUSEHOLD_ID, and VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(new URL(env.VITE_SUPABASE_URL.trim()).origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

/** Requests waiting for Claude, as "run:<id>" and "fresh:<id>". */
async function waiting(): Promise<string[]> {
  const weeks = await db.from('plan_weeks').select('id').eq('household_id', household);
  if (weeks.error) throw new Error(weeks.error.message);
  const ids = (weeks.data ?? []).map((w) => w.id as string);
  const [runs, fresh] = await Promise.all([
    ids.length ? db.from('basket_runs').select('id').in('plan_week_id', ids).eq('status', 'requested') : Promise.resolve({ data: [], error: null }),
    db.from('fresh_starts').select('id').eq('household_id', household).eq('trolley_status', 'requested'),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  if (fresh.error) throw new Error(fresh.error.message);
  return [...(runs.data ?? []).map((r) => `run:${r.id}`), ...(fresh.data ?? []).map((r) => `fresh:${r.id}`)];
}

/** Starts Claude with the fill instructions, only the tools the fill needs, and Chrome. */
function runClaude(): Promise<number> {
  mkdirSync(workDir, { recursive: true });
  const prompt = `${fillPrompt(readFileSync(taskFile, 'utf8'))}\n\nWrite any JSON files only inside ${workDir}/, and pass them to the basket commands with --file <path> instead of a `< file` redirect (which isn't allowed here), e.g. npm run -s basket -- finish --file ${workDir}/finish.json. You have no way to send a push notification here: put what you would have said in your final message instead.`;
  const args = ['-p', prompt, '--chrome', '--permission-mode', 'dontAsk', '--allowedTools',
    'Read', 'Glob', 'Grep', 'ToolSearch', `Edit(/${workDir}/**)`,
    'Bash(npm run -s basket:*)', `Bash(cd ${process.cwd()} && npm run -s basket:*)`, 'mcp__claude-in-chrome__*'];
  return new Promise((resolve) => {
    const child = spawn(claude, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('error', (e) => { log(`Couldn't start Claude: ${e.message}`); resolve(-1); });
    child.on('close', (code) => resolve(code ?? -1));
  });
}

const tried = new Map<string, number>();
let running = false;
async function check() {
  let now: string[];
  try { now = await waiting(); } catch (e) { log(`Check failed: ${(e as Error).message}`); return; }
  for (const id of tried.keys()) if (!now.includes(id)) tried.delete(id);
  const d = decide({ waiting: now, running, tried, now: Date.now() });
  if (!d.start) return;
  running = true;
  for (const id of d.ids) tried.set(id, Date.now());
  log(`Starting Claude for ${d.ids.join(', ')}`);
  const code = await runClaude();
  log(`Claude finished (exit ${code})`);
  // A fill request Claude never claimed means it couldn't get going (signed out, no network): say so in the app.
  const runIds = d.ids.filter((id) => id.startsWith('run:')).map((id) => id.slice(4));
  if (runIds.length) {
    const r = await db.from('basket_runs').update({ status: 'failed', finished_at: new Date().toISOString(),
      summary: "Claude couldn't start on the Mac (it may be signed out). Check the Mac, then tap Fill again." })
      .in('id', runIds).eq('status', 'requested').select('id');
    if (r.data?.length) log(`Marked ${r.data.length} unclaimed request(s) failed`);
  }
  running = false;
  void check();
}

log(`Watching for Sainsbury's requests every ${EVERY_MS / 1000}s`);
setInterval(() => { if (!running) void check(); }, EVERY_MS);
void check();
