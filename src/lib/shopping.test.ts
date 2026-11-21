import { AISLES } from './aisles';
import { aisle, buildShoppingList, deliveryFor, pickShoppingWeek, tickKey } from './shopping';
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

describe('batch plans', () => {
  const pasted = recipe('katsu', 4, [['chicken', 600, 'g'], ['curry powder', 20, 'g'], ['coconut milk', 400, 'ml']]);
  pasted.ingredients[1].group_name = 'The paste';
  pasted.ingredients[2].group_name = 'The paste';
  pasted.batch = { name: 'Curry paste', group: 'The paste', steps: [], makes: 4, freezer_days: 90 };
  const map = new Map([['katsu', pasted]]);
  const list = (batch: MealSlot['batch'], portions = 4) =>
    buildShoppingList([{ ...dinner('2026-10-20', 'katsu', portions), batch }], map, [], 2).sun;
  const qty = (items: ReturnType<typeof list>, name: string) => items.find((i) => i.name === name)?.qty;

  test('a dinner from the freezer skips its paste ingredients but buys the rest', () => {
    for (const plan of ['frozen', 'frozen_ok'] as const) {
      expect(qty(list(plan), 'curry powder')).toBeUndefined();
      expect(qty(list(plan), 'coconut milk')).toBeUndefined();
      expect(qty(list(plan), 'chicken')).toBe(600);
    }
  });

  test('making a batch buys the paste for every portion it makes, scaled with the dinner', () => {
    expect(qty(list('make', 6), 'curry powder')).toBe(120); // 20 × 1.5 × 4
    expect(qty(list('make', 6), 'chicken')).toBe(900); // 600 × 1.5
  });

  test('made, no plan, or a recipe without a batch: just the dinner', () => {
    expect(qty(list('made'), 'curry powder')).toBe(20);
    expect(qty(list(null), 'curry powder')).toBe(20);
    const plain = buildShoppingList([{ ...dinner('2026-10-20', 'curry', 6), batch: 'frozen' }], recipes, [], 2).sun;
    expect(plain.find((i) => i.name === 'onions')?.qty).toBe(2);
  });
});

test('a roast dinner buys every part it was built from, scaled to the people', () => {
  const brisket = { ...recipe('brisket', 15, [['rolled beef brisket', 4750, 'g']]), slug: 'roast-brisket' };
  const roasties = { ...recipe('roasties', 6, [['roasting potatoes', 1400, 'g']]), slug: 'goose-fat-roasties' };
  const cauli = { ...recipe('cauli', 6, [['cauliflower', 1, '']]), slug: 'cauliflower-cheese' };
  const map = new Map([['brisket', brisket], ['roasties', roasties], ['cauli', cauli]]);
  const slot = { ...dinner('2026-10-25', 'brisket', 15), roast: { main: 'beef', sides: ['goose-fat-roasties', 'cauliflower-cheese'], people: 15, serve: '13:30' } };
  const items = buildShoppingList([slot], map, [], 1).sun;
  expect(items.find((i) => i.name === 'rolled beef brisket')?.qty).toBe(4750);
  expect(items.find((i) => i.name === 'roasting potatoes')?.qty).toBe(3500);
  expect(items.find((i) => i.name === 'cauliflower')?.qty).toBe(2.5);
  expect(items.find((i) => i.name === 'roasting potatoes')?.forMeals).toEqual(['Sun roast: roasties']);
});

test('a Christmas dinner with two meats buys both', () => {
  const turkey = { ...recipe('turkey', 10, [['turkey crown', 3000, 'g']]), slug: 'christmas-turkey' };
  const ham = { ...recipe('ham', 10, [['smoked gammon joint', 2000, 'g']]), slug: 'christmas-ham' };
  const map = new Map([['turkey', turkey], ['ham', ham]]);
  const slot = { ...dinner('2026-10-25', 'turkey', 10), roast: { occasion: 'christmas', main: 'turkey', mains: ['turkey', 'ham'], extras: ['christmas-ham'], sides: [], people: 10, serve: '14:00' } };
  const items = buildShoppingList([slot], map, [], 1).sun;
  expect(items.find((i) => i.name === 'turkey crown')?.qty).toBe(3000);
  expect(items.find((i) => i.name === 'smoked gammon joint')?.qty).toBe(2000);
});

