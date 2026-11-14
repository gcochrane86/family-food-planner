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
  it("a home lunch's night-before part (the roast chicken) is done in the hour, but not the lunch itself", () => {
    const SANDWICH = recipe('sandwich', 'Chicken Sandwich', [ing(1, 'whole chicken', 1, '', 'spatchcocked'), ing(2, 'sourdough', 4, 'slices', null)], [
      step('prep_8pm', 1, null, 'Spatchcock the chicken', 'Flatten the **whole chicken**.', null, null, 5),
      step('prep_8pm', 2, null, 'Roast in the Anova', 'Roast it.', 'apo', '200°C', 45),
      step('finish', 1, 0, 'Build', 'Spread the **sourdough**.', null, null, null),
    ]);
    const plan = planHour(input({ tonight: null, tomorrow: { dinner: null, lunch: { kind: 'ahead', title: 'Chicken Sandwich', recipe: SANDWICH }, breakfast: null } }));
    const titles = [...plan.steps, ...plan.after].map((s) => s.title);
    expect(titles).toContain("For tomorrow's lunch: Spatchcock the chicken");
    expect(titles).toContain("For tomorrow's lunch: Roast in the Anova");
    expect(titles.some((t) => t.includes('Build'))).toBe(false);
    expect(plan.getOut.flatMap((g) => g.items).map((i) => i.name)).toContain('whole chicken');
  });

  it("lists what to get out for the whole hour: tonight's dinner, tomorrow's prep and the boxed veg, with icons once made", () => {
    const plan = planHour(input({ prepPhotos: { 'icon:onion': 'h1/prep/icon-onion.jpg' } }));
    const where = Object.fromEntries(plan.getOut.flatMap((g) => g.items.map((i) => [i.name, g.where])));
    expect(where).toMatchObject({ 'chicken thigh': 'fridge', coriander: 'fridge', carrot: 'fridge', beef: 'fridge', onion: 'cupboard', 'tinned tomato': 'cupboard', 'beef stock': 'cupboard' });
    // Tomorrow's tomatoes are cut on the day, so they stay put tonight.
    expect(where.tomato).toBeUndefined();
    const onion = plan.getOut.flatMap((g) => g.items).find((i) => i.name === 'onion')!;
    expect(onion).toMatchObject({ qty: '2', icon: 'h1/prep/icon-onion.jpg' });
    expect(plan.iconsMissing.map((i) => i.name)).not.toContain('onion');
    expect(plan.iconsMissing.map((i) => i.name)).toContain('chicken thigh');
  });

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
    expect(titled(plan, 'Chop all the ingredients below')).toMatchObject({ at: '17:30', end: '17:35' });
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
    expect(titled(plan, 'Chop all the ingredients below')!.photos.map((p) => p.path)).toEqual(['h1/hero/curry.jpg', 'h1/hero/stew.jpg']);
    expect(titled(plan, 'Plate up')!.photos.map((p) => p.path)).toEqual(['h1/hero/curry.jpg']);
    expect(titled(plan, "Pack tomorrow's lunch")!.photos.map((p) => p.path)).toEqual(['h1/hero/curry.jpg']);
    for (const c of plan.steps.filter((x) => x.kind === 'clean')) expect(c.photos).toEqual([]);
  });

  it('a step that is only about a machine shows your photo of that machine, and so does rinsing the TM7', () => {
    const fish = recipe('fish', 'Roast Fish', [ing(1, 'cod', 400, 'g', null)], [
      step('finish', 1, 0, 'Heat the Anova', 'Preheat the Anova and line a tray.', 'apo', '200°C', 5),
      step('finish', 2, 5, 'Roast', 'Roast the **cod**.', 'apo', '200°C · 12 min', 12),
    ]);
    const kit = { apo: { path: 'h1/kit/apo.jpg', name: 'Anova Precision Oven' }, tm7: { path: 'h1/kit/tm7.jpg', name: 'Thermomix TM7' } };
    const plan = planHour(input({ tonight: { recipe: { ...fish, hero_image_path: 'h1/hero/fish.jpg' }, portions: 4 }, kitPhotos: kit }));
    expect(titled(plan, 'Heat the Anova')!.photos).toMatchObject([{ path: 'h1/kit/apo.jpg', alt: 'Anova Precision Oven' }]);
    expect(titled(plan, 'Roast')!.photos.map((p) => p.path)).toEqual(['h1/hero/fish.jpg']);
    const tm7 = planHour(input({ minutes: 75, tomorrow: { dinner: { recipe: STEW(TM7_PREP), portions: 4 } }, kitPhotos: kit }));
    const rinse = tm7.steps.find((x) => x.title === 'Rinse the TM7 bowl');
    expect(rinse?.photos).toEqual([{ path: 'h1/kit/tm7.jpg', alt: 'Thermomix TM7' }]);
  });

  it('the chopping step shows a board photo for each cut, and lists the cuts still without one', () => {
    const plan = planHour(input({ prepPhotos: { 'onion|chunks': 'h1/prep/cartoon-onion.jpg', 'garlic|crushed': 'h1/prep/cartoon-garlic.jpg' } }));
    const chop = titled(plan, 'Chop all the ingredients below')!;
    expect(chop.photos.map(({ path, alt }) => ({ path, alt }))).toEqual([{ path: 'h1/prep/cartoon-onion.jpg', alt: 'onion, chunks' }, { path: 'h1/prep/cartoon-garlic.jpg', alt: 'garlic, crushed' }]);
    expect(chop.photos[0].prep).toMatchObject({ name: 'onion', note: 'roughly chopped', key: 'onion|chunks' });
    expect(plan.prepMissing.map((m) => m.label)).toEqual(['ginger, sliced', 'coriander, chopped', 'carrot, diced', 'chicken thigh, diced', 'beef, diced']);
    expect(plan.prepMissing[0]).toMatchObject({ name: 'ginger', note: 'peeled and sliced' });
    expect(titled(planHour(input()), 'Chop all the ingredients below')!.photos.every((p) => !p.path.includes('/prep/'))).toBe(true);
  });

  it('an older realistic chopping photo is redrawn as a cartoon; your own photo and a cartoon are kept', () => {
    const plan = planHour(input({ prepPhotos: {
      'ginger|sliced': 'h1/prep/ginger-sliced-1.jpg', 'coriander|chopped': 'h1/prep/cartoon-coriander-1.jpg', 'carrot|diced': 'h1/prep/own-carrot-1.jpg',
    } }));
    expect(plan.prepMissing.find((m) => m.label === 'ginger, sliced')).toMatchObject({ redraw: true });
    expect(plan.prepMissing.map((m) => m.label)).not.toContain('coriander, chopped');
    expect(plan.prepMissing.map((m) => m.label)).not.toContain('carrot, diced');
  });
});

