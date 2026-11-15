import { describe, expect, test } from 'vitest';
import { compareTargets, dayBalance, parseNutrition, personDay, routineName, weekBalance } from './balance.ts';

const N = (o: Partial<Record<string, unknown>> = {}) => ({
  protein_g: 30, fibre_g: 10, veg_portions: 2, fruit_portions: 0, healthy_fat: false, oily_fish: false, legumes: false, red_meat: false, processed_meat: false, ...o,
});
const D = '2026-11-17';
const recipes = new Map<string, { nutrition?: unknown }>([
  ['salmon', { nutrition: N({ protein_g: 35, fibre_g: 9, veg_portions: 2, healthy_fat: true, oily_fish: true }) }],
  ['curry', { nutrition: N({ fibre_g: 12, veg_portions: 2, legumes: true }) }],
  ['beef', { nutrition: N({ red_meat: true, fibre_g: 4, veg_portions: 1 }) }],
  ['hummus', { nutrition: N({ protein_g: 6, fibre_g: 8, veg_portions: 1, healthy_fat: true, legumes: true }) }],
  ['nothing', {}],
]);
const routines = {
  'Eggs & porridge': N({ protein_g: 28, fibre_g: 6, fruit_portions: 1 }),
  'Overnight oats': N({ protein_g: 20, fibre_g: 7, fruit_portions: 1 }),
  'Packed lunch': N({ protein_g: 30, fibre_g: 8, veg_portions: 2, healthy_fat: true }),
};
const day = (o: { breakfast?: string; lunch?: string; dinner?: string | null; dinnerMode?: string; snacks?: string[] } = {}) => [
  { date: D, slot: 'breakfast', mode: 'routine', recipe_id: null, routine_choice: o.breakfast ?? 'Eggs & porridge' },
  { date: D, slot: 'lunch', mode: 'packed', recipe_id: null, reason: o.lunch ?? 'Packed lunch' },
  { date: D, slot: 'dinner', mode: o.dinnerMode ?? 'cook', recipe_id: o.dinner === undefined ? 'salmon' : o.dinner },
  ...(o.snacks ?? []).map((id, i) => ({ date: D, slot: i ? 'snack_pm' : 'snack_am', mode: 'cook', recipe_id: id })),
];

describe('dayBalance', () => {
  test('a balanced day is all ok', () => {
    const b = dayBalance(D, day({ snacks: ['hummus'] }), recipes, routines);
    expect(b).toMatchObject({ breakfastProtein: 'ok', vegFruit: 'ok', healthyFat: 'ok', fibre: 'ok', low: [] });
    expect(b.totals.fibre_g).toBe(31);
  });

  test('a lower-protein breakfast is low', () => {
    expect(dayBalance(D, day({ breakfast: 'Overnight oats' }), recipes, routines).breakfastProtein).toBe('low');
  });

  test("a routine name's suffix is left off to find its estimate", () => {
    expect(routineName('Overnight oats (made Sunday)')).toBe('Overnight oats');
    expect(dayBalance(D, day({ breakfast: 'Overnight oats (made Sunday)' }), recipes, routines).breakfastProtein).toBe('low');
  });

  test('a dinner out leaves the day-total markers unknown, never low (a healthy fat already eaten still counts)', () => {
    const b = dayBalance(D, day({ dinner: null, dinnerMode: 'out' }), recipes, routines);
    expect(b).toMatchObject({ breakfastProtein: 'ok', vegFruit: 'unknown', healthyFat: 'ok', fibre: 'unknown', low: [] });
    const noFat = dayBalance(D, day({ dinner: null, dinnerMode: 'out' }), recipes, { ...routines, 'Packed lunch': N() });
    expect(noFat.healthyFat).toBe('unknown');
  });

  test('a breakfast with no estimate leaves breakfast protein unknown', () => {
    expect(dayBalance(D, day({ breakfast: 'Toast' }), recipes, routines).breakfastProtein).toBe('unknown');
  });

  test('a dinner with no estimate leaves the totals unknown', () => {
    expect(dayBalance(D, day({ dinner: 'nothing' }), recipes, routines).fibre).toBe('unknown');
  });

  test('five portions, but mostly fruit, is low', () => {
    const fruity = { ...routines, 'Fruit bowl': N({ protein_g: 25, fruit_portions: 4, veg_portions: 0 }) };
    const b = dayBalance(D, day({ breakfast: 'Fruit bowl', dinner: 'beef' }), recipes, { ...fruity, 'Packed lunch': N({ veg_portions: 0 }) });
    expect(b.vegFruit).toBe('low');
    expect(b.low).toContain('veg & fruit');
  });

  test("a snack's fibre lifts the day", () => {
    expect(dayBalance(D, day(), recipes, routines).fibre).toBe('low');
    expect(dayBalance(D, day({ snacks: ['hummus'] }), recipes, routines).fibre).toBe('ok');
  });

  test("leftovers at lunch are the day before's dinner", () => {
    const slots = [
      { date: '2026-11-16', slot: 'dinner', mode: 'cook', recipe_id: 'curry' },
      { date: D, slot: 'breakfast', mode: 'routine', recipe_id: null, routine_choice: 'Eggs & porridge' },
      { date: D, slot: 'lunch', mode: 'routine', recipe_id: null, routine_choice: 'Leftovers' },
      { date: D, slot: 'dinner', mode: 'cook', recipe_id: 'salmon' },
    ];
    expect(dayBalance(D, slots, recipes, routines).totals.fibre_g).toBe(6 + 12 + 9);
  });
});