describe('other shops', () => {
  const fishPie = { ...recipe('fish', 4, [['salmon fillets', 400, 'g'], ['onion', 1, ''], ['milk', 300, 'ml']]), protein: 'fish' as const };
  const map = new Map([['fish', fishPie], ['stew', stew]]);
  const fishmonger = { name: 'Fishmonger', buys: ['salmon', 'cod'], day: 3, sometimes: false, weeks: [] };
  const farm = { name: 'Farm shop', buys: ['milk', 'eggs'], day: null, sometimes: true, weeks: ['2026-10-19'] };
  const eggs = { id: 'b1', household_id: 'h1', position: 1, name: 'Eggs', qty: 12, unit: '', delivery: 'sun' as const, approx: false };

  test("the fishmonger buys Thursday's fish; Sainsbury's gets the rest", () => {
    const list = buildShoppingList([dinner('2026-10-22', 'fish', 4)], map, [], 2, [], { shops: [fishmonger], weekStart: '2026-10-19' });
    expect([...list.sun, ...list.tue].map((i) => i.name)).not.toContain('salmon fillets');
    expect([...list.sun, ...list.tue].map((i) => i.name)).toContain('onion');
    expect(list.others).toEqual([{ name: 'Fishmonger', day: 3, items: [expect.objectContaining({ name: 'salmon fillets', qty: 400 })] }]);
  });

  test('fish for another day still comes from Sainsbury\'s', () => {
    const list = buildShoppingList([dinner('2026-10-20', 'fish', 4)], map, [], 2, [], { shops: [fishmonger], weekStart: '2026-10-19' });
    expect(list.sun.map((i) => i.name)).toContain('salmon fillets');
    expect(list.others).toEqual([]);
  });

  test('the farm shop takes eggs and dairy only in weeks you go, weekly basics included', () => {
    const going = buildShoppingList([dinner('2026-10-22', 'fish', 4)], map, [], 2, [eggs], { shops: [farm], weekStart: '2026-10-19' });
    expect([...going.sun, ...going.tue].map((i) => i.name)).not.toContain('milk');
    expect([...going.sun, ...going.tue].map((i) => i.name)).not.toContain('Eggs');
    expect(going.others[0].items.map((i) => i.name).sort()).toEqual(['Eggs', 'milk']);
    const notGoing = buildShoppingList([dinner('2026-10-22', 'fish', 4)], map, [], 2, [eggs], { shops: [farm], weekStart: '2026-10-26' });
    expect(notGoing.others).toEqual([]);
    expect([...notGoing.sun, ...notGoing.tue].map((i) => i.name)).toEqual(expect.arrayContaining(['milk', 'Eggs']));
  });
});

test("a day's tonight's version is what gets bought, and a stale one is ignored", () => {
  const withCream = recipe('pasta', 4, [['crème fraîche', 200, 'ml'], ['penne', 400, 'g']]);
  const version = { based_on: 'pasta', note: 'Yoghurt tonight', ingredients: [
    { group_name: null, name: 'Greek yoghurt', qty: 200, unit: 'g', note: null, qty_approx: false, changed: true },
    { group_name: null, name: 'penne', qty: 400, unit: 'g', note: null, qty_approx: false, changed: false },
  ], steps: [] };
  const names = (v: unknown) => {
    const list = buildShoppingList([{ ...dinner('2026-10-19', 'pasta', 4), version: v as MealSlot['version'] }], new Map([['pasta', withCream]]), [], 2);
    return [...list.sun, ...list.tue].map((i) => i.name.toLowerCase()).join(', ');
  };
  expect(names(version)).toContain('greek yoghurt');
  expect(names(version)).not.toContain('crème fraîche');
  expect(names({ ...version, based_on: 'other' })).toContain('crème fraîche');
});

describe('snack makes', () => {
  const hummus = { ...recipe('hummus', 6, [['chickpeas', 400, 'g'], ['tahini', 2, 'tbsp']]), kind: 'snack' as const };
  const snack = (date: string, mode: MealSlot['mode'], portions: number | null, source: string | null = null): MealSlot => ({
    ...dinner(date, 'hummus', portions, mode), slot: 'snack_am', source_date: source,
  });
  const withSnacks = new Map([...recipes, ['hummus', hummus]]);
  test('a midweek make is bought with Tuesday’s delivery, scaled to its portions; the days it covers add nothing', () => {
    const list = buildShoppingList([dinner('2026-10-19', 'curry', 6), snack('2026-10-22', 'cook', 12), snack('2026-10-23', 'leftovers', null, '2026-10-22')], withSnacks, [], 2);
    const chickpeas = list.tue.find((i) => i.name === 'chickpeas')!;
    expect(chickpeas.qty).toBe(800);
    expect(chickpeas.forMeals).toEqual(['Thu snack: hummus']);
  });
  test('a make on the Sunday before the week comes in Sunday’s delivery', () => {
    const list = buildShoppingList([dinner('2026-10-19', 'curry', 6), snack('2026-10-18', 'cook', 6)], withSnacks, [], 2);
    expect(list.sun.find((i) => i.name === 'chickpeas')?.qty).toBe(400);
    expect(list.tue.find((i) => i.name === 'chickpeas')).toBeUndefined();
  });
});

