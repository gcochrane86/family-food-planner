import { describe, expect, test } from 'vitest';
import { isSnack, snackFactor } from './snackRules.ts';
import { quickNutrition } from './quickNutrition.ts';

describe('what counts as a snack', () => {
  test('snack recipes, recipes that can be snacks and quick snacks; not plain meals or archived ones', () => {
    expect(isSnack({ kind: 'snack' })).toBe(true);
    expect(isSnack({ kind: 'component', snack_ok: true })).toBe(true);
    expect(isSnack({ kind: 'snack', quick: true })).toBe(true);
    expect(isSnack({ kind: 'meal' })).toBe(false);
    expect(isSnack({ kind: 'snack', status: 'archived' })).toBe(false);
  });

  test('one snack of a recipe that can be a snack is its share of the batch; a snack recipe is one serving', () => {
    expect(snackFactor({ kind: 'component', snack_ok: true, base_portions: 4, snack_portions: 8 })).toBe(0.5);
    expect(snackFactor({ kind: 'snack', base_portions: 6 })).toBe(1);
    expect(snackFactor({ kind: 'component', snack_ok: true, base_portions: 4, snack_portions: null })).toBe(1);
  });
});

describe('quick snack nutrition', () => {
  test('an apple and 30g almonds, from the food table', () => {
    const n = quickNutrition([{ name: 'Apple', qty: 1, unit: '' }, { name: 'almonds', qty: 30, unit: 'g' }])!;
    expect(n.kcal).toBe(268);
    expect(n.protein_g).toBeCloseTo(6.9, 1);
    expect(n.fruit_portions).toBe(1);
    expect(n.healthy_fat).toBe(true);
    expect(n.legumes).toBe(false);
  });

  test('Greek yoghurt by the tablespoon; hummus counts as beans', () => {
    expect(quickNutrition([{ name: 'Greek yoghurt', qty: 150, unit: 'g' }])!.protein_g).toBeCloseTo(13.5, 1);
    expect(quickNutrition([{ name: 'hummus', qty: 2, unit: 'tbsp' }])!.legumes).toBe(true);
  });

  test("something it doesn't know leaves the estimate to Claude", () => {
    expect(quickNutrition([{ name: 'Apple', qty: 1, unit: '' }, { name: 'mystery bar', qty: 1, unit: '' }])).toBeNull();
    expect(quickNutrition([])).toBeNull();
  });
});

test('food names match whole words: pineapple is not an apple, doughnuts are not nuts', () => {
  expect(quickNutrition([{ name: 'pineapple', qty: 100, unit: 'g' }])).toBeNull();
  expect(quickNutrition([{ name: 'doughnuts', qty: 1, unit: '' }])).toBeNull();
  expect(quickNutrition([{ name: 'red apples', qty: 1, unit: '' }])).not.toBeNull();
});
