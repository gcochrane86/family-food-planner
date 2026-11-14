import { HONEY, HONEY_VERSION } from '../test/fixtures';
import { changeStepForDay } from './dayVersion';

const ok = (r: ReturnType<typeof changeStepForDay>) => { if ('error' in r) throw new Error(r.error); return r.version; };

test("a step's wording, timer and start change for the day; the rest of the recipe is kept", () => {
  const v = ok(changeStepForDay(HONEY, null, { phase: 'finish', title: 'Rice on', body: 'Rinse the **rice** well and start.', timer: 25, at: 5 }));
  expect(v.based_on).toBe(HONEY.id);
  expect(v.note).toBe('Changed for this day: Rice on');
  const rice = v.steps.find((s) => s.title === 'Rice on')!;
  expect(rice).toMatchObject({ body: 'Rinse the **rice** well and start.', timer_minutes: 25, at_minute: 5, changed: true });
  expect(v.steps.filter((s) => s.changed)).toHaveLength(1);
  expect(v.ingredients.map((i) => i.name)).toEqual(HONEY.ingredients.map((i) => i.name));
});

test('a step can be removed for the day', () => {
  const v = ok(changeStepForDay(HONEY, null, { phase: 'finish', title: 'Final toss', remove: true }));
  expect(v.steps.map((s) => s.title)).not.toContain('Final toss');
  expect(v.note).toBe('Removed for this day: Final toss');
});

test("a change on top of Claude's version keeps Claude's changes and adds to its note", () => {
  const v = ok(changeStepForDay(HONEY, HONEY_VERSION, { phase: 'finish', title: 'Final toss', timer: 3 }));
  expect(v.note).toBe('Turkey instead of chicken; Changed for this day: Final toss');
  expect(v.ingredients.map((i) => i.name)).toContain('turkey breast');
  expect(v.steps.find((s) => s.title === 'Rice on')!.body).toBe('Rinse the **rice** twice and start.');
  expect(v.steps.find((s) => s.title === 'Final toss')!.timer_minutes).toBe(3);
});

test('a version made for another recipe is ignored, and an unknown step is refused', () => {
  const v = ok(changeStepForDay(HONEY, { ...HONEY_VERSION, based_on: 'other' }, { phase: 'finish', title: 'Rice on', timer: 30 }));
  expect(v.note).toBe('Changed for this day: Rice on');
  expect(changeStepForDay(HONEY, null, { phase: 'finish', title: 'Nope', timer: 3 })).toEqual({ error: expect.stringMatching(/isn't in/) });
});

test("a version saved before the night-before flag existed keeps the recipe's flag after a day edit", () => {
  const recipe = { ...HONEY, steps: HONEY.steps.map((s) => (s.phase === 'prep_8pm' ? { ...s, needs_night_before: true } : s)) };
  const old = { ...HONEY_VERSION, steps: HONEY_VERSION.steps.map(({ needs_night_before: _n, ...s }) => s) };
  const v = ok(changeStepForDay(recipe, old, { phase: 'finish', title: 'Final toss', timer: 3 }));
  expect(v.steps.find((s) => s.phase === 'prep_8pm')!.needs_night_before).toBe(true);
});
