// Makes a recipe's main photo with Gemini and saves it (Storage + recipes.hero_image_path). Shared by the
// generate-hero function (the app's Make photos) and the connector's add_recipe. The caller's client decides access.
import { findImageData, GEMINI_URL, geminiRequest, heroPrompt } from './hero.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Makes and saves the photo; returns its path, or throws with a reason in plain words. */
export async function makeHeroImage(db: Db, apiKey: string, recipeId: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const { data: recipe, error } = await db.from('recipes').select('id, household_id, title, subtitle, hero_hint').eq('id', recipeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!recipe) throw new Error('That recipe is not in your library.');
  const { data: ingredients } = await db.from('recipe_ingredients').select('name').eq('recipe_id', recipeId).order('position');

  const res = await fetchFn(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(geminiRequest(heroPrompt({ title: recipe.title, subtitle: recipe.subtitle, ingredients: ingredients ?? [], hint: recipe.hero_hint }))),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `Google replied HTTP ${res.status}`);
  const image = findImageData(body);
  if (!image) throw new Error('Google replied without an image. Try again.');

  // A new file name each time, so phones never show a cached older photo.
  const path = `${recipe.household_id}/hero/${recipe.id}-${Date.now()}.jpg`;
  const { error: uploadError } = await db.storage.from('recipe-images').upload(path, base64ToBytes(image.data), { contentType: image.mimeType, upsert: true });
  if (uploadError) throw new Error(`Couldn't save the image: ${uploadError.message}`);
  const { error: updateError } = await db.from('recipes').update({ hero_image_path: path, hero_image_source: 'generated' }).eq('id', recipe.id);
  if (updateError) throw new Error(updateError.message);
  return path;
}
