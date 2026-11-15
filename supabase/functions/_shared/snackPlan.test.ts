import { describe, expect, test } from 'vitest';
import { parseSnacks, saveNutrition, snackMakeDates, snackRows } from './snackPlan.ts';
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

describe('parseSnacks', () => {
  const week = { weekStart: W, days: 7, makeDates: ['2026-11-22', '2026-11-25'] };
  test('a Sunday make covering Monday to Wednesday, and a Wednesday make covering the rest', () => {
    const s = parseSnacks([
      { recipe: 'hummus', slot: 'am', make_date: '2026-11-22', covers: ['2026-11-23', '2026-11-24', '2026-11-25'] },
      { recipe: 'egg-muffins', slot: 'pm', make_date: '2026-11-25', covers: ['2026-11-25', '2026-11-26'] },
    ], week);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ recipe: 'hummus', slot: 'snack_am', makeDate: '2026-11-22', covers: ['2026-11-23', '2026-11-24', '2026-11-25'] });
  });
  test('refuses a make day that isn’t a prep day, a day covered twice, and a day before the make', () => {
    expect(() => parseSnacks([{ recipe: 'x', slot: 'am', make_date: '2026-11-24', covers: ['2026-11-24'] }], week)).toThrow(/2026-11-24 isn't a snack-making day. Use one of 2026-11-22, 2026-11-25/);
    expect(() => parseSnacks([
      { recipe: 'x', slot: 'am', make_date: '2026-11-22', covers: ['2026-11-25'] },
      { recipe: 'y', slot: 'am', make_date: '2026-11-25', covers: ['2026-11-25'] },
    ], week)).toThrow(/morning snack on 2026-11-25 is covered twice/);
    expect(() => parseSnacks([{ recipe: 'x', slot: 'am', make_date: '2026-11-25', covers: ['2026-11-24'] }], week)).toThrow(/before it's made/);
    expect(() => parseSnacks([{ recipe: 'x', slot: 'lunch', make_date: '2026-11-25', covers: ['2026-11-25'] }], week)).toThrow(/slot must be am or pm/);
  });
  test('no snacks is fine', () => {
    expect(parseSnacks(undefined, week)).toEqual([]);
  });
});

describe('snackRows', () => {
  const make = { recipe: 'hummus', slot: 'snack_am' as const, makeDate: '2026-11-22', covers: ['2026-11-23', '2026-11-24', '2026-11-25'] };
  test('a make on its day with portions for every day it covers, and the covered days as leftovers', () => {
    expect(snackRows([make], new Map([['hummus', { id: 'r-h', keeps_days: 4, toddler_ok: true }]]), { adults: 2, children: 1 })).toEqual([
      { date: '2026-11-22', slot: 'snack_am', recipe_id: 'r-h', mode: 'cook', portions: 9, guests: 0, locked: false, reason: 'Snack: made today for 3 days', source_date: null },
      { date: '2026-11-23', slot: 'snack_am', recipe_id: 'r-h', mode: 'leftovers', portions: null, guests: 0, locked: false, reason: 'Snack', source_date: '2026-11-22' },
      { date: '2026-11-24', slot: 'snack_am', recipe_id: 'r-h', mode: 'leftovers', portions: null, guests: 0, locked: false, reason: 'Snack', source_date: '2026-11-22' },
      { date: '2026-11-25', slot: 'snack_am', recipe_id: 'r-h', mode: 'leftovers', portions: null, guests: 0, locked: false, reason: 'Snack', source_date: '2026-11-22' },
    ]);
  });
  test('the toddler only counts for a toddler-friendly snack', () => {
    expect(snackRows([make], new Map([['hummus', { id: 'r-h', keeps_days: 4, toddler_ok: false }]]), { adults: 2, children: 1 })[0].portions).toBe(6);
  });
  test('refuses a cover beyond how long it keeps', () => {
    expect(() => snackRows([make], new Map([['hummus', { id: 'r-h', keeps_days: 3, toddler_ok: true }]]), { adults: 2, children: 1 }))
      .toThrow(/hummus keeps 3 days from 2026-11-22, so not until 2026-11-25/);
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
  test('a make day in the week must be one of the days it covers', () => {
    expect(() => parseSnacks([{ recipe: 'x', slot: 'am', make_date: '2026-11-25', covers: ['2026-11-26'] }], { weekStart: W, days: 7, makeDates: ['2026-11-25'] }))
      .toThrow(/made on 2026-11-25, so it covers that day too/);
  });
  test('when no prep day falls in the plan, any evening will do', () => {
    expect(snackMakeDates(W, 5, [5])).toEqual(snackMakeDates(W, 5, []));
  });
});
