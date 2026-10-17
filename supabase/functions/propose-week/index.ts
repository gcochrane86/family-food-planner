// Proposes next week's menu. Called two ways:
//  - by the scheduler (Friday evenings, hourly in UTC) with the x-cron-secret header: acts at 7pm London
//    time for every household that has no plan for next week yet (?force=1 skips the time check);
//  - by a signed-in member from the app ("Propose now"): only for their own household.
// Deployed with --no-verify-jwt, because the scheduler has no user; both paths are checked here.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { buildPlannerInput, slotRows } from '../_shared/planInput.ts';
import { proposeWeek } from '../_shared/planner.ts';
import { londonParts, nextMonday, shouldPropose } from '../_shared/schedule.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const url = Deno.env.get('SUPABASE_URL')!;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Makes and saves the proposal for one household. Returns 'exists' if that week already has a plan. */
async function proposeFor(db: SupabaseClient, householdId: string, weekStart: string): Promise<'created' | 'exists'> {
  const { data: existing, error: e0 } = await db.from('plan_weeks').select('id').eq('household_id', householdId).eq('week_start', weekStart).maybeSingle();
  if (e0) throw e0;
  if (existing) return 'exists';

  const [settings, members, recipes, weeks] = await Promise.all([
    db.from('settings').select('data').eq('household_id', householdId).maybeSingle(),
    db.from('members').select('id, kind, portion_weight').eq('household_id', householdId),
    db.from('recipes').select('id, title, kind, status, protein, finish_minutes, reheats_well, base_portions, rating, tags').eq('household_id', householdId),
    db.from('plan_weeks').select('id').eq('household_id', householdId).gte('week_start', addDays(weekStart, -14)).lt('week_start', weekStart),
  ]);
  for (const r of [settings, members, recipes, weeks]) if (r.error) throw r.error;
  const memberIds = (members.data ?? []).map((m) => m.id);
  const weekIds = (weeks.data ?? []).map((w) => w.id);
  const [pattern, recent] = await Promise.all([
    memberIds.length ? db.from('member_week_pattern').select('member_id, weekday, office').in('member_id', memberIds) : { data: [], error: null },
    weekIds.length ? db.from('meal_slots').select('recipe_id').in('plan_week_id', weekIds).eq('slot', 'dinner').eq('mode', 'cook') : { data: [], error: null },
  ]);
  if (pattern.error) throw pattern.error;
  if (recent.error) throw recent.error;

  // In-date batch portions in the freezer (none if the table isn't there yet, so the menu still arrives).
  const frozen = await db.from('prepared_items').select('recipe_id, portions').eq('household_id', householdId).eq('location', 'freezer')
    .gt('portions', 0).or(`use_by.is.null,use_by.gte.${weekStart}`);
  const input = buildPlannerInput({
    weekStart, householdId, settings: settings.data?.data ?? null, members: members.data ?? [], pattern: pattern.data ?? [],
    recipes: recipes.data ?? [], recentDinnerRecipeIds: (recent.data ?? []).map((r) => r.recipe_id),
    ...(frozen.error ? {} : { frozen: frozen.data ?? [] }),
  });
  const plan = proposeWeek(input);

  const { data: week, error: e1 } = await db.from('plan_weeks')
    .insert({ household_id: householdId, week_start: weekStart, days: input.days, status: 'draft' }).select('id').single();
  if (e1) {
    if (e1.code === '23505') return 'exists'; // another run got there first
    throw e1;
  }
  const { error: e2 } = await db.from('meal_slots').insert(slotRows(week.id, plan));
  if (e2) {
    await db.from('plan_weeks').delete().eq('id', week.id); // don't leave an empty week behind
    throw e2;
  }
  return 'created';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  const force = new URL(req.url).searchParams.get('force') === '1';

  try {
    // Scheduler path
    const cronSecret = Deno.env.get('CRON_SECRET');
    const given = req.headers.get('x-cron-secret');
    if (given !== null) {
      if (!cronSecret || given !== cronSecret) return reply(401, { error: 'Bad scheduler secret' });
      const { go, weekStart } = shouldPropose(new Date());
      if (!go && !force) return reply(200, { skipped: 'not 7pm Friday in London', weekStart });
      const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
      const { data: households, error } = await admin.from('households').select('id');
      if (error) throw error;
      const results: Record<string, string> = {};
      // One household's problem must not stop the others; the next hourly run retries it.
      for (const h of households ?? []) {
        try {
          results[h.id] = await proposeFor(admin, h.id, weekStart);
        } catch (e) {
          console.error(`propose-week ${h.id}:`, e);
          results[h.id] = 'failed';
        }
      }
      return reply(200, { weekStart, results });
    }

    // Member path ("Propose now" in the app)
    const auth = req.headers.get('Authorization');
    if (!auth) return reply(401, { error: 'Sign in first.' });
    const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: user, error: userError } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (userError || !user.user) return reply(401, { error: 'Sign in first.' });
    const { data: membership } = await db.from('household_users').select('household_id').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!membership) return reply(403, { error: 'You are not in a household yet.' });
    const body = await req.json().catch(() => ({}));
    const weekStart = typeof body.weekStart === 'string' ? body.weekStart : nextMonday(londonParts(new Date()).date);
    const result = await proposeFor(db, membership.household_id, weekStart);
    return reply(200, { weekStart, result });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
