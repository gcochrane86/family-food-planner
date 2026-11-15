import { describe, expect, test } from 'vitest';
import { makeSlots, mealName, parseEats, parsePartners, partnerEats, placeEat, type Eat } from './snackEats.ts';

const MON = '2026-11-16';
const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const day = (date: string, breakfast: string, lunch: Record<string, unknown> = { mode: 'packed', reason: 'Packed lunch' }) => [
  { date, slot: 'breakfast', mode: 'routine', recipe_id: null, routine_choice: null, reason: breakfast },
  { date, slot: 'lunch', recipe_id: null, ...lunch },
  { date, slot: 'dinner', mode: 'cook', recipe_id: 'tikka' },
] as never[];
const recipes = new Map([['tikka', { reheats_well: true }]]);
const snacks = new Map([
  ['boiled-egg', { id: 'egg', keeps_days: 5, toddler_ok: true }],
  ['apple-almonds', { id: 'apple', keeps_days: 2, toddler_ok: false }],
]);
const partners = {
  'Overnight oats': { a: [{ recipe: 'boiled-egg', qty: 2 }], b: [{ recipe: 'boiled-egg', qty: 1 }] },
  'Packed lunch': { a: [{ recipe: 'apple-almonds', qty: 1 }] },
};

describe('meal names', () => {
  test('a breakfast by its plain name; a packed lunch; leftovers have none', () => {
    const slots = [...day(MON, 'Overnight oats (made Sunday)'), ...day('2026-11-17', 'Baked oats', { mode: 'routine', routine_choice: 'Leftovers' })];
    expect(mealName(MON, 'breakfast', slots, recipes)).toBe('Overnight oats');
    expect(mealName(MON, 'lunch', slots, recipes)).toBe('Packed lunch');
    expect(mealName('2026-11-17', 'lunch', slots, recipes)).toBeNull();
  });

  test("an unpicked home lunch is last night's dinner when it reheats, else the first home lunch", () => {
    const slots = [...day(MON, 'Baked oats'), ...day('2026-11-17', 'Baked oats', { mode: 'routine', routine_choice: null, reason: 'Home lunch' })];
    expect(mealName('2026-11-17', 'lunch', slots, recipes, { homeLunches: ['Chicken sandwich'] })).toBeNull();
    expect(mealName('2026-11-17', 'lunch', slots, new Map(), { homeLunches: ['Chicken sandwich'] })).toBe('Chicken sandwich');
  });
});

describe('partner eats', () => {
  test("each person's partners come with the planned breakfast and lunch, and follow a changed breakfast", () => {
    const slots = [...day(MON, 'Overnight oats'), ...day('2026-11-17', 'Baked oats')];
    const eats = partnerEats(dates.slice(0, 2), slots, partners, snacks, ['2026-11-15'], recipes);
    expect(eats).toEqual([
      { date: MON, slot: 'breakfast', member_id: 'a', recipe_id: 'egg', qty: 2, make_date: '2026-11-15', partner: true },
      { date: MON, slot: 'breakfast', member_id: 'b', recipe_id: 'egg', qty: 1, make_date: '2026-11-15', partner: true },
      { date: MON, slot: 'lunch', member_id: 'a', recipe_id: 'apple', qty: 1, make_date: '2026-11-15', partner: true },
      // Apple & almonds keeps 2 days, so Tuesday's is made on Monday evening.
      { date: '2026-11-17', slot: 'lunch', member_id: 'a', recipe_id: 'apple', qty: 1, make_date: '2026-11-16', partner: true },
    ]);
  });

  test("past a make day's keeping time, the partner is made the evening before", () => {
    const slots = day('2026-11-19', 'Baked oats');
    const [eat] = partnerEats(['2026-11-19'], slots, partners, snacks, ['2026-11-15'], recipes);
    expect(eat.make_date).toBe('2026-11-18');
  });

  test('a partner with an unknown recipe is left out', () => {
    expect(partnerEats([MON], day(MON, 'Toast'), { Toast: { a: [{ recipe: 'gone', qty: 1 }] } }, snacks, [], recipes)).toEqual([]);
  });
});