describe('weekBalance', () => {
  const dates = ['2026-11-16', '2026-11-17', '2026-11-18'];
  const slots = [
    { date: dates[0], slot: 'dinner', mode: 'cook', recipe_id: 'salmon' },
    { date: dates[1], slot: 'dinner', mode: 'cook', recipe_id: 'curry' },
    { date: dates[1], slot: 'snack_am', mode: 'cook', recipe_id: 'hummus' },
    { date: dates[2], slot: 'snack_am', mode: 'leftovers', recipe_id: 'hummus', source_date: dates[1] },
    { date: dates[2], slot: 'dinner', mode: 'cook', recipe_id: 'beef' },
  ];
  test('counts oily fish and red meat dinners, and days with beans or lentils', () => {
    expect(weekBalance(dates, slots, recipes, routines)).toEqual({
      oilyFish: { count: 1, mark: 'low' }, legumes: { count: 2, mark: 'low' },
      redMeat: { count: 1, mark: 'ok' }, processed: { count: 0, mark: 'ok' },
    });
  });
});

describe('parseNutrition', () => {
  test('keeps a whole estimate, rejects junk', () => {
    expect(parseNutrition(N())).toEqual(N());
    expect(parseNutrition({ protein_g: 'lots' })).toBeNull();
    expect(parseNutrition(null)).toBeNull();
    expect(parseNutrition(N({ fibre_g: -1 }))).toBeNull();
  });
});

describe('home lunches the planner left as a default', () => {
  const r2 = new Map<string, { nutrition?: unknown; reheats_well?: boolean }>([
    ['stew', { nutrition: N({ fibre_g: 12 }), reheats_well: true }],
    ['salad', { nutrition: N({ fibre_g: 3 }), reheats_well: false }],
  ]);
  const home = (dinnerBefore: string) => [
    { date: '2026-11-16', slot: 'dinner', mode: 'cook', recipe_id: dinnerBefore },
    { date: D, slot: 'lunch', mode: 'routine', recipe_id: null, routine_choice: null, reason: 'Chicken sandwich on sourdough' },
  ];
  test("after a dinner that reheats well, it's that dinner's leftovers", () => {
    expect(dayBalance(D, home('stew'), r2, {}, { homeLunches: ['Chicken sandwich'] }).totals.fibre_g).toBe(12);
  });
  test("otherwise it's the first home lunch on the list", () => {
    expect(dayBalance(D, home('salad'), r2, { 'Chicken sandwich': N({ fibre_g: 4 }) }, { homeLunches: ['Chicken sandwich'] }).totals.fibre_g).toBe(4);
  });
});

describe('each person’s day', () => {
  const full = (o: Partial<Record<string, unknown>> = {}) => N({ kcal: 500, fat_g: 20, sat_fat_g: 5, carbs_g: 50, sugars_g: 10, salt_g: 1, ...o });
  const rs = new Map<string, { nutrition?: unknown; toddler_ok?: boolean }>([
    ['salmon', { nutrition: full({ protein_g: 30 }) }],
    ['hummus', { nutrition: full({ kcal: 150, protein_g: 6, sugars_g: 2 }), toddler_ok: true }],
    ['nuts', { nutrition: full({ kcal: 200, protein_g: 7 }), toddler_ok: false }],
  ]);
  const rt = { 'Eggs & porridge': full({ protein_g: 20 }), 'Packed lunch': full({ protein_g: 30 }) };
  const slots = [...day({ snacks: ['hummus', 'nuts'] })];
  const adult = { kind: 'adult', portion_weight: 1.25 };
  const toddler = { kind: 'child', portion_weight: 0.5 };

  test('an adult eats their share of each meal and one of each snack', () => {
    const p = personDay(D, slots, rs, rt, adult);
    expect(p.totals.kcal).toBe(1.25 * 1500 + 150 + 200);
    expect(p.totals.protein_g).toBe(1.25 * 80 + 13);
    expect(p.unknown).toEqual([]);
  });

  test('the toddler eats their share, and only the toddler-friendly snacks, scaled to them', () => {
    const p = personDay(D, slots, rs, rt, toddler);
    expect(p.totals.kcal).toBe(0.5 * 1500 + 0.5 * 150);
  });

  test('an estimate without calories leaves calories unknown, the rest still added', () => {
    const p = personDay(D, day(), new Map([['salmon', { nutrition: N({ protein_g: 30 }) }]]), rt, adult);
    expect(p.unknown).toContain('kcal');
    expect(p.totals.protein_g).toBe(1.25 * 80);
  });

  test('a night out leaves every total unknown', () => {
    expect(personDay(D, day({ dinner: null, dinnerMode: 'out' }), rs, rt, adult).unknown).toContain('protein_g');
  });

  test('targets: at least, at most, and about (within 10%)', () => {
    const totals = { kcal: 2300, protein_g: 80, fat_g: 70, sat_fat_g: 25, carbs_g: 250, sugars_g: 40, fibre_g: 31 };
    expect(compareTargets(totals, { kcal: 2000, protein_g: 90, fat_g: 70, sat_fat_g: 20, carbs_g: 260, sugars_g: 50, fibre_g: 30 }, [])).toEqual({
      kcal: 'over', protein_g: 'under', fat_g: 'ok', sat_fat_g: 'over', carbs_g: 'ok', sugars_g: 'ok', fibre_g: 'ok',
    });
  });

  test('with part of the day unknown, a total short of its target is unknown, but one already over is over', () => {
    expect(compareTargets({ protein_g: 40, sugars_g: 60 }, { protein_g: 90, sugars_g: 50 }, ['protein_g', 'sugars_g'])).toEqual({ protein_g: 'unknown', sugars_g: 'over' });
  });

  test('a number with no target is left out', () => {
    expect(compareTargets({ kcal: 2000 }, {}, [])).toEqual({});
  });
});
