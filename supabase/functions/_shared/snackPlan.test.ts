import { describe, expect, test } from 'vitest';
import { saveNutrition, snackMakeDates } from './snackPlan.ts';
import { tableDb } from './testDb';

const W = '2026-11-23'; // a Monday; the Sunday before is the 22nd
const N = { protein_g: 6, fibre_g: 6, veg_portions: 1, fruit_portions: 0, healthy_fat: true, oily_fish: false, legumes: true, red_meat: false, processed_meat: false };

describe('snackMakeDates', () => {
  test('a Sunday prep day is the Sunday before the week (and the week’s own Sunday on a 7-day plan); midweek days are in the week', () => {
    expect(snackMakeDates(W, 7, [2, 6])).toEqual(['2026-11-22', '2026-11-25', '2026-11-29']);
    expect(snackMakeDates(W, 5, [6])).toEqual(['2026-11-22']);
  });
  test('with no prep days, any evening from the Sunday before', () => {
    expect(snackMakeDates(W, 5, [])).toEqual(['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
  });
});

describe('saveNutrition', () => {
  test('saves a recipe’s estimate by slug or title, and a breakfast’s into settings', async () => {
    const db = tableDb({ recipes: [{ id: 'r1', slug: 'curry', title: 'Thai Green Curry' }], 'settings:one': { data: { adventure: 1, routine_nutrition: { Old: N } } } });
    const out = await saveNutrition(db, 'h1', { recipes: [{ recipe: 'thai green curry', nutrition: N }], routines: [{ name: 'Eggs & porridge', nutrition: N }] });
    expect(out).toMatch(/Saved estimates for 1 recipe and 1 breakfast or lunch/);
    const writes = db.writes();
    expect(writes.find((w) => w.table === 'recipes')).toMatchObject({ method: 'update', payload: { nutrition: N } });
    expect(writes.find((w) => w.table === 'settings')?.payload).toMatchObject({ data: { adventure: 1, routine_nutrition: { Old: N, 'Eggs & porridge': N } } });
  });
  test('nothing is saved when a name is unknown or an estimate is incomplete', async () => {
    const db = tableDb({ recipes: [{ id: 'r1', slug: 'curry', title: 'Curry' }] });
    expect(await saveNutrition(db, 'h1', { recipes: [{ recipe: 'pie', nutrition: N }] })).toMatch(/No recipe called "pie". Nothing was saved/);
    expect(await saveNutrition(db, 'h1', { recipes: [{ recipe: 'curry', nutrition: { protein_g: 3 } }] })).toMatch(/curry's estimate needs/);
    expect(db.writes()).toEqual([]);
  });
});

describe('review fixes', () => {
  test('when no prep day falls in the plan, any evening will do', () => {
    expect(snackMakeDates(W, 5, [5])).toEqual(snackMakeDates(W, 5, []));
  });
});
