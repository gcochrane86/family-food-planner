import { parsePlan, saveWeekPlan } from './weekPlan';
import { tableDb } from './testDb';

const WEEK = { weekStart: '2026-11-16', days: 7, adventure: 1 };
const dinner = (date: string, recipe = 'curry') => ({ date, recipe, reason: 'Chicken · 30 min' });
const NEW = {
  slug: 'lemon-chicken', title: 'Lemon Chicken', kind: 'meal', protein: 'chicken', base_portions: 4,
  ingredients: [{ name: 'chicken thigh', qty: 800, unit: 'g', note: 'cut into 3cm chunks' }],
  steps: [{ phase: 'finish', title: 'Cook', body: 'Cook the **chicken thigh**.', picture: 'Chicken browning in a frying pan on the hob' }],
};

describe('parsePlan', () => {
  test('a summary, dinners in the week, and up to the allowed new recipes', () => {
    const plan = parsePlan({ summary: 'A balanced week.', dinners: [dinner('2026-11-16')], new_recipes: [NEW] }, WEEK);
    expect(plan.dinners).toEqual([dinner('2026-11-16')]);
    expect(plan.newRecipes[0]).toMatchObject({ slug: 'lemon-chicken', source: 'claude', status: 'active' });
  });
  test('refuses a date outside the week, two dinners on one date, too many new recipes, and a broken recipe', () => {
    expect(() => parsePlan({ summary: 'x', dinners: [dinner('2026-11-23')] }, WEEK)).toThrow(/not in the week/);
    expect(() => parsePlan({ summary: 'x', dinners: [dinner('2026-11-16'), dinner('2026-11-16', 'stew')] }, WEEK)).toThrow(/two dinners on 2026-11-16/);
    expect(() => parsePlan({ summary: 'x', dinners: [dinner('2026-11-16')], new_recipes: [NEW, { ...NEW, slug: 'b' }] }, WEEK)).toThrow(/at most 1 new recipe/);
    expect(() => parsePlan({ summary: 'x', dinners: [dinner('2026-11-16')], new_recipes: [{ ...NEW, title: '' }] }, WEEK)).toThrow(/title missing/);
  });
});

describe("a week's own cooking times", () => {
  test('kept for days in the week, 30–240 minutes, whole minutes; anything else dropped', () => {
    const plan = parsePlan({ summary: 'x', dinners: [dinner('2026-11-16')], cooking_minutes: { '2026-11-18': 120, '2026-11-19': 92.6, '2026-11-25': 90, '2026-11-20': 10, '2026-11-21': 'lots' } }, WEEK);
    expect(plan.cookingMinutes).toEqual({ '2026-11-18': 120, '2026-11-19': 93 });
    expect(parsePlan({ summary: 'x', dinners: [dinner('2026-11-16')] }, WEEK).cookingMinutes).toBeNull();
  });
  test('saved with the week, and the planner around the dinners uses them', async () => {
    const db = tableDb({ recipes: [{ id: 'r-curry', slug: 'curry' }] });
    let seen: number[] | undefined;
    const plan = parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-16')], cooking_minutes: { '2026-11-18': 120 } }, WEEK);
    await saveWeekPlan(db, 'h1', 'req1', '2026-11-16', plan, {
      loadInput: async () => ({ days: 7, recipes: [{ id: 'r-curry' }], dayMinutes: [60, 60, 60, 60, 60, 60, 60] }) as never,
      propose: (input) => { seen = input.dayMinutes; return []; },
    });
    expect(seen).toEqual([60, 60, 120, 60, 60, 60, 60]);
    expect(db.rpcs.at(-1)!.args).toMatchObject({ p_cooking: { '2026-11-18': 120 } });
  });
});

