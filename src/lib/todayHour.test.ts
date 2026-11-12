import { describe, expect, it } from 'vitest';
import { HONEY } from '../test/fixtures';
import { planHour, type HourInput } from './todayHour';
import type { RecipeDetail, RecipeIngredient, RecipeStep } from './types';

const ing = (position: number, name: string, qty: number | null, unit: string, note: string | null): RecipeIngredient =>
  ({ position, group_name: null, name, qty, unit, note, qty_approx: false });
const step = (phase: RecipeStep['phase'], position: number, at: number | null, title: string, body: string, machine: RecipeStep['machine'], settings: string | null, timer: number | null): RecipeStep =>
  ({ phase, position, at_minute: at, title, body, machine, settings, timer_minutes: timer, image_path: null, image_source: null });
const recipe = (id: string, title: string, ingredients: RecipeIngredient[], steps: RecipeStep[]): RecipeDetail =>
  ({ ...HONEY, id, slug: id, title, base_portions: 4, ingredients, steps });

// Tonight: chop in the TM7 (5 min), brown the chicken on the hob (8 min), simmer in the TM7 (15 min hands-off), serve.
const CURRY = recipe('curry', 'Chicken Curry', [
  ing(1, 'onion', 2, '', 'roughly chopped'), ing(2, 'garlic', 3, 'cloves', 'crushed'), ing(3, 'ginger', 20, 'g', 'peeled and sliced'),
  ing(4, 'chicken thigh', 800, 'g', 'diced'), ing(5, 'tinned tomatoes', 400, 'g', null), ing(6, 'coriander', 10, 'g', 'chopped'),
], [
  step('finish', 1, 0, 'Chop the aromatics', 'Put the **onion**, **garlic** and **ginger** in the bowl.', 'tm7', '5 sec · speed 5', null),
  step('finish', 2, null, 'Brown the chicken', 'Fry the **chicken thigh** in a pan.', 'hob', null, 8),
  step('finish', 3, null, 'Simmer', 'Add the **tinned tomatoes** and cook.', 'tm7', '15 min · 100°C · speed 1', 15),
  step('finish', 4, null, 'Serve', 'Scatter the **coriander**.', null, null, null),
]);
// Tomorrow: a hand prep step tonight, then carrots (keep 4 days) and tomatoes (cut on the day) tomorrow.
const STEW = (prep: RecipeStep) => recipe('stew', 'Beef Stew', [
  ing(1, 'carrot', 3, '', 'diced'), ing(2, 'tomato', 2, '', 'chopped'), ing(3, 'beef', 600, 'g', 'cubed'), ing(4, 'beef stock', 300, 'ml', null),
], [prep, step('finish', 1, 0, 'Stew', 'Add the **carrot** and **tomato** and cook.', 'apo', '60 min · 160°C', 60)]);
const HAND_PREP = step('prep_8pm', 1, null, 'Marinate the beef', 'Mix the **beef** with the **beef stock**.', null, null, 5);
const TM7_PREP = step('prep_8pm', 1, null, 'Make the sauce', 'Cook the **beef stock** down.', 'tm7', '10 min · 100°C · speed 2', 10);

const input = (over: Partial<HourInput> = {}): HourInput => ({
  date: '2026-11-12', start: '17:30', minutes: 60, tm7Bowls: 1, tm7Machines: 1,
  tonight: { recipe: CURRY, portions: 4 }, yesterdayPlanned: false,
  tomorrow: { dinner: { recipe: STEW(HAND_PREP), portions: 4 }, lunch: null, breakfast: null },
  ...over,
});
const titled = (plan: ReturnType<typeof planHour>, t: string) => plan.steps.find((s) => s.title.includes(t));

