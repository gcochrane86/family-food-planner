// Makes one chopping photo: an ingredient cut a particular way, on a chopping board ("new potato, halved"). Saved
// once per household, ingredient and cut, and reused by every recipe that prepares it the same way.
// With `icon: true` it makes the ingredient's small cartoon for Today's hour "Get it out" list instead (one per ingredient).
// Runs as the signed-in caller, so household access rules decide where it can save. Needs GOOGLE_AI_API_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding@1.0.5/base64';
import { findImageData, GEMINI_MODEL, GEMINI_URL } from '../_shared/hero.ts';
import { iconKey, iconPrompt, prepKey, prepPhotoPrompt } from '../_shared/prepCut.ts';

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

  const { householdId, name, note, replace, hint, icon } = await req.json().catch(() => ({}));
  const ownHint = typeof hint === 'string' && hint.trim() ? hint.trim().slice(0, 200) : null;
  if (typeof householdId !== 'string' || typeof name !== 'string' || !name.trim() || name.length > 120 || (note != null && (typeof note !== 'string' || note.length > 200))) {
    return reply(400, { error: 'householdId and an ingredient name are required' });
  }
  // Only your own household (checked before anything costs money).
  const { data: home } = await db.from('households').select('id').eq('id', householdId).maybeSingle();
  if (!home) return reply(404, { error: 'That household is not yours.' });

  const asIcon = icon === true;
  const p = asIcon ? { ...iconKey(name), cut: '' } : prepKey(name, note ?? null);
  const { data: existing, error: readError } = await db.from('prep_photos').select('path, source').eq('household_id', householdId).eq('key', p.key).maybeSingle();
  if (readError) return reply(500, { error: readError.message });
  if (existing && replace !== true) return reply(200, { path: existing.path, key: p.key, label: p.label, reused: true });

  // The household's own chopping board (Settings → Kitchen, an item with "board" in its name), if it has a photo.
  const { data: kitRows } = await db.from('equipment').select('code, name, capabilities').eq('household_id', householdId);
  const board = (kitRows ?? []).find((k: { code: string; name: string }) => /board/i.test(`${k.code} ${k.name}`));
  const boardPath = (board?.capabilities?.photos as string[] | undefined)?.[0] ?? (typeof board?.capabilities?.photo === 'string' ? board.capabilities.photo : null);
  const boardImg = boardPath && !asIcon ? (await db.storage.from('recipe-images').download(boardPath)).data : null;
  const boardInput = boardImg ? [{ type: 'image', data: encodeBase64(new Uint8Array(await boardImg.arrayBuffer())), mime_type: boardImg.type || 'image/jpeg' }] : [];

  const gemini = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [{ type: 'text', text: asIcon ? iconPrompt(p.ingredient, ownHint) : prepPhotoPrompt(p, ownHint, boardInput.length > 0) }, ...boardInput],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: asIcon ? '1:1' : '4:3', image_size: '1K' },
    }),
  });
  const body = await gemini.json().catch(() => null);
  if (!gemini.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${gemini.status}`;
    return reply(502, { error: `Google couldn't make the image: ${message}` });
  }
  const image = findImageData(body);
  if (!image) return reply(502, { error: 'Google replied without an image. Try again.' });

  const file = p.key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  // Chopping pictures are named cartoon-…, so the app can tell them from the older realistic ones it redraws.
  const path = `${householdId}/prep/${asIcon ? '' : 'cartoon-'}${file}-${Date.now()}.jpg`;
  const { error: uploadError } = await db.storage.from('recipe-images').upload(path, decodeBase64(image.data), { contentType: image.mimeType });
  if (uploadError) return reply(500, { error: `Couldn't save the image: ${uploadError.message}` });
  const { error: saveError } = await db.from('prep_photos')
    .upsert({ household_id: householdId, key: p.key, label: p.label, path, source: 'generated' }, { onConflict: 'household_id,key' });
  if (saveError) return reply(500, { error: saveError.message });
  return reply(200, { path, key: p.key, label: p.label, reused: false });
});
