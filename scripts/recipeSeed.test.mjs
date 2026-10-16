// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { contentRows, recipeRow, seedFromDetail, validateRecipeSeed } from './recipeSeed.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const example = read('seed/recipes.example.json');
const clone = () => JSON.parse(JSON.stringify(example));

test('the example recipe file is valid', () => {
  expect(validateRecipeSeed(example)).toEqual([]);
});

test('your private recipe files are valid (when present)', () => {
  const dir = 'seed/private/recipes';
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    expect({ file: f, problems: validateRecipeSeed(read(`${dir}/${f}`)) }).toEqual({ file: f, problems: [] });
  }
});

test('a missing title, bad phase and unknown machine are reported', () => {
  const s = clone();
  delete s.recipes[0].title;
  s.recipes[0].steps[0].phase = 'lunch';
  s.recipes[0].steps[0].machine = 'toaster';
  expect(validateRecipeSeed(s)).toEqual(expect.arrayContaining([
    'recipes[0].title missing',
    'recipes[0].steps[0].phase must be prep_8pm, finish or reheat',
    'recipes[0].steps[0].machine must be one of tm7, apo, hy24, meater, hob, oven, kettle',
  ]));
});

test('slugs must be unique and kebab-case', () => {
  const s = clone();
  s.recipes.push({ ...s.recipes[0] });
  s.recipes[0].slug = 'Bad Slug';
  expect(validateRecipeSeed(s)).toEqual(expect.arrayContaining([
    'recipes[0].slug must be lower-case-with-dashes',
  ]));
  const t = clone();
  t.recipes.push({ ...t.recipes[0] });
  expect(validateRecipeSeed(t)).toContain(`recipes[1].slug "${t.recipes[0].slug}" is used twice`);
});

test('ingredient quantities must be numbers or null', () => {
  const s = clone();
  s.recipes[0].ingredients[0].qty = 'lots';
  expect(validateRecipeSeed(s)).toContain('recipes[0].ingredients[0].qty must be a number or null');
});

test('values the database would reject are caught before anything is written', () => {
  const s = clone();
  s.recipes[0].status = 'maybe';
  s.recipes[0].base_portions = 120;
  s.recipes[0].salt_per_portion_g = 150;
  s.recipes[0].steps[0].at = 2.5;
  s.recipes[0].steps[0].settings = 12;
  s.recipes[0].ingredients[0].unit = 5;
  expect(validateRecipeSeed(s)).toEqual(expect.arrayContaining([
    'recipes[0].status must be draft, active or archived',
    'recipes[0].base_portions must be a positive number under 100',
    'recipes[0].salt_per_portion_g must be a number under 100',
    'recipes[0].steps[0].at must be whole minutes',
    'recipes[0].steps[0].settings must be text',
    'recipes[0].ingredients[0].unit must be text',
  ]));
});

test('meals must say their main protein; components may', () => {
  const s = clone();
  s.recipes[0].kind = 'meal';
  delete s.recipes[0].protein;
  expect(validateRecipeSeed(s)).toContain('recipes[0].protein must be one of chicken, fish, red_meat, veggie, egg, other');
  s.recipes[0].protein = 'fish';
  expect(validateRecipeSeed(s)).toEqual([]);
  const c = clone();
  c.recipes[0].protein = 'tofu';
  expect(validateRecipeSeed(c)).toContain('recipes[0].protein must be one of chicken, fish, red_meat, veggie, egg, other');
});

test('a file that is not { recipes: [...] } is rejected', () => {
  expect(validateRecipeSeed([])).toEqual(['file must be an object with a "recipes" list']);
});

test('cookidoo is a valid source', () => {
  const s = clone();
  s.recipes[0].source = 'cookidoo';
  expect(validateRecipeSeed(s)).toEqual([]);
});

test('web is a valid source', () => {
  const s = clone();
  s.recipes[0].source = 'web';
  expect(validateRecipeSeed(s)).toEqual([]);
});

test('recipeRow and contentRows turn a seed recipe into database rows', () => {
  const r = clone().recipes[0];
  const row = recipeRow('h1', r);
  expect(row).toMatchObject({ household_id: 'h1', slug: r.slug, title: r.title, source: r.source, status: r.status ?? 'active' });
  const { ingredients, steps } = contentRows(r);
  expect(ingredients[0]).toMatchObject({ position: 1, name: r.ingredients[0].name });
  expect(steps).toHaveLength(r.steps.length);
  expect(steps[0].position).toBe(1);
});

test('seedFromDetail turns a saved recipe back into the seed format, round-tripping through the row helpers', () => {
  const r = clone().recipes[0];
  const row = recipeRow('h1', r);
  const { ingredients, steps } = contentRows(r);
  const back = seedFromDetail({ ...row, id: 'x', ingredients, steps: steps.map((s) => ({ ...s, image_path: null })) });
  expect(validateRecipeSeed({ recipes: [back] })).toEqual([]);
  expect(contentRows(back)).toEqual({ ingredients, steps });
  expect(back).toMatchObject({ slug: r.slug, title: r.title, base_portions: r.base_portions });
  expect(back).not.toHaveProperty('household_id');
});
