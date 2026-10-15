import { formatQty, groupIngredients, machineLabel, pantryLabel, scaleFactor, toddlerSaltNote } from './recipes';
import type { RecipeIngredient, Staple } from './types';

describe('formatQty', () => {
  test.each([
    [1200 * 0.5, 'g', '600g'],
    [1000, 'g', '1kg'],
    [1250, 'ml', '1.25L'],
    [37.4, 'g', '37.4g'],
    [152, 'g', '150g'],
    [0.5 * 0.5, 'tsp', '¼ tsp'],
    [1 * 0.5, 'egg white', '½ egg white'],
    [3 * 0.5417, '', '1½'],
    [2, 'cloves', '2 cloves'],
    [1, 'cloves', '1 clove'],
    [0.1, '', '½'],
  ])('%s %s → %s', (qty, unit, expected) => {
    expect(formatQty(qty, unit)).toBe(expected);
  });

  test('approximate amounts say "about"', () => {
    expect(formatQty(100, 'g', true)).toBe('about 100g');
  });

  test('no quantity shows nothing', () => {
    expect(formatQty(null, '')).toBe('');
  });

  test('floating-point noise never shows', () => {
    expect(formatQty(0.1 + 0.2, 'tsp')).toBe('¼ tsp');
    expect(formatQty(1.0000001, 'tsp')).toBe('1 tsp');
  });
});

test('scaleFactor scales from the recipe portions to the target', () => {
  expect(scaleFactor(3, 6)).toBe(0.5);
  expect(scaleFactor(5.5, 6)).toBeCloseTo(0.9167, 3);
});

describe('pantryLabel', () => {
  const staples: Staple[] = [
    { id: '1', ingredient_id: 'a', name: 'Canned chickpeas', status: 'have' },
    { id: '2', ingredient_id: 'b', name: 'Soy sauce', status: 'low' },
    { id: '3', ingredient_id: 'c', name: 'Paprika', status: 'out' },
    { id: '4', ingredient_id: 'd', name: 'Garlic granules', status: 'have' },
    { id: '5', ingredient_id: 'e', name: 'Sea salt', status: 'have' },
  ];
  test.each([
    ['chickpeas', 'In pantry'],
    ['low-sodium soy sauce', 'In pantry'],
    ['paprika', 'To buy'],
    ['garlic', 'To buy'],
    ['garlic granules', 'In pantry'],
    ['fine sea salt', 'In pantry'],
    ['chicken breast', 'To buy'],
  ])('%s → %s', (name, label) => {
    expect(pantryLabel(name, staples)).toBe(label);
  });
});

describe('toddlerSaltNote', () => {
  test('warns when the toddler share is over 0.5g', () => {
    expect(toddlerSaltNote(2, 0.5)).toMatch(/About 1\.0g salt in the toddler's portion/);
  });
  test('says nothing when it is within the limit or unknown', () => {
    expect(toddlerSaltNote(0.6, 0.5)).toBeNull();
    expect(toddlerSaltNote(null, 0.5)).toBeNull();
  });
});

test('machineLabel names each machine', () => {
  expect(machineLabel('tm7')).toBe('TM7');
  expect(machineLabel('hy24')).toBe('HY 24L');
  expect(machineLabel('meater')).toBe('MEATER');
});

test('groupIngredients keeps recipe order and names ungrouped items "Ingredients"', () => {
  const i = (name: string, group_name: string | null, position: number) =>
    ({ name, group_name, position, qty: 1, unit: '', note: null, qty_approx: false }) as RecipeIngredient;
  expect(groupIngredients([i('rice', 'The carb', 3), i('chicken', 'The meat', 1), i('salt', null, 2)]))
    .toEqual([
      { group: 'The meat', items: [i('chicken', 'The meat', 1)] },
      { group: 'Ingredients', items: [i('salt', null, 2)] },
      { group: 'The carb', items: [i('rice', 'The carb', 3)] },
    ]);
});