describe('prep ahead: essential and optional', () => {
  const MUST = { ...HAND_PREP, needs_night_before: true };
  const OPTIONAL = { ...TM7_PREP, position: 2 };
  const STEW2 = recipe('stew', 'Beef Stew', [
    ing(1, 'carrot', 3, '', 'diced'), ing(2, 'tomato', 2, '', 'chopped'), ing(3, 'beef', 600, 'g', 'cubed'), ing(4, 'beef stock', 300, 'ml', null),
  ], [MUST, OPTIONAL, step('finish', 1, 0, 'Stew', 'Add the **carrot** and **tomato** and cook.', 'apo', '60 min · 160°C', 60)]);
  const all = (plan: ReturnType<typeof planHour>) => [...plan.steps, ...plan.after].map((s) => s.title);

  it("tomorrow's optional prep is in tonight's hour only when prep ahead is on; must-do prep always is", () => {
    const on = planHour(input({ tomorrow: { dinner: { recipe: STEW2, portions: 4, prepAhead: true }, lunch: null, breakfast: null } }));
    expect(all(on)).toEqual(expect.arrayContaining(['For tomorrow: Marinate the beef', 'For tomorrow: Make the sauce']));
    expect(on.forTomorrow).toEqual({ title: 'Beef Stew', optional: 1, mustDo: ['Marinate the beef'], ahead: true });
    const off = planHour(input({ tomorrow: { dinner: { recipe: STEW2, portions: 4, prepAhead: false }, lunch: null, breakfast: null } }));
    expect(all(off)).toContain('For tomorrow: Marinate the beef');
    expect(all(off)).not.toContain('For tomorrow: Make the sauce');
    expect(off.forTomorrow).toMatchObject({ optional: 1, ahead: false });
  });

  it('the chopping boxed for tomorrow follows the tick', () => {
    const on = planHour(input({ tomorrow: { dinner: { recipe: STEW2, portions: 4, prepAhead: true }, lunch: null, breakfast: null } }));
    expect(on.chop.some((g) => g.where === 'box')).toBe(true);
    const off = planHour(input({ tomorrow: { dinner: { recipe: STEW2, portions: 4, prepAhead: false }, lunch: null, breakfast: null } }));
    expect(off.chop.some((g) => g.where === 'box')).toBe(false);
    expect(off.getOut.flatMap((g) => g.items).map((i) => i.name)).not.toContain('carrot');
  });

  it("skipped optional prep is done tonight, before tonight's cook, and tonight is chopped fresh", () => {
    const plan = planHour(input({ yesterdayPlanned: true, tonight: { recipe: STEW2, portions: 4, prepAhead: 'on_the_day' }, tomorrow: null }));
    const titles = plan.steps.map((s) => s.title);
    expect(titles).toContain("From yesterday's prep: Make the sauce");
    expect(titles.some((t) => t.includes('Marinate'))).toBe(false);
    expect(titles.indexOf("From yesterday's prep: Make the sauce")).toBeLessThan(titles.indexOf('Stew'));
    expect(plan.chop.some((g) => g.where === 'fridge')).toBe(false);
    expect(plan.doneLastNight).toEqual({ title: 'Beef Stew', steps: ['Marinate the beef'], state: 'on_the_day' });
  });

  it('missed prep: everything comes into tonight, must-do with a warning; no hour yesterday counts as missed', () => {
    const plan = planHour(input({ yesterdayPlanned: true, tonight: { recipe: STEW2, portions: 4, prepAhead: 'missed' }, tomorrow: null }));
    const titles = plan.steps.map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(["From yesterday's prep: Marinate the beef", "From yesterday's prep: Make the sauce"]));
    expect(plan.warnings).toContain('Marinate the beef: this needed the night before, so it gets less time tonight');
    expect(plan.doneLastNight).toEqual({ title: 'Beef Stew', steps: ['Marinate the beef', 'Make the sauce'], state: 'missed' });
    const none = planHour(input({ yesterdayPlanned: false, tonight: { recipe: STEW2, portions: 4 }, tomorrow: null }));
    expect(none.steps.map((s) => s.title)).toContain("From yesterday's prep: Marinate the beef");
    expect(none.doneLastNight).toBeNull();
  });

  it('a missed overnight marinade gets at most 30 minutes tonight, as a wait, not hours of hands-on', () => {
    const LONG = recipe('stew', 'Beef Stew', STEW2.ingredients, [{ ...MUST, timer_minutes: 480 }, ...STEW2.steps.slice(1)]);
    const plan = planHour(input({ yesterdayPlanned: false, tonight: { recipe: LONG, portions: 4 }, tomorrow: null }));
    const m = plan.steps.find((s) => s.title === "From yesterday's prep: Marinate the beef")!;
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    expect(mins(m.end) - mins(m.at)).toBe(30);
    expect(plan.handsOn).toBeLessThan(90);
  });

  it("each dinner step says which day's dinner and which recipe step it comes from; generated steps don't", () => {
    const plan = planHour(input({ yesterdayPlanned: false, tonight: { recipe: STEW2, portions: 4 }, tomorrow: { dinner: { recipe: STEW2, portions: 4 }, lunch: null, breakfast: null } }));
    const src = (t: string) => plan.steps.find((s) => s.title === t)?.source;
    expect(src('Stew')).toEqual({ date: '2026-11-12', phase: 'finish', title: 'Stew' });
    expect(src("From yesterday's prep: Make the sauce")).toEqual({ date: '2026-11-12', phase: 'prep_8pm', title: 'Make the sauce' });
    expect(src('For tomorrow: Make the sauce')).toEqual({ date: '2026-11-13', phase: 'prep_8pm', title: 'Make the sauce' });
    expect(src('Chop all the ingredients below')).toBeUndefined();
  });

  it('prep done last night stays out of tonight, and is listed as done', () => {
    const plan = planHour(input({ yesterdayPlanned: true, tonight: { recipe: STEW2, portions: 4, prepAhead: 'ahead' }, tomorrow: null }));
    expect(plan.steps.some((s) => s.title.startsWith("From yesterday's prep"))).toBe(false);
    expect(plan.doneLastNight).toEqual({ title: 'Beef Stew', steps: ['Marinate the beef', 'Make the sauce'], state: 'ahead' });
  });

  it('a dinner with only must-do prep has no optional steps to tick', () => {
    const plan = planHour(input({ tomorrow: { dinner: { recipe: STEW(MUST), portions: 4 }, lunch: null, breakfast: null } }));
    expect(plan.forTomorrow).toEqual({ title: 'Beef Stew', optional: 0, mustDo: ['Marinate the beef'], ahead: true });
    expect(planHour(input({ tonight: null, tomorrow: null })).forTomorrow).toBeNull();
  });

  it("a roast tomorrow shows its night-before steps and stays off the timeline", () => {
    const roast = { title: 'Sunday roast', steps: [{ time: '20:00', title: 'Salt the beef', partTitle: 'Topside' }] };
    const plan = planHour(input({ tomorrow: { dinner: null, lunch: null, breakfast: null, roast } }));
    expect(plan.roastAhead).toEqual(roast);
    expect(all(plan).some((t) => t.includes('Salt the beef'))).toBe(false);
  });
});
