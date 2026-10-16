import { DEFAULT_SETTINGS, householdPortions, nextStaple, parseWeight, validateSettings } from './household';
import type { Member } from './types';

describe('parseWeight', () => {
  test('accepts a comma as the decimal point', () => {
    expect(parseWeight('1,25')).toEqual({ ok: true, value: 1.25 });
  });
  test('accepts a dot', () => {
    expect(parseWeight(' 0.5 ')).toEqual({ ok: true, value: 0.5 });
  });
  test.each(['', '0', '-1', '3.5', 'abc', '1.2.3'])('rejects %j', (input) => {
    expect(parseWeight(input)).toEqual({ ok: false, error: 'Enter a number between 0.1 and 3' });
  });
});

test('householdPortions sums the seed members to 3', () => {
  const m = (portion_weight: number) => ({ portion_weight }) as Member;
  expect(householdPortions([m(1.25), m(1.25), m(0.5)])).toBe(3);
  expect(householdPortions([m(0.1), m(0.2)])).toBe(0.3);
});

test('nextStaple cycles have → low → out → have', () => {
  expect(nextStaple('have')).toBe('low');
  expect(nextStaple('low')).toBe('out');
  expect(nextStaple('out')).toBe('have');
});

describe('validateSettings', () => {
  test('fills everything from the defaults', () => {
    expect(validateSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  test('clamps the weekday dinner limit to 10–120', () => {
    expect(validateSettings({ weekday_dinner_max_min: 5 }).weekday_dinner_max_min).toBe(10);
    expect(validateSettings({ weekday_dinner_max_min: 500 }).weekday_dinner_max_min).toBe(120);
  });
  test('defaults match the spec', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      weekday_dinner_max_min: 30,
      default_plan_days: 7,
      shops_per_week: 2,
      delivery_slots: [
        { day: 'sun', start: '19:00', end: '20:00' },
        { day: 'tue', start: '19:00', end: '20:00' },
      ],
      delivery_pass: false,
      use_nectar: false,
      adventure: 1,
      breakfasts: ['Overnight oats', 'Baked oats', 'Eggs & porridge'],
      lunches: ['Chicken sandwich', 'Roast beef sandwich', 'Egg sandwich', 'Tuna & sweetcorn sandwich', 'Mexican beef poke bowl'],
    });
  });
  test('ignores values of the wrong type', () => {
    expect(validateSettings({ default_plan_days: 6, shops_per_week: '2', delivery_pass: 'yes' })).toEqual(DEFAULT_SETTINGS);
  });
});

test('breakfast and lunch lists: kept tidy, with the defaults when missing or empty', () => {
  const s = validateSettings({ breakfasts: [' Banana pancakes ', 'Baked oats', 'baked oats', '', 7, 'x'.repeat(61)], lunches: [] });
  expect(s.breakfasts).toEqual(['Banana pancakes', 'Baked oats']);
  expect(s.lunches).toEqual(['Chicken sandwich', 'Roast beef sandwich', 'Egg sandwich', 'Tuna & sweetcorn sandwich', 'Mexican beef poke bowl']);
  expect(validateSettings({}).breakfasts).toEqual(['Overnight oats', 'Baked oats', 'Eggs & porridge']);
  expect(validateSettings({ lunches: Array.from({ length: 30 }, (_, i) => `L${i}`) }).lunches).toHaveLength(20);
});