test("a snack made the Sunday before the week isn't bought from a shop that goes on the week's Sunday", () => {
  const hummus = { ...recipe('hummus', 6, [['chickpeas', 400, 'g']]), kind: 'snack' as const };
  const fishmonger = { name: 'Fishmonger', buys: ['chickpeas'], day: 6, sometimes: false, weeks: [] };
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 6), { ...dinner('2026-10-18', 'hummus', 6), slot: 'snack_am' }], new Map([...recipes, ['hummus', hummus]]), [], 2, [],
    { shops: [fishmonger], weekStart: '2026-10-19' });
  expect(list.sun.find((i) => i.name === 'chickpeas')).toBeTruthy();
});

test("each person's snacks and partners are bought once, as the family's make", () => {
  const egg = { ...recipe('boiled-egg', 1, [['eggs', 1, '']]), kind: 'snack' as const };
  const make = { ...dinner('2026-10-18', 'boiled-egg', 9), slot: 'snack' as const };
  const list = buildShoppingList([dinner('2026-10-19', 'curry', 6), make], new Map([...recipes, ['boiled-egg', egg]]), [], 2);
  expect(list.sun.find((i) => i.name === 'eggs')?.qty).toBe(9);
  expect(list.tue.find((i) => i.name === 'eggs')).toBeUndefined();
});

test('which delivery brings a day: Sunday for the Sunday before to Wednesday, Tuesday after; one shop is always Sunday', () => {
  expect(deliveryFor('2026-11-15', '2026-11-16', 2)).toBe('sun');
  expect(deliveryFor('2026-11-18', '2026-11-16', 2)).toBe('sun');
  expect(deliveryFor('2026-11-19', '2026-11-16', 2)).toBe('tue');
  expect(deliveryFor('2026-11-19', '2026-11-16', 1)).toBe('sun');
});

describe('tidying the list', () => {
  const basic = (name: string, qty: number | null, unit: string) => ({ household_id: 'h1', position: 0, name, qty, unit, approx: false, delivery: 'sun' as const });

  test('dates by count, in grams and pitted are one line, in grams', () => {
    const a = recipe('caramelitas', 12, [['Medjool dates', 4, ''], ['Medjool dates', 200, 'g']]);
    const b = recipe('balls', 12, [['pitted Medjool dates', 200, 'g']]);
    const list = buildShoppingList([{ ...dinner('2026-10-19', 'caramelitas', 12), slot: 'snack' }, { ...dinner('2026-10-19', 'balls', 12), slot: 'snack' }],
      new Map([['caramelitas', a], ['balls', b]]), [{ id: 'st-d', ingredient_id: 'i', name: 'Medjool dates', status: 'out' }], 1);
    const dates = list.sun.filter((i) => /date/i.test(i.name));
    expect(dates).toHaveLength(1);
    expect(dates[0]).toMatchObject({ name: 'Medjool dates', qty: 480, unit: 'g' });
    expect(dates[0].staples).toEqual([{ id: 'st-d', status: 'out' }]);
  });

  test('carrots by count and in grams add up, in grams', () => {
    const r = recipe('stew', 4, [['carrots', 2, ''], ['carrot', 300, 'g']]);
    const carrots = buildShoppingList([dinner('2026-10-19', 'stew', 4)], new Map([['stew', r]]), [], 1).sun.filter((i) => /carrot/.test(i.name));
    expect(carrots).toEqual([expect.objectContaining({ qty: 460, unit: 'g' })]);
  });

  test('water from the tap is never bought, but things in water still are', () => {
    const r = recipe('soup', 4, [['water', 500, 'g'], ['boiling water', 400, 'ml'], ['cold water', 1, 'tbsp'], ['tinned tuna in water', 160, 'g'], ['coconut water', 250, 'ml']]);
    const names = buildShoppingList([dinner('2026-10-19', 'soup', 4)], new Map([['soup', r]]), [], 1).sun.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['tinned tuna in water', 'coconut water']));
    expect(names).not.toEqual(expect.arrayContaining(['water']));
    expect(names.filter((n) => /^(boiling |cold )?water$/.test(n))).toEqual([]);
  });

  test('milk in ml, milk in tablespoons and the whole-milk basic are one line, under the basic', () => {
    const r = recipe('bake', 4, [['milk', 300, 'ml'], ['milk', 2, 'tbsp']]);
    const list = buildShoppingList([dinner('2026-10-19', 'bake', 4)], new Map([['bake', r]]), [], 1, [basic('Whole milk', 1500, 'ml')]);
    const milk = list.sun.filter((i) => /milk/i.test(i.name));
    expect(milk).toHaveLength(1);
    expect(milk[0]).toMatchObject({ key: 'whole milk|ml', name: 'Whole milk', qty: 1830, unit: 'ml' });
    expect(milk[0].forMeals).toEqual(['Breakfasts & lunches', 'Mon bake']);
  });

  test('kilos and grams of the same thing add up; coconut milk and a whole chicken stay apart', () => {
    const r = recipe('a', 4, [['potatoes', 1, 'kg'], ['potato', 450, 'g'], ['coconut milk', 400, 'ml'], ['milk', 100, 'ml'], ['chicken thighs', 500, 'g']]);
    const list = buildShoppingList([dinner('2026-10-19', 'a', 4)], new Map([['a', r]]), [], 1, [basic('Whole chicken', 1, '')]);
    expect(list.sun.filter((i) => /potato/.test(i.name))).toEqual([expect.objectContaining({ qty: 1.45, unit: 'kg' })]);
    expect(list.sun.filter((i) => /milk/.test(i.name)).map((i) => i.name).sort()).toEqual(['coconut milk', 'milk']);
    expect(list.sun.filter((i) => /chicken/i.test(i.name))).toHaveLength(2);
  });

  test('things that can\'t be added up (2 lemons and 1 tbsp lemon) stay as two lines', () => {
    const r = recipe('a', 4, [['lemons', 2, ''], ['lemon', 1, 'tbsp']]);
    expect(buildShoppingList([dinner('2026-10-19', 'a', 4)], new Map([['a', r]]), [], 1).sun.filter((i) => /lemon/.test(i.name))).toHaveLength(2);
  });
});

