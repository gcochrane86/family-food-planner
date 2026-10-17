import { buildShoppingList, pickShoppingWeek, tickKey } from './shopping';
import type { MealSlot, RecipeDetail, Staple } from './types';

const recipe = (id: string, base: number, ingredients: [string, number | null, string][]): RecipeDetail => ({
  id, household_id: 'h1', slug: id, title: id, subtitle: null, kind: 'meal', component_role: null, source: 'claude', protein: 'chicken',
  base_portions: base, reheats_well: false, freezes_well: false, toddler_ok: true, toddler_note: null, salt_per_portion_g: null,
  prep_minutes: 0, finish_minutes: 20, hands_off_minutes: 0, tags: [], equipment: [], reheat: null, hero_image_path: null,
  hero_image_source: null, status: 'active', rating: null, steps: [],
  ingredients: ingredients.map(([name, qty, unit], i) => ({ position: i + 1, group_name: null, name, qty, unit, note: null, qty_approx: false })),
});
const dinner = (date: string, recipeId: string | null, portions: number | null, mode: MealSlot['mode'] = 'cook', guests = 0): MealSlot => ({
  date, slot: 'dinner', recipe_id: recipeId, mode, portions, guests, locked: false, reason: null, source_date: null,
  routine_choice: null, cooked_at: null, portions_verdict: null,
});

const curry = recipe('curry', 6, [['onions', 2, ''], ['tinned tomatoes', 400, 'g'], ['baby spinach', 200, 'g']]);
const stew = recipe('stew', 4, [['onion', 1, ''], ['beef', 600, 'g'], ['sea salt', null, '']]);
const staples: Staple[] = [
  { id: 's1', ingredient_id: 'i1', name: 'Tinned tomatoes', status: 'have' },
  { id: 's2', ingredient_id: 'i2', name: 'Sea salt', status: 'have' },
  { id: 's3', ingredient_id: 'i3', name: 'Paprika', status: 'low' },
];
const recipes = new Map([['curry', curry], ['stew', stew]]);

test('the same ingredient from two dinners adds up, scaled to the portions planned', () => {
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 3), dinner('2026-10-20', 'stew', 4)], recipes, staples, 2);
  const onion = list.sun.find((i) => i.name === 'onions')!;
  expect(onion.qty).toBe(2); // 2 × 3/6 + 1 × 4/4
  expect(onion.forMeals).toEqual(['Mon curry', 'Tue stew']);
});

test('staples you have are left off; low ones are added', () => {
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 6)], recipes, staples, 2);
  const names = list.sun.map((i) => i.name);
  expect(names).not.toContain('tinned tomatoes');
  expect(names).toContain('Paprika');
  expect(list.sun.find((i) => i.name === 'Paprika')!.forMeals).toEqual(['Cupboard: running low']);
});

test('with two shops, things needed Thursday onwards come on Tuesday', () => {
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 6), dinner('2026-10-22', 'stew', 4)], recipes, staples, 2);
  expect(list.tue.map((i) => i.name)).toContain('beef');
  expect(list.sun.map((i) => i.name)).not.toContain('beef');
  // onions are needed Monday, so the whole amount comes on Sunday
  expect(list.sun.find((i) => i.name === 'onions')!.qty).toBe(3);
  expect(list.tue.find((i) => i.name === 'onion')).toBeUndefined();
});

test('with one shop, everything comes on Sunday', () => {
  const list = buildShoppingList([dinner('2026-10-22', 'stew', 4)], recipes, staples, 1);
  expect(list.tue).toEqual([]);
  expect(list.sun.map((i) => i.name)).toContain('beef');
});

test('guests increase the quantities', () => {
  const list = buildShoppingList([dinner('2026-10-20', 'stew', 6.5, 'cook', 2)], recipes, staples, 2);
  expect(list.sun.find((i) => i.name === 'beef')!.qty).toBeCloseTo(975);
});

