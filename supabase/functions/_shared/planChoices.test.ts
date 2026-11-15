import { describe, expect, it } from 'vitest';
import { applyChoices, ownCookingMinutes, parseChoices, setPrepDay, usualChoices } from './planChoices.ts';
import type { PlannerInput } from './planner.ts';

const MON = '2026-11-23';
const DATES = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const settings = { cooking_minutes: { sat: 120, sun: 120 }, weekday_dinner_max_min: 30, adventure: 1, prep_days: [6] };
const adults = [{ id: 'a' }, { id: 'b' }];
const pattern = [
  { member_id: 'a', weekday: 1, office: true }, { member_id: 'a', weekday: 3, office: true },
  { member_id: 'b', weekday: 0, office: true }, { member_id: 'b', weekday: 2, office: false },
];

describe('usualChoices', () => {
  it('fills the week from the usual settings and office pattern', () => {
    const c = usualChoices(MON, settings, adults, pattern);
    expect(c.office).toEqual({ a: [1, 3], b: [0] });
    expect(c.cookingMinutes).toEqual(Object.fromEntries(DATES.map((d, i) => [d, i >= 5 ? 120 : 60])));
    expect(c.prepDays).toEqual([6]);
    expect(c.weekdayMaxMin).toBe(30);
    expect(c.newRecipes).toBe(1);
    expect(c.nightsOff).toEqual([]);
    expect(c.useUp).toEqual([]);
  });

  it('defaults: no prep days, 30 minutes, one new recipe', () => {
    const c = usualChoices(MON, {}, adults, []);
    expect(c.prepDays).toEqual([]);
    expect(c.weekdayMaxMin).toBe(30);
    expect(c.newRecipes).toBe(1);
    expect(c.office).toEqual({ a: [], b: [] });
  });
});

describe('parseChoices', () => {
  it('is null for anything but an object', () => {
    expect(parseChoices(null, MON)).toBeNull();
    expect(parseChoices('x', MON)).toBeNull();
    expect(parseChoices([], MON)).toBeNull();
  });

  it('drops what is outside the week or out of range', () => {
    const c = parseChoices({
      office: { a: [0, 4, 5, 6, 9, 'x', 4], b: 'no' },
      nightsOff: ['2026-11-25', '2026-12-01', 'nope'],
      cookingMinutes: { '2026-11-23': 90, '2026-11-24': 10, '2026-12-01': 60, '2026-11-25': 500 },
      prepDays: [6, 6, 7, -1, 2],
      weekdayMaxMin: 45,
      newRecipes: 12,
      useUp: [...Array.from({ length: 25 }, (_, i) => `item ${i}`), 'x'.repeat(100), 3],
    }, MON)!;
    expect(c.office).toEqual({ a: [0, 4] });
    expect(c.nightsOff).toEqual(['2026-11-25']);
    expect(c.cookingMinutes).toEqual({ '2026-11-23': 90 });
    expect(c.prepDays).toEqual([2, 6]);
    expect(c.weekdayMaxMin).toBe(45);
    expect(c.newRecipes).toBe(7);
    expect(c.useUp).toHaveLength(20);
  });

  it('cuts long use-up names to 80 characters', () => {
    expect(parseChoices({ useUp: ['x'.repeat(100)] }, MON)!.useUp).toEqual(['x'.repeat(80)]);
  });

  it('a limit that is not a number falls back to 30, new recipes to 1', () => {
    const c = parseChoices({ weekdayMaxMin: 'a', newRecipes: -3 }, MON)!;
    expect(c.weekdayMaxMin).toBe(30);
    expect(c.newRecipes).toBe(0);
  });
});

describe('applyChoices', () => {
  it('sets office days, each day’s minutes, the limit and the nights off', () => {
    const input = { weekStart: MON, days: 7, officeDays: [4], weekdayMaxMin: 30, dayMinutes: Array(7).fill(60) } as unknown as PlannerInput;
    const c = { ...usualChoices(MON, settings, adults, pattern), nightsOff: ['2026-11-25'], weekdayMaxMin: 45 };
    c.cookingMinutes['2026-11-27'] = 90;
    const out = applyChoices(input, c);
    expect(out.officeDays).toEqual([0, 1, 3]);
    expect(out.dayMinutes).toEqual([60, 60, 60, 60, 90, 120, 120]);
    expect(out.weekdayMaxMin).toBe(45);
    expect(out.nightsOff).toEqual(['2026-11-25']);
  });
});

describe('setPrepDay', () => {
  const usual = usualChoices(MON, settings, adults, pattern);
  it('picking a day gives it at least 2 hours', () => {
    expect(setPrepDay(usual, usual, 2, true).cookingMinutes['2026-11-25']).toBe(120);
    expect(setPrepDay(usual, usual, 2, true).prepDays).toEqual([2, 6]);
    const longer = { ...usual, cookingMinutes: { ...usual.cookingMinutes, '2026-11-25': 150 } };
    expect(setPrepDay(longer, usual, 2, true).cookingMinutes['2026-11-25']).toBe(150);
  });
  it('unpicking it puts the usual time back', () => {
    const on = setPrepDay(usual, usual, 2, true);
    const off = setPrepDay(on, usual, 2, false);
    expect(off.cookingMinutes['2026-11-25']).toBe(60);
    expect(off.prepDays).toEqual([6]);
  });
});

describe('ownCookingMinutes', () => {
  it('only the dates that differ from the settings, or null', () => {
    const c = usualChoices(MON, settings, adults, pattern);
    expect(ownCookingMinutes(c, settings)).toBeNull();
    c.cookingMinutes['2026-11-24'] = 90;
    expect(ownCookingMinutes(c, settings)).toEqual({ '2026-11-24': 90 });
  });
});

test('a usual prep day starts with at least 2 hours', () => {
  const c = usualChoices(MON, { prep_days: [2] }, adults, []);
  expect(c.cookingMinutes['2026-11-25']).toBe(120);
  expect(c.cookingMinutes['2026-11-24']).toBe(60);
});
