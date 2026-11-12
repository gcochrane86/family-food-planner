import { applyVersion, buildVersion, parseVersion, type VersionInput } from './slotVersion';

const saved = {
  id: 'r1',
  ingredients: [
    { group_name: null, name: 'Chicken thighs', qty: 600, unit: 'g', note: 'diced', qty_approx: false },
    { group_name: null, name: 'Crème fraîche', qty: 200, unit: 'ml', note: null, qty_approx: false },
    { group_name: 'To serve', name: 'Rice', qty: 300, unit: 'g', note: null, qty_approx: false },
  ],
  steps: [
    { phase: 'finish', position: 1, at_minute: 0, title: 'Brown', body: 'Brown the **chicken**.', machine: 'hob', settings: null, timer_minutes: 8, image_path: 'p/brown.jpg' },
    { phase: 'finish', position: 2, at_minute: 8, title: 'Sauce', body: 'Stir in the **crème fraîche**.', machine: 'hob', settings: null, timer_minutes: 5, image_path: null },
  ],
};
const keep = (i: (typeof saved.ingredients)[number]) => ({ group_name: i.group_name, name: i.name, qty: i.qty, unit: i.unit, note: i.note });
const keepStep = ({ image_path: _i, ...s }: (typeof saved.steps)[number]) => s;
const input = (o: Partial<VersionInput> = {}): VersionInput => ({
  note: 'Greek yoghurt instead of crème fraîche',
  ingredients: [keep(saved.ingredients[0]), { group_name: null, name: 'Greek yoghurt', qty: 200, unit: 'g', note: null, replaces: 'crème fraîche' }, keep(saved.ingredients[2])],
  steps: [keepStep(saved.steps[0]), { ...keepStep(saved.steps[1]), body: 'Off the heat, stir in the **Greek yoghurt**.' }],
  ...o,
});

test('buildVersion marks only what changed, and keeps the note', () => {
  const r = buildVersion(saved, input());
  if (!('version' in r)) throw new Error(r.error);
  expect(r.version.based_on).toBe('r1');
  expect(r.version.note).toBe('Greek yoghurt instead of crème fraîche');
  expect(r.version.ingredients.map((i) => [i.name, i.changed])).toEqual([['Chicken thighs', false], ['Greek yoghurt', true], ['Rice', false]]);
  expect(r.version.steps.map((s) => [s.title, s.changed, s.position])).toEqual([['Brown', false, 1], ['Sauce', true, 2]]);
});

test('a different amount counts as changed', () => {
  const r = buildVersion(saved, input({ ingredients: [{ ...keep(saved.ingredients[0]), qty: 400 }, keep(saved.ingredients[1]), keep(saved.ingredients[2])] }));
  if (!('version' in r)) throw new Error(r.error);
  expect(r.version.ingredients[0].changed).toBe(true);
  expect(r.version.ingredients[1].changed).toBe(false);
});

test('an ingredient or step left out without saying so is refused', () => {
  expect(buildVersion(saved, input({ ingredients: [keep(saved.ingredients[0]), keep(saved.ingredients[2])] })))
    .toEqual({ error: 'Tonight\'s version leaves out "Crème fraîche" without saying so: add it back, put it in removed_ingredients, or name it in replaces.' });
  expect(buildVersion(saved, input({ ingredients: [keep(saved.ingredients[0]), keep(saved.ingredients[2])], removed_ingredients: [' crème FRAÎCHE '] }))).toHaveProperty('version');
  expect(buildVersion(saved, input({ steps: [keepStep(saved.steps[0])] })))
    .toEqual({ error: 'Tonight\'s version leaves out the step "Sauce" without saying so: add it back, put it in removed_steps, or name it in replaces.' });
  expect(buildVersion(saved, input({ steps: [keepStep(saved.steps[0])], removed_steps: ['sauce'] }))).toHaveProperty('version');
});

test('a version needs a note, and has limits', () => {
  expect(buildVersion(saved, input({ note: '  ' }))).toEqual({ error: "Say in one line what's different tonight." });
  const many = Array.from({ length: 81 }, (_, i) => ({ group_name: null, name: `x${i}`, qty: 1, unit: 'g', note: null }));
  expect(buildVersion(saved, input({ ingredients: [...input().ingredients, ...many] }))).toHaveProperty('error');
});

test('applyVersion uses the version for its own recipe only', () => {
  const r = buildVersion(saved, input());
  if (!('version' in r)) throw new Error(r.error);
  const v = applyVersion(saved, r.version);
  expect(v.ingredients.map((i) => i.name)).toEqual(['Chicken thighs', 'Greek yoghurt', 'Rice']);
  expect(v.steps[1].body).toContain('Greek yoghurt');
  expect(v.steps[0].image_path).toBe('p/brown.jpg');
  expect(v.steps[1].image_path).toBeNull();
  expect(v.versionNote).toBe('Greek yoghurt instead of crème fraîche');
  expect([...v.changedIngredients!]).toEqual(['Greek yoghurt']);
  expect([...v.changedSteps!]).toEqual([1]);
  for (const stale of [{ ...r.version, based_on: 'other' }, null, { note: 'x' }, 'junk']) {
    const s = applyVersion(saved, stale);
    expect(s).toBe(saved);
  }
  expect(parseVersion(r.version)).toEqual(r.version);
  for (const bad of [null, { note: 'x' }, 'junk', { based_on: 'r1', note: 'x', ingredients: 'no', steps: [] }]) expect(parseVersion(bad)).toBeNull();
});

test("a step sent back without the saved **bold** markers is the same step, and keeps them", () => {
  const r = buildVersion(saved, input({ steps: [{ ...keepStep(saved.steps[0]), body: 'Brown the chicken.' }, { ...keepStep(saved.steps[1]), body: 'Stir in the Greek yoghurt.' }] }));
  if (!('version' in r)) throw new Error(r.error);
  expect(r.version.steps[0]).toMatchObject({ body: 'Brown the **chicken**.', changed: false });
  expect(r.version.steps[1].changed).toBe(true);
});

test('a kept ingredient keeps its saved group and approximate amount unless told otherwise', () => {
  const approx = { ...saved, ingredients: saved.ingredients.map((i) => (i.name === 'Rice' ? { ...i, qty_approx: true } : i)) };
  const r = buildVersion(approx, input({ ingredients: [keep(saved.ingredients[0]), input().ingredients[1], { name: 'Rice', qty: 300, unit: 'g', note: null } as VersionInput['ingredients'][number]] }));
  if (!('version' in r)) throw new Error(r.error);
  expect(r.version.ingredients[2]).toMatchObject({ group_name: 'To serve', qty_approx: true, changed: false });
  const moved = buildVersion(saved, input({ ingredients: [keep(saved.ingredients[0]), input().ingredients[1], { ...keep(saved.ingredients[2]), group_name: 'Side' }] }));
  if (!('version' in moved)) throw new Error(moved.error);
  expect(moved.version.ingredients[2]).toMatchObject({ group_name: 'Side', changed: true });
});