describe('saveWeekPlan', () => {
  const input = { days: 7, recipes: [{ id: 'r-curry', handsOn: 20 }, { id: 'r-new', handsOn: 20 }] };
  const deps = {
    loadInput: async () => input as never,
    propose: () => [{ date: '2026-11-16', slot: 'dinner', recipe_id: 'r-curry', mode: 'cook' }] as never,
  };

  test('adds the new recipes, then saves the week through save_claude_week', async () => {
    const db = tableDb({ recipes: [{ id: 'r-curry', slug: 'curry' }], 'recipes:single': { id: 'r-new' } });
    const plan = parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-16'), dinner('2026-11-17', 'lemon-chicken')], new_recipes: [NEW] }, WEEK);
    expect(await saveWeekPlan(db, 'h1', 'req1', '2026-11-16', plan, deps)).toEqual({ added: 1 });
    expect(db.writes().find((w) => w.table === 'recipes' && w.method === 'insert')?.payload).toMatchObject({ household_id: 'h1', slug: 'lemon-chicken', source: 'claude', planned_for: '2026-11-16' });
    expect(db.rpcs.map((r) => r.fn)).toEqual(['replace_recipe_contents', 'save_claude_week']);
    expect(db.rpcs[1].args).toMatchObject({ p_request: 'req1', p_days: 7, p_summary: 'A week.' });
  });

  test("a week approved meanwhile: the request closes with why, and the new recipe is removed again", async () => {
    const db = tableDb({ recipes: [{ id: 'r-curry', slug: 'curry' }], 'recipes:single': { id: 'r-new' }, 'rpc:save_claude_week': { data: null, error: { message: 'week_approved' } } });
    const plan = parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-17', 'lemon-chicken')], new_recipes: [NEW] }, WEEK);
    await expect(saveWeekPlan(db, 'h1', 'req1', '2026-11-16', plan, deps)).rejects.toThrow(/approved while planning/);
    const writes = db.writes();
    expect(writes.find((w) => w.table === 'recipes' && w.method === 'delete')).toBeTruthy();
    expect(writes.find((w) => w.table === 'week_plan_requests' && w.method === 'update')?.payload).toMatchObject({ status: 'failed', summary: 'That week was approved while planning, so it was left as it is.' });
  });

  test('an unknown recipe is refused before anything is written', async () => {
    const db = tableDb({ recipes: [{ id: 'r-curry', slug: 'curry' }] });
    const plan = parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-16', 'mystery-pie')] }, WEEK);
    await expect(saveWeekPlan(db, 'h1', 'req1', '2026-11-16', plan, deps)).rejects.toThrow(/No recipe "mystery-pie"/);
    expect(db.writes()).toEqual([]);
    expect(db.rpcs).toEqual([]);
  });
});

describe('planContext', () => {
  test("gives Claude each day's cooking time, and each recipe's prep and cook hands-on", async () => {
    const { planContext } = await import('./weekPlan');
    const db = tableDb({
      'settings:one': { data: { cooking_minutes: { wed: 120 } } },
      recipes: [{ id: 'r1', slug: 'curry', title: 'Curry', kind: 'meal', status: 'active', protein: 'chicken', finish_minutes: 30, prep_minutes: 10, hands_off_minutes: 20, reheats_well: false, base_portions: 4, recipe_ingredients: [] }],
    });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    expect(ctx.rules.cookingTime[2]).toEqual({ date: '2026-11-18', day: 'Wednesday', minutes: 120 });
    expect(ctx.rules.cookingTime[0].minutes).toBe(60);
    expect(ctx.rules).not.toHaveProperty('todaysHour');
    expect(ctx.recipes[0]).toMatchObject({ prepMinutes: 10, cookHandsOn: 10 });
  });
});