describe('planHour', () => {
  it('chops first, at the start, veg before raw meat, and boxes what keeps for tomorrow', () => {
    const plan = planHour(input());
    expect(plan.steps[0]).toMatchObject({ at: '17:30', kind: 'chop' });
    expect(plan.chop.map((g) => [g.where, g.raw])).toEqual([['tm7', false], ['bowl', false], ['box', false], ['bowl', true], ['bowl', true]]);
    expect(plan.chop[0].items.map((i) => i.name)).toEqual(['onion', 'garlic', 'ginger']);
    const box = plan.chop.find((g) => g.where === 'box')!;
    expect(box.label).toBe('For tomorrow: Beef Stew');
    expect(box.items.map((i) => i.name)).toEqual(['carrot']);
    expect(plan.chop.flatMap((g) => g.items.map((i) => i.name))).not.toContain('tomato');
    expect(plan.steps[1]).toMatchObject({ at: '17:41', kind: 'clean', title: 'Board, knife and bowls into the dishwasher' });
  });

  it('scales the amounts to the portions', () => {
    const plan = planHour(input({ tonight: { recipe: CURRY, portions: 6 } }));
    expect(plan.chop[0].items[0]).toMatchObject({ name: 'onion', qty: '3' });
  });

  it("leaves out what was chopped yesterday, unless yesterday wasn't planned", () => {
    const names = (p: ReturnType<typeof planHour>) => p.chop.filter((g) => g.where !== 'box' && g.where !== 'fridge').flatMap((g) => g.items.map((i) => i.name));
    expect(names(planHour(input({ yesterdayPlanned: true })))).toEqual(['coriander', 'beef']);
    expect(names(planHour(input()))).toContain('onion');
  });

  it("does tomorrow's hand prep during tonight's 15-minute TM7 wait", () => {
    const plan = planHour(input());
    expect(titled(plan, 'Simmer')).toMatchObject({ at: '17:56', end: '18:11' });
    expect(titled(plan, 'Marinate the beef')).toMatchObject({ at: '17:56', kind: 'extra' });
  });

  it('a TM7 prep job waits for the bowl, with a rinse in between, when there is one bowl', () => {
    const plan = planHour(input({ minutes: 75, tomorrow: { dinner: { recipe: STEW(TM7_PREP), portions: 4 } } }));
    expect(titled(plan, 'Rinse the TM7 bowl')).toMatchObject({ at: '18:16', end: '18:18', kind: 'clean' });
    expect(titled(plan, 'Make the sauce')).toMatchObject({ at: '18:18', end: '18:28' });
  });

  it('two bowls need no rinse; two machines can run together', () => {
    const two = planHour(input({ minutes: 75, tm7Bowls: 2, tomorrow: { dinner: { recipe: STEW(TM7_PREP), portions: 4 } } }));
    expect(titled(two, 'Rinse')).toBeUndefined();
    expect(titled(two, 'Make the sauce')).toMatchObject({ at: '18:16' });
    const machines = planHour(input({ tm7Machines: 2, tomorrow: { dinner: { recipe: STEW(TM7_PREP), portions: 4 } } }));
    expect(titled(machines, 'Make the sauce')).toMatchObject({ at: '17:56' });
    expect(titled(machines, 'Rinse')).toBeUndefined();
  });

  it('with no dinner tonight, the extras start after the chopping', () => {
    const plan = planHour(input({ tonight: null, tomorrow: { dinner: { recipe: STEW(HAND_PREP), portions: 4 }, breakfast: { title: 'Overnight oats' } } }));
    expect(plan.steps.filter((s) => s.kind === 'cook')).toEqual([]);
    expect(titled(plan, 'Plate up')).toBeUndefined();
    expect(titled(plan, 'Marinate the beef')).toMatchObject({ at: '17:37' });
    expect(titled(plan, 'Make the overnight oats')).toMatchObject({ at: '17:42' });
    expect(plan.steps.at(-1)).toMatchObject({ kind: 'clean', title: 'Wipe down, load and start the dishwasher', at: '17:47' });
  });

  it("with tomorrow not planned, there's only tonight", () => {
    const plan = planHour(input({ tomorrow: null }));
    expect(plan.chop.some((g) => g.where === 'box')).toBe(false);
    expect(plan.steps.filter((s) => s.kind === 'extra')).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("warns when dinner runs over, and lists the extras that don't fit for after dinner", () => {
    const LONG = recipe('long', 'Big Casserole', ['carrot', 'celery', 'leek', 'onion', 'potato'].map((n, i) => ing(i + 1, n, 1, '', 'diced')),
      [step('finish', 1, 0, 'Casserole', 'Cook everything in the casserole.', 'hob', null, 55)]);
    const plan = planHour(input({ tonight: { recipe: LONG, portions: 4 }, tomorrow: { breakfast: { title: 'Overnight oats' } } }));
    expect(plan.warnings).toContain('Tonight\'s dinner runs to 18:35');
    expect(plan.warnings).toContain('Not enough time for Make the overnight oats: do it after dinner');
    expect(plan.after.map((s) => s.title)).toEqual(['Make the overnight oats']);
    expect(titled(plan, 'Plate up')).toMatchObject({ at: '18:35' });
  });

  it("packs tomorrow's leftovers lunch straight after plating up", () => {
    const plan = planHour(input({ tomorrow: { lunch: { kind: 'leftovers', title: 'Chicken Curry' } } }));
    const i = plan.steps.findIndex((s) => s.title === 'Plate up');
    expect(plan.steps[i]).toMatchObject({ at: '18:20' });
    expect(plan.steps[i + 1]).toMatchObject({ title: "Pack tomorrow's lunch: Chicken Curry", kind: 'extra' });
    expect(plan.steps.at(-1)!.title).toBe('Wipe down, load and start the dishwasher');
  });

  it('counts what needs washing, once each, and the hands-on minutes', () => {
    const plan = planHour(input({ tomorrow: null }));
    for (const k of ['Board', 'Knife', 'TM7 bowl', 'Pan']) expect(plan.toWash.filter((x) => x === k)).toHaveLength(1);
    // chop 8 + rinse-down 2 + aromatics 5 + chicken 8 + serve 5 + plate up 5 + clean 5
    expect(plan.handsOn).toBe(38);
  });
});

describe('review fixes', () => {
  const PREP_CHAIN = recipe('ragu', 'Ragu', [ing(1, 'carrot', 1, '', 'diced')], [
    step('prep_8pm', 1, null, 'Chop the soffritto', 'Chop the **carrot**.', 'tm7', '5 sec · speed 5', 5),
    step('prep_8pm', 2, null, 'Saute', 'Saute it.', 'tm7', '8 min · 120°C · speed 1', 8),
    step('finish', 1, 0, 'Cook', 'Cook it.', 'hob', null, 30),
  ]);
  it("no rinse between one extra recipe's own TM7 steps", () => {
    const plan = planHour(input({ tonight: null, tomorrow: { dinner: { recipe: PREP_CHAIN, portions: 4 } } }));
    expect(plan.steps.filter((s) => s.title.includes('Rinse'))).toEqual([]);
    expect(titled(plan, 'Saute')!.at).toBe(titled(plan, 'Chop the soffritto')!.end);
  });

  it("never slots a TM7 extra between tonight's own TM7 steps when there's one bowl", () => {
    const SPLIT = recipe('split', 'Split Sauce', [], [
      step('finish', 1, 0, 'Sauce', 'Make the sauce.', 'tm7', '5 min · 100°C', 5),
      step('finish', 2, null, 'Roast', 'Roast it.', 'oven', '25 min · 200°C', 25),
      step('finish', 3, null, 'Finish sauce', 'Finish it.', 'tm7', '5 min · 100°C', 5),
    ]);
    const plan = planHour(input({ minutes: 90, tonight: { recipe: SPLIT, portions: 4 }, tomorrow: { dinner: { recipe: STEW(TM7_PREP), portions: 4 } } }));
    const sauce = titled(plan, 'Make the sauce')!;
    expect(sauce.at >= titled(plan, 'Finish sauce')!.end).toBe(true);
  });

  it("the rinse after tonight's TM7 cooking says to tip the dinner out first", () => {
    const plan = planHour(input({ minutes: 75, tomorrow: { dinner: { recipe: STEW(TM7_PREP), portions: 4 } } }));
    expect(titled(plan, 'Rinse the TM7 bowl')!.body).toMatch(/Tip tonight's dinner into a warm dish/);
  });

  it("what was chopped yesterday shows as a fridge box to check, not as chopping", () => {
    const plan = planHour(input({ yesterdayPlanned: true, tomorrow: null }));
    const fridge = plan.chop.find((g) => g.where === 'fridge')!;
    expect(fridge.label).toBe('From the fridge box (chopped yesterday)');
    expect(fridge.items.map((i) => i.name)).toEqual(['onion', 'garlic', 'ginger', 'chicken thigh']);
    // Only the coriander is chopped: the 5-minute minimum.
    expect(titled(plan, 'Chop everything')).toMatchObject({ at: '17:30', end: '17:35' });
  });

  it("gives each step a picture that makes sense: the step's photo, else its recipe's, and none for cleaning", () => {
    const withPhotos = { ...CURRY, hero_image_path: 'h1/hero/curry.jpg', steps: CURRY.steps.map((st) => (st.title === 'Simmer' ? { ...st, image_path: 'h1/steps/simmer.jpg' } : st)) };
    const stew = { ...STEW(HAND_PREP), hero_image_path: 'h1/hero/stew.jpg' };
    const plan = planHour(input({ tonight: { recipe: withPhotos, portions: 4 }, tomorrow: { dinner: { recipe: stew, portions: 4 }, lunch: { kind: 'leftovers', title: 'Chicken Curry' }, breakfast: null } }));
    expect(titled(plan, 'Simmer')!.photos.map((p) => p.path)).toEqual(['h1/steps/simmer.jpg']);
    expect(titled(plan, 'Simmer')!.photos[0].alt).toBe('Photo of this step');
    expect(titled(plan, 'Brown the chicken')!.photos[0].alt).toBe('Chicken Curry');
    expect(titled(plan, 'Brown the chicken')!.photos.map((p) => p.path)).toEqual(['h1/hero/curry.jpg']);
    expect(titled(plan, 'Marinate the beef')!.photos.map((p) => p.path)).toEqual(['h1/hero/stew.jpg']);
    expect(titled(plan, 'Chop everything')!.photos.map((p) => p.path)).toEqual(['h1/hero/curry.jpg', 'h1/hero/stew.jpg']);
    expect(titled(plan, 'Plate up')!.photos.map((p) => p.path)).toEqual(['h1/hero/curry.jpg']);
    expect(titled(plan, "Pack tomorrow's lunch")!.photos.map((p) => p.path)).toEqual(['h1/hero/curry.jpg']);
    for (const c of plan.steps.filter((x) => x.kind === 'clean')) expect(c.photos).toEqual([]);
  });
});
