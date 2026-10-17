import { HONEY, NEXT_WEEK } from '../test/fixtures';
import type { MealSlot, PreparedItem } from './types';
import { availablePortions, freezerPortions, isBatchIngredient, isBatchStep, parseBatch } from './batch';

const paste = { name: 'Curry paste', group: 'The paste', steps: ['Blitz the paste'], makes: 4, freezer_days: 90 };

describe('parseBatch', () => {
  it('accepts a batch', () => expect(parseBatch(paste)).toEqual(paste));
  it('fills in the defaults and clamps makes and freezer_days', () => {
    expect(parseBatch({ name: 'Paste', group: 'G', steps: [] })).toEqual({ name: 'Paste', group: 'G', steps: [], makes: 4, freezer_days: 90 });
    expect(parseBatch({ ...paste, makes: 20, freezer_days: 0 })).toMatchObject({ makes: 8, freezer_days: 1 });
  });
  it('returns null for anything that is not a batch', () => {
    expect(parseBatch({})).toBeNull();
    expect(parseBatch(null)).toBeNull();
    expect(parseBatch({ name: 'Paste', steps: [] })).toBeNull();
    expect(parseBatch({ ...paste, steps: 'x' })).toBeNull();
  });
});

test('batch ingredients and steps match the group and step titles exactly', () => {
  const r = { batch: paste };
  expect(isBatchIngredient(r, { group_name: 'The paste' })).toBe(true);
  expect(isBatchIngredient(r, { group_name: 'The rice' })).toBe(false);
  expect(isBatchIngredient({ batch: null }, { group_name: 'The paste' })).toBe(false);
  expect(isBatchStep(r, { title: 'Blitz the paste' })).toBe(true);
  expect(isBatchStep(r, { title: 'Rice on' })).toBe(false);
});

const item = (over: Partial<PreparedItem>): PreparedItem => ({
  id: 'p1', household_id: 'h1', recipe_id: HONEY.id, name: 'Curry paste', portions: 3, location: 'freezer', made_on: '2026-10-01', use_by: '2026-12-30', ...over,
});

test('freezer portions count only that recipe and only in date', () => {
  const items = [item({}), item({ id: 'p2', portions: 2, use_by: '2026-10-10' }), item({ id: 'p3', recipe_id: 'other', portions: 5 }), item({ id: 'p4', location: 'fridge', portions: 1 })];
  expect(freezerPortions(HONEY.id, items, '2026-10-17')).toBe(3);
});

test('available portions take off dinners already planned from the freezer but not yet checked', () => {
  const slots: MealSlot[] = NEXT_WEEK.slots.map((s) => (s.slot === 'dinner' && s.recipe_id === HONEY.id ? { ...s, batch: 'frozen' } : s));
  expect(availablePortions(HONEY.id, [item({})], slots, '2026-10-17')).toBe(2);
  const checked = slots.map((s) => (s.batch === 'frozen' ? { ...s, batch: 'frozen_ok' as const } : s));
  expect(availablePortions(HONEY.id, [item({})], checked, '2026-10-17')).toBe(3);
  expect(availablePortions(HONEY.id, [], slots, '2026-10-17')).toBe(0);
});