describe('the walking order', () => {
  test('fresh, meat and nuts first; then cheese, pasta and dairy; then sauces and seasoning; then frozen', () => {
    const names = ['frozen peas', 'olive oil', 'cheddar', 'chicken thighs', 'spaghetti', 'red onion', 'ground cumin', 'almonds', 'Greek yoghurt',
      'tinned tomatoes', 'salmon fillets', 'fresh coriander', 'coriander seeds', 'bell pepper', 'black pepper', 'eggs', 'Whole milk', 'chicken stock',
      'frozen raspberries', 'peanut butter', 'basmati rice', 'sourdough loaf'];
    expect(names.map((n) => [n, aisle(n)])).toEqual([
      ['frozen peas', 5], ['olive oil', 2], ['cheddar', 1], ['chicken thighs', 0], ['spaghetti', 1], ['red onion', 0], ['ground cumin', 2],
      ['almonds', 0], ['Greek yoghurt', 1], ['tinned tomatoes', 2], ['salmon fillets', 0], ['fresh coriander', 0], ['coriander seeds', 2],
      ['bell pepper', 0], ['black pepper', 2], ['eggs', 1], ['Whole milk', 1], ['chicken stock', 2], ['frozen raspberries', 5], ['peanut butter', 0],
      ['basmati rice', 1], ['sourdough loaf', 3],
    ]);
  });

  test('accents are read as plain letters: tomato purée is a sauce, crème fraîche is dairy', () => {
    expect([aisle('tomato purée'), aisle('tomato puree'), aisle('crème fraîche')]).toEqual([2, 2, 1]);
  });

  test('toiletries and household things have their own part, just before frozen', () => {
    expect(['toothpaste', 'bin bags', 'washing-up liquid', 'Nappies', 'kitchen roll', 'sourdough loaf', 'frozen peas'].map((n) => aisle(n)))
      .toEqual([4, 4, 4, 4, 4, 3, 5]);
    expect(AISLES[4]).toBe('Toiletries & household');
    expect(AISLES[5]).toBe('Frozen');
  });

  test('a delivery comes back in walking order, keeping the order within each part', () => {
    const r = recipe('a', 4, [['frozen peas', 200, 'g'], ['olive oil', 1, 'tbsp'], ['cheddar', 90, 'g'], ['onion', 1, ''], ['beef mince', 500, 'g']]);
    expect(buildShoppingList([dinner('2026-10-19', 'a', 4)], new Map([['a', r]]), [], 1).sun.map((i) => i.name))
      .toEqual(['onion', 'beef mince', 'cheddar', 'olive oil', 'frozen peas']);
  });
});

