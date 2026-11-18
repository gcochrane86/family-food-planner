// Easy tonight: dinners made from the cupboard plus a five-minute walk to the Spar. Spar shops each stock their own
// range, so this keeps to everyday things any Spar always has. And the cupboard keeps one of each long-life tin in:
// a dinner that uses one up puts it on the next shop.
import { coveringStaple, words } from './recipes';
import type { Staple } from './types';

/** Everyday things any Spar has, as the last words of an ingredient's name ("Greek yoghurt" is yoghurt). */
const SPAR_BASICS = [
  'chicken', 'chicken breast', 'chicken thigh', 'mince', 'bacon', 'ham', 'sausage', 'tuna', 'cheese', 'parmesan',
  'egg', 'milk', 'butter', 'cheddar', 'mozzarella', 'yoghurt', 'crème fraîche', 'cream',
  'onion', 'garlic', 'potato', 'carrot', 'pepper', 'tomato', 'cucumber', 'lettuce', 'lemon', 'lime', 'spinach',
  'broccoli', 'mushroom', 'courgette', 'apple', 'banana', 'ginger', 'pea', 'sweetcorn',
  'bread', 'sourdough', 'wrap', 'flour', 'cornflour', 'sugar', 'pasta', 'penne', 'spaghetti', 'rice',
  'bean', 'chickpea', 'lentil', 'tomato purée', 'passata', 'coconut milk', 'stock', 'honey', 'oil', 'vinegar',
].map(words);

/** Fresh herbs and chilli: a garnish, or swapped for dried from the cupboard, so a Spar without them doesn't stop dinner. */
const SKIPPABLE = new Set(['parsley', 'coriander', 'mint', 'basil', 'chive', 'tarragon', 'dill', 'cress', 'herb', 'thyme', 'rosemary', 'sage', 'oregano', 'chilli']);
const NOT_FRESH = new Set(['dried', 'ground']);
/** What there's always plenty of. */
const FREE = new Set(['water', 'ice']);
/** "Chicken thigh fillets" are chicken thighs; lemon juice and zest come from lemons. */
const FORMS = new Set(['fillet', 'juice', 'zest']);

const endsWith = (whole: string[], tail: string[]) =>
  tail.length > 0 && tail.length <= whole.length && tail.every((w, i) => whole[whole.length - tail.length + i] === w);

/** The choices in a name ("chicken breast or thigh"), each as words, without any note in brackets. */
function choices(name: string): string[][] {
  const plain = name.replace(/\([^)]*\)/g, ' ');
  const parts = plain.split(/\s+or\s+/i).map(words).filter((w) => w.length > 0);
  return parts.map((w) => (w.length > 1 && FORMS.has(w[w.length - 1]) ? w.slice(0, -1) : w));
}

const isFree = (name: string) => choices(name).some((w) => w.length === 1 ? FREE.has(w[0]) : FREE.has(w[w.length - 1]) && ['boiling', 'hot', 'cold'].includes(w[0]));
const atSpar = (name: string) => choices(name).some((w) => SPAR_BASICS.some((b) => endsWith(w, b)));
const skippable = (name: string) => choices(name).some((w) => !NOT_FRESH.has(w[0]) && SKIPPABLE.has(w[w.length - 1]));

export interface EasyTonight {
  /** Not in the cupboard, and any Spar has it. */
  spar: string[];
  /** Fresh herbs and chilli: get them if the Spar has them, otherwise leave them out. */
  skip: string[];
  /** Not in the cupboard, and not something a Spar can be counted on for. */
  bigShop: string[];
}

/** Where each of a dinner's ingredients would come from tonight. Each name is listed once. */
export function easyTonight(ingredients: { name: string }[], staples: Staple[]): EasyTonight {
  const out: EasyTonight = { spar: [], skip: [], bigShop: [] };
  const seen = new Set<string>();
  for (const { name } of ingredients) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (isFree(name) || coveringStaple(name, staples)) continue;
    if (skippable(name)) out.skip.push(name);
    else if (atSpar(name)) out.spar.push(name);
    else out.bigShop.push(name);
  }
  return out;
}

/** Long-life tins and cartons a dinner uses whole, so the cupboard keeps one in. */
const KEEP_ONE_IN = [['chickpea'], ['bean'], ['lentil'], ['coconut', 'milk'], ['passata'], ['tinned', 'tomato'], ['chopped', 'tomato']];

export function isKeepOneIn(stapleName: string): boolean {
  const w = words(stapleName);
  return KEEP_ONE_IN.some((k) => endsWith(w, k));
}

/** The kept-one-in staples a dinner uses up, once each. */
export function usedUp(ingredients: { name: string }[], staples: Staple[]): Staple[] {
  const out: Staple[] = [];
  for (const { name } of ingredients) {
    const s = coveringStaple(name, staples);
    if (s && isKeepOneIn(s.name) && !out.includes(s)) out.push(s);
  }
  return out;
}
