// Chopping photos: one photo per ingredient and cut ("new potato, halved", "red pepper, strips (1cm)"), made once and
// reused by every recipe that prepares it the same way. Recipes word their cuts differently ("in pieces", "roughly
// chopped"), so the cut is read into a standard set, keeping any size. Shared by the app and the photo function.

const DROP = new Set(['fresh', 'large', 'small', 'medium', 'ripe', 'big']);

/** "Red Peppers (about 2)" → "red pepper": lower case, no notes in brackets or size words, the last word singular. */
function ingredientOf(name: string): string {
  const words = name.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((w) => w && !DROP.has(w));
  if (!words.length) return name.trim().toLowerCase();
  const last = words[words.length - 1];
  words[words.length - 1] = last === 'chillies' ? 'chilli'
    : last.endsWith('oes') ? last.slice(0, -2)
    : last.endsWith('ies') ? `${last.slice(0, -3)}y`
    : last.endsWith('s') && !/(ss|us|as)$/.test(last) ? last.slice(0, -1) : last;
  return words.join(' ');
}

const CUTS: [RegExp, string][] = [
  [/crush|minced?\b/, 'crushed'],
  [/grat/, 'grated'],
  [/julienne|matchstick/, 'matchsticks'],
  [/baton|strip/, 'strips'],
  [/\brings?\b/, 'rings'],
  [/half[- ]moon/, 'half-moons'],
  [/wedge/, 'wedges'],
  [/floret/, 'florets'],
  [/quarter/, 'quartered'],
  [/halve|in half|\bhalves\b/, 'halved'],
  [/finely (chopped|diced)|fine dice|\bfinely\b/, 'finely diced'],
  [/dice|cube/, 'diced'],
  [/chunk|piece|roughly chopped|rough chop/, 'chunks'],
  [/thin(ly)? slic|thin slices/, 'thinly sliced'],
  [/slic/, 'sliced'],
  [/chop/, 'chopped'],
];

/** The ingredient and its cut, as a key for the saved photo and a label to show. */
export function prepKey(name: string, note: string | null | undefined): { key: string; ingredient: string; cut: string; label: string } {
  const ingredient = ingredientOf(name);
  const n = (note ?? '').trim().toLowerCase().replace(/[.;]+$/, '');
  const size = n.match(/(\d+(?:\.\d+)?)\s*(mm|cm)\b/);
  const found = CUTS.find(([re]) => re.test(n));
  const cut = !n ? 'chopped' : found ? `${found[1]}${size ? ` (${size[1]}${size[2]})` : ''}` : n;
  return { key: `${ingredient}|${cut}`, ingredient, cut, label: `${ingredient}, ${cut}` };
}

/** What the picture maker is asked for: a friendly cartoon (the same style as the get-out pictures) of a chopping board
 *  and knife with just that ingredient, cut that way. `hint`: your own words for this picture. `ownBoard`: a photo of
 *  the household's board goes with the request as a reference, drawn as a cartoon. */
export function prepPhotoPrompt(p: { ingredient: string; cut: string }, hint?: string | null, ownBoard = false): string {
  const extra = hint?.trim().replace(/[.\s]+$/, '');
  return [
    ownBoard
      ? `The reference photo shows the household's own chopping board. Draw a friendly cartoon of that same board (any angle or rotation that shows the food best) with ${p.ingredient} on it, freshly prepared and ready to cook, and a chef's knife beside it.`
      : `A friendly cartoon illustration, from above at a slight angle, of a wooden chopping board with ${p.ingredient} on it, freshly prepared and ready to cook, and a chef's knife beside it.`,
    `Show only the ${p.ingredient}, cut exactly like this: ${p.cut}. Show enough pieces that the size and shape of the cut are clear.`,
    'Bright flat colours with soft shading and clean outlines, like an illustrated picture-vocabulary card, on a plain white background.',
    extra ? `Also: ${extra.slice(0, 200)}.` : '',
    'No hands, no text, no labels, no packaging, no other ingredients.',
  ].filter(Boolean).join(' ');
}

