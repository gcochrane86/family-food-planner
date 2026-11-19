import { buildAdhocList } from './adhoc';
import type { AdhocItem, AdhocMeal, RecipeDetail, Staple } from './types';

const recipe = (id: string, title: string, base: number, ingredients: [string, number | null, string][]): RecipeDetail => ({
  id, household_id: 'h1', slug: id, title, subtitle: null, kind: 'meal', component_role: null, source: 'claude', protein: 'chicken',
  base_portions: base, reheats_well: false, freezes_well: false, toddler_ok: true, toddler_note: null, salt_per_portion_g: null,
  prep_minutes: 0, finish_minutes: 20, hands_off_minutes: 0, tags: [], equipment: [], reheat: null, hero_image_path: null,
  hero_image_source: null, status: 'active', rating: null, steps: [],
  ingredients: ingredients.map(([name, qty, unit], i) => ({ position: i + 1, group_name: null, name, qty, unit, note: null, qty_approx: false })),
});
const meal = (id: string, recipe_id: string, m: 'lunch' | 'dinner', portions: number): AdhocMeal =>
  ({ id, household_id: 'h1', recipe_id, meal: m, portions, created_at: '2026-11-19T08:00:00Z' });
const item = (name: string): AdhocItem => ({ id: `i-${name}`, household_id: 'h1', name, created_at: '2026-11-19T08:00:00Z' });

const wraps = recipe('wraps', 'Chicken wraps', 4, [['chicken breast', 400, 'g'], ['tortilla wraps', 4, ''], ['olive oil', 1, 'tbsp'], ['frozen peas', 100, 'g']]);
const curry = recipe('curry', 'Chickpea curry', 4, [['onion', 1, ''], ['canned chickpeas', 400, 'g'], ['coconut milk', 400, 'ml']]);
const recipes = new Map([['wraps', wraps], ['curry', curry]]);
const staples: Staple[] = [
  { id: 'oil', ingredient_id: 'i1', name: 'Olive oil', status: 'have' },
  { id: 'cp', ingredient_id: 'i2', name: 'Canned chickpeas', status: 'out' },
  { id: 'pap', ingredient_id: 'i3', name: 'Paprika', status: 'low' },
];

test('the same recipe as lunch and dinner adds up on one line, for both meals', () => {
  const { list } = buildAdhocList([meal('a', 'wraps', 'lunch', 2), meal('b', 'wraps', 'dinner', 4)], recipes, [], []);
  const chicken = list.find((i) => i.name === 'chicken breast')!;
  expect(chicken.qty).toBe(600);
  expect(chicken.forMeals).toEqual(['Lunch: Chicken wraps', 'Dinner: Chicken wraps']);
});

test('portions scale what is bought', () => {
  expect(buildAdhocList([meal('a', 'curry', 'dinner', 8)], recipes, [], []).list.find((i) => i.name === 'onion')!.qty).toBe(2);
});

test("what the pantry has is checked, not bought; low staples the meals don't use stay off", () => {
  const { list, check } = buildAdhocList([meal('a', 'wraps', 'dinner', 4)], recipes, staples, []);
  expect(list.map((i) => i.name)).not.toContain('olive oil');
  expect(list.map((i) => i.name)).not.toContain('Paprika');
  expect(check.map((c) => [c.name, c.forMeals])).toEqual([['Olive oil', ['Dinner: Chicken wraps']]]);
});

test('a run-out staple a meal uses is bought, and ticking it can restock the pantry', () => {
  const { list } = buildAdhocList([meal('a', 'curry', 'dinner', 4)], recipes, staples, []);
  expect(list.find((i) => i.name === 'canned chickpeas')!.staples).toEqual([{ id: 'cp', status: 'out' }]);
});

test('items added by hand go in their aisle: toothpaste after the food, before the frozen peas', () => {
  const { list } = buildAdhocList([meal('a', 'wraps', 'dinner', 4)], recipes, [], [item('toothpaste')]);
  expect(list.map((i) => i.name)).toEqual(['chicken breast', 'olive oil', 'tortilla wraps', 'toothpaste', 'frozen peas']);
  expect(list.find((i) => i.name === 'toothpaste')).toMatchObject({ key: 'extra|i-toothpaste', qty: null, forMeals: [] });
});

test('nothing planned and nothing added is an empty list', () => {
  expect(buildAdhocList([], recipes, staples, [])).toEqual({ list: [], check: [] });
});