describe('cupboard lines know their cupboard item, so ticking one can restock it', () => {
  test('a low or run-out staple line names its cupboard item and status', () => {
    const list = buildShoppingList([], recipes, [{ id: 'st-pap', ingredient_id: 'i', name: 'Paprika', status: 'out' }], 2);
    expect(list.sun.find((i) => i.key === 'staple|st-pap')!.staples).toEqual([{ id: 'st-pap', status: 'out' }]);
  });

  test('a line that covers a low staple names it too', () => {
    const list = buildShoppingList([dinner('2026-10-19', 'curry', 6)], recipes, [{ id: 's1', ingredient_id: 'i1', name: 'Tinned tomatoes', status: 'low' }], 2);
    expect(list.sun.find((i) => i.name === 'tinned tomatoes')!.staples).toEqual([{ id: 's1', status: 'low' }]);
  });

  test('a recipe line with no staple behind it names none', () => {
    const list = buildShoppingList([dinner('2026-10-19', 'curry', 6)], recipes, staples, 2);
    expect(list.sun.find((i) => i.name === 'onions')!.staples).toBeUndefined();
  });

  test('merged lines keep the staple', () => {
    const milky = recipe('custard', 4, [['milk', 500, 'ml'], ['whole milk', 2, 'tbsp']]);
    const list = buildShoppingList([dinner('2026-10-19', 'custard', 4)], new Map([['custard', milky]]),
      [{ id: 'st-milk', ingredient_id: 'i', name: 'Whole milk', status: 'low' }], 2);
    const milk = list.sun.filter((i) => /milk/i.test(i.name));
    expect(milk).toHaveLength(1);
    expect(milk[0].staples).toEqual([{ id: 'st-milk', status: 'low' }]);
  });
});

describe('check the cupboard: what the week uses that the pantry says you have', () => {
  test('each cupboard item the dinners use is listed once, with the amounts and the dinners, and not bought', () => {
    const list = buildShoppingList([dinner('2026-10-19', 'curry', 6), dinner('2026-10-20', 'curry', 3), dinner('2026-10-21', 'stew', 4)], recipes, staples, 2);
    expect(list.check).toEqual([
      { stapleId: 's1', name: 'Tinned tomatoes', amounts: [{ qty: 600, unit: 'g', approx: false }], forMeals: ['Mon curry', 'Tue curry'], neededBy: '2026-10-19' },
      { stapleId: 's2', name: 'Sea salt', amounts: [{ qty: null, unit: '', approx: false }], forMeals: ['Wed stew'], neededBy: '2026-10-21' },
    ]);
    expect(list.sun.map((i) => i.name)).not.toContain('tinned tomatoes');
  });

  test('low items are bought, not checked', () => {
    const list = buildShoppingList([dinner('2026-10-19', 'curry', 6)], recipes, [{ ...staples[0], status: 'low' }], 2);
    expect(list.check).toEqual([]);
  });

  test('"Need it": a cupboard item you need goes on the list as run out, restocks when ticked, and stays on after', () => {
    const list = buildShoppingList([dinner('2026-10-19', 'curry', 6)], recipes, staples, 2, [], undefined, new Set(['s1']));
    expect(list.check.map((c) => c.stapleId)).not.toContain('s1');
    const tomatoes = list.sun.find((i) => i.name === 'tinned tomatoes')!;
    expect(tomatoes.qty).toBe(400);
    expect(tomatoes.forMeals).toEqual(['Mon curry', 'Cupboard: run out']);
    expect(tomatoes.staples).toEqual([{ id: 's1', status: 'out' }]);
  });
});

test('a lunch cooked from a recipe is bought for, at its portions; a home or leftover lunch is not', () => {
  const lunch = (date: string, recipeId: string | null, mode: MealSlot['mode'], portions: number | null): MealSlot =>
    ({ ...dinner(date, recipeId, portions, mode), slot: 'lunch' });
  const list = buildShoppingList([lunch('2026-10-22', 'stew', 'cook', 2), lunch('2026-10-23', 'curry', 'reheat', null), lunch('2026-10-24', null, 'routine', null)], recipes, staples, 1);
  const beef = list.sun.find((i) => i.name === 'beef')!;
  expect(beef.qty).toBe(300);
  expect(beef.forMeals).toEqual(['Thu lunch: stew']);
  expect(list.sun.find((i) => i.name === 'baby spinach')).toBeUndefined();
});
