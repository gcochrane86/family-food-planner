import { CURRY, HONEY } from '../test/fixtures';
import { ROUTINE_SLUGS, routineRecipe } from './mealPhotos';

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
  expect(Object.keys(ROUTINE_SLUGS)).toEqual(['Overnight oats', 'Baked oats', 'Eggs & porridge', 'Chicken sandwich', 'Packed lunch']);
});