describe('the week’s choices (Plan with Claude)', () => {
  const choices = {
    office: { a: [0] }, nightsOff: ['2026-11-18'], prepDays: [6], weekdayMaxMin: 30, newRecipes: 2, useUp: ['Lamb mince (freezer)'],
    cookingMinutes: { '2026-11-16': 60, '2026-11-17': 60, '2026-11-18': 60, '2026-11-19': 60, '2026-11-20': 90, '2026-11-21': 60, '2026-11-22': 120 },
  };
  test('planContext reads the open request and plans with its choices', async () => {
    const { planContext } = await import('./weekPlan');
    const db = tableDb({
      'settings:one': { data: { adventure: 1 } },
      members: [{ id: 'a', kind: 'adult', portion_weight: 1 }],
      member_week_pattern: [{ member_id: 'a', weekday: 1, office: true }],
      week_plan_requests: [{ choices, summary: null, status: 'requested', requested_at: '2026-11-13T19:00:00Z' }],
      recipes: [{ id: 'r1', slug: 'curry', title: 'Curry', kind: 'meal', status: 'active', protein: 'chicken', finish_minutes: 30, reheats_well: false, base_portions: 4, recipe_ingredients: [] }],
    });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    expect(ctx.week.dates[0]).toMatchObject({ office: true, nightOff: false, prepDay: false });
    expect(ctx.week.dates[1].office).toBe(false);
    expect(ctx.week.dates[2].nightOff).toBe(true);
    expect(ctx.week.dates[6].prepDay).toBe(true);
    expect(ctx.rules.cookingTime[4].minutes).toBe(90);
    expect(ctx.rules).toMatchObject({ nightsOff: ['2026-11-18'], prepDays: ['Sunday'], useUp: ['Lamb mince (freezer)'], newRecipesAllowed: 2 });
    expect(ctx.builtInProposal.find((d) => d.date === '2026-11-18')?.recipe).toBeNull();
    expect(ctx.rules.choicesMadeOn).toBe('2026-11-13');
  });

  test('after a save, the week keeps the choices it was planned with (a second save in the same chat)', async () => {
    const { planContext } = await import('./weekPlan');
    const db = tableDb({
      members: [{ id: 'a', kind: 'adult', portion_weight: 1 }],
      week_plan_requests: [{ choices, summary: 'A good week.', status: 'done', requested_at: '2026-11-13T19:00:00Z' }],
    });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    expect(ctx.rules.nightsOff).toEqual(['2026-11-18']);
  });

  test('a request the household cancelled leaves the usual week', async () => {
    const { planContext } = await import('./weekPlan');
    const db = tableDb({
      members: [{ id: 'a', kind: 'adult', portion_weight: 1 }],
      week_plan_requests: [{ choices, summary: 'Cancelled', status: 'failed', requested_at: '2026-11-13T19:00:00Z' }],
    });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    expect(ctx.rules.nightsOff).toEqual([]);
    expect(ctx.rules.choicesMadeOn).toBeNull();
  });

  test('with no open request the usual week is planned, as before', async () => {
    const { planContext } = await import('./weekPlan');
    const db = tableDb({ 'settings:one': { data: { adventure: 1 } }, members: [{ id: 'a', kind: 'adult', portion_weight: 1 }], member_week_pattern: [{ member_id: 'a', weekday: 1, office: true }] });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    expect(ctx.week.dates[1].office).toBe(true);
    expect(ctx.rules).toMatchObject({ nightsOff: [], prepDays: [], useUp: [], newRecipesAllowed: 1 });
  });

  test('the save refuses a dinner on a night off before anything is written, and saves the office and prep days', async () => {
    const db = tableDb({ recipes: [{ id: 'r-curry', slug: 'curry' }] });
    const deps = { loadInput: async () => ({ days: 7, recipes: [{ id: 'r-curry' }] }) as never, propose: () => [] as never, choices };
    const bad = parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-18')] }, WEEK);
    await expect(saveWeekPlan(db, 'h1', 'req1', '2026-11-16', bad, deps)).rejects.toThrow(/Wed 18 Nov is a night off/);
    expect(db.rpcs).toEqual([]);
    const good = parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-17')] }, WEEK);
    await saveWeekPlan(db, 'h1', 'req1', '2026-11-16', good, deps);
    expect(db.rpcs.at(-1)!.args).toMatchObject({ p_office: { a: [0] }, p_prep: [6] });
  });

  test('loadPlannerInput uses a planned week’s own office days', async () => {
    const { loadPlannerInput } = await import('./loadPlan');
    const db = tableDb({ members: [{ id: 'a', kind: 'adult', portion_weight: 1 }], member_week_pattern: [{ member_id: 'a', weekday: 1, office: true }], 'plan_weeks:one': { office_days: { a: [3] } } });
    expect((await loadPlannerInput(db, 'h1', '2026-11-16')).officeDays).toEqual([3]);
  });
});

test("loadPlannerInput with choices only counts adults' office days", async () => {
  const { loadPlannerInput } = await import('./loadPlan');
  const db = tableDb({ members: [{ id: 'a', kind: 'adult', portion_weight: 1 }, { id: 'kid', kind: 'child', portion_weight: 0.5 }] });
  const choices = { office: { a: [0], kid: [2], gone: [4] }, nightsOff: [], prepDays: [], weekdayMaxMin: 30, newRecipes: 1, useUp: [], cookingMinutes: {} };
  expect((await loadPlannerInput(db, 'h1', '2026-11-16', choices)).officeDays).toEqual([0]);
});

