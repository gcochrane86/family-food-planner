import { HOW_TO_PLAN, makePlanner } from './askClaudePlan';
import { tableDb } from './testDb';

const NOW = new Date('2026-11-13T19:00:00Z'); // Friday evening in London: next week starts 2026-11-16
const RECIPES = [
  { id: 'r1', slug: 'thai-green-curry', title: 'Thai Green Curry', kind: 'meal', status: 'active' },
  { id: 'r2', slug: 'fish-pie', title: 'Classic Fish Pie', kind: 'meal', status: 'active' },
  { id: 'r3', slug: 'fish-tacos', title: 'Fish Tacos', kind: 'meal', status: 'active' },
];
const deps = (save = vi.fn(async () => ({ added: 0 }))) => ({
  context: vi.fn(async () => ({ week: { start: '2026-11-16' } }) as never),
  loadInput: vi.fn(async () => ({ days: 5, recipes: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] }) as never),
  save,
});
const world = (o: Record<string, unknown> = {}) => tableDb({ recipes: RECIPES, 'settings:one': { data: { adventure: 1 } }, 'week_plan_requests:single': { id: 'new-req' }, ...o });
const plan = (dinners: { date: string; recipe: string }[], extra = {}) => ({ week: 'next', summary: 'A good week.', dinners: dinners.map((d) => ({ ...d, reason: 'Because' })), ...extra });

test('the context explains how to plan, then gives the week as JSON', async () => {
  const d = deps();
  const out = await makePlanner(world(), 'h1', NOW, d).context({});
  expect(d.context).toHaveBeenCalledWith(expect.anything(), 'h1', '2026-11-16');
  expect(out).toMatch(/Meal specifications/);
  expect(out).toMatch(/save_week_plan/);
  expect(out).toContain('"start": "2026-11-16"');
});

test('dinners can be named by title; the plan is saved through a new planning request', async () => {
  const d = deps();
  const db = world();
  const out = await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'thai green curry' }, { date: '2026-11-17', recipe: 'fish-pie' }]));
  const insert = db.writes().find((w) => w.table === 'week_plan_requests' && w.method === 'insert');
  expect(insert?.payload).toMatchObject({ household_id: 'h1', week_start: '2026-11-16', status: 'planning', replace: true });
  expect(d.save).toHaveBeenCalledWith(db, 'h1', 'new-req', '2026-11-16', expect.objectContaining({ dinners: [
    { date: '2026-11-16', recipe: 'thai-green-curry', reason: 'Because' }, { date: '2026-11-17', recipe: 'fish-pie', reason: 'Because' },
  ] }), { choices: null });
  expect(out).toMatch(/Saved a draft for the week of Mon 16 Nov/);
  expect(out).toMatch(/Mon 16 Nov: Thai Green Curry/);
  expect(out).toMatch(/approve it in the app/i);
});

test("a day's own cooking time from the household's note is saved with the week, and said back", async () => {
  const d = deps();
  const out = await makePlanner(world(), 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }], { cooking_minutes: { '2026-11-18': 120 } }));
  expect(d.save).toHaveBeenCalledWith(expect.anything(), 'h1', 'new-req', '2026-11-16', expect.objectContaining({ cookingMinutes: { '2026-11-18': 120 } }), { choices: null });
  expect(out).toMatch(/Cooking time: Wed 18 Nov 2 hours/);
});

test('how to plan fits each day to its cooking time', () => {
  expect(HOW_TO_PLAN).toMatch(/rules\.cookingTime/);
  expect(HOW_TO_PLAN).toMatch(/cooking_minutes/);
  expect(HOW_TO_PLAN).not.toMatch(/todaysHour/);
});

test('an open request for that week is taken over, not doubled', async () => {
  const d = deps();
  const db = world({ 'week_plan_requests:one': { id: 'open-req', status: 'requested' } });
  await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }]));
  expect(db.writes().some((w) => w.table === 'week_plan_requests' && w.method === 'insert')).toBe(false);
  expect(db.writes().find((w) => w.table === 'week_plan_requests' && w.method === 'update')?.payload).toMatchObject({ status: 'planning', replace: true });
  expect(d.save).toHaveBeenCalledWith(db, 'h1', 'open-req', '2026-11-16', expect.anything(), expect.anything());
});

