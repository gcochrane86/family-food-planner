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

const IGNORED_WORDS = /\b(canned|tinned|dried|fresh|ground|whole|low-sodium|reduced-salt|fine|large|small)\b/g;
function normalise(name: string): string {
  return name.toLowerCase()
    .replace(IGNORED_WORDS, ' ')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((w) => (w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/** "In pantry" when a staple you have (or are low on) is this ingredient, e.g. "Canned chickpeas" covers "chickpeas". */
export function pantryLabel(name: string, staples: Staple[]): 'In pantry' | 'To buy' {
  const ingredient = ` ${normalise(name)} `;
  const covered = staples.some((s) => s.status !== 'out' && ingredient.includes(` ${normalise(s.name)} `));
  return covered ? 'In pantry' : 'To buy';
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
