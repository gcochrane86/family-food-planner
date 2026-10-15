// Generates a hero photo for one recipe with Google's Gemini image model and saves it to Storage.
// Runs as the signed-in caller, so household access rules decide which recipes they can do this for.
// Needs the secret GOOGLE_AI_API_KEY (Supabase → Edge Functions → Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { findImageData, GEMINI_URL, geminiRequest, heroPrompt } from '../_shared/hero.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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

  const { data: recipe, error: recipeError } = await db.from('recipes')
    .select('id, household_id, title, subtitle').eq('id', recipeId).maybeSingle();
  if (recipeError) return reply(500, { error: recipeError.message });
  if (!recipe) return reply(404, { error: 'That recipe is not in your library.' });
  const { data: ingredients } = await db.from('recipe_ingredients').select('name').eq('recipe_id', recipeId).order('position');

  const gemini = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(geminiRequest(heroPrompt({ title: recipe.title, subtitle: recipe.subtitle, ingredients: ingredients ?? [] }))),
  });
  const body = await gemini.json().catch(() => null);
  if (!gemini.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${gemini.status}`;
    return reply(502, { error: `Google couldn't make the image: ${message}` });
  }
  const image = findImageData(body);
  if (!image) return reply(502, { error: 'Google replied without an image. Try again.' });

  // A new file name each time, so phones never show a cached older photo.
  const path = `${recipe.household_id}/hero/${recipe.id}-${Date.now()}.jpg`;
  const { error: uploadError } = await db.storage.from('recipe-images')
    .upload(path, base64ToBytes(image.data), { contentType: image.mimeType, upsert: true });
  if (uploadError) return reply(500, { error: `Couldn't save the image: ${uploadError.message}` });

  const { error: updateError } = await db.from('recipes')
    .update({ hero_image_path: path, hero_image_source: 'generated' }).eq('id', recipe.id);
  if (updateError) return reply(500, { error: updateError.message });

  return reply(200, { path });
});
