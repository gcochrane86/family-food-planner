// Prompt and rules for AI step photos, made only for recipes rated "Have it again" (spec §5 Images).
// Shared by the generate-step-photo Edge Function (Deno) and its tests (Vitest). No imports, so both can load it.
// Learned from the curry test (16 Oct 2026): shots showing the TM7 drew the machine wrong, so these are
// food close-ups only, and each one names just the ingredients added so far.

interface PromptStep { title: string; body: string; machine: string | null; phase: string }

// The TM7's bowl, in words: image models otherwise draw an ordinary mixing bowl.
const TM7_BOWL = 'the Thermomix TM7 mixing bowl: a tall, narrow stainless-steel jug with a handle on one side, the blade in the centre of the base and ribs inside, not a mixing bowl or a saucepan';

function container(machine: string | null): string {
  if (machine === 'tm7') return `inside ${TM7_BOWL}`;
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

/** Which of the household's kit a step's machine means, for reference photos (Settings → Kitchen). */
const KIT_FOR: Record<string, string[]> = { tm7: ['tm7'], apo: ['apo'], hy24: ['hy24'], oven: ['oven'], hob: ['frying-pans', 'saucepans', 'hob'], meater: ['meater'] };
const MAX_KIT_PHOTOS = 3;

/** The household's photos of the kit a step uses (at most 3), or null when there are none. */
/** Kit named in your own words for the photo ("…into the TM7 bowl"). */
const MENTIONS: [RegExp, string][] = [[/\btm7\b|thermomix/i, 'tm7'], [/\banova\b|\bapo\b/i, 'apo'], [/air[- ]?fryer|\bhy24\b/i, 'hy24'], [/\bpan\b|\bpans\b|saucepan|frying/i, 'hob']];

export function kitReference(machine: string | null, kit: { code: string; name: string; photos: string[] }[], hint?: string | null): { name: string; photos: string[] } | null {
  const machines = [...(hint ? MENTIONS.filter(([re]) => re.test(hint)).map(([, m]) => m) : []), ...(machine ? [machine] : [])];
  const codes = [...new Set(machines.flatMap((m) => KIT_FOR[m] ?? [m]))];
  const items = codes.map((c) => kit.find((k) => k.code === c)).filter((k): k is NonNullable<typeof k> => !!k && k.photos.length > 0);
  if (!items.length) return null;
  const photos: string[] = [];
  // Take one photo of each item in turn, so every piece of kit is seen.
  for (let i = 0; photos.length < MAX_KIT_PHOTOS && items.some((k) => k.photos[i]); i++) for (const k of items) if (k.photos[i] && photos.length < MAX_KIT_PHOTOS) photos.push(k.photos[i]);
  return { name: items.map((k) => k.name).join(' and '), photos };
}

/** `hint`: the household's own one-sentence description of what the photo should show; it replaces the automatic one.
 *  `kit`: photos of the household's own kit for this step go with the request (after the dish photo), so the food is
 *  shown in that kit. Without them, no appliance is shown (the model draws machines wrong from words alone). */
export function stepPhotoPrompt(recipeTitle: string, steps: PromptStep[], index: number, hint?: string | null, kit?: { name: string; count: number } | null): string {
  const step = steps[index];
  const ingredients = ingredientsSoFar(steps, index);
  const prep = step.phase === 'prep_8pm';
  const intro = kit
    ? `Image 1 is the finished dish "${recipeTitle}": use it only to see what the food looks like. Draw a friendly cartoon illustration of one cooking step for this dish.`
    : `The reference photo shows the finished dish "${recipeTitle}": use it only to see what the food looks like. Draw a friendly cartoon illustration of one cooking step for this dish.`;
  // The same look as the chopping-board pictures and the get-out cards.
  const style = 'Bright flat colours with soft shading and clean outlines, like an illustrated picture-vocabulary card, seen from above at a slight angle, on a plain white background. Make the action obvious at a glance: one clear moment, the food large in the middle.';
  const which = kit && (kit.count === 1 ? 'Image 2 shows' : `Images 2 to ${kit.count + 1} show`);
  const tm7 = kit && /tm7|thermomix/i.test(kit.name) ? ` The Thermomix part is ${TM7_BOWL}.` : '';
  const rules = kit
    ? `${which} the household's own ${kit.name}: draw that same kit as a cartoon (same shape and colour), from any angle or rotation that shows the food best, showing only the part that holds the food.${tm7} No controls, no screen. No text, no labels, no hands, no packaging, no logos.`
    : 'No appliance, no controls, no screen. No text, no labels, no hands, no packaging, no logos.';
  const own = hint?.trim().replace(/[.\s]+$/, '');
  if (own) return [intro, style, `The step: ${step.title}.`, `Show this clearly: ${own}.`, rules].join(' ');
  return [
    intro,
    style,
    `The step: ${step.title}. ${step.body.replace(/\*\*/g, '')}`,
    ingredients.length ? `Only these ingredients are in it so far: ${ingredients.join(', ')}.` : '',
    prep
      ? 'This is made the night before: show it finished in a glass jar or container.'
      : `Show the food at this moment ${container(step.machine)}.`,
    rules,
  ].filter(Boolean).join(' ');
}

/** Step pictures drawn in the cartoon style are saved as steps/cartoon-…; older realistic ones get redrawn. */
export const isCartoonStep = (path: string | null | undefined) => !!path && /\/steps\/cartoon-/.test(path);

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
