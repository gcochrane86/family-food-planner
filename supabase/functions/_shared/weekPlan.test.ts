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
    expect(db.writes().find((w) => w.table === 'recipes' && w.method === 'insert')?.payload).toMatchObject({ household_id: 'h1', slug: 'lemon-chicken', source: 'claude' });
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
