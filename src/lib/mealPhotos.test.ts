import { CURRY, HONEY } from '../test/fixtures';
import { HOME_LUNCHES, ROUTINE_SLUGS, routineRecipe, slugify } from './mealPhotos';

const recipes = new Map([
  ['b1', { ...HONEY, id: 'b1', slug: 'baked-oats', title: 'Baked Oats' }],
  ['s1', { ...HONEY, id: 's1', slug: 'chicken-sandwich', title: 'Chicken Sandwich' }],
  ['p1', { ...HONEY, id: 'p1', slug: 'burrito-bowl', title: 'Burrito Bowl' }],
  [CURRY.id, CURRY],
]);

test('breakfast and lunch names map to their recipes', () => {
  expect(routineRecipe('Baked oats', recipes)?.id).toBe('b1');
  expect(routineRecipe('Chicken sandwich', recipes)?.id).toBe('s1');
  expect(routineRecipe('Packed lunch', recipes)?.id).toBe('p1');
});

test('an unknown name, or a routine without its recipe yet, gives nothing', () => {
  expect(routineRecipe('Pancakes', recipes)).toBeUndefined();
  expect(routineRecipe('Overnight oats', recipes)).toBeUndefined();
  expect(Object.keys(ROUTINE_SLUGS)).toEqual(['Overnight oats', 'Baked oats', 'Eggs & porridge', 'Packed lunch', ...HOME_LUNCHES]);
});

test('home lunches each have a recipe slug, chicken sandwich first', () => {
  expect(HOME_LUNCHES).toEqual(['Chicken sandwich', 'Roast beef sandwich', 'Egg sandwich', 'Tuna & sweetcorn sandwich', 'Mexican beef poke bowl']);
  expect(HOME_LUNCHES.map((n) => ROUTINE_SLUGS[n])).toEqual(['chicken-sandwich', 'roast-beef-sandwich', 'egg-sandwich', 'tuna-sweetcorn-sandwich', 'mexican-beef-poke-bowl']);
});

test('a breakfast or lunch you added finds its recipe by its name', () => {
  expect(slugify('Banana & Blueberry Pancakes!')).toBe('banana-blueberry-pancakes');
  const map = new Map([['n1', { ...HONEY, id: 'n1', slug: 'banana-pancakes', title: 'Banana pancakes' }]]);
  expect(routineRecipe('Banana pancakes', map)?.id).toBe('n1');
});