describe('placing and making', () => {
  const base = { date: '2026-11-18', slot: 'snack_pm' as const, member_id: 'a', recipe_id: 'egg', qty: 1 };
  test('a new eat joins a make of the same recipe that still keeps', () => {
    const existing: Eat[] = [{ ...base, date: MON, make_date: '2026-11-15' }];
    expect(placeEat(base, existing, 5, ['2026-11-15']).make_date).toBe('2026-11-15');
  });
  test('else the latest make day it keeps from, else the day before', () => {
    expect(placeEat(base, [], 5, ['2026-11-15', '2026-11-17']).make_date).toBe('2026-11-17');
    expect(placeEat(base, [], 1, ['2026-11-15']).make_date).toBe('2026-11-17');
  });
  test('makes are the eats added up by make day and recipe', () => {
    const eats: Eat[] = [
      { ...base, date: MON, qty: 2, make_date: '2026-11-15' }, { ...base, member_id: 'b', date: MON, qty: 1, make_date: '2026-11-15' },
      { ...base, recipe_id: 'apple', make_date: '2026-11-17' },
    ];
    expect(makeSlots(eats)).toEqual([
      { date: '2026-11-15', slot: 'snack', mode: 'cook', recipe_id: 'egg', portions: 3, reason: 'Snack', source_date: null },
      { date: '2026-11-17', slot: 'snack', mode: 'cook', recipe_id: 'apple', portions: 1, reason: 'Snack', source_date: null },
    ]);
  });
});

describe("Claude's snacks and partners", () => {
  const members = [{ id: 'a', name: 'Adult A', kind: 'adult' }, { id: 't', name: 'Little', kind: 'child' }];
  const pool = new Map([
    ['boiled-egg', { id: 'egg', slug: 'boiled-egg', keeps_days: 5, toddler_ok: true }],
    ['apple & almonds', { id: 'apple', slug: 'apple-almonds', keeps_days: 2, toddler_ok: false }],
  ]);
  const ctx = { dates, makeDates: ['2026-11-15', '2026-11-18'], members, snacks: pool };
  const s = (o: Record<string, unknown>) => ({ person: 'adult a', date: '2026-11-17', slot: 'pm', recipe: 'boiled-egg', qty: 2, make_date: '2026-11-15', ...o });

  test('a snack for a person by name, recipe by slug or title', () => {
    expect(parseEats([s({}), s({ slot: 'am', recipe: 'Apple & Almonds', make_date: '2026-11-15', date: MON })], ctx)).toEqual([
      { date: '2026-11-17', slot: 'snack_pm', member_id: 'a', recipe_id: 'egg', qty: 2, make_date: '2026-11-15' },
      { date: MON, slot: 'snack_am', member_id: 'a', recipe_id: 'apple', qty: 2, make_date: '2026-11-15' },
    ]);
  });

  test.each([
    [s({ person: 'Nobody' }), /No one called "Nobody"/],
    [s({ person: 'little', recipe: 'Apple & almonds', make_date: '2026-11-15', date: MON }), /isn't toddler-friendly/],
    [s({ make_date: '2026-11-17' }), /isn't a snack-making day/],
    [s({ date: MON, make_date: '2026-11-18' }), /before it's made/],
    [s({ recipe: 'apple-almonds', date: '2026-11-20' }), /keeps 2 days/],
    [s({ recipe: 'Flapjack' }), /No snack recipe "Flapjack"/],
  ])('refuses %o', (item, msg) => {
    expect(() => parseEats([item], ctx)).toThrow(msg);
  });

  test('one person has one snack per slot per day', () => {
    expect(() => parseEats([s({}), s({ qty: 1 })], ctx)).toThrow(/two afternoon snacks on 2026-11-17/);
  });

  test('partners by meal, person and recipe; a nut snack never goes to the toddler', () => {
    const p = parsePartners([{ meal: 'Overnight oats', person: 'Adult A', recipe: 'boiled-egg', qty: 2 }], { members, snacks: pool, meals: ['Overnight oats'] });
    expect(p).toEqual({ 'Overnight oats': { a: [{ recipe: 'boiled-egg', qty: 2 }] } });
    expect(() => parsePartners([{ meal: 'Overnight oats', person: 'Little', recipe: 'apple-almonds', qty: 1 }], { members, snacks: pool, meals: ['Overnight oats'] }))
      .toThrow(/isn't toddler-friendly/);
    expect(() => parsePartners([{ meal: 'Toast', person: 'Adult A', recipe: 'boiled-egg', qty: 1 }], { members, snacks: pool, meals: ['Overnight oats'] }))
      .toThrow(/"Toast" isn't one of the breakfasts or lunches/);
  });
});