test('nothing is written for an ambiguous title, a past week, or an approved week', async () => {
  for (const [db, args, says] of [
    [world(), plan([{ date: '2026-11-16', recipe: 'fish' }]), /Several recipes match/],
    [world(), { ...plan([{ date: '2026-11-02', recipe: 'fish-pie' }]), week: '2026-11-02' }, /has passed/],
    [world({ 'plan_weeks:one': { status: 'approved' } }), plan([{ date: '2026-11-16', recipe: 'fish-pie' }]), /already approved/],
  ] as const) {
    const d = deps();
    expect(await makePlanner(db, 'h1', NOW, d).save(args as never)).toMatch(says);
    expect(db.writes()).toEqual([]);
    expect(d.save).not.toHaveBeenCalled();
  }
});

test("when saving fails, the request is closed with why and Claude is told", async () => {
  const d = deps(vi.fn(async () => { throw new Error('That week was approved while planning, so it was left as it is.'); }));
  const db = world();
  const out = await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }]));
  expect(out).toMatch(/Couldn't save the week: That week was approved while planning/);
  expect(db.writes().find((w) => w.table === 'week_plan_requests' && w.method === 'update')?.payload).toMatchObject({ status: 'failed' });
});

describe('review fixes', () => {
  test('a recipe in draft status can be planned (only archived ones are out)', async () => {
    const d = deps();
    const db = world({ recipes: [...RECIPES, { id: 'r4', slug: 'new-stew', title: 'New Stew', kind: 'meal', status: 'draft' }] });
    await makePlanner(db, 'h1', NOW, { ...d, loadInput: vi.fn(async () => ({ days: 5, recipes: [{ id: 'r4' }] }) as never) }).save(plan([{ date: '2026-11-16', recipe: 'New Stew' }]));
    expect(d.save).toHaveBeenCalled();
  });

  test("Claude's fixable mistakes are reported without opening (or failing) a plan request", async () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, RegExp][] = [
      [{}, plan([{ date: '2026-11-16', recipe: 'fish-pie' }], { new_recipes: [{ slug: 'fish-pie', title: 'Another Fish Pie', kind: 'meal', protein: 'fish', base_portions: 4, ingredients: [{ name: 'cod', qty: 400, unit: 'g' }], steps: [{ phase: 'finish', title: 'Bake', body: 'Bake the **cod**.' }] }] }), /already exists/],
      [{ recipes: [{ id: 'r1' }] }, plan([{ date: '2026-11-16', recipe: 'fish-pie' }]), /Not plannable/],
    ];
    for (const [input, args, says] of cases) {
      const d = deps();
      const db = world();
      const out = await makePlanner(db, 'h1', NOW, { ...d, loadInput: vi.fn(async () => ({ days: 5, recipes: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }], ...input }) as never) }).save(args as never);
      expect(out).toMatch(says);
      expect(db.writes()).toEqual([]);
    }
  });

  test("the household's note isn't filled with Claude's summary", async () => {
    const db = world();
    await makePlanner(db, 'h1', NOW, deps()).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }]));
    expect(db.writes().find((w) => w.table === 'week_plan_requests' && w.method === 'insert')?.payload).toMatchObject({ note: null });
  });

  test("this week's days that have passed can't be replanned", async () => {
    const thursday = new Date('2026-11-12T12:00:00Z');
    const db = world();
    const out = await makePlanner(db, 'h1', thursday, deps()).save({ ...plan([{ date: '2026-11-10', recipe: 'fish-pie' }]), week: 'this' } as never);
    expect(out).toMatch(/has passed/);
    expect(db.writes()).toEqual([]);
  });

  test('replacing a draft is called out in how to plan', async () => {
    expect(await makePlanner(world(), 'h1', NOW, deps()).context({})).toMatch(/existing is "draft".*replace/i);
  });
});

