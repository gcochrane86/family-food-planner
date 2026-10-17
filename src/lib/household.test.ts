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
      lunches: ['Chicken sandwich', 'Roast beef sandwich', 'Egg sandwich', 'Tuna & sweetcorn sandwich', 'Tuna poke bowl', 'Mexican beef poke bowl', 'Chicken poke bowl', 'Salmon poke bowl'],
      day_rules: [],
      other_shops: [],
      private_rules: [],
    });
  });
  test('ignores values of the wrong type', () => {
    expect(validateSettings({ default_plan_days: 6, shops_per_week: '2', delivery_pass: 'yes' })).toEqual(DEFAULT_SETTINGS);
  });
});

test('breakfast and lunch lists: kept tidy, with the defaults when missing or empty', () => {
  const s = validateSettings({ breakfasts: [' Banana pancakes ', 'Baked oats', 'baked oats', '', 7, 'x'.repeat(61)], lunches: [] });
  expect(s.breakfasts).toEqual(['Banana pancakes', 'Baked oats']);
  expect(s.lunches).toEqual(['Chicken sandwich', 'Roast beef sandwich', 'Egg sandwich', 'Tuna & sweetcorn sandwich', 'Tuna poke bowl', 'Mexican beef poke bowl', 'Chicken poke bowl', 'Salmon poke bowl']);
  expect(validateSettings({}).breakfasts).toEqual(['Overnight oats', 'Baked oats', 'Eggs & porridge']);
  expect(validateSettings({ lunches: Array.from({ length: 30 }, (_, i) => `L${i}`) }).lunches).toHaveLength(20);
});

test('your requirements: day rules and other shops are kept tidy', () => {
  const s = validateSettings({
    day_rules: [{ weekday: 3, protein: 'fish', note: 'Fishmonger in town' }, { weekday: 9, protein: 'fish' }, { weekday: 1, protein: 'pudding' }],
    other_shops: [
      { name: 'Fishmonger', buys: ['salmon', ' Cod '], day: 3, sometimes: false },
      { name: 'Farm shop', buys: ['eggs', 'milk'], sometimes: true, weeks: ['2026-10-19', 'nope'] },
      { name: '', buys: ['x'] },
    ],
  });
  expect(s.day_rules).toEqual([{ weekday: 3, protein: 'fish', note: 'Fishmonger in town' }]);
  expect(s.other_shops).toEqual([
    { name: 'Fishmonger', buys: ['salmon', 'cod'], day: 3, sometimes: false, weeks: [] },
    { name: 'Farm shop', buys: ['eggs', 'milk'], day: null, sometimes: true, weeks: ['2026-10-19'] },
  ]);
  expect(validateSettings({}).day_rules).toEqual([]);
  expect(validateSettings({}).other_shops).toEqual([]);
});

test('private rules are kept when settings are saved, tidied, and default to none', () => {
  expect(validateSettings({ private_rules: [' Rule one ', '', 3, 'x'.repeat(301)] }).private_rules).toEqual(['Rule one']);
  expect(validateSettings({}).private_rules).toEqual([]);
});
