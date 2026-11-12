import { words } from './recipes';
import type { RecipeIngredient } from './types';

/**
 * How many days an ingredient keeps once it's cut, in a lidded box in the fridge (5°C or below). Raw meat and fish
 * never go more than a day; soft things are cut on the day.
 */
const FISH = ['fish', 'salmon', 'cod', 'haddock', 'hake', 'pollock', 'plaice', 'sea bass', 'seabass', 'bream', 'mackerel',
  'trout', 'tuna', 'sardine', 'prawn', 'shrimp', 'scallop', 'mussel', 'squid', 'crab', 'seafood'];
const MEAT = ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'mince', 'steak', 'bacon', 'gammon', 'duck', 'venison'];

const KEEPS: [number, string[]][] = [
  [4, ['carrot', 'celery', 'pepper', 'cabbage', 'red onion', 'squash', 'butternut squash', 'swede', 'broccoli',
    'cauliflower', 'green bean', 'salad leaves']],
  [2, ['onion', 'leek', 'spring onion', 'kale']],
  [1, ['garlic', 'ginger', ...MEAT]],
  [0, ['tomato', 'cucumber', 'courgette', 'mushroom', 'potato', 'apple', 'avocado', 'aubergine', 'coriander', 'basil',
    'parsley', 'dill', 'mint', ...FISH]],
];
const TABLE = KEEPS.flatMap(([days, names]) => names.map((n) => ({ days, w: words(n) })));

/** Where the words of `part` appear together, in order, inside `whole`. */
function contains(whole: string[], part: string[]): boolean {
  for (let i = 0; i + part.length <= whole.length; i++) if (part.every((p, j) => whole[i + j] === p)) return true;
  return false;
}

export function keepsDays(name: string): 0 | 1 | 2 | 4 {
  const w = words(name);
  let best: { days: number; len: number } | null = null;
  for (const e of TABLE) if (contains(w, e.w) && (!best || e.w.length > best.len)) best = { days: e.days, len: e.w.length };
  return (best?.days ?? 1) as 0 | 1 | 2 | 4;
}

const CUT = /chop|dice|slice|grate|mince|cube|baton|strip|wedge|julienne|crush|halve|quarter|trim|floret|shred/i;

export function needsChopping(ing: Pick<RecipeIngredient, 'name' | 'note'>): boolean {
  return CUT.test(ing.note ?? '');
}

/** Made from meat or fish but not raw: these don't go on the separate mat. */
const NOT_RAW = new Set(['stock', 'broth', 'gravy', 'sauce', 'paste', 'powder', 'tinned', 'canned', 'cube', 'smoked']);
const RAW = [...MEAT, ...FISH].map(words);

export function isRawProtein(name: string): boolean {
  const w = words(name);
  if (w.some((x) => NOT_RAW.has(x))) return false;
  return RAW.some((r) => contains(w, r));
}
