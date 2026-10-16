// Generates hero photos for recipes that don't have one yet, one at a time, via the generate-hero Edge Function.
//   npm run heroes -- --household <household-id>          (shows how many and the rough cost)
//   npm run heroes -- --household <household-id> --limit 1 --yes   (try one first)
//   npm run heroes -- --household <household-id> --yes    (makes them; stops at the first failure)
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';

const PRICE_USD = 0.034; // gemini-3.1-flash-lite-image, 1K, standard rate (checked Oct 2026)
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const fail = (msg) => { console.error(msg); process.exit(1); };
const householdId = arg('household');
const limit = Number(arg('limit') ?? Infinity);
if (!householdId) fail('Usage: npm run heroes -- --household <household-id> [--limit N] [--yes]');

const env = loadEnv();
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
const url = new URL(env.VITE_SUPABASE_URL.trim()).origin;
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await db.from('recipes').select('id, title').eq('household_id', householdId)
  .is('hero_image_path', null).neq('status', 'archived').order('kind').order('title');
if (error) fail(error.message);
const todo = data.slice(0, limit);
const cost = (todo.length * PRICE_USD).toFixed(2);
console.log(`${todo.length} recipe${todo.length === 1 ? '' : 's'} without a photo: about $${cost} (≈ £${(cost * 0.79).toFixed(2)}).`);
todo.forEach((r) => console.log(`  - ${r.title}`));
if (!todo.length) process.exit(0);
if (!args.includes('--yes')) { console.log('\nNothing made yet. Run again with --yes to generate them.'); process.exit(0); }

let made = 0;
for (const r of todo) {
  const res = await fetch(`${url}/functions/v1/generate-hero`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId: r.id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Stop rather than keep paying for attempts that may fail the same way.
    console.error(`✗ ${r.title}: ${body.error ?? `HTTP ${res.status}`}`);
    console.error(`Stopped. ${todo.length - made} left to do; fix the problem and run again.`);
    break;
  }
  made++;
  console.log(`✓ ${r.title}`);
}
console.log(`\nMade ${made} of ${todo.length} photos.`);
