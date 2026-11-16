import { describe, expect, test } from 'vitest';
import { cookedMakes, mergeMakes, nextMake, weekEats, weekMakes } from './weekEats';
import type { MealSlot, PlanWeek, Recipe, Settings } from './types';

const week = { id: 'w', week_start: '2026-11-16', days: 7, prep_days: [6] } as PlanWeek;
const slot = (date: string, kind: string, reason: string | null, extra: Partial<MealSlot> = {}) =>
  ({ plan_week_id: 'w', date, slot: kind, mode: kind === 'lunch' ? 'packed' : 'routine', recipe_id: null, reason, routine_choice: null, ...extra }) as MealSlot;
const slots = [slot('2026-11-16', 'breakfast', 'Overnight oats'), slot('2026-11-16', 'lunch', 'Packed lunch'), slot('2026-11-17', 'breakfast', 'Overnight oats')];
const recipes = [{ id: 'egg', slug: 'boiled-egg', kind: 'snack', keeps_days: 5, toddler_ok: true }] as Recipe[];
const settings = { meal_partners: { 'Overnight oats': { a: [{ recipe: 'boiled-egg', qty: 2 }], b: [{ recipe: 'boiled-egg', qty: 1 }] } } } as unknown as Settings;

describe("a week's eats and makes", () => {
  test('partners and stored snacks together; makes add everyone up on the Sunday before the week', () => {
    const stored = [{ id: 'e1', date: '2026-11-17', slot: 'snack_pm' as const, member_id: 'a', recipe_id: 'egg', qty: 1, make_date: '2026-11-15' }];
    const eats = weekEats({ week, slots, eats: stored }, settings, recipes);
    expect(eats).toHaveLength(5);
    expect(weekMakes({ week, slots, eats: stored }, settings, recipes)).toEqual([
      expect.objectContaining({ plan_week_id: 'w', date: '2026-11-15', slot: 'snack', mode: 'cook', recipe_id: 'egg', portions: 7 }),
    ]);
  });

  test('no week, nothing to eat', () => {
    expect(weekEats({ week: null, slots: [] }, settings, recipes)).toEqual([]);
  });
});

describe('review fixes', () => {
  test("a draft counts the partners Claude proposed with it, over the saved ones", () => {
    const draft = { ...week, status: 'draft', new_partners: { 'Overnight oats': { a: [{ recipe: 'boiled-egg', qty: 3 }] } } } as PlanWeek;
    const eats = weekEats({ week: draft, slots }, settings, recipes).filter((e) => e.member_id === 'a');
    expect(eats.map((e) => e.qty)).toEqual([3, 3]);
    expect(weekEats({ week: { ...draft, status: 'approved' }, slots }, settings, recipes).filter((e) => e.member_id === 'a').map((e) => e.qty)).toEqual([2, 2]);
  });

  test("a person who's no longer in the household has no partners", () => {
    expect(weekEats({ week, slots }, settings, recipes, ['b']).map((e) => e.member_id)).toEqual(['b', 'b']);
  });
});

test("a recipe made on a day for two weeks is one make in Today's cooking", () => {
  const slot = (portions: number, wk: string) => ({ plan_week_id: wk, date: '2026-11-15', slot: 'snack', mode: 'cook', recipe_id: 'egg', portions } as MealSlot);
  expect(mergeMakes([slot(4, 'a'), slot(5, 'b'), { ...slot(2, 'b'), recipe_id: 'balls' }]).map((m) => [m.recipe_id, m.portions])).toEqual([['egg', 9], ['balls', 2]]);
});

