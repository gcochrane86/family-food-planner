import { readFileSync } from 'node:fs';
import { makeRecipeAdder } from './askClaudeRecipe';
import { makeHeroImage } from './heroMake';
import { tableDb } from './testDb';

const example = JSON.parse(readFileSync('seed/recipes.example.json', 'utf8')).recipes[0];
const recipe = (o: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(example)), slug: 'new-curry', title: 'New Curry', photo: 'A bowl of curry', ...o });
const HOUSEHOLD = { settings: {}, members: [{ name: 'You', kind: 'adult', portion_weight: 1.25 }], rules: [], equipment: [{ code: 'tm7', name: 'Thermomix TM7' }] };
const world = (o: Record<string, unknown> = {}) => tableDb({ recipes: [{ slug: 'fish-pie', title: 'Classic Fish Pie' }], 'recipes:single': { id: 'r-new' }, 'rpc:replace_recipe_contents': { data: 0, error: null }, ...o });
const adder = (db: ReturnType<typeof tableDb>, makeHero = vi.fn(async () => {})) =>
  ({ makeHero, add: makeRecipeAdder(db, 'h1', { makeHero, household: async () => HOUSEHOLD as never }) });

test('the rules give the recipe format, the household and the existing recipes', async () => {
  const out = await adder(world()).add.rules();
  expect(out).toMatch(/Format: \{ slug/);
  expect(out).toMatch(/Main photo: photo is 2–4 sentences/);
  expect(out).toMatch(/Thermomix TM7/);
  expect(out).toContain('Classic Fish Pie (fish-pie)');
  expect(out).toMatch(/show the household the whole recipe/i);
});

test('add saves a new recipe with its contents, from the page it came from, then makes its main photo', async () => {
  const db = world();
  const { add, makeHero } = adder(db);
  const out = await add.add({ recipe: recipe(), source_url: 'https://example.com/curry' });
  const insert = db.writes().find((w) => w.table === 'recipes' && w.method === 'insert');
  expect(insert?.payload).toMatchObject({ household_id: 'h1', slug: 'new-curry', title: 'New Curry', source: 'web', source_url: 'https://example.com/curry', status: 'active', hero_hint: 'A bowl of curry' });
  expect(db.rpcs[0]).toMatchObject({ fn: 'replace_recipe_contents', args: expect.objectContaining({ p_recipe_id: 'r-new' }) });
  expect(makeHero).toHaveBeenCalledWith('r-new');
  expect(out).toMatch(/Added New Curry/);
  expect(out).toMatch(/main photo/i);
});

test('a recipe whose slug or title is already in the library is refused, and nothing is written', async () => {
  for (const r of [recipe({ slug: 'fish-pie' }), recipe({ title: 'classic fish pie' })]) {
    const db = world();
    const { add, makeHero } = adder(db);
    expect(await add.add({ recipe: r })).toMatch(/already .*Nothing was saved/s);
    expect(db.writes()).toEqual([]);
    expect(makeHero).not.toHaveBeenCalled();
  }
});

test('a recipe with problems lists them and saves nothing', async () => {
  const db = world();
  const out = await adder(db).add.add({ recipe: recipe({ steps: [{ phase: 'later', title: '', body: '' }] }) });
  expect(out).toMatch(/needs fixing/);
  expect(out).toMatch(/phase must be/);
  expect(db.writes()).toEqual([]);
});

test('if the contents fail, the half-made recipe is removed', async () => {
  const db = world({ 'rpc:replace_recipe_contents': { data: null, error: { message: 'bad step' } } });
  const out = await adder(db).add.add({ recipe: recipe() });
  expect(out).toMatch(/Couldn't save .*bad step/s);
  expect(db.writes().some((w) => w.table === 'recipes' && w.method === 'delete')).toBe(true);
});

test("a failed photo leaves the recipe saved and says to use Make photos", async () => {
  const out = await adder(world(), vi.fn(async () => { throw new Error('Google is busy'); })).add.add({ recipe: recipe() });
  expect(out).toMatch(/Added New Curry/);
  expect(out).toMatch(/photo couldn't be made.*Google is busy.*Make photos/s);
});

test('makeHeroImage asks Gemini with the description, saves the image and points the recipe at it', async () => {
  const uploads: { path: string }[] = [];
  const updates: unknown[] = [];
  const db = {
    from: (t: string) => ({
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { id: 'r1', household_id: 'h1', title: 'Curry', subtitle: null, hero_hint: 'A bowl of curry' }, error: null }),
        order: async () => ({ data: [{ name: 'chicken' }], error: null }),
      }) }),
      update: (v: unknown) => ({ eq: async () => { updates.push([t, v]); return { error: null }; } }),
    }),
    storage: { from: () => ({ upload: async (path: string) => { uploads.push({ path }); return { error: null }; } }) },
  };
  const fetchFn = vi.fn(async (_u: string, init: { body: string }) => {
    expect(JSON.parse(init.body).input).toContain('A realistic food photograph of Curry: A bowl of curry');
    return new Response(JSON.stringify({ outputs: [{ type: 'image', data: btoa('jpg'), mime_type: 'image/jpeg' }] }));
  });
  const path = await makeHeroImage(db as never, 'key', 'r1', fetchFn as never);
  expect(path).toMatch(/^h1\/hero\/r1-\d+\.jpg$/);
  expect(uploads[0].path).toBe(path);
  expect(updates).toEqual([['recipes', { hero_image_path: path, hero_image_source: 'generated' }]]);
});

