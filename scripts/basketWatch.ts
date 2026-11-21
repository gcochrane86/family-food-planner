// Watches for taps in the app and starts Claude on this Mac straight away, instead of waiting for a scheduled task:
//   - Sainsbury's: "Ready for Sainsbury's" / "Fill again" / "Start again", and Settings → Start fresh (the trolley)
//   - Cookidoo: approving a week (or "Sync Cookidoo again"), and Start fresh (My Week)
// Checking costs nothing (a few small database reads every 10 seconds); Claude only runs when there's a request, one
// job at a time, since both drive the same Chrome. Claude follows the same instructions as the scheduled tasks, read
// from their task files. Runs in the background under launchd (docs/playbooks/sainsburys-basket.md, "The watcher").
//   npx tsx scripts/basketWatch.ts            (BASKET_HOUSEHOLD_ID and CLAUDE_BIN from the environment)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterRun, decide, fillPrompt, nextJob, type Job } from './basketWatchLogic';
// @ts-expect-error plain JS helper
import { loadEnv } from './env.mjs';

const env = loadEnv();
const household = env.BASKET_HOUSEHOLD_ID;
const claude = env.CLAUDE_BIN ?? join(homedir(), '.local/bin/claude');
const workDir = join(homedir(), '.food-planner-basket');
const EVERY_MS = 10_000;
const TASKS: Record<Job, { file: string; cli: string }> = {
  basket: { file: join(homedir(), '.claude/scheduled-tasks/sainsburys-basket-fill/SKILL.md'), cli: 'basket' },
  cookidoo: { file: join(homedir(), '.claude/scheduled-tasks/cookidoo-sync/SKILL.md'), cli: 'cookidoo' },
};
if (!household || !env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Needs BASKET_HOUSEHOLD_ID, and VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(new URL(env.VITE_SUPABASE_URL.trim()).origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

type Rows = { data: { id: string }[] | null; error: { message: string } | null };
const none: Rows = { data: [], error: null };
const idsOf = (prefix: string, r: Rows) => {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []).map((x) => `${prefix}:${x.id}`);
};

/** Requests waiting for Claude, oldest kind first: "run:", "fresh:", "cookidoo:" and "cookidoo-fresh:" ids. */
async function waiting(): Promise<string[]> {
  const weeks = await db.from('plan_weeks').select('id').eq('household_id', household);
  if (weeks.error) throw new Error(weeks.error.message);
  const ids = (weeks.data ?? []).map((w) => w.id as string);
  const [runs, fresh, syncs, myWeek] = await Promise.all([
    ids.length ? db.from('basket_runs').select('id').in('plan_week_id', ids).eq('status', 'requested').order('requested_at') : Promise.resolve(none),
    db.from('fresh_starts').select('id').eq('household_id', household).eq('trolley_status', 'requested'),
    ids.length ? db.from('cookidoo_runs').select('id').in('plan_week_id', ids).eq('status', 'requested').order('requested_at') : Promise.resolve(none),
    db.from('fresh_starts').select('id').eq('household_id', household).eq('cookidoo_status', 'requested'),
  ]);
  return [...idsOf('cookidoo-fresh', myWeek as Rows), ...idsOf('cookidoo', syncs as Rows), ...idsOf('fresh', fresh as Rows), ...idsOf('run', runs as Rows)];
}

/** Starts Claude with a task's instructions, only the tools that task needs, and Chrome. */
function runClaude(job: Job): Promise<number> {
  mkdirSync(workDir, { recursive: true });
  const { file, cli } = TASKS[job];
  const prompt = [
    fillPrompt(readFileSync(file, 'utf8')),
    `Write any JSON files only inside ${workDir}/, and pass them to the ${cli} commands with --file <path> instead of a "< file" redirect (which isn't allowed here), e.g. npm run -s ${cli} -- finish --file ${workDir}/finish.json.`,
    'You have no way to send a push notification here: put what you would have said in your final message instead.',
  ].join('\n\n');
  const args = ['-p', prompt, '--chrome', '--permission-mode', 'dontAsk', '--allowedTools',
    'Read', 'Glob', 'Grep', 'ToolSearch', `Edit(/${workDir}/**)`,
    `Bash(npm run -s ${cli}:*)`, `Bash(cd ${process.cwd()} && npm run -s ${cli}:*)`, 'mcp__claude-in-chrome__*'];
  return new Promise((resolve) => {
    const child = spawn(claude, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('error', (e) => { log(`Couldn't start Claude: ${e.message}`); resolve(-1); });
    child.on('close', (code) => resolve(code ?? -1));
  });
}

/** A request Claude never claimed means it couldn't get going (signed out, no network): say so in the app. */
async function failUnclaimed(ids: string[]) {
  const of = (prefix: string) => ids.filter((id) => id.startsWith(`${prefix}:`)).map((id) => id.slice(prefix.length + 1));
  const now = new Date().toISOString();
  const why = "Claude couldn't start on the Mac (it may be signed out). Check the Mac, then";
  const marked = [
    of('run').length ? await db.from('basket_runs').update({ status: 'failed', finished_at: now, summary: `${why} tap Fill again.` })
      .in('id', of('run')).eq('status', 'requested').select('id') : none,
    of('cookidoo').length ? await db.from('cookidoo_runs').update({ status: 'failed', finished_at: now, summary: `${why} tap Sync Cookidoo again.` })
      .in('id', of('cookidoo')).eq('status', 'requested').select('id') : none,
  ].reduce((n, r) => n + (r.data?.length ?? 0), 0);
  if (marked) log(`Marked ${marked} unclaimed request(s) failed`);
}

const tried = new Map<string, number>();
let running = false;
async function check() {
  let now: string[];
  try { now = await waiting(); } catch (e) { log(`Check failed: ${(e as Error).message}`); return; }
  for (const id of tried.keys()) if (!now.includes(id)) tried.delete(id);
  const d = decide({ waiting: now, running, tried, now: Date.now() });
  if (!d.start) return;
  const { job, ids } = nextJob(d.ids);
  running = true;
  for (const id of ids) tried.set(id, Date.now());
  log(`Starting Claude (${job}) for ${ids.join(', ')}`);
  const code = await runClaude(job);
  log(`Claude finished (exit ${code})`);
  try {
    const after = afterRun(ids, await waiting());
    for (const id of after.retryNow) tried.delete(id);
    await failUnclaimed(after.fail);
  } catch (e) { log(`Couldn't check what's left: ${(e as Error).message}`); }
  running = false;
  void check();
}

log(`Watching for Sainsbury's and Cookidoo requests every ${EVERY_MS / 1000}s`);
setInterval(() => { if (!running) void check(); }, EVERY_MS);
void check();
