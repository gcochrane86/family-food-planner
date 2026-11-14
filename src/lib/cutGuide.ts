import { chopInstruction, prepKey } from '../../supabase/functions/_shared/prepCut';

// The cut guide: tap an ingredient to see how it's cut, in plain words, with a true-size ruler. A web page can't know
// the screen's physical size, so the ruler is set once per device against a bank card and kept in browser storage.

export interface CutSize { mm: number; label: string }
export interface CutGuide { instruction: string; meaning: string | null; sizes: CutSize[]; square: number | null; prep: { key: string; label: string } }

const MEANINGS: [RegExp, string, string][] = [
  [/finely (chopped|diced)|fine dice|\bfinely\b/, 'finely diced', 'Very small pieces, a few millimetres across, so they melt into the dish.'],
  [/dice|cube/, 'diced', 'Even cubes, all the same size so they cook at the same rate.'],
  [/chunk|piece|roughly chopped|rough chop/, 'chunks', "Rough cubes, all about the same size so they cook evenly; they needn't be neat."],
  [/julienne|matchstick/, 'matchsticks', 'Thin sticks, like matchsticks: slice thinly, then cut the slices into strips.'],
  [/baton|strip/, 'strips', 'Long pieces about as wide as the size given: cut slices, then cut them lengthways.'],
  [/\bdiscs?\b|\brounds?\b/, 'discs', 'Thin rounds cut straight across, all the same thickness.'],
  [/\brings?\b/, 'rings', 'Thin rounds cut straight across, so each slice is a ring.'],
  [/half[- ]moon/, 'half-moons', 'Cut in half lengthways, lay flat side down, then slice across into half-rounds.'],
  [/wedge/, 'wedges', 'Cut from the middle outwards, like slices of a cake.'],
  [/floret/, 'florets', 'The small tree-shaped heads, cut off the thick stalk, all about bite size.'],
  [/quarter/, 'quartered', 'Cut in half, then each half in half again: four pieces.'],
  [/halve|in half|\bhalves\b/, 'halved', 'Cut once through the middle into two halves.'],
  [/thin(ly)? slic|thin slices/, 'thinly sliced', 'Slices as thin as you can cut them evenly.'],
  [/slic/, 'sliced', 'Even slices cut straight across, all the same thickness.'],
  [/crush|minced?\b/, 'crushed', 'Pressed or chopped to a paste, with no whole pieces left.'],
  [/grat/, 'grated', 'Rubbed on the grater into fine shreds.'],
];

const SQUARE = new Set(['chunks', 'diced']);
const toMm = (n: string, unit: string) => Number(n) * (unit === 'cm' ? 10 : 1);
const fmt = (n: string, unit: string) => `${Number(n)}${unit}`;

/** What to show for one ingredient, or null when the card says nothing about cutting. */
export function cutGuide(name: string, qty: string, note: string | null): CutGuide | null {
  const n = (note ?? '').trim().toLowerCase();
  const sizes: CutSize[] = [];
  const length = qty.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(mm|cm)$/);
  if (length) sizes.push({ mm: toMm(length[1], length[2]), label: `${fmt(length[1], length[2])} piece` });
  for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm)\b(?:\s+([a-z-]+))?/g)) {
    sizes.push({ mm: toMm(m[1], m[2]), label: [fmt(m[1], m[2]), m[3]].filter(Boolean).join(' ') });
  }
  if (!n && !sizes.length) return null;
  const found = MEANINGS.find(([re]) => re.test(n));
  const noteSize = sizes.find((s) => !s.label.endsWith(' piece'));
  const prep = prepKey(name, note);
  return {
    instruction: chopInstruction(name, note),
    meaning: found?.[2] ?? null,
    sizes,
    square: found && SQUARE.has(found[1]) && noteSize ? noteSize.mm : null,
    prep: { key: prep.key, label: prep.label },
  };
}

/** A bank card is 85.6mm by 53.98mm (ISO/IEC 7810 ID-1). */
export const CARD_MM = 85.6;
export const CARD_SHORT_MM = 53.98;
const KEY = 'cut-ruler:px-per-mm';

/** Screen pixels per millimetre on this device, once the ruler has been set; null until then. */
export function readPxPerMm(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 1 ? v : null;
  } catch { return null; }
}
export function savePxPerMm(v: number): void {
  try { localStorage.setItem(KEY, String(v)); } catch { /* the ruler is asked for again next time */ }
}
