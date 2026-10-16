import { HONEY, NEXT_WEEK } from '../test/fixtures';
import { cookidooRecipe, finishStatus, myWeekChanges, portionsToSend, textHash, whyToSend } from './cookidoo';
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
  expect(portionsToSend(slots, 'r-honey', 6)).toBe(6);
});

test('portions are whole servings, and fall back to the recipe when none are planned', () => {
  const slots = NEXT_WEEK.slots.map((s) => (s.slot === 'dinner' && s.date === '2026-10-19' ? { ...s, portions: 3.5 } : s));
  expect(portionsToSend(slots, 'r-honey', 6)).toBe(4);
  const none = NEXT_WEEK.slots.map((s) => (s.slot === 'dinner' && s.date === '2026-10-19' ? { ...s, portions: null } : s));
  expect(portionsToSend(none, 'r-honey', 6)).toBe(6);
});

test('the text fingerprint changes when the text does, and only then', () => {
  expect(textHash(cookidooRecipe(HONEY, 3))).toBe(textHash(cookidooRecipe(HONEY, 3)));
  expect(textHash(cookidooRecipe(HONEY, 3))).not.toBe(textHash(cookidooRecipe(HONEY, 4)));
  expect(textHash(cookidooRecipe(HONEY, 3))).not.toBe(textHash(cookidooRecipe({ ...HONEY, title: 'Other' }, 3)));
});

test('what to send: new, changed, nothing, and never an imported original', () => {
  const sent = { cookidoo_url: 'https://cookidoo.co.uk/x', cookidoo_hash: 'abc', cookidoo_own_url: null };
  expect(whyToSend({ ...sent, cookidoo_url: null, cookidoo_hash: null }, 'abc')).toBe('new');
  expect(whyToSend(sent, 'abc')).toBeNull();
  expect(whyToSend(sent, 'xyz')).toBe('changed');
  expect(whyToSend({ cookidoo_url: null, cookidoo_hash: null, cookidoo_own_url: 'https://cookidoo.co.uk/own' }, 'abc')).toBeNull();
});

test('a sync that saw a change while it ran finishes by asking again', () => {
  expect(finishStatus({ requested_at: '2026-10-16T19:05:00Z', started_at: '2026-10-16T19:00:00Z' }, 'done')).toBe('requested');
  expect(finishStatus({ requested_at: '2026-10-16T18:55:00Z', started_at: '2026-10-16T19:00:00Z' }, 'done')).toBe('done');
  expect(finishStatus({ requested_at: '2026-10-16T18:55:00Z', started_at: '2026-10-16T19:00:00Z' }, 'failed')).toBe('failed');
});
