import { aheadRecipeId, homeLunchOn } from './lunchAhead';
import type { MealSlot, Recipe } from './types';

const slot = (date: string, kind: MealSlot['slot'], over: Partial<MealSlot> = {}): MealSlot =>
  ({ date, slot: kind, recipe_id: null, mode: 'routine', portions: null, guests: 0, locked: false, reason: null, source_date: null, routine_choice: null, cooked_at: null, portions_verdict: null, ...over });
const recipes = [
  { id: 'sandwich', slug: 'chicken-sandwich', title: 'Chicken Sandwich', reheats_well: false },
  { id: 'stew', slug: 'stew', title: 'Stew', reheats_well: true },
  { id: 'egg', slug: 'egg-sandwich', title: 'Egg Sandwich', reheats_well: false },
] as unknown as Recipe[];
const byId = new Map(recipes.map((r) => [r.id, r]));
const hasAhead = (id: string) => id === 'sandwich';
// Wed 18 Nov is "tomorrow"; days before it are looked back over.
const run = (...lunches: (string | null)[]) => lunches.map((c, i) => slot(`2026-11-${String(18 - lunches.length + 1 + i).padStart(2, '0')}`, 'lunch', { routine_choice: c }));

test("a home lunch is the recipe of the same name; leftovers when last night's dinner reheats well", () => {
  const slots = [slot('2026-11-17', 'dinner', { mode: 'cook', recipe_id: 'stew' }), slot('2026-11-18', 'lunch'), slot('2026-11-19', 'lunch', { routine_choice: 'Egg sandwich' })];
  expect(homeLunchOn('2026-11-18', slots, recipes, byId)).toBeNull(); // leftovers
  expect(homeLunchOn('2026-11-19', slots, recipes, byId)?.id).toBe('egg');
  expect(homeLunchOn('2026-11-20', [slot('2026-11-20', 'lunch')], recipes, byId)?.id).toBe('sandwich'); // the default
  expect(homeLunchOn('2026-11-21', [slot('2026-11-21', 'lunch', { mode: 'packed' })], recipes, byId)).toBeNull();
});

test('the chicken is roasted the evening before the first of two sandwich days, not before the second', () => {
  expect(aheadRecipeId('2026-11-18', run('Egg sandwich', 'Chicken sandwich'), recipes, byId, hasAhead)).toBe('sandwich');
  expect(aheadRecipeId('2026-11-18', run('Egg sandwich', 'Chicken sandwich', 'Chicken sandwich'), recipes, byId, hasAhead)).toBeNull();
  expect(aheadRecipeId('2026-11-18', run('Egg sandwich', 'Chicken sandwich', 'Chicken sandwich', 'Chicken sandwich'), recipes, byId, hasAhead)).toBe('sandwich');
  expect(aheadRecipeId('2026-11-18', run('Chicken sandwich', 'Egg sandwich'), recipes, byId, hasAhead)).toBeNull();
});
