// The ad-hoc plan (19 Nov 2026): for a quick trip to the shops when nothing's organised. A few meals with no days and
// anything added by hand make a list of their own, kept apart from the week's. Whether this phone shows it is a
// setting on the phone. See docs/superpowers/specs/2026-11-19-adhoc-plan-design.md.
import { useEffect, useState } from 'react';
import { aisle } from './aisles';
import { buildShoppingList, type CupboardCheck, type ShopItem } from './shopping';
import type { AdhocItem, AdhocMeal, MealSlot, RecipeDetail, Staple } from './types';

/** A Monday the ad-hoc meals stand on, so the week's list-maker can buy for them (its day labels are taken off). */
const ADHOC_DATE = '2000-01-03';
const MEAL_LABEL = { lunch: 'Lunch', dinner: 'Dinner' } as const;
/** "Mon Lunch: Chicken wraps" is "Lunch: Chicken wraps". */
const undated = (label: string) => label.replace(/^[A-Z][a-z]{2} /, '');

/** The ad-hoc shop: what the meals need that the pantry doesn't have, plus the items added by hand, in the order you
 *  walk the shop; and what the pantry says you have, to check. No weekly basics, and no low or run-out cupboard
 *  things the meals don't use: the weekly shop covers those. */
export function buildAdhocList(meals: AdhocMeal[], recipes: Map<string, RecipeDetail>, staples: Staple[], items: AdhocItem[],
  needed: Set<string> = new Set()): { list: ShopItem[]; check: CupboardCheck[] } {
  // Each meal goes in as its own dinner, its recipe titled with the meal, so the lines say what they're for.
  const asRecipes = new Map<string, RecipeDetail>();
  const slots: MealSlot[] = [];
  for (const m of meals) {
    const r = recipes.get(m.recipe_id);
    if (!r) continue;
    asRecipes.set(m.id, { ...r, id: m.id, title: `${MEAL_LABEL[m.meal]}: ${r.title}` });
    slots.push({
      date: ADHOC_DATE, slot: 'dinner', recipe_id: m.id, mode: 'cook', portions: m.portions, guests: 0, locked: false, reason: null,
      source_date: null, routine_choice: null, cooked_at: null, portions_verdict: null,
    });
  }
  // Only the run-out and low things a meal uses come along (merged into its line); the rest wait for the weekly shop.
  const built = buildShoppingList(slots, asRecipes, staples, 1, [], undefined, needed);
  const food = [...built.sun, ...built.tue].filter((i) => !i.key.startsWith('staple|'))
    .map((i) => ({ ...i, forMeals: i.forMeals.filter((f) => !f.startsWith('Cupboard:')).map(undated) }));
  const extras: ShopItem[] = items.map((x) => ({ key: `extra|${x.id}`, name: x.name, qty: null, unit: '', approx: false, forMeals: [], neededBy: '' }));
  return {
    list: [...food, ...extras].sort((a, b) => aisle(a.name) - aisle(b.name)),
    check: built.check.map((c) => ({ ...c, forMeals: c.forMeals.map(undated) })),
  };
}

const KEY = 'adhoc-mode';
const EVENT = 'adhoc-mode';

/** Whether this phone shows the ad-hoc plan (Settings → Plan or ad-hoc). Off if the phone can't say. */
export function isAdhoc(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setAdhoc(on: boolean): void {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* stays as it was */ }
  window.dispatchEvent(new Event(EVENT));
}

/** isAdhoc, kept up to date when it's switched. */
export function useAdhoc(): boolean {
  const [on, setOn] = useState(isAdhoc);
  useEffect(() => {
    const update = () => setOn(isAdhoc());
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return on;
}
