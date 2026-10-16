import { BEEF, CHOW, DONER, HONEY, NEXT_WEEK, PENNE, SALMON } from '../test/fixtures';
import type { MealSlot, Recipe } from './types';
import { daySummary, proteinBalance } from './weekSummary';

const recipes = new Map<string, Recipe>([HONEY, SALMON, BEEF, PENNE, CHOW, DONER].map((r) => [r.id, r]));
const edit = (date: string, kind: MealSlot['slot'], over: Partial<MealSlot>) =>
  NEXT_WEEK.slots.map((s) => (s.date === date && s.slot === kind ? { ...s, ...over } : s));

test('breakfast shows the choice, then the routine, then the pool', () => {
  expect(daySummary('2026-10-19', NEXT_WEEK.slots, recipes, []).breakfast).toBe('Overnight oats (made at Sunday 8pm prep)');
  expect(daySummary('2026-10-21', NEXT_WEEK.slots, recipes, []).breakfast).toBe('Eggs, porridge or baked oats');
  expect(daySummary('2026-10-21', edit('2026-10-21', 'breakfast', { routine_choice: 'Baked oats' }), recipes, []).breakfast).toBe('Baked oats');
});

test('lunch shows its reason, packed, leftovers or home lunch', () => {
  expect(daySummary('2026-10-19', NEXT_WEEK.slots, recipes, []).lunch).toBe('Packed lunch');
  expect(daySummary('2026-10-19', edit('2026-10-19', 'lunch', { reason: null }), recipes, []).lunch).toBe('Packed lunch');
  expect(daySummary('2026-10-20', edit('2026-10-20', 'lunch', { reason: null }), recipes, []).lunch).toBe('Leftover Almond-Crusted Honey Chilli Chicken');
  expect(daySummary('2026-10-21', edit('2026-10-21', 'lunch', { reason: null }), recipes, []).lunch).toBe('Home lunch');
});

test('dinner shows the recipe, out tonight or leftovers night', () => {
  expect(daySummary('2026-10-20', NEXT_WEEK.slots, recipes, [])).toMatchObject({ dinner: 'Varoma Salmon', dinnerOut: false });
  expect(daySummary('2026-10-20', edit('2026-10-20', 'dinner', { mode: 'out' }), recipes, [])).toMatchObject({ dinner: 'Out tonight', dinnerOut: true });
  expect(daySummary('2026-10-25', NEXT_WEEK.slots, recipes, []).dinner).toBe('Leftovers night');
});

test('chips: office, prep tonight, cook once, guests, out, cooked, in that order', () => {
  expect(daySummary('2026-10-19', NEXT_WEEK.slots, recipes, [0]).chips).toEqual([
    { kind: 'office', label: 'Office' },
    { kind: 'twice', label: 'Cook once ×2' },
  ]);
  const prepped = new Map(recipes).set(BEEF.id, { ...BEEF, prep_minutes: 10 });
  const slots = edit('2026-10-20', 'dinner', { guests: 2, cooked_at: '2026-10-20T19:00:00Z' });
  expect(daySummary('2026-10-20', slots, prepped, []).chips).toEqual([
    { kind: 'prep', label: '8pm prep' },
    { kind: 'guests', label: '+2 guests' },
    { kind: 'cooked', label: '✓ Cooked' },
  ]);
  expect(daySummary('2026-10-20', edit('2026-10-20', 'dinner', { mode: 'out' }), recipes, []).chips).toEqual([{ kind: 'out', label: 'Out tonight' }]);
  expect(daySummary('2026-10-20', edit('2026-10-20', 'dinner', { guests: 1 }), recipes, []).chips).toEqual([{ kind: 'guests', label: '+1 guest' }]);
});

test('proteinBalance counts cooked dinners only', () => {
  expect(proteinBalance(NEXT_WEEK.slots, recipes)).toEqual({ chicken: 2, fish: 1, red_meat: 2, veggie: 1 });
  expect(proteinBalance(edit('2026-10-19', 'dinner', { mode: 'out' }), recipes)).toEqual({ chicken: 1, fish: 1, red_meat: 2, veggie: 1 });
});
