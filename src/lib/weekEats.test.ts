import { describe, expect, test } from 'vitest';
import { mergeMakes, weekEats, weekMakes } from './weekEats';
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
