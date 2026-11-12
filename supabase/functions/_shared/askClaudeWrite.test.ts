import { changeWindow, makeChanger } from './askClaudeWrite';
import { tableDb } from './testDb';

const NOW = new Date('2026-11-12T20:00:00Z'); // Thursday evening in London

test('changes are allowed from today to the end of next week', () => {
  expect(changeWindow('2026-11-12', NOW)).toEqual({ weekStart: '2026-11-09' });
  expect(changeWindow('2026-11-22', NOW)).toEqual({ weekStart: '2026-11-16' });
  expect(changeWindow('2026-11-11', NOW)).toEqual({ error: 'That day has passed.' });
  expect(changeWindow('2026-11-23', NOW)).toEqual({ error: 'Only this week and next can be changed.' });
  expect(changeWindow('tomorrow', NOW)).toEqual({ error: 'Use a date like 2026-11-16.' });
});

const recipe = (id: string, title: string, o = {}) => ({
  id, title, subtitle: null, kind: 'meal', component_role: null, status: 'active', protein: 'fish', finish_minutes: 30, prep_minutes: 0,
  hands_off_minutes: 10, reheats_well: true, base_portions: 4, rating: null, tags: [], ...o,
});
const s = (o: Record<string, unknown>) => ({
  id: `id-${o.date}-${o.slot}`, plan_week_id: 'w1', recipe_id: null, mode: 'routine', portions: null, guests: 0, locked: false, reason: null,
  source_date: null, routine_choice: null, cooked_at: null, portions_verdict: null, cookidoo_recipe_id: null, batch: null, roast: null, ...o,
});
const version = { based_on: 'pie', note: 'Yoghurt', ingredients: [], steps: [] };
const world = (o: Record<string, unknown> = {}) => tableDb({
  'plan_weeks:one': { id: 'w1', week_start: '2026-11-16', status: 'draft', days: 7 },
  plan_weeks: [],
  meal_slots: [
    s({ date: '2026-11-17', slot: 'dinner', recipe_id: 'pie', mode: 'cook', portions: 3, version }),
    s({ date: '2026-11-18', slot: 'lunch', recipe_id: 'pie', mode: 'reheat', source_date: '2026-11-17' }),
  ],
  recipes: [recipe('pie', 'Fish Pie'), recipe('curry', 'Thai Green Curry', { protein: 'chicken' })],
  'recipes:one': { ...recipe('pie', 'Fish Pie'), reheat: null, toddler_note: null },
  recipe_ingredients: [{ group_name: null, name: 'Crème fraîche', qty: 200, unit: 'ml', note: null, position: 1 }],
  recipe_steps: [{ phase: 'finish', position: 1, at_minute: 0, title: 'Sauce', body: 'Stir in the crème fraîche.', machine: 'hob', settings: null, timer_minutes: 5 }],
  members: [{ id: 'm1', kind: 'adult', portion_weight: 1.5 }, { id: 'm2', kind: 'adult', portion_weight: 1.5 }],
  basket_runs: [],
  ...o,
});