/** Chopping pictures drawn in the cartoon style (and your own photos) are kept; older realistic ones are redrawn. */
export const isCartoonPrep = (path: string) => /\/prep\/(cartoon|own)-/.test(path);

/** The "get it out" picture for an ingredient: one per ingredient, however it's cut. Kept with the chopping photos
 *  (prep_photos) under an `icon:` key. */
export function iconKey(name: string): { key: string; ingredient: string; label: string } {
  const ingredient = ingredientOf(name);
  return { key: `icon:${ingredient}`, ingredient, label: ingredient };
}

/** A small cartoon of the ingredient as it comes out of the fridge or cupboard, like a picture-vocabulary card. */
export function iconPrompt(ingredient: string, hint?: string | null): string {
  const extra = hint?.trim().replace(/[.\s]+$/, '');
  return [
    `A simple, friendly cartoon illustration of ${ingredient}, the way it looks when you take it out of the fridge, freezer or cupboard to cook`,
    '(whole, or in its usual bottle, jar, tin, tub or pack if that is how it is kept).',
    'Centred on a plain white background, bright flat colours with soft shading and clean outlines, like an illustrated picture-vocabulary card.',
    extra ? `Also: ${extra.slice(0, 200)}.` : '',
    'No text, no labels, no letters, no brand names, no people, nothing else in the picture.',
  ].filter(Boolean).join(' ');
}

/** What to do with one thing to chop, in plain words: "Cut the new potatoes in half", "Dice the potatoes into 2cm
 *  cubes". Read from the recipe's note with the same cuts as the chopping pictures. */
export function chopInstruction(name: string, note: string | null | undefined): string {
  const n = (note ?? '').trim().toLowerCase().replace(/[.;]+$/, '');
  const what = name.trim().toLowerCase();
  const size = n.match(/(\d+(?:\.\d+)?)\s*(mm|cm)\b/);
  const sz = size ? `${size[1]}${size[2]}` : '';
  const cut = CUTS.find(([re]) => re.test(n))?.[1] ?? (n ? null : 'chopped');
  const peel = /peel/.test(n);
  const verb = (v: string) => (peel ? `Peel and ${v.charAt(0).toLowerCase()}${v.slice(1)}` : v);
  switch (cut) {
    case 'halved': return verb(`Cut the ${what} in half`);
    case 'quartered': return verb(`Cut the ${what} into quarters`);
    case 'diced': return verb(`Dice the ${what}${sz ? ` into ${sz} cubes` : ''}`);
    case 'finely diced': return verb(`Finely dice the ${what}`);
    case 'chunks': return verb(`Cut the ${what} into ${sz ? `${sz} ` : ''}chunks`);
    case 'thinly sliced': return verb(`Thinly slice the ${what}`);
    case 'sliced': return verb(`Slice the ${what}${sz ? ` ${sz} thick` : ''}`);
    case 'strips': return verb(`Cut the ${what} into ${sz ? `${sz} ` : ''}strips`);
    case 'matchsticks': return verb(`Cut the ${what} into matchsticks`);
    case 'rings': return verb(`Slice the ${what} into rings`);
    case 'half-moons': return verb(`Slice the ${what} into half-moons`);
    case 'wedges': return verb(`Cut the ${what} into wedges`);
    case 'florets': return verb(`Cut the ${what} into florets`);
    case 'crushed': return verb(`Crush the ${what}`);
    case 'grated': return verb(`Grate the ${what}`);
    case 'chopped': return verb(`Chop the ${what}`);
    default:
      if (/shred/.test(n)) return verb(`Shred the ${what}`);
      if (/trim/.test(n)) return verb(`Trim the ${what}`);
      return `${what.charAt(0).toUpperCase()}${what.slice(1)}: ${n}`;
  }
}
