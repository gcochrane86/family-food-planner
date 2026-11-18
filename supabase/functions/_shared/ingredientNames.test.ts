import { checkNames, nameKey, standardNames } from './ingredientNames';

test('a name key ignores case, plurals and words that only say how it is sold', () => {
  expect(nameKey('Pitted Medjool Dates')).toBe(nameKey('medjool date'));
  expect(nameKey('fresh mint')).toBe('mint');
  expect(nameKey('tomatoes')).toBe('tomato');
});

test('the standard list is each name once, in its most used spelling, alphabetical', () => {
  expect(standardNames(['olive oil', 'Olive oil', 'olive oil', 'eggs', 'egg', 'eggs', 'Butter'])).toEqual(['Butter', 'eggs', 'olive oil']);
});

const STANDARD = ['smooth peanut butter', 'butter', 'olive oil', 'sesame oil', 'eggs', 'spring onions', 'onion'];

test('a name on the list (any case or plural) is fine; a new name like a standard one is flagged with what it is like', () => {
  const out = checkNames(['Eggs', 'olive oils', 'nut butter', 'extra virgin olive oil', 'za\'atar'], STANDARD, []);
  expect(out.like).toEqual([
    { name: 'nut butter', like: ['smooth peanut butter', 'butter'] },
    { name: 'extra virgin olive oil', like: ['olive oil', 'sesame oil'] },
  ]);
  expect(out.fresh).toEqual(['nut butter', 'extra virgin olive oil', "za'atar"]);
});

test('a new name the household confirmed as different is not flagged', () => {
  const out = checkNames(['almond butter'], STANDARD, ['Almond butter']);
  expect(out.like).toEqual([]);
  expect(out.fresh).toEqual(['almond butter']);
});
