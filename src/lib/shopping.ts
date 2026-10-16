import { pantryLabel, words } from './recipes';
import type { MealSlot, RecipeDetail, Staple } from './types';

export interface ShopItem {
  key: string;
  name: string;
  qty: number | null;
  unit: string;
  approx: boolean;
  forMeals: string[];
  neededBy: string;
}

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * The week's shopping, worked out from the planned dinners (scaled to their portions, guests included)
 * minus cupboard staples you have, plus staples that are low or out. With two shops a week, anything
 * first needed Monday to Wednesday comes in Sunday's delivery and the rest in Tuesday's.
 */
export function buildShoppingList(
  slots: MealSlot[], recipes: Map<string, RecipeDetail>, staples: Staple[], shopsPerWeek: 1 | 2,
): { sun: ShopItem[]; tue: ShopItem[] } {
  const have = staples.filter((s) => s.status === 'have');
  const items = new Map<string, ShopItem>();

  for (const slot of [...slots].sort((a, b) => a.date.localeCompare(b.date))) {
    if (slot.slot !== 'dinner' || slot.mode !== 'cook' || !slot.recipe_id) continue;
    const recipe = recipes.get(slot.recipe_id);
    if (!recipe) continue;
    const factor = (slot.portions ?? recipe.base_portions) / recipe.base_portions;
    const meal = `${SHORT[weekdayIndex(slot.date)]} ${recipe.title}`;
    for (const ing of recipe.ingredients) {
      if (pantryLabel(ing.name, have) === 'In pantry') continue;
      const key = `${words(ing.name).join(' ')}|${ing.unit}`;
      const qty = ing.qty === null ? null : ing.qty * factor;
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
  for (const s of staples.filter((x) => x.status !== 'have')) {
    sun.push({
      key: `staple|${s.id}`, name: s.name, qty: null, unit: '', approx: false,
      forMeals: [s.status === 'low' ? 'Cupboard: running low' : 'Cupboard: run out'], neededBy: '',
    });
  }
  return { sun, tue };
}
