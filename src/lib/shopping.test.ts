import { buildShoppingList } from './shopping';
import type { MealSlot, RecipeDetail, Staple } from './types';

const recipe = (id: string, base: number, ingredients: [string, number | null, string][]): RecipeDetail => ({
  id, household_id: 'h1', slug: id, title: id, subtitle: null, kind: 'meal', component_role: null, source: 'claude', protein: 'chicken',
  base_portions: base, reheats_well: false, freezes_well: false, toddler_ok: true, toddler_note: null, salt_per_portion_g: null,
  prep_minutes: 0, finish_minutes: 20, hands_off_minutes: 0, tags: [], equipment: [], reheat: null, hero_image_path: null,
  hero_image_source: null, status: 'active', steps: [],
  ingredients: ingredients.map(([name, qty, unit], i) => ({ position: i + 1, group_name: null, name, qty, unit, note: null, qty_approx: false })),
});
const dinner = (date: string, recipeId: string | null, portions: number | null, mode: MealSlot['mode'] = 'cook', guests = 0): MealSlot => ({
  date, slot: 'dinner', recipe_id: recipeId, mode, portions, guests, locked: false, reason: null, source_date: null,
  routine_choice: null, cooked_at: null, portions_verdict: null,
});

const curry = recipe('curry', 6, [['onions', 2, ''], ['tinned tomatoes', 400, 'g'], ['baby spinach', 200, 'g']]);
const stew = recipe('stew', 4, [['onion', 1, ''], ['beef', 600, 'g'], ['sea salt', null, '']]);
const staples: Staple[] = [
  { id: 's1', ingredient_id: 'i1', name: 'Tinned tomatoes', status: 'have' },
  { id: 's2', ingredient_id: 'i2', name: 'Sea salt', status: 'have' },
  { id: 's3', ingredient_id: 'i3', name: 'Paprika', status: 'low' },
];
const recipes = new Map([['curry', curry], ['stew', stew]]);

test('the same ingredient from two dinners adds up, scaled to the portions planned', () => {
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 3), dinner('2026-10-20', 'stew', 4)], recipes, staples, 2);
  const onion = list.sun.find((i) => i.name === 'onions')!;
  expect(onion.qty).toBe(2); // 2 × 3/6 + 1 × 4/4
  expect(onion.forMeals).toEqual(['Mon curry', 'Tue stew']);
});

test('staples you have are left off; low ones are added', () => {
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 6)], recipes, staples, 2);
  const names = list.sun.map((i) => i.name);
  expect(names).not.toContain('tinned tomatoes');
  expect(names).toContain('Paprika');
  expect(list.sun.find((i) => i.name === 'Paprika')!.forMeals).toEqual(['Cupboard: running low']);
});

test('with two shops, things needed Thursday onwards come on Tuesday', () => {
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 6), dinner('2026-10-22', 'stew', 4)], recipes, staples, 2);
  expect(list.tue.map((i) => i.name)).toContain('beef');
  expect(list.sun.map((i) => i.name)).not.toContain('beef');
  // onions are needed Monday, so the whole amount comes on Sunday
  expect(list.sun.find((i) => i.name === 'onions')!.qty).toBe(3);
  expect(list.tue.find((i) => i.name === 'onion')).toBeUndefined();
});

test('with one shop, everything comes on Sunday', () => {
  const list = buildShoppingList([dinner('2026-10-22', 'stew', 4)], recipes, staples, 1);
  expect(list.tue).toEqual([]);
  expect(list.sun.map((i) => i.name)).toContain('beef');
});

test('guests increase the quantities', () => {
  const list = buildShoppingList([dinner('2026-10-20', 'stew', 6.5, 'cook', 2)], recipes, staples, 2);
  expect(list.sun.find((i) => i.name === 'beef')!.qty).toBeCloseTo(975);
});

test('out and leftovers nights add nothing', () => {
  const list = buildShoppingList([dinner('2026-10-19', null, null, 'out'), dinner('2026-10-20', null, null, 'leftovers')], recipes, staples, 2);
  expect(list.sun.filter((i) => !i.forMeals[0].startsWith('Cupboard'))).toEqual([]);
});

test('ingredients with no quantity still appear once', () => {
  const list = buildShoppingList([dinner('2026-10-20', 'stew', 4)], recipes, [], 2);
  expect(list.sun.find((i) => i.name === 'sea salt')).toMatchObject({ qty: null });
});
