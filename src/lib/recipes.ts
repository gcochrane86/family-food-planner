import type { Machine, RecipeIngredient, Staple } from './types';

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const SPOONS = new Set(['tsp', 'tbsp']);
const SINGULAR: Record<string, string> = { cloves: 'clove', slices: 'slice', sprigs: 'sprig', pinches: 'pinch' };

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function fraction(value: number, step: number): string {
  const r = Math.max(step, roundTo(value, step)); // never show 0 of something the recipe needs
  const whole = Math.floor(r + 1e-9);
  const part = Math.round((r - whole) * 100) / 100;
  return `${whole || ''}${FRACTIONS[part] ?? ''}` || '0';
}

function metric(value: number, unit: 'g' | 'ml'): string {
  const v = value >= 50 ? roundTo(value, 5) : Math.round(value * 10) / 10;
  if (v >= 1000) return `${Number((v / 1000).toFixed(2))}${unit === 'g' ? 'kg' : 'L'}`;
  return `${Number(v.toFixed(1))}${unit}`;
}

/** How a (scaled) quantity reads on a card: "600g", "1.25L", "¼ tsp", "1½", "about 100g". */
export function formatQty(qty: number | null, unit: string, approx = false): string {
  if (qty === null || qty === undefined) return '';
  let text: string;
  if (unit === 'g' || unit === 'ml') {
    text = metric(qty, unit);
  } else {
    const amount = fraction(qty, SPOONS.has(unit) ? 0.25 : 0.5);
    const u = amount === '1' || amount === '½' || amount === '¼' || amount === '¾' ? (SINGULAR[unit] ?? unit) : unit;
    text = u ? `${amount} ${u}` : amount;
  }
  return approx ? `about ${text}` : text;
}

export function scaleFactor(target: number, base: number): number {
  return target / base;
}

export function words(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => (w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** The part of an ingredient that comes from something else: "egg white" is egg, "lemon juice" is lemon. */
const PARTS = new Set(['white', 'yolk', 'juice', 'zest']);
/** Tins of these are what recipes mean when they just say "chickpeas"; tinned tomatoes are not fresh tomatoes. */
const PACKAGING = new Set(['canned', 'tinned']);
const SHELF_STABLE = new Set(['chickpea', 'bean', 'lentil']);

function covers(staple: string[], ingredient: string[]): boolean {
  const endsWith = (whole: string[], tail: string[]) =>
    tail.length > 0 && tail.length <= whole.length && tail.every((w, i) => whole[whole.length - tail.length + i] === w);
  const target = PARTS.has(ingredient[ingredient.length - 1]) ? ingredient.slice(0, -1) : ingredient;
  if (endsWith(target, staple)) return true;
  // "Canned black beans" also covers plain "black beans".
  if (PACKAGING.has(staple[0]) && SHELF_STABLE.has(staple[staple.length - 1])) return endsWith(target, staple.slice(1));
  return false;
}

/**
 * "In pantry" when a staple you have (or are low on) is this ingredient. The staple has to be the ingredient's
 * main noun, so "Eggs" covers "egg white" but not "dried egg noodles", and "Tinned tomatoes" doesn't cover fresh ones.
 */
export function pantryLabel(name: string, staples: Staple[]): 'In pantry' | 'To buy' {
  const ingredient = words(name);
  return staples.some((s) => s.status !== 'out' && covers(words(s.name), ingredient)) ? 'In pantry' : 'To buy';
}

/** Spec §3: aim for about 0.5g salt or less in the toddler's portion of a main meal. */
export function toddlerSaltNote(saltPerPortion: number | null, toddlerWeight: number): string | null {
  if (saltPerPortion === null || saltPerPortion === undefined) return null;
  const share = saltPerPortion * toddlerWeight;
  if (share <= 0.5) return null;
  return `About ${share.toFixed(1)}g salt in the toddler's portion (aim for 0.5g or less). Season the adult plates at the table instead.`;
}

const MACHINES: Record<Machine, string> = {
  tm7: 'TM7', apo: 'APO', hy24: 'HY 24L', meater: 'MEATER', hob: 'Hob', oven: 'Oven', kettle: 'Kettle',
};
export function machineLabel(m: Machine): string {
  return MACHINES[m];
}

export function groupIngredients(list: RecipeIngredient[]): { group: string; items: RecipeIngredient[] }[] {
  const groups: { group: string; items: RecipeIngredient[] }[] = [];
  for (const item of [...list].sort((a, b) => a.position - b.position)) {
    const group = item.group_name ?? 'Ingredients';
    let g = groups.find((x) => x.group === group);
    if (!g) groups.push((g = { group, items: [] }));
    g.items.push(item);
  }
  return groups;
}

const MADE = new Set(['sauce', 'glaze', 'dressing', 'marinade', 'paste', 'mixture', 'mix', 'batter', 'filling', 'topping', 'seasoning', 'salad']);

/**
 * The ingredients a step uses: each **bold** name in its method, matched to the recipe's ingredients, in the order
 * the step mentions them and once each. A name matches an ingredient whose words include all of its words ("salt"
 * is "fine sea salt"); when one ingredient has exactly those words, only it counts ("onion" isn't "spring onion").
 */
export function stepIngredients<T extends RecipeIngredient>(body: string, ingredients: T[]): T[] {
  const found: T[] = [];
  for (const m of body.matchAll(/\*\*([^*]+)\*\*/g)) {
    let term = words(m[1]);
    // "The sauce", "the glaze": something the recipe makes, not an ingredient to weigh out.
    if (!term.length || (term.length === 1 && MADE.has(term[0]))) continue;
    const match = (t: string[]) => ingredients.filter((i) => { const w = words(i.name); return t.every((x) => w.includes(x)); });
    let hits = match(term);
    // "Lemon zest" comes from the lemon.
    if (!hits.length && term.length > 1 && PARTS.has(term[term.length - 1])) { term = term.slice(0, -1); hits = match(term); }
    // "Rib-eye" is "ribeye" (only for hyphenated names, so "sauce" never finds "soy sauce").
    if (!hits.length && m[1].includes('-')) hits = ingredients.filter((i) => words(i.name).join('').includes(term.join('')));
    const exact = hits.filter((i) => { const w = words(i.name); return w.length === term.length; });
    for (const i of exact.length ? exact : hits) if (!found.includes(i)) found.push(i);
  }
  return found;
}