describe("the week's choices from the app", () => {
  const choices = {
    office: {}, nightsOff: ['2026-11-18'], prepDays: [], weekdayMaxMin: 30, newRecipes: 2, useUp: [],
    cookingMinutes: { '2026-11-16': 60, '2026-11-17': 90, '2026-11-18': 60, '2026-11-19': 60, '2026-11-20': 60, '2026-11-21': 60, '2026-11-22': 60 },
  };
  const NEWR = (slug: string) => ({ slug, title: slug, kind: 'meal', protein: 'chicken', base_portions: 4,
    ingredients: [{ name: 'chicken thigh', qty: 800, unit: 'g', note: 'cut into 3cm chunks' }],
    steps: [{ phase: 'finish', title: 'Cook', body: 'Cook the **chicken thigh**.', picture: 'Chicken browning in a frying pan on the hob' }] });
  const open = () => world({ 'week_plan_requests:one': { id: 'open-req', status: 'requested' },
    week_plan_requests: [{ choices, summary: null, status: 'requested', requested_at: '2026-11-13T19:00:00Z' }] });

  test('a second save in the same chat still keeps the night off', async () => {
    const d = deps();
    const db = world({ week_plan_requests: [{ choices, summary: 'A good week.', status: 'done', requested_at: '2026-11-13T19:00:00Z' }] });
    const out = await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-18', recipe: 'fish-pie' }]));
    expect(out).toMatch(/Wed 18 Nov is a night off/);
    expect(d.save).not.toHaveBeenCalled();
  });

  test('a dinner on a night off is refused before the request is taken over', async () => {
    const d = deps();
    const db = open();
    const out = await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-18', recipe: 'fish-pie' }]));
    expect(out).toMatch(/Wed 18 Nov is a night off/);
    expect(d.save).not.toHaveBeenCalled();
    expect(db.writes()).toEqual([]);
  });

  test('the new-recipe allowance is the one chosen, and the chosen times are saved with the week', async () => {
    const d = deps();
    const out = await makePlanner(open(), 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }], { new_recipes: [NEWR('a-one'), NEWR('a-two')] }));
    expect(out).not.toMatch(/at most/);
    expect(d.save).toHaveBeenCalledWith(expect.anything(), 'h1', 'open-req', '2026-11-16',
      expect.objectContaining({ cookingMinutes: { '2026-11-17': 90 } }), expect.objectContaining({ choices: expect.objectContaining({ newRecipes: 2 }) }));
    const three = await makePlanner(open(), 'h1', NOW, deps()).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }], { new_recipes: [NEWR('b-one'), NEWR('b-two'), NEWR('b-three')] }));
    expect(three).toMatch(/at most 2 new recipes/);
  });

  test('how to plan covers nights off, prep days and use-up', () => {
    expect(HOW_TO_PLAN).toMatch(/rules\.nightsOff/);
    expect(HOW_TO_PLAN).toMatch(/rules\.prepDays/);
    expect(HOW_TO_PLAN).toMatch(/rules\.useUp/);
    expect(HOW_TO_PLAN).toMatch(/rules\.choicesMadeOn/);
  });
});

describe('snacks', () => {
  const snackWorld = (o: Record<string, unknown> = {}) => world({
    recipes: [...RECIPES, { id: 's1', slug: 'hummus', title: 'Beetroot Hummus', kind: 'snack', status: 'active' }],
    'settings:one': { data: { adventure: 1, prep_days: [6] } }, ...o,
  });
  test('a snack can be named by title, made the Sunday before the week', async () => {
    const d = deps();
    await makePlanner(snackWorld(), 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }],
      { snacks: [{ recipe: 'beetroot hummus', slot: 'am', make_date: '2026-11-15', covers: ['2026-11-16'] }] }));
    expect(d.save).toHaveBeenCalledWith(expect.anything(), 'h1', 'new-req', '2026-11-16',
      expect.objectContaining({ snacks: [{ recipe: 'hummus', slot: 'snack_am', makeDate: '2026-11-15', covers: ['2026-11-16'] }] }), expect.anything());
  });
  test('a snack on a day that isn’t a prep day is sent back to fix', async () => {
    const d = deps();
    const out = await makePlanner(snackWorld(), 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }],
      { snacks: [{ recipe: 'hummus', slot: 'am', make_date: '2026-11-17', covers: ['2026-11-17'] }] }));
    expect(out).toMatch(/isn't a snack-making day. Use one of 2026-11-15/);
    expect(d.save).not.toHaveBeenCalled();
  });
  test('a dinner can’t be a snack recipe', async () => {
    const out = await makePlanner(snackWorld(), 'h1', NOW, deps()).save(plan([{ date: '2026-11-16', recipe: 'beetroot hummus' }]));
    expect(out).toMatch(/No recipe called "beetroot hummus"/);
  });
  test('how to plan asks for estimates first and aims snacks at the gaps', () => {
    expect(HOW_TO_PLAN).toMatch(/save_nutrition/);
    expect(HOW_TO_PLAN).toMatch(/builtInBalance/);
    expect(HOW_TO_PLAN).toMatch(/snackMakeDates/);
  });
});
