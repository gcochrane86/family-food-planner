import { HONEY, NEXT_WEEK } from '../test/fixtures';
import { cookidooRecipe, myWeekChanges, portionsToSend } from './cookidoo';
import { formatQty } from './recipes';

test('ingredients are scaled and written as Cookidoo lines, with notes after a comma', () => {
  const c = cookidooRecipe(HONEY, 3);
  expect(c.title).toBe(HONEY.title);
  expect(c.portions).toBe(3);
  expect(c.ingredients[0]).toBe(`${formatQty(600, 'g')} chicken breast or thigh, 10mm batons`);
  expect(c.ingredients[1]).toBe(`${formatQty(200, 'g')} basmati rice`);
});

test('steps come in cooking order: prep first, TM settings in Cookidoo notation, no bold markers', () => {
  const c = cookidooRecipe(HONEY, 6);
  expect(c.steps[0]).toBe('The night before: Chop the garlic and reduce. 12 min/Varoma/speed 2');
  expect(c.steps[1]).toBe('Rinse the rice and start. 20 min/100°C/speed 4');
  expect(c.steps[2]).toBe('Toss with the warm sauce.');
  const hy = cookidooRecipe({ ...HONEY, steps: [{ ...HONEY.steps[2], machine: 'hy24', settings: '190°C · air fry · 12 min' }] }, 6);
  expect(hy.steps[0]).toMatch(/\(.*: 190°C · air fry · 12 min\)$/);
});

test('my week: a swapped dinner removes the old entry and adds the new', () => {
  expect(myWeekChanges([{ date: 'd1', recipeId: 'B' }], [{ date: 'd1', recipeId: 'A' }]))
    .toEqual({ add: [{ date: 'd1', recipeId: 'B' }], remove: [{ date: 'd1', recipeId: 'A' }] });
});

test('my week: unchanged days are left alone, and days no longer cooked are removed', () => {
  expect(myWeekChanges(
    [{ date: 'd1', recipeId: 'A' }, { date: 'd3', recipeId: 'C' }],
    [{ date: 'd1', recipeId: 'A' }, { date: 'd2', recipeId: 'B' }, { date: 'd3', recipeId: null }],
  )).toEqual({ add: [{ date: 'd3', recipeId: 'C' }], remove: [{ date: 'd2', recipeId: 'B' }] });
});

test('my week: only entries we added can be removed', () => {
  const current = [{ date: 'd1', recipeId: 'A' }, { date: 'd2', recipeId: null }];
  const { remove } = myWeekChanges([], current);
  for (const r of remove) expect(current).toContainEqual(r);
});

test('portionsToSend picks the larger portions when a recipe is planned twice', () => {
  const slots = NEXT_WEEK.slots.map((s) => (s.slot === 'dinner' && s.date === '2026-10-21' ? { ...s, recipe_id: 'r-honey', portions: 3 } : s));
  expect(portionsToSend(slots, 'r-honey')).toBe(6);
});