describe('snacks from any recipe, and quick snacks', () => {
  const oats = { id: 'oats', slug: 'baked-oats', kind: 'component', snack_ok: true, snack_portions: 8, base_portions: 4, keeps_days: 3 } as unknown as Recipe;
  const apple = { id: 'apple', slug: 'apple-almonds', kind: 'snack', quick: true, base_portions: 1 } as unknown as Recipe;
  const stored = [
    { id: 'e1', date: '2026-11-17', slot: 'snack_pm' as const, member_id: 'a', recipe_id: 'oats', qty: 8, make_date: '2026-11-15' },
    { id: 'e2', date: '2026-11-18', slot: 'snack_am' as const, member_id: 'a', recipe_id: 'apple', qty: 2, make_date: '2026-11-18' },
  ];
  test("a recipe that can be a snack is made in recipe portions; a quick snack is bought but never made", () => {
    const makes = weekMakes({ week, slots: [], eats: stored }, {} as Settings, [...recipes, oats, apple]);
    expect(makes.map((m) => [m.recipe_id, m.portions])).toEqual([['oats', 4], ['apple', 2]]);
    expect(cookedMakes(makes, [...recipes, oats, apple]).map((m) => m.recipe_id)).toEqual(['oats']);
  });
});

describe('nextMake: the make a snack recipe is opened at', () => {
  const make = (date: string, recipe_id: string, portions: number) => ({ date, slot: 'snack', mode: 'cook', recipe_id, portions }) as MealSlot;
  const makes = [make('2026-11-15', 'balls', 3), make('2026-11-16', 'balls', 14), make('2026-11-16', 'balls', 2), make('2026-11-19', 'balls', 6), make('2026-11-16', 'oat', 8)];

  test("today's make (all of it, both weeks it feeds) when there is one", () => {
    expect(nextMake(makes, 'balls', '2026-11-16')).toMatchObject({ date: '2026-11-16', portions: 16 });
  });
  test('else the next one', () => {
    expect(nextMake(makes, 'balls', '2026-11-17')).toMatchObject({ date: '2026-11-19', portions: 6 });
  });
  test('none left', () => {
    expect(nextMake(makes, 'balls', '2026-11-20')).toBeNull();
  });
});

describe('snacks are made in whole batches', () => {
  const w = { ...week, prep_days: [0] } as PlanWeek;
  const eat = (n: number, recipe_id = 'balls') => ({ id: `e${n}${recipe_id}`, date: '2026-11-17', slot: 'snack_am' as const, member_id: `m${n}`, recipe_id, qty: 1, make_date: '2026-11-16' });
  const lib = [
    { id: 'balls', slug: 'balls', kind: 'snack', base_portions: 20, keeps_days: 7, toddler_ok: true },
    { id: 'quick', slug: 'quick', kind: 'snack', quick: true, base_portions: 1, keeps_days: 1, toddler_ok: true },
    { id: 'oats', slug: 'oats', kind: 'meal', snack_ok: true, base_portions: 4, keeps_days: 3, toddler_ok: true },
  ] as Recipe[];
  const makesFor = (eats: ReturnType<typeof eat>[]) => weekMakes({ week: w, slots: [], eats }, {} as Settings, lib);

  test('14 balls needed makes the whole 20', () => {
    expect(makesFor(Array.from({ length: 14 }, (_, i) => eat(i)))[0]).toMatchObject({ recipe_id: 'balls', portions: 20 });
  });
  test('a batch size read as text still counts', () => {
    const textLib = lib.map((r) => (r.id === 'balls' ? { ...r, base_portions: '20' as unknown as number } : r));
    expect(weekMakes({ week: w, slots: [], eats: [eat(1)] }, {} as Settings, textLib)[0].portions).toBe(20);
  });
  test('more than a batch makes two', () => {
    expect(makesFor(Array.from({ length: 26 }, (_, i) => eat(i)))[0].portions).toBe(40);
  });
  test('quick snacks and meals that can be snacks are not rounded', () => {
    const m = makesFor([eat(1, 'quick'), eat(2, 'oats')]);
    expect(m.find((x) => x.recipe_id === 'quick')!.portions).toBe(1);
    expect(m.find((x) => x.recipe_id === 'oats')!.portions).toBeLessThan(4);
  });
  test('one make feeding two weeks is still one batch when merged', () => {
    const a = makesFor(Array.from({ length: 3 }, (_, i) => eat(i)));
    const b = makesFor(Array.from({ length: 4 }, (_, i) => eat(i + 10)));
    expect(mergeMakes([...a, ...b])[0].portions).toBe(20);
  });
});
