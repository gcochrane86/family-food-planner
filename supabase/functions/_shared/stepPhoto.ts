// Prompt and rules for AI step photos, made only for recipes rated "Have it again" (spec §5 Images).
// Shared by the generate-step-photo Edge Function (Deno) and its tests (Vitest). No imports, so both can load it.
// Learned from the curry test (16 Oct 2026): shots showing the TM7 drew the machine wrong, so these are
// food close-ups only, and each one names just the ingredients added so far.

interface PromptStep { title: string; body: string; machine: string | null; phase: string }

function container(machine: string | null): string {
  if (machine === 'tm7') return 'inside a stainless steel mixing bowl';
  if (machine === 'hob') return 'in a pan';
  if (machine === 'apo' || machine === 'hy24' || machine === 'oven') return 'on a baking tray';
  return 'on a chopping board or in a bowl';
}

/** The ingredients marked **like this** in steps 0..index, in order, without repeats. */
function ingredientsSoFar(steps: PromptStep[], index: number): string[] {
  const seen: string[] = [];
  for (const s of steps.slice(0, index + 1)) {
    for (const m of s.body.matchAll(/\*\*(.+?)\*\*/g)) {
      const name = m[1].trim().toLowerCase();
      if (name && !seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

/** `hint`: the household's own one-sentence description of what the photo should show; it replaces the automatic one. */
export function stepPhotoPrompt(recipeTitle: string, steps: PromptStep[], index: number, hint?: string | null): string {
  const step = steps[index];
  const ingredients = ingredientsSoFar(steps, index);
  const prep = step.phase === 'prep_8pm';
  const intro = `The reference photo shows the finished dish "${recipeTitle}". Make a realistic photo of one cooking step for this same dish, with the same table, light and colours as the reference photo.`;
  const rules = 'Close up from directly above. No appliance, no controls, no screen. No text, no labels, no hands, no packaging, no logos.';
  const own = hint?.trim().replace(/[.\s]+$/, '');
  if (own) return [intro, `The step: ${step.title}.`, `Show this: ${own}.`, rules].join(' ');
  return [
    intro,
    `The step: ${step.title}. ${step.body.replace(/\*\*/g, '')}`,
    ingredients.length ? `Only these ingredients are in it so far: ${ingredients.join(', ')}.` : '',
    prep
      ? 'This is made the night before: show it finished in a glass jar or container.'
      : `Show the food at this moment ${container(step.machine)}.`,
    'Close up from directly above. No appliance, no controls, no screen. No text, no labels, no hands, no packaging, no logos.',
  ].filter(Boolean).join(' ');
}

/**
 * Why a step photo can't be made, or null when it can. Guards cost and never replaces your own photo.
 * `asked` is a photo you chose from the recipe's ⚙︎ menu (after seeing the cost), which doesn't need a 👍.
 */
export function stepPhotoRefusal(
  recipe: { rating: string | null; hero_image_path: string | null },
  step: { image_path: string | null; image_source: string | null },
  replace: boolean,
  asked = false,
  replaceOwn = false, // cook mode's "Make a new photo", after warning that it replaces your photo
): string | null {
  if (recipe.rating !== 'up' && !asked) return 'Only liked recipes get step photos.';
  if (!recipe.hero_image_path) return 'Make the main photo first.';
  if (step.image_path && step.image_source !== 'generated' && !(replaceOwn && asked)) return 'This step has your own photo.';
  if (step.image_path && !replace) return 'This step already has a photo.';
  return null;
}

/**
 * The condition the saved photo must still meet when it's written, 10–20 seconds after the refusal check:
 * a new photo only fills an empty step, and a redo only replaces a generated one. So a photo you add
 * while one is being made always wins.
 */
export function stepPhotoWriteGuard(replace: boolean, replaceOwn = false): { column: 'image_path' | 'image_source'; equals: null | 'generated' | 'own' } {
  if (replace && replaceOwn) return { column: 'image_source', equals: 'own' };
  return replace ? { column: 'image_source', equals: 'generated' } : { column: 'image_path', equals: null };
}
