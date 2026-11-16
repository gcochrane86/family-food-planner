import { expect, test } from 'vitest';
import { textAmountsNote } from './stepAmounts';

test('a scaled step with amounts in its words says they are for the full recipe', () => {
  expect(textAmountsNote('Add the remaining 150g of **pistachios**', 0.7, 20)).toBe('Amounts in the words are for the full recipe (20). The cards are for yours.');
});

test('no note at the full recipe, or when the words have no amounts', () => {
  expect(textAmountsNote('Add the remaining 150g of **pistachios**', 1, 20)).toBeNull();
  expect(textAmountsNote('Add the **oats** and blitz 8 sec / speed 8', 0.7, 20)).toBeNull();
  expect(textAmountsNote('Roast at 200°C for 20 min', 0.5, 4)).toBeNull();
});

test('spoons and millilitres count as amounts', () => {
  expect(textAmountsNote('Stir in 2 tbsp boiling water', 0.5, 4)).not.toBeNull();
  expect(textAmountsNote('Save 100ml of the pasta water', 2, 4)).not.toBeNull();
});
