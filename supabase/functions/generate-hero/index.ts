// Generates a hero photo for one recipe with Google's Gemini image model and saves it to Storage.
// Runs as the signed-in caller, so household access rules decide which recipes they can do this for.
// Needs the secret GOOGLE_AI_API_KEY (Supabase → Edge Functions → Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { makeHeroImage } from '../_shared/heroMake.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  const key = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!key) return reply(500, { error: 'The GOOGLE_AI_API_KEY secret is not set in Supabase.' });

  const auth = req.headers.get('Authorization');
  if (!auth) return reply(401, { error: 'Sign in first.' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { recipeId } = await req.json().catch(() => ({}));
  if (typeof recipeId !== 'string') return reply(400, { error: 'recipeId is required' });

  try {
    const path = await makeHeroImage(db, key, recipeId);
    return reply(200, { path });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reply(/not in your library/.test(message) ? 404 : 502, { error: /^(Google|Couldn't|That)/.test(message) ? message : `Google couldn't make the image: ${message}` });
  }
});