test('out and leftovers nights add nothing', () => {
  const list = buildShoppingList([dinner('2026-10-19', null, null, 'out'), dinner('2026-10-20', null, null, 'leftovers')], recipes, staples, 2);
  expect(list.sun.filter((i) => !i.forMeals[0].startsWith('Cupboard'))).toEqual([]);
});

test('ingredients with no quantity still appear once', () => {
  const list = buildShoppingList([dinner('2026-10-20', 'stew', 4)], recipes, [], 2);
  expect(list.sun.find((i) => i.name === 'sea salt')).toMatchObject({ qty: null });
});

describe('weekly basics', () => {
  const basic = (name: string, qty: number | null, unit: string, delivery: 'sun' | 'tue' | 'split') =>
    ({ household_id: 'h1', position: 0, name, qty, unit, approx: false, delivery });

  test('a split basic is shared between the deliveries, counts rounding up on Sunday', () => {
    const list = buildShoppingList([], recipes, [], 2, [basic('Bananas', 7, '', 'split'), basic('Whole milk', 3000, 'ml', 'split')]);
    expect(list.sun.find((i) => i.name === 'Bananas')!.qty).toBe(4);
    expect(list.tue.find((i) => i.name === 'Bananas')!.qty).toBe(3);
    expect(list.sun.find((i) => i.name === 'Whole milk')!.qty).toBe(1500);
    expect(list.tue.find((i) => i.name === 'Whole milk')!.qty).toBe(1500);
    expect(list.sun.find((i) => i.name === 'Bananas')!.forMeals).toEqual(['Breakfasts & lunches']);
  });

  test('a Tuesday basic comes on Tuesday', () => {
    const list = buildShoppingList([], recipes, [], 2, [basic('Cucumber', 1, '', 'tue')]);
    expect(list.tue.map((i) => i.name)).toEqual(['Cucumber']);
  });

  test('with one shop a week, basics all come on Sunday', () => {
    const list = buildShoppingList([], recipes, [], 1, [basic('Bananas', 7, '', 'split'), basic('Cucumber', 1, '', 'tue')]);
    expect(list.tue).toEqual([]);
    expect(list.sun.find((i) => i.name === 'Bananas')!.qty).toBe(7);
  });

  test('a basic and a recipe ingredient with the same name become one line', () => {
    const eggy = recipe('frittata', 4, [['eggs', 8, '']]);
    const list = buildShoppingList([dinner('2026-10-19', 'frittata', 4)], new Map([['frittata', eggy]]), [], 2, [basic('Eggs', 18, '', 'sun')]);
    const eggs = list.sun.filter((i) => i.key === 'egg|');
    expect(eggs).toHaveLength(1);
    expect(eggs[0].qty).toBe(26);
    expect(eggs[0].forMeals).toEqual(['Mon frittata', 'Breakfasts & lunches']);
  });
});

describe('ticks and the shopping week', () => {
  const item = (qty: number | null) => ({ key: 'egg|', name: 'Eggs', qty, unit: '', approx: false, forMeals: [], neededBy: '' });
  test('a tick is tied to the quantity, so a changed amount needs ticking again', () => {
    expect(tickKey(item(18))).toBe('egg|@18');
    expect(tickKey(item(26))).not.toBe(tickKey(item(18)));
    expect(tickKey(item(null))).toBe('egg|');
    expect(tickKey(item(1.2345))).toBe('egg|@1.23');
  });

  const week = (status: 'draft' | 'approved', start: string) => ({ week: { id: start, household_id: 'h1', week_start: start, days: 7 as const, status, proposed_at: '', approved_at: null }, slots: [] });
  const none = { week: null, slots: [] };
  test('the list comes from next week if approved, otherwise this week if approved', () => {
    expect(pickShoppingWeek(week('approved', 'next'), week('approved', 'this'))?.week?.week_start).toBe('next');
    expect(pickShoppingWeek(week('draft', 'next'), week('approved', 'this'))?.week?.week_start).toBe('this');
    expect(pickShoppingWeek(none, week('draft', 'this'))).toBeNull();
  });
});

