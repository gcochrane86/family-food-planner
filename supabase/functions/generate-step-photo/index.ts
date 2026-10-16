// Makes one AI photo for one step of a liked recipe, using the recipe's hero photo as the style reference, and saves
// it to Storage. One step per call keeps each run well inside the function time limit; the app calls it step by step.
// Runs as the signed-in caller, so household access rules decide which recipes they can do this for.
// Needs the secret GOOGLE_AI_API_KEY (Supabase → Edge Functions → Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding@1.0.5/base64';
import { findImageData, GEMINI_MODEL, GEMINI_URL } from '../_shared/hero.ts';
import { stepPhotoPrompt, stepPhotoRefusal, stepPhotoWriteGuard } from '../_shared/stepPhoto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Cooking order: the night-before prep comes first, then the finish.
const PHASE_ORDER: Record<string, number> = { prep_8pm: 0, finish: 1, reheat: 2 };

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

  const { recipeId, stepId, replace, asked } = await req.json().catch(() => ({}));
  if (typeof recipeId !== 'string' || typeof stepId !== 'string') return reply(400, { error: 'recipeId and stepId are required' });

  const { data: recipe, error: recipeError } = await db.from('recipes')
    .select('id, household_id, title, rating, hero_image_path').eq('id', recipeId).maybeSingle();
  if (recipeError) return reply(500, { error: recipeError.message });
  if (!recipe) return reply(404, { error: 'That recipe is not in your library.' });

  const { data: rows, error: stepsError } = await db.from('recipe_steps')
    .select('id, phase, position, title, body, machine, image_path, image_source').eq('recipe_id', recipeId);
  if (stepsError) return reply(500, { error: stepsError.message });
  const steps = (rows ?? []).sort((a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9) || a.position - b.position);
  const index = steps.findIndex((s) => s.id === stepId);
  if (index < 0) return reply(404, { error: 'That step is not in this recipe.' });

  const refusal = stepPhotoRefusal(recipe, steps[index], replace === true, asked === true);
  if (refusal) return reply(409, { error: refusal });

  const { data: hero, error: heroError } = await db.storage.from('recipe-images').download(recipe.hero_image_path!);
  if (heroError || !hero) return reply(500, { error: `Couldn't read the main photo: ${heroError?.message ?? 'missing'}` });

  const gemini = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [
        { type: 'text', text: stepPhotoPrompt(recipe.title, steps, index) },
        { type: 'image', data: encodeBase64(new Uint8Array(await hero.arrayBuffer())), mime_type: hero.type || 'image/jpeg' },
      ],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '4:3', image_size: '1K' },
    }),
  });
  const body = await gemini.json().catch(() => null);
  if (!gemini.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${gemini.status}`;
    return reply(502, { error: `Google couldn't make the image: ${message}` });
  }
  const image = findImageData(body);
  if (!image) return reply(502, { error: 'Google replied without an image. Try again.' });

  // A new file name each time, so phones never show a cached older photo.
  const path = `${recipe.household_id}/steps/${recipe.id}-${stepId}-${Date.now()}.jpg`;
  const { error: uploadError } = await db.storage.from('recipe-images')
    .upload(path, decodeBase64(image.data), { contentType: image.mimeType });
  if (uploadError) return reply(500, { error: `Couldn't save the image: ${uploadError.message}` });

  // Only if the step is still free (or still generated, for a redo): a photo you added meanwhile wins.
  const guard = stepPhotoWriteGuard(replace === true);
  const update = db.from('recipe_steps').update({ image_path: path, image_source: 'generated' }).eq('id', stepId);
  const { data: saved, error: updateError } = await (guard.equals === null ? update.is(guard.column, null) : update.eq(guard.column, guard.equals)).select('id');
  if (updateError) return reply(500, { error: updateError.message });
  if (!saved?.length) {
    await db.storage.from('recipe-images').remove([path]);
    return reply(409, { error: 'This step already has a photo.' });
  }

  return reply(200, { path });
});
