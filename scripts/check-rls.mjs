// Checks that someone who isn't signed in can't read any household data.
// Run after applying supabase/migrations/0001_foundation.sql: npm run check-rls
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';

const env = loadEnv();
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const tables = ['households', 'household_users', 'members', 'member_week_pattern', 'settings',
  'house_rules', 'equipment', 'ingredients', 'pantry_items', 'join_attempts'];
let failed = false;
for (const t of tables) {
  const { data, error } = await anon.from(t).select('*').limit(1);
  if (error && /permission denied/i.test(error.message)) continue; // no access at all is the safest result
  if (error) { console.error(`${t}: error ${error.message}`); failed = true; continue; }
  if (data.length) { console.error(`${t}: LEAK, signed-out read returned rows`); failed = true; }
}
const { error: rpcError } = await anon.rpc('create_household', { p_name: 'x' });
if (!rpcError) { console.error('create_household: callable while signed out'); failed = true; }

console.log(failed ? 'RLS FAILED' : 'RLS OK');
process.exit(failed ? 1 : 0);
