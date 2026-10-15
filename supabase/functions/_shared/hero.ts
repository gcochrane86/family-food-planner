// Shared by the generate-hero Edge Function (Deno) and its tests (Vitest). No imports, so both can load it.

export const GEMINI_MODEL = 'gemini-3.1-flash-lite-image';
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** Seasonings and basics that don't make a dish recognisable in a photo. */
const BACKGROUND = /\b(salt|pepper|oil|water|stock|granules|powder|paprika|cumin|turmeric|oregano|chilli flakes|mint|flour|cornflour|sugar|vinegar|sauce|honey|lemon juice)\b/i;

interface HeroRecipe {
  title: string;
  subtitle: string | null;
  ingredients: { name: string }[];
}

/** One consistent house style, so the whole library looks like a set (spec §5 Images). */
export function heroPrompt(recipe: HeroRecipe): string {
  const main = [...new Set(recipe.ingredients.map((i) => i.name.trim()).filter((n) => n && !BACKGROUND.test(n)))].slice(0, 5);
  const dish = recipe.subtitle ? `${recipe.title}, ${recipe.subtitle}` : recipe.title;
  return [
    `A realistic food photograph of ${dish}, home-cooked and plated for a family dinner.`,
    main.length ? `Main ingredients: ${main.join(', ')}.` : '',
    'Shot at a 45-degree angle in soft natural window light, on matte stoneware on a pale oak table, shallow depth of field.',
    'No text, no labels, no hands, no packaging, no logos.',
  ].filter(Boolean).join(' ');
}

export function geminiRequest(prompt: string) {
  return {
    model: GEMINI_MODEL,
    input: prompt,
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '4:3', image_size: '1K' },
  };
}

/** Finds the generated image in a Gemini response, whichever response shape it comes back in. */
export function findImageData(response: unknown): { data: string; mimeType: string } | null {
  let found: { data: string; mimeType: string } | null = null;
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const o = node as Record<string, unknown>;
    if (o.type === 'image' && typeof o.data === 'string') {
      found = { data: o.data, mimeType: typeof o.mime_type === 'string' ? o.mime_type : 'image/jpeg' };
    }
    const inline = (o.inlineData ?? o.inline_data) as Record<string, unknown> | undefined;
    if (inline && typeof inline.data === 'string') {
      found = { data: inline.data, mimeType: String(inline.mimeType ?? inline.mime_type ?? 'image/png') };
    }
    Object.values(o).forEach(visit);
  };
  visit(response);
  return found;
}
