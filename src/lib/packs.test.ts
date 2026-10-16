import { packsNeeded, toBase } from './packs';

test.each([
  [650, 'g', 1, 'kg', 1],
  [1200, 'g', 500, 'g', 3],
  [3000, 'ml', 2.272, 'L', 2],
  [7, '', 5, '', 2],
  [18, '', 12, 'each', 2],
  [1.5, 'kg', 750, 'g', 2],
])('%s%s needed with %s%s packs → %s', (need, needUnit, size, packUnit, packs) => {
  expect(packsNeeded(need, needUnit, size, packUnit)).toBe(packs);
});

test('units that cannot be compared give null', () => {
  expect(packsNeeded(200, 'g', 1, '')).toBeNull();
  expect(packsNeeded(2, 'tbsp', 500, 'ml')).toBeNull();
});

test('nothing or no amount still means one pack', () => {
  expect(packsNeeded(0, 'g', 500, 'g')).toBe(1);
  expect(packsNeeded(null, '', 1, '')).toBe(1);
});

test('exact multiples do not round up because of floating point', () => {
  expect(packsNeeded(0.3 * 3, 'kg', 300, 'g')).toBe(3);
});

test('toBase converts to grams, millilitres or each', () => {
  expect(toBase(1.5, 'kg')).toEqual({ amount: 1500, base: 'g' });
  expect(toBase(2, 'litres')).toEqual({ amount: 2000, base: 'ml' });
  expect(toBase(6, 'pack')).toEqual({ amount: 6, base: 'each' });
  expect(toBase(1, 'tsp')).toBeNull();
});