describe('a staple that is also a weekly basic (eggs)', () => {
  const eggy = recipe('frittata', 4, [['eggs', 8, ''], ['egg yolks', 2, '']]);
  const recipesWithEggs = new Map([['frittata', eggy]]);
  const basics = [{ household_id: 'h1', position: 1, name: 'Eggs', qty: 18, unit: '', approx: false, delivery: 'sun' as const }];
  const eggStaple = (status: Staple['status']): Staple[] => [{ id: 'st-eggs', ingredient_id: 'i', name: 'Eggs', status }];
  const plan = [dinner('2026-10-19', 'frittata', 4)];

  test.each(['have', 'low', 'out'] as const)('eggs staple "%s": dinner eggs are added to the breakfast eggs in one line', (status) => {
    const list = buildShoppingList(plan, recipesWithEggs, eggStaple(status), 2, basics);
    const eggLines = list.sun.filter((i) => /egg/i.test(i.name));
    expect(eggLines.map((i) => i.name)).toEqual(['eggs', 'egg yolks']);
    expect(eggLines[0].qty).toBe(26);
    expect(list.sun.some((i) => i.key === 'staple|st-eggs')).toBe(false);
  });

  test('a low staple that nothing else covers still gets its own line', () => {
    const list = buildShoppingList([], recipes, [{ id: 'st-pap', ingredient_id: 'i', name: 'Paprika', status: 'low' }], 2, basics);
    expect(list.sun.find((i) => i.key === 'staple|st-pap')).toBeTruthy();
  });

  test('a low staple that a line already covers adds a note to that line instead', () => {
    const list = buildShoppingList(plan, recipesWithEggs, eggStaple('low'), 2, basics);
    expect(list.sun.find((i) => i.name === 'eggs')!.forMeals).toContain('Cupboard: running low');
  });
});

describe('leftover lunches', () => {
  const reheats = { ...stew, id: 'stew', reheats_well: true };
  const map = new Map([['stew', reheats], ['curry', curry]]);
  const lunch = (date: string, over: Partial<MealSlot> = {}): MealSlot => ({
    date, slot: 'lunch', recipe_id: null, mode: 'routine', portions: null, guests: 0, locked: false, reason: null, source_date: null,
    routine_choice: null, cooked_at: null, portions_verdict: null, ...over,
  });
  const beef = (slots: MealSlot[]) => buildShoppingList(slots, map, [], 2).sun.find((i) => i.name === 'beef')!.qty;

  test("a dinner that reheats well also buys the next day's lunch when leftovers are the pick", () => {
    expect(beef([dinner('2026-10-20', 'stew', 3), lunch('2026-10-21')])).toBe(900); // 600 × (3 + 3) / 4
    expect(beef([dinner('2026-10-20', 'stew', 3), lunch('2026-10-21', { routine_choice: 'Leftovers' })])).toBe(900);
  });

  test('picking another lunch, or a dinner that does not reheat, buys just the dinner', () => {
    expect(beef([dinner('2026-10-20', 'stew', 3), lunch('2026-10-21', { routine_choice: 'Egg sandwich' })])).toBe(450);
    const salad = buildShoppingList([dinner('2026-10-20', 'curry', 3), lunch('2026-10-21')], map, [], 2).sun.find((i) => i.name === 'onions')!.qty;
    expect(salad).toBe(1); // 2 × 3/6
  });

  test("an office day's packed leftovers count too, and guests aren't doubled", () => {
    expect(beef([dinner('2026-10-20', 'stew', 5.5, 'cook', 2), lunch('2026-10-21', { mode: 'packed', recipe_id: 'stew', source_date: '2026-10-20' })])).toBe(1275); // 600 × (5.5 + 3) / 4
    expect(beef([dinner('2026-10-20', 'stew', 3), lunch('2026-10-21', { mode: 'packed' })])).toBe(450);
  });
});