test('swap_meal changes the dinner with the app\'s rules and writes only that week\'s slots', async () => {
  const db = world();
  const text = await makeChanger(db, 'h1', NOW).swapMeal({ date: '2026-11-17', recipe: 'thai green' });
  expect(text).toContain('Fish Pie → Thai Green Curry');
  expect(text).toMatch(/lunch/i);
  expect(text).toMatch(/tonight's version .*cleared/i);
  const [w] = db.writes();
  expect(w).toMatchObject({ table: 'meal_slots', method: 'upsert', options: { onConflict: 'plan_week_id,date,slot' } });
  const rows = w.payload as Record<string, unknown>[];
  const dinner = rows.find((r) => r.slot === 'dinner')!;
  expect(dinner).toMatchObject({ recipe_id: 'curry', mode: 'cook', locked: true, reason: 'Your choice', version: null, plan_week_id: 'w1' });
  expect(rows.find((r) => r.slot === 'lunch')).toMatchObject({ mode: 'routine', source_date: null });
  for (const r of rows) { expect('id' in r).toBe(false); expect('cookidoo_recipe_id' in r).toBe(false); }
  const weekRead = db.chains.find((c) => c.table === 'plan_weeks' && c.calls.some(([m]) => m === 'maybeSingle'))!;
  expect(weekRead.calls).toContainEqual(['eq', ['household_id', 'h1']]);
});

test('swap_meal says what follows in an approved week with a filled basket', async () => {
  const db = world({ 'plan_weeks:one': { id: 'w1', week_start: '2026-11-16', status: 'approved', days: 7 }, basket_runs: [{ delivery: 'sun', status: 'done' }] });
  const text = await makeChanger(db, 'h1', NOW).swapMeal({ date: '2026-11-17', out: true });
  expect(text).toContain('eating out');
  expect(text).toContain('Cookidoo will re-sync this dinner.');
  expect(text).toContain('The Sainsbury\'s basket is already filled: use Empty and refill, or a Spar trip.');
});

test('swap_meal writes nothing for an unknown recipe, a missing week or a past day', async () => {
  for (const [db, args, says] of [
    [world(), { date: '2026-11-17', recipe: 'lasagne' }, 'No recipe called "lasagne"'],
    [world({ 'plan_weeks:one': null }), { date: '2026-11-17', recipe: 'curry' }, 'No plan for that week yet.'],
    [world(), { date: '2026-11-10', recipe: 'curry' }, 'That day has passed.'],
  ] as const) {
    expect(await makeChanger(db, 'h1', NOW).swapMeal(args)).toContain(says);
    expect(db.writes()).toHaveLength(0);
  }
});

const versionArgs = {
  date: '2026-11-17', slot: 'dinner', note: 'Greek yoghurt instead of crème fraîche',
  ingredients: [{ name: 'Greek yoghurt', qty: 200, unit: 'g', replaces: 'Crème fraîche' }],
  steps: [{ phase: 'finish', title: 'Sauce', body: 'Off the heat, stir in the yoghurt.', machine: 'hob', timer_minutes: 5, at_minute: 0 }],
};

test('set_tonights_version saves a checked version on that day and says what changed', async () => {
  const db = world();
  const text = await makeChanger(db, 'h1', NOW).setVersion(versionArgs);
  expect(text).toContain('Greek yoghurt');
  expect(text).toContain('Sauce');
  expect(text).toContain("Tonight's version isn't sent to Cookidoo; Cookidoo keeps the saved recipe.");
  const [w] = db.writes();
  expect(w).toMatchObject({ table: 'meal_slots', method: 'update' });
  expect(w.filters).toEqual([['plan_week_id', 'w1'], ['date', '2026-11-17'], ['slot', 'dinner']]);
  const v = (w.payload as { version: { based_on: string; ingredients: { changed: boolean }[] } }).version;
  expect(v.based_on).toBe('pie');
  expect(v.ingredients[0].changed).toBe(true);
  const recipeRead = db.chains.find((c) => c.table === 'recipes' && c.calls.some(([m]) => m === 'maybeSingle'))!;
  expect(recipeRead.calls).toContainEqual(['eq', ['household_id', 'h1']]);
});

test('set_tonights_version refuses a version that loses something, or a day with nothing cooked', async () => {
  const lossy = world();
  expect(await makeChanger(lossy, 'h1', NOW).setVersion({ ...versionArgs, ingredients: [{ name: 'Greek yoghurt', qty: 200, unit: 'g' }] })).toContain('leaves out "Crème fraîche"');
  expect(lossy.writes()).toHaveLength(0);
  const out = world({ meal_slots: [s({ date: '2026-11-17', slot: 'dinner', mode: 'out' })] });
  expect(await makeChanger(out, 'h1', NOW).setVersion(versionArgs)).toBe("There's nothing cooked then to change.");
  expect(out.writes()).toHaveLength(0);
});

test('clear_tonights_version clears it, or says there was none', async () => {
  const db = world();
  expect(await makeChanger(db, 'h1', NOW).clearVersion({ date: '2026-11-17', slot: 'dinner' })).toMatch(/back to the saved recipe/i);
  expect(db.writes()[0]).toMatchObject({ table: 'meal_slots', method: 'update', payload: { version: null } });
  const none = world({ meal_slots: [s({ date: '2026-11-17', slot: 'dinner', recipe_id: 'pie', mode: 'cook' })] });
  expect(await makeChanger(none, 'h1', NOW).clearVersion({ date: '2026-11-17', slot: 'dinner' })).toBe("There's no tonight's version on that day.");
  expect(none.writes()).toHaveLength(0);
});

const pantry = [
  { id: 'p1', staple_status: 'have', ingredients: { name: 'Soy sauce' } },
  { id: 'p2', staple_status: null, ingredients: { name: 'Milk' } },
  { id: 'p3', staple_status: 'have', ingredients: { name: 'Olive oil' } },
  { id: 'p4', staple_status: 'have', ingredients: { name: 'Sesame oil' } },
];

test('set_pantry changes a staple, and only a staple, in this household', async () => {
  const db = world({ pantry_items: pantry });
  expect(await makeChanger(db, 'h1', NOW).setPantry({ item: 'soy', status: 'out' })).toContain('Soy sauce: out');
  expect(db.writes()).toEqual([{ table: 'pantry_items', method: 'update', payload: { staple_status: 'out' }, options: undefined, filters: [['household_id', 'h1'], ['id', 'p1']] }]);
  const milk = world({ pantry_items: pantry });
  expect(await makeChanger(milk, 'h1', NOW).setPantry({ item: 'milk', status: 'out' })).toBe("Milk isn't a staple: change it in the app's Pantry.");
  const oils = world({ pantry_items: pantry });
  expect(await makeChanger(oils, 'h1', NOW).setPantry({ item: 'oil', status: 'low' })).toMatch(/^Several items match/);
  const bad = world({ pantry_items: pantry });
  expect(await makeChanger(bad, 'h1', NOW).setPantry({ item: 'soy', status: 'gone' })).toBe('Status must be have, low or out.');
  for (const d of [milk, oils, bad]) expect(d.writes()).toHaveLength(0);
});

test('change tools only ever write slots and staples', async () => {
  const db = world({ pantry_items: pantry });
  const c = makeChanger(db, 'h1', NOW);
  await c.swapMeal({ date: '2026-11-17', recipe: 'curry' });
  await c.setVersion(versionArgs);
  await c.clearVersion({ date: '2026-11-17', slot: 'dinner' });
  await c.setPantry({ item: 'soy', status: 'low' });
  const writes = db.writes();
  expect(writes.length).toBeGreaterThanOrEqual(4);
  for (const w of writes) {
    expect(['meal_slots', 'pantry_items']).toContain(w.table);
    expect(['upsert', 'update']).toContain(w.method);
    if (w.table === 'pantry_items') expect(w.filters).toContainEqual(['household_id', 'h1']);
    if (w.table === 'meal_slots' && w.method === 'update') expect(w.filters).toContainEqual(['plan_week_id', 'w1']);
  }
});
