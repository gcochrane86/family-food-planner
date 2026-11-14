import { chopInstruction, prepKey } from '../../supabase/functions/_shared/prepCut';

// The cut guide: tap an ingredient to see how it's cut, in plain words, with a true-size ruler. A web page can't know
// the screen's physical size, so the ruler is set once per device against a bank card and kept in browser storage.

export interface CutSize { mm: number; label: string }
export interface CutGuide { instruction: string; meaning: string | null; sizes: CutSize[]; square: number | null; prep: { key: string; label: string } }

// What each cut means, keyed by the same cut names as the chopping pictures and the instruction (prepKey), so the
// three always agree. Discs are a kind of slice with their own words.
const MEANINGS: Record<string, string> = {
  'finely diced': 'Very small pieces, a few millimetres across, so they melt into the dish.',
  diced: 'Even cubes, all the same size so they cook at the same rate.',
  chunks: "Rough cubes, all about the same size so they cook evenly; they needn't be neat.",
  matchsticks: 'Thin sticks, like matchsticks: slice thinly, then cut the slices into strips.',
  strips: 'Long pieces about as wide as the size given: cut slices, then cut them lengthways.',
  rings: 'Thin rounds cut straight across, so each slice is a ring.',
  'half-moons': 'Cut in half lengthways, lay flat side down, then slice across into half-rounds.',
  wedges: 'Cut from the middle outwards, like slices of a cake.',
  florets: 'The small tree-shaped heads, cut off the thick stalk, all about bite size.',
  quartered: 'Cut in half, then each half in half again: four pieces.',
  halved: 'Cut once through the middle into two halves.',
  'thinly sliced': 'Slices as thin as you can cut them evenly.',
  sliced: 'Even slices cut straight across, all the same thickness.',
  crushed: 'Pressed or chopped to a paste, with no whole pieces left.',
  grated: 'Rubbed on the grater into fine shreds.',
  chopped: 'Cut into small, roughly even pieces.',
};
const DISCS = 'Thin rounds cut straight across, all the same thickness.';
const SQUARE = new Set(['chunks', 'diced']);
const FRACTION: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
const unitOf = (u: string) => (u.startsWith('cm') ? 'cm' : 'mm');

/** What to show for one ingredient, or null when the card says nothing about cutting or size. */
export function cutGuide(name: string, qty: string, note: string | null): CutGuide | null {
  const n = (note ?? '').trim().toLowerCase();
  const sizes: CutSize[] = [];
  // The amount as the cards show it: "3 cm", "2½ cm", "about 3 cm".
  const length = qty.trim().toLowerCase().match(/^(?:about\s+)?(\d+)?\s*([½¼¾])?\s*(mm|cms?)$/);
  if (length && (length[1] || length[2])) {
    const value = Number(length[1] ?? 0) + (length[2] ? FRACTION[length[2]] : 0);
    const unit = unitOf(length[3]);
    sizes.push({ mm: value * (unit === 'cm' ? 10 : 1), label: `${length[1] ?? ''}${length[2] ?? ''}${unit} piece` });
  }
  for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cms?)(?![a-z])(?:\s+([a-z-]+))?/g)) {
    const unit = unitOf(m[2]);
    sizes.push({ mm: Number(m[1]) * (unit === 'cm' ? 10 : 1), label: [`${Number(m[1])}${unit}`, m[3]].filter(Boolean).join(' ') });
  }
  const prep = prepKey(name, note);
  const cut = prep.cut.replace(/ \(.*\)$/, '');
  const meaning = n && /\bdiscs?\b/.test(n) && /slic|disc/.test(cut + n) ? DISCS : n ? MEANINGS[cut] ?? null : null;
  if (!meaning && !sizes.length) return null;
  const noteSize = sizes.find((s) => !s.label.endsWith(' piece'));
  return {
    instruction: chopInstruction(name, note),
    meaning,
    sizes,
    square: SQUARE.has(cut) && noteSize ? noteSize.mm : null,
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
