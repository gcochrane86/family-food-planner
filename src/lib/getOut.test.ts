import { getOutList, keptIn } from './getOut';
import type { RecipeIngredient } from './types';

const ing = (name: string, qty: number | null, unit = 'g', extra: Partial<RecipeIngredient> = {}): RecipeIngredient =>
  ({ position: 0, group_name: null, name, qty, unit, note: null, qty_approx: false, ...extra });

test('where each thing is kept', () => {
  expect(keptIn('chicken thighs')).toBe('fridge');
  expect(keptIn('frozen peas')).toBe('freezer');
  expect(keptIn('olive oil')).toBe('cupboard');
  expect(keptIn('soy sauce')).toBe('cupboard');
  expect(keptIn('ground cumin')).toBe('cupboard');
  expect(keptIn('black pepper')).toBe('cupboard');
  expect(keptIn('red pepper')).toBe('fridge');
  expect(keptIn('onion')).toBe('cupboard');
  expect(keptIn('spring onions')).toBe('fridge');
  expect(keptIn('garlic cloves')).toBe('cupboard');
  expect(keptIn('basmati rice')).toBe('cupboard');
  expect(keptIn('tinned chickpeas')).toBe('cupboard');
  expect(keptIn('green beans')).toBe('fridge');
  expect(keptIn('butter')).toBe('fridge');
  expect(keptIn('Greek yoghurt')).toBe('fridge');
});

test('the get-out list: everything once, amounts added up, grouped fridge, freezer, cupboard; water left out', () => {
  const rice = ing('basmati rice', 200);
  const groups = getOutList([
    { i: rice, factor: 2 },
    { i: rice, factor: 2 },
    { i: ing('Red peppers', 1, ''), factor: 1 },
    { i: ing('red pepper', 2, ''), factor: 1 },
    { i: ing('frozen peas', 100), factor: 1 },
    { i: ing('water', 500, 'ml'), factor: 1 },
    { i: ing('salt', null, '', { qty_approx: true }), factor: 1 },
  ], { 'icon:red pepper': 'h1/prep/icon-red-pepper.jpg' });
  expect(groups.map((g) => g.where)).toEqual(['fridge', 'freezer', 'cupboard']);
  expect(groups[0].items).toEqual([{ name: 'red pepper', qty: '3', key: 'icon:red pepper', icon: 'h1/prep/icon-red-pepper.jpg' }]);
  expect(groups[1].items[0]).toMatchObject({ name: 'frozen peas', qty: '100g', icon: null });
  expect(groups[2].items.map((i) => [i.name, i.qty])).toEqual([['basmati rice', '400g'], ['salt', '']]);
});
