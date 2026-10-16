/** Converts an amount to grams, millilitres or a count, or null for units that can't be bought by size (tsp, bunch…). */
export function toBase(qty: number, unit: string): { amount: number; base: 'g' | 'ml' | 'each' } | null {
  const u = unit.trim().toLowerCase();
  if (u === 'g' || u === 'grams' || u === 'gram') return { amount: qty, base: 'g' };
  if (u === 'kg') return { amount: qty * 1000, base: 'g' };
  if (u === 'ml') return { amount: qty, base: 'ml' };
  if (u === 'l' || u === 'litre' || u === 'litres' || u === 'liter' || u === 'liters') return { amount: qty * 1000, base: 'ml' };
  if (u === '' || u === 'each' || u === 'pack' || u === 'packs' || u === 'x') return { amount: qty, base: 'each' };
  return null;
}

/**
 * How many packs to add to the basket to cover what the list needs, e.g. 1.2kg with 500g packs → 3.
 * Null when the units can't be compared (then the person or Claude decides).
 */
export function packsNeeded(needQty: number | null, needUnit: string, packSize: number, packUnit: string): number | null {
  if (needQty === null || needQty <= 0) return 1;
  const need = toBase(needQty, needUnit);
  const pack = toBase(packSize, packUnit);
  if (!need || !pack || need.base !== pack.base || pack.amount <= 0) return null;
  return Math.max(1, Math.ceil(need.amount / pack.amount - 1e-9));
}
