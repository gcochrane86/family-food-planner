// Helper for "Plan with Claude" (see docs/playbooks/week-plan.md). Runs on the owner's Mac with the service key from
// .env. Claude reads the household's picture with `context`, chooses the dinners, and pipes the plan into `save`;
// the built-in planner then fills breakfasts and lunches around those dinners.
//   npx tsx scripts/week.ts pending --household <id>       plan requests waiting (and Friday evening's own request)
//   npx tsx scripts/week.ts claim --request <id>           marks one 'planning' so no other check takes it
//   npx tsx scripts/week.ts context --request <id>         everything the plan needs, as JSON
//   npx tsx scripts/week.ts save --request <id> < plan.json {"summary", "dinners": [{date, recipe, reason}], "new_recipes"?}
//   npx tsx scripts/week.ts failed < failed.json           {"request": "<id>", "summary": "why"}
import { arg, command, db, fail, must, read, stdin } from './cliShared';
import { parseWeekFailed, parseWeekPlan } from './weekInput';
import { loadPlannerInput } from '../supabase/functions/_shared/loadPlan';
import { londonParts, nextMonday } from '../supabase/functions/_shared/schedule';
import { planContext, saveWeekPlan } from '../supabase/functions/_shared/weekPlan';

const STALE_MS = 2 * 60 * 60 * 1000;    // planning that started over 2 hours ago has stopped (Mac asleep)
const UNCLAIMED_MS = 12 * 60 * 60 * 1000; // a request not picked up in 12 hours (Mac off) is closed, not planned late
const FRIDAY_FROM = 18;               // Friday from 6pm London time, Claude plans next week by itself

type Request = { id: string; household_id: string; week_start: string; note: string | null; status: string; started_at: string | null; requested_at: string; replace: boolean };
const COLS = 'id, household_id, week_start, note, status, started_at, requested_at, replace';
const close = async (id: string, summary: string) =>
  must(await db.from('week_plan_requests').update({ status: 'failed', summary, finished_at: new Date().toISOString() }).eq('id', id).in('status', ['requested', 'planning']), 'Closing the request');

async function loadRequest(id: string): Promise<Request> {
  return must<Request | null>(await db.from('week_plan_requests').select(COLS).eq('id', id).maybeSingle(), 'Finding the request')
    ?? fail(`No plan request with ID ${id}.`);
}

/** Requests waiting, oldest first. On Friday evening, next week gets its own request if it has no plan yet. */
async function pending() {
  const householdId = arg('household') ?? fail('--household is required');
  const { date, hour, weekday } = londonParts(new Date());
  if (weekday === 5 && hour >= FRIDAY_FROM) {
    const weekStart = nextMonday(date);
    const [week, asked] = await Promise.all([
      db.from('plan_weeks').select('id').eq('household_id', householdId).eq('week_start', weekStart).maybeSingle(),
      db.from('week_plan_requests').select('id').eq('household_id', householdId).eq('week_start', weekStart).limit(1),
    ]);
    // Only once: a week that was planned, or already asked for (even if that failed), is left alone.
    if (!must(week, 'Reading next week') && !must(asked, 'Reading requests')?.length) {
      const made = await db.from('week_plan_requests').insert({ household_id: householdId, week_start: weekStart, note: null });
      if (made.error && made.error.code !== '23505') fail(`Asking for Friday's plan: ${made.error.message}`);
    }
  }
  const rows = must<Request[]>(await db.from('week_plan_requests').select(COLS)
    .eq('household_id', householdId).in('status', ['requested', 'planning']).order('requested_at'), 'Reading requests');
  const waiting = [];
  for (const r of rows) {
    if (r.status === 'planning') {
      if (Date.now() - Date.parse(r.started_at ?? r.requested_at) > STALE_MS) await close(r.id, 'Stopped part-way (the Mac may have slept).');
      continue;
    }
    // Planning it now could overwrite a menu made (and changed) since, so it's closed instead.
    if (Date.now() - Date.parse(r.requested_at) > UNCLAIMED_MS) {
      await close(r.id, 'Not picked up in time (the Mac was off). Tap Plan with Claude again.');
      continue;
    }
    waiting.push({ id: r.id, weekStart: r.week_start, note: r.note });
  }
  console.log(JSON.stringify(waiting));
}

async function claim() {
  const id = arg('request') ?? fail('--request is required');
  const rows = must<Request[]>(await db.from('week_plan_requests').update({ status: 'planning', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'requested').select(COLS), 'Claiming the request');
  if (!rows.length) fail('That request is already being planned or is finished.');
  const week = must<{ status: string } | null>(await db.from('plan_weeks').select('status').eq('household_id', rows[0].household_id).eq('week_start', rows[0].week_start).maybeSingle(), 'Reading the week');
  const why = week?.status === 'approved' ? 'That week is already approved, so it was left as it is.'
    : week && !rows[0].replace ? 'A menu for that week was made in the meantime. Tap Replan with Claude to replace it.' : null;
  if (why) {
    await close(id, why);
    fail(`${why} The request is closed as failed.`);
  }
  console.log(`Request ${id} claimed.`);
}

/** Everything the plan needs (see planContext), with the request's note. */
async function context() {
  const r = await loadRequest(arg('request') ?? fail('--request is required'));
  console.log(JSON.stringify({ request: { id: r.id, note: r.note }, ...(await planContext(db, r.household_id, r.week_start)) }, null, 2));
}

/** Adds Claude's new recipes, plans the week around Claude's dinners, and saves it all, or nothing. */
async function save() {
  const r = await loadRequest(arg('request') ?? fail('--request is required'));
  if (r.status !== 'planning') fail(`That request is ${r.status}, not planning. Claim it first.`);
  const hid = r.household_id;
  const settings = must<{ data: { adventure?: number } } | null>(await db.from('settings').select('data').eq('household_id', hid).maybeSingle(), 'Reading settings');
  const before = await loadPlannerInput(db, hid, r.week_start);
  const plan = read((t) => parseWeekPlan(t, { weekStart: r.week_start, days: before.days, adventure: settings?.data?.adventure ?? 1 }), await stdin());
  try {
    const { added } = await saveWeekPlan(db, hid, r.id, r.week_start, plan);
    console.log(`Planned the week of ${r.week_start}${added ? ` with ${added} new recipe${added === 1 ? '' : 's'}` : ''}.`);
  } catch (e) {
    fail((e as Error).message);
  }
}

async function failed() {
  const f = read(parseWeekFailed, await stdin());
  const closed = must<{ id: string }[]>(await db.from('week_plan_requests').update({ status: 'failed', summary: f.summary, finished_at: new Date().toISOString() })
    .eq('id', f.request).eq('status', 'planning').select('id'), 'Closing the request');
  if (!closed.length) fail('That request is not being planned (finished, or never claimed). Not changing it.');
  console.log(`Request ${f.request} marked failed.`);
}

const commands: Record<string, () => Promise<void>> = { pending, claim, context, save, failed };
await (commands[command] ?? (() => fail('Use: pending | claim | context | save | failed')))();