describe('snacks and nutrition (daily balance)', () => {
  const N = { protein_g: 30, fibre_g: 10, veg_portions: 2, fruit_portions: 0, healthy_fat: true, oily_fish: false, legumes: false, red_meat: false, processed_meat: false, free_sugars_g: 0 };
  test('the context lists snack recipes, the snack-making days, what has no estimate yet, and the proposal’s balance', async () => {
    const { planContext } = await import('./weekPlan');
    const db = tableDb({
      'settings:one': { data: { prep_days: [2, 6], breakfasts: ['Eggs & porridge', 'Overnight oats'], lunches: ['Sandwich'], routine_nutrition: { 'Eggs & porridge': N } } },
      members: [{ id: 'a', kind: 'adult', portion_weight: 1 }],
      recipes: [
        { id: 'r1', slug: 'curry', title: 'Curry', kind: 'meal', status: 'active', protein: 'chicken', finish_minutes: 30, reheats_well: false, base_portions: 4, recipe_ingredients: [], nutrition: N },
        { id: 'r2', slug: 'pie', title: 'Pie', kind: 'meal', status: 'active', protein: 'fish', finish_minutes: 30, reheats_well: false, base_portions: 4, recipe_ingredients: [], nutrition: null },
        { id: 's1', slug: 'hummus', title: 'Hummus', kind: 'snack', status: 'active', keeps_days: 4, toddler_ok: true, recipe_ingredients: [], nutrition: N },
      ],
    });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    expect(ctx.rules.snackMakeDates).toEqual(['2026-11-15', '2026-11-18', '2026-11-22']);
    expect(ctx.snackRecipes.map((r: { slug: string }) => r.slug)).toEqual(['hummus']);
    expect(ctx.recipes.map((r: { slug: string }) => r.slug)).not.toContain('hummus');
    expect(ctx.nutritionMissing.recipes).toEqual(['pie']);
    expect(ctx.nutritionMissing.routines).toEqual(expect.arrayContaining(['Overnight oats', 'Sandwich', 'Packed lunch']));
    expect(ctx.nutritionMissing.routines).not.toContain('Eggs & porridge');
    expect(ctx.builtInBalance[0]).toHaveProperty('date', '2026-11-16');
  });

  const SNACKS = [{ id: 'r-curry', slug: 'curry' }, { id: 'r-egg', slug: 'boiled-egg', title: 'Boiled egg', kind: 'snack', status: 'active', keeps_days: 5, toddler_ok: true },
    { id: 'r-nuts', slug: 'nuts', title: 'Apple & almonds', kind: 'snack', status: 'active', keeps_days: 2, toddler_ok: false }];
  const PEOPLE = [{ id: 'm-a', name: 'Adult A', kind: 'adult' }, { id: 'm-t', name: 'Little', kind: 'child' }];
  const save = (db: ReturnType<typeof tableDb>, raw: Record<string, unknown>) => saveWeekPlan(db, 'h1', 'req1', '2026-11-16',
    parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-16')], ...raw }, WEEK),
    { loadInput: async () => ({ days: 7, recipes: [{ id: 'r-curry' }] }) as never, propose: () => [] as never, choices: { prepDays: [6] } as never });

  test("the save sends each person's snacks and new meal partners with the week", async () => {
    const db = tableDb({ recipes: SNACKS, members: PEOPLE, 'settings:one': { data: { breakfasts: ['Overnight oats'] } } });
    await save(db, {
      snacks: [{ person: 'Adult A', date: '2026-11-17', slot: 'pm', recipe: 'Boiled egg', qty: 2, make_date: '2026-11-15' }],
      partners: [{ meal: 'Overnight oats', person: 'Little', recipe: 'boiled-egg', qty: 1 }],
    });
    expect(db.rpcs.at(-1)!.args).toMatchObject({
      p_eats: [{ date: '2026-11-17', slot: 'snack_pm', member_id: 'm-a', recipe_id: 'r-egg', qty: 2, make_date: '2026-11-15' }],
      p_partners: { 'Overnight oats': { 'm-t': [{ recipe: 'boiled-egg', qty: 1 }] } },
    });
  });

  test('a nut snack for the toddler is refused, and nothing is saved', async () => {
    const db = tableDb({ recipes: SNACKS, members: PEOPLE });
    await expect(save(db, { snacks: [{ person: 'Little', date: '2026-11-16', slot: 'am', recipe: 'nuts', qty: 1, make_date: '2026-11-15' }] }))
      .rejects.toThrow(/isn't toddler-friendly/);
    expect(db.rpcs.map((r) => r.fn)).not.toContain('save_claude_week');
  });

  test('a snack recipe that isn’t known is refused before anything is written', async () => {
    const db = tableDb({ recipes: SNACKS, members: PEOPLE });
    await expect(save(db, { snacks: [{ person: 'Adult A', recipe: 'mystery', date: '2026-11-16', slot: 'pm', make_date: '2026-11-15' }] }))
      .rejects.toThrow(/No snack recipe "mystery"/);
    expect(db.rpcs).toEqual([]);
  });

  test('the context names each person and their partners, and counts partners in their day', async () => {
    const { planContext } = await import('./weekPlan');
    const E = { ...N, protein_g: 6, kcal: 75 };
    const db = tableDb({
      'settings:one': { data: { breakfasts: ['Overnight oats'], routine_nutrition: { 'Overnight oats': { ...N, kcal: 300 } }, meal_partners: { 'Overnight oats': { 'm-a': [{ recipe: 'boiled-egg', qty: 2 }] } } } },
      members: [{ id: 'm-a', name: 'Adult A', kind: 'adult', portion_weight: 1 }],
      recipes: [{ id: 'r-egg', slug: 'boiled-egg', title: 'Boiled egg', kind: 'snack', status: 'active', keeps_days: 5, toddler_ok: true, recipe_ingredients: [], nutrition: E }],
    });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    expect(ctx.partners).toEqual([{ meal: 'Overnight oats', person: 'Adult A', recipe: 'boiled-egg', qty: 2 }]);
    expect(ctx.members[0]).not.toHaveProperty('id');
    const monday = ctx.builtInBalance[0].people[0];
    expect(monday.totals.kcal).toBeGreaterThanOrEqual(300 + 2 * 75);
  });
});

test('snack recipes without an estimate are listed too', async () => {
  const { planContext } = await import('./weekPlan');
  const db = tableDb({ members: [{ id: 'a', kind: 'adult', portion_weight: 1 }],
    recipes: [{ id: 's1', slug: 'hummus', title: 'Hummus', kind: 'snack', status: 'active', keeps_days: 4, recipe_ingredients: [], nutrition: null }] });
  expect((await planContext(db as never, 'h1', '2026-11-16')).nutritionMissing.recipes).toEqual(['hummus']);
});

test("the proposal's balance gives each person's day against their targets", async () => {
  const { planContext } = await import('./weekPlan');
  const N = { protein_g: 20, fibre_g: 5, veg_portions: 1, fruit_portions: 0, healthy_fat: false, oily_fish: false, legumes: false, red_meat: false, processed_meat: false, kcal: 500, sugars_g: 10 };
  const db = tableDb({
    'settings:one': { data: { routine_nutrition: { 'Overnight oats': N, 'Baked oats': N, 'Eggs & porridge': N, 'Packed lunch': N, 'Chicken sandwich': N } } },
    members: [{ id: 'a', name: 'A', kind: 'adult', portion_weight: 1.25, targets: { protein_g: 90, sugars_g: 30 } }],
    recipes: [{ id: 'r1', slug: 'curry', title: 'Curry', kind: 'meal', status: 'active', protein: 'chicken', finish_minutes: 30, reheats_well: false, base_portions: 4, recipe_ingredients: [], nutrition: N }],
  });
  const day = (await planContext(db as never, 'h1', '2026-11-16')).builtInBalance[0];
  expect(day.people).toEqual([expect.objectContaining({ name: 'A', targets: { protein_g: 90, sugars_g: 30 }, off: ['under protein_g', 'over sugars_g'] })]);
  expect(day.people[0].totals.protein_g).toBe(75);
});

describe('snacks from any recipe, quick snacks, and the household\'s own', () => {
  const N = { protein_g: 8, fibre_g: 4, veg_portions: 0, fruit_portions: 0, healthy_fat: true, oily_fish: false, legumes: false, red_meat: false, processed_meat: false, kcal: 400 };
  test('the context lists recipes that can be snacks and quick snacks, per snack, and the snacks the household added', async () => {
    const { planContext } = await import('./weekPlan');
    const db = tableDb({
      members: [{ id: 'm-a', name: 'Adult A', kind: 'adult', portion_weight: 1.25 }],
      recipes: [
        { id: 'r-oats', slug: 'baked-oats', title: 'Baked oats', kind: 'component', status: 'active', snack_ok: true, snack_portions: 8, base_portions: 4, keeps_days: 3, toddler_ok: true, recipe_ingredients: [], nutrition: N },
        { id: 'r-apple', slug: 'apple-almonds', title: 'Apple & almonds', kind: 'snack', quick: true, status: 'active', base_portions: 1, toddler_ok: false, recipe_ingredients: [], nutrition: null },
      ],
      'plan_weeks:one': { id: 'w1', status: 'draft' },
      snack_eats: [{ date: '2026-11-17', slot: 'snack_pm', member_id: 'm-a', recipe_id: 'r-apple', qty: 1, added_by: 'household' }],
    });
    const ctx = await planContext(db as never, 'h1', '2026-11-16');
    const oats = ctx.snackRecipes.find((r: { slug: string }) => r.slug === 'baked-oats');
    expect(oats).toMatchObject({ snackPortion: '1 of 8 from a batch (half a serving)', quick: false });
    expect(oats.nutrition.kcal).toBe(200);
    expect(ctx.snackRecipes.find((r: { slug: string }) => r.slug === 'apple-almonds')).toMatchObject({ quick: true });
    expect(ctx.nutritionMissing.recipes).toContain('apple-almonds');
    expect(ctx.householdSnacks).toEqual([{ person: 'Adult A', date: '2026-11-17', slot: 'pm', recipe: 'apple-almonds', qty: 1 }]);
  });

  test("Claude's quick snack needs no make day, and a recipe that can be a snack is accepted", async () => {
    const db = tableDb({ recipes: [{ id: 'r-curry', slug: 'curry' }, { id: 'r-apple', slug: 'apple-almonds', title: 'Apple & almonds', kind: 'snack', quick: true, status: 'active' },
      { id: 'r-oats', slug: 'baked-oats', title: 'Baked oats', kind: 'component', snack_ok: true, status: 'active', keeps_days: 3 }], members: [{ id: 'm-a', name: 'Adult A', kind: 'adult' }] });
    await saveWeekPlan(db, 'h1', 'req1', '2026-11-16', parsePlan({ summary: 'A week.', dinners: [dinner('2026-11-16')], snacks: [
      { person: 'Adult A', date: '2026-11-18', slot: 'pm', recipe: 'apple-almonds' },
      { person: 'Adult A', date: '2026-11-17', slot: 'am', recipe: 'baked-oats', qty: 1, make_date: '2026-11-15' },
    ] }, WEEK), { loadInput: async () => ({ days: 7, recipes: [{ id: 'r-curry' }] }) as never, propose: () => [] as never, choices: { prepDays: [6] } as never });
    expect((db.rpcs.at(-1)!.args as { p_eats: unknown[] }).p_eats).toEqual([
      expect.objectContaining({ recipe_id: 'r-apple', make_date: '2026-11-18' }), expect.objectContaining({ recipe_id: 'r-oats', make_date: '2026-11-15' }),
    ]);
  });
});

test('a new quick snack needs no steps', async () => {
  const { validateRecipeSeed } = await import('./recipeSeed');
  expect(validateRecipeSeed({ recipes: [{ slug: 'pear-walnuts', title: 'Pear & walnuts', kind: 'snack', quick: true, keeps_days: 1, base_portions: 1, source: 'claude',
    ingredients: [{ name: 'pear', qty: 1, unit: '' }, { name: 'walnuts', qty: 20, unit: 'g' }], steps: [], nutrition: { protein_g: 3, fibre_g: 6, veg_portions: 0, fruit_portions: 1,
      healthy_fat: true, oily_fish: false, legumes: false, red_meat: false, processed_meat: false } }] })).toEqual([]);
});