// Rework with Claude, from the Claude app: the saved recipe in the seed format, then the whole changed recipe saved over it.
const SAVED = { id: 'r1', household_id: 'h1', slug: 'fish-pie', title: 'Classic Fish Pie', source: 'web', status: 'active', kind: 'meal', base_portions: '6', hero_hint: 'A golden pie' };
const reworkWorld = (o: Record<string, unknown> = {}) => world({
  recipes: [{ id: 'r1', slug: 'fish-pie', title: 'Classic Fish Pie' }, { id: 'r2', slug: 'fish-tacos', title: 'Fish Tacos' }],
  'recipes:one': SAVED,
  recipe_ingredients: [{ position: 1, group_name: null, name: 'cod', qty: '400', unit: 'g', note: null, qty_approx: false }],
  recipe_steps: [{ phase: 'finish', position: 1, at_minute: 0, title: 'Bake', body: 'Bake it.', machine: 'oven', settings: null, timer_minutes: 30, photo_hint: null, needs_night_before: false }],
  recipe_reworks: [{ id: 'w1', request: 'Use the Anova oven', status: 'requested' }],
  ...o,
});

test('reworkContext gives the request, the rules and the saved recipe in the seed format', async () => {
  const out = await adder(reworkWorld()).add.reworkContext({ recipe: 'fish pie' });
  expect(out).toMatch(/only what the household asked/i);
  expect(out).toContain('Use the Anova oven');
  expect(out).toMatch(/Format: \{ slug/);
  expect(out).toContain('"slug": "fish-pie"');
  expect(out).toContain('"name": "cod"');
  expect(out).toContain('"base_portions": 6');
});

test('reworkContext asks which recipe when the name fits several, and says when none fits', async () => {
  expect(await adder(reworkWorld()).add.reworkContext({ recipe: 'fish' })).toMatch(/Classic Fish Pie.*Fish Tacos/s);
  expect(await adder(reworkWorld()).add.reworkContext({ recipe: 'lasagne' })).toMatch(/No recipe/);
});

test('rework saves the whole changed recipe over the saved one, keeping its slug, source and status, and closes the request', async () => {
  const db = reworkWorld();
  const changed = recipe({ slug: 'something-else', title: 'Classic Fish Pie', source: 'claude', status: 'draft' });
  const out = await adder(db).add.rework({ recipe: 'Classic Fish Pie', changed, summary: 'Anova oven instead of the TM7' });
  const call = db.rpcs.find((r) => r.fn === 'save_recipe');
  expect(call?.args).toMatchObject({ p_recipe_id: 'r1', p_fields: expect.objectContaining({ slug: 'fish-pie', source: 'web', status: 'active', household_id: 'h1' }) });
  const close = db.writes().find((w) => w.table === 'recipe_reworks' && w.method === 'update');
  expect(close?.payload).toMatchObject({ status: 'done', summary: 'Anova oven instead of the TM7' });
  expect(close?.filters).toContainEqual(['recipe_id', 'r1']);
  expect(out).toMatch(/Reworked Classic Fish Pie/);
});

test('a changed recipe with problems is refused and nothing is written', async () => {
  const db = reworkWorld();
  const out = await adder(db).add.rework({ recipe: 'fish-pie', changed: recipe({ steps: [{ phase: 'later', title: '', body: '' }] }), summary: 'x' });
  expect(out).toMatch(/needs fixing.*Nothing was saved/s);
  expect(db.rpcs).toEqual([]);
  expect(db.writes()).toEqual([]);
});

test('a failed save says so and leaves the request open', async () => {
  const db = reworkWorld({ 'rpc:save_recipe': { data: null, error: { message: 'bad step' } } });
  const out = await adder(db).add.rework({ recipe: 'fish-pie', changed: recipe(), summary: 'x' });
  expect(out).toMatch(/Couldn't save.*bad step/s);
  expect(db.writes().some((w) => w.table === 'recipe_reworks')).toBe(false);
});
