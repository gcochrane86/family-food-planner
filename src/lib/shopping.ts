import { isBatchIngredient, parseBatch } from './batch';
import { leftoverLunchPortions } from './weekSummary';
import { pantryLabel, words } from './recipes';
import type { MealSlot, PlanWeek, RecipeDetail, Staple, WeeklyBasic } from './types';

export interface ShopItem {
  key: string;
  name: string;
  qty: number | null;
  unit: string;
  approx: boolean;
  forMeals: string[];
  neededBy: string;
}

/** A tick belongs to an item at a quantity: if the amount changes (guests, swaps), the line needs buying again.
 *  Used by the Shop tab and the basket tool, so they always agree on what's already bought. */
export const tickKey = (item: Pick<ShopItem, 'key' | 'qty'>) =>
  (item.qty === null ? item.key : `${item.key}@${Math.round(item.qty * 100) / 100}`);

type WeekData = { week: PlanWeek | null; slots: MealSlot[] };
/** Which week the shopping list is for: next week once approved, otherwise this week if approved. */
export function pickShoppingWeek(next: WeekData, current: WeekData): WeekData | null {
  if (next.week?.status === 'approved') return next;
  if (current.week?.status === 'approved') return current;
  return null;
}

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * The week's shopping, worked out from the planned dinners (scaled to their portions, guests included)
 * minus cupboard staples you have, plus staples that are low or out. With two shops a week, anything
 * first needed Monday to Wednesday comes in Sunday's delivery and the rest in Tuesday's.
 */
export function buildShoppingList(
  slots: MealSlot[], recipes: Map<string, RecipeDetail>, staples: Staple[], shopsPerWeek: 1 | 2, basics: WeeklyBasic[] = [],
): { sun: ShopItem[]; tue: ShopItem[] } {
  // A staple that's also a weekly basic (e.g. eggs) is bought every week anyway, so recipes still add theirs.
  const basicNames = new Set(basics.map((b) => words(b.name).join(' ')));
  const have = staples.filter((s) => s.status === 'have' && !basicNames.has(words(s.name).join(' ')));
  const items = new Map<string, ShopItem>();

  for (const slot of [...slots].sort((a, b) => a.date.localeCompare(b.date))) {
    if (slot.slot !== 'dinner' || slot.mode !== 'cook' || !slot.recipe_id) continue;
    const recipe = recipes.get(slot.recipe_id);
    if (!recipe) continue;
    // A dinner that reheats well is cooked bigger when the next day's lunch is its leftovers.
    const factor = ((slot.portions ?? recipe.base_portions) + leftoverLunchPortions(slot, slots, recipes)) / recipe.base_portions;
    const meal = `${SHORT[weekdayIndex(slot.date)]} ${recipe.title}`;
    const batch = parseBatch(recipe.batch);
    for (const ing of recipe.ingredients) {
      if (pantryLabel(ing.name, have) === 'In pantry') continue;
      // The batch part comes from the freezer, or is made several times over to freeze the rest.
      const inBatch = !!batch && isBatchIngredient(recipe, ing);
      if (inBatch && (slot.batch === 'frozen' || slot.batch === 'frozen_ok')) continue;
      const times = inBatch && slot.batch === 'make' ? batch!.makes : 1;
      const key = `${words(ing.name).join(' ')}|${ing.unit}`;
      const qty = ing.qty === null ? null : ing.qty * factor * times;
      const existing = items.get(key);
      if (!existing) {
        items.set(key, { key, name: ing.name, qty, unit: ing.unit, approx: ing.qty_approx, forMeals: [meal], neededBy: slot.date });
        continue;
      }
      existing.qty = existing.qty === null || qty === null ? existing.qty ?? qty : existing.qty + qty;
      existing.approx ||= ing.qty_approx;
      if (!existing.forMeals.includes(meal)) existing.forMeals.push(meal);
    }
  }

  const sun: ShopItem[] = [];
  const tue: ShopItem[] = [];
  for (const item of items.values()) {
    if (item.qty !== null) item.qty = Math.round(item.qty * 1000) / 1000;
    (shopsPerWeek === 2 && weekdayIndex(item.neededBy) >= 3 ? tue : sun).push(item);
  }
  // Breakfast and lunch basics: merged into a matching line in the same delivery, otherwise added.
  const counts = (unit: string) => unit !== 'g' && unit !== 'ml';
  for (const b of [...basics].sort((x, y) => x.position - y.position)) {
    const parts: [ShopItem[], number | null][] = [];
    if (shopsPerWeek === 1 || b.delivery === 'sun') parts.push([sun, b.qty]);
    else if (b.delivery === 'tue') parts.push([tue, b.qty]);
    else if (b.qty === null) parts.push([sun, null]);
    else if (counts(b.unit)) parts.push([sun, Math.ceil(b.qty / 2)], [tue, Math.floor(b.qty / 2)]);
    else parts.push([sun, b.qty / 2], [tue, b.qty / 2]);
    const key = `${words(b.name).join(' ')}|${b.unit}`;
    for (const [list, qty] of parts) {
      if (qty === 0) continue;
      const existing = list.find((i) => i.key === key);
      if (existing) {
        existing.qty = existing.qty === null || qty === null ? existing.qty ?? qty : existing.qty + qty;
        existing.approx ||= b.approx;
        existing.forMeals.push('Breakfasts & lunches');
      } else {
        list.push({ key, name: b.name, qty, unit: b.unit, approx: b.approx, forMeals: ['Breakfasts & lunches'], neededBy: '' });
      }
    }
  }

  for (const s of staples.filter((x) => x.status !== 'have')) {
    const note = s.status === 'low' ? 'Cupboard: running low' : 'Cupboard: run out';
    // Already on the list (from a recipe or a basic)? Note it there rather than adding a second line.
    const covered = [...sun, ...tue].find((i) => pantryLabel(i.name, [{ ...s, status: 'have' }]) === 'In pantry');
    if (covered) {
      covered.forMeals.push(note);
      continue;
    }
    sun.push({
      key: `staple|${s.id}`, name: s.name, qty: null, unit: '', approx: false,
      forMeals: [note], neededBy: '',
    });
  }
  return { sun, tue };
}
