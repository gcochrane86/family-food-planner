import { planRoast, type RoastPartRecipe } from './roast';

// Parts as the owner's roast describes them (serve 13:30, prep from 08:45).
const p = (slug: string, part: 'main' | 'side', mains: string[], base: number, steps: object[]): RoastPartRecipe =>
  ({ id: `r-${slug}`, slug, title: slug, hero_image_path: null, base_portions: base, roast: { part, mains, steps } });
const PARTS = [
  p('roast-brisket', 'main', ['beef'], 15, [
    { title: 'Overnight braise', before: 900, minutes: 600, kit: 'apo', temp: 80, when: 'night' },
    { title: 'Harvest the juices', before: 280, minutes: 10, kit: 'counter', when: 'morning' },
    { title: 'Hold until service', before: 225, minutes: 221, kit: 'apo', temp: 65, when: 'morning' },
    { title: 'Carve', before: 4, minutes: 8, kit: 'counter', when: 'service' }]),
  p('roast-lamb', 'main', ['lamb'], 6, [
    { title: 'Stud the lamb', before: 270, minutes: 10, kit: 'counter', when: 'morning' },
    { title: 'Roast', before: 150, minutes: 110, kit: 'apo', temp: 180, when: 'service' },
    { title: 'Rest and carve', before: 35, minutes: 30, kit: 'counter', when: 'service' }]),
  p('goose-fat-roasties', 'side', [], 6, [
    { title: 'Steam the potatoes', before: 285, minutes: 60, kit: 'apo', temp: 85, when: 'morning' },
    { title: 'Rough up and dry', before: 225, minutes: 10, kit: 'counter', when: 'morning' },
    { title: 'Heat the goose fat', before: 54, minutes: 6, kit: 'oven', temp: 210, fan: true, trays: 1, when: 'service' },
    { title: 'Roast', before: 48, minutes: 44, kit: 'oven', temp: 210, fan: true, trays: 1, when: 'service' }]),
  p('yorkshire-puddings', 'side', [], 6, [
    { title: 'Make the batter', before: 275, minutes: 10, kit: 'tm7', when: 'morning' },
    { title: 'Heat the fat', before: 95, minutes: 20, kit: 'oven', temp: 220, fan: true, trays: 1, when: 'service' },
    { title: 'Bake', before: 75, minutes: 21, kit: 'oven', temp: 220, fan: true, trays: 1, when: 'service' },
    { title: 'Flash crisp', before: 4, minutes: 2, kit: 'grill', when: 'service' }]),
  p('honey-citrus-carrots', 'side', [], 6, [
    { title: 'Cut the carrots', before: 265, minutes: 8, kit: 'counter', when: 'morning' },
    { title: 'Roast', before: 54, minutes: 50, kit: 'oven', temp: 200, trays: 0.5, when: 'service' }]),
  p('bay-parsnips', 'side', [], 6, [
    { title: 'Cut the parsnips', before: 260, minutes: 8, kit: 'counter', when: 'morning' },
    { title: 'Roast', before: 54, minutes: 50, kit: 'oven', temp: 200, trays: 0.5, when: 'service' }]),
  p('cauliflower-cheese', 'side', [], 6, [
    { title: 'Cheese sauce and assemble', before: 250, minutes: 15, kit: 'tm7', when: 'morning' },
    { title: 'Bake', before: 42, minutes: 38, kit: 'oven', temp: 200, trays: 0.5, when: 'service' }]),
  p('mint-sauce', 'side', ['lamb'], 6, [{ title: 'Make the mint sauce', before: 240, minutes: 5, kit: 'tm7', when: 'morning' }]),
];
const parts = new Map(PARTS.map((x) => [x.slug, x]));
const beef = { main: 'beef' as const, sides: ['goose-fat-roasties', 'yorkshire-puddings', 'honey-citrus-carrots', 'bay-parsnips', 'cauliflower-cheese'], people: 15, serve: '13:30' };
const find = (plan: ReturnType<typeof planRoast>, part: string, title: string) =>
  plan.phases.flatMap((ph) => ph.steps).find((s) => s.part === part && s.title === title)!;

test("the owner's beef roast lands on the owner's times and ovens", () => {
  const plan = planRoast(beef, parts);
  expect(plan.warnings).toEqual([]);
  expect(find(plan, 'roast-brisket', 'Overnight braise')).toMatchObject({ time: '22:30', phase: 'Night before' });
  expect(find(plan, 'goose-fat-roasties', 'Steam the potatoes')).toMatchObject({ time: '08:45', phase: 'Morning prep' });
  expect(find(plan, 'yorkshire-puddings', 'Bake')).toMatchObject({ time: '12:15', kit: 'Oven 1 · 220°C fan' });
  expect(find(plan, 'goose-fat-roasties', 'Roast')).toMatchObject({ time: '12:42', kit: 'Oven 1 · 210°C fan' });
  expect(find(plan, 'honey-citrus-carrots', 'Roast')).toMatchObject({ time: '12:36', kit: 'Oven 2 · 200°C' });
  expect(find(plan, 'cauliflower-cheese', 'Bake')).toMatchObject({ time: '12:48', kit: 'Oven 2 · 200°C' });
  expect(find(plan, 'yorkshire-puddings', 'Flash crisp')).toMatchObject({ time: '13:26', kit: 'Oven 3 · grill' });
  expect(plan.phases.map((ph) => ph.name)).toEqual(['Night before', 'Morning prep', 'Out and about', 'Service countdown']);
});

test('changing the serve and prep times moves the steps with them', () => {
  const plan = planRoast({ ...beef, serve: '14:00', prepAt: '09:15' }, parts);
  expect(find(plan, 'goose-fat-roasties', 'Steam the potatoes').time).toBe('09:15');
  expect(find(plan, 'goose-fat-roasties', 'Roast').time).toBe('13:12');
  expect(find(plan, 'roast-brisket', 'Overnight braise').time).toBe('23:00');
});

test('different temperatures at the same time go to different ovens', () => {
  const early = new Map(parts);
  early.set('honey-citrus-carrots', p('honey-citrus-carrots', 'side', [], 6, [{ title: 'Roast', before: 70, minutes: 50, kit: 'oven', temp: 200, trays: 0.5, when: 'service' }]));
  const plan = planRoast({ ...beef, sides: ['yorkshire-puddings', 'honey-citrus-carrots'], serve: '13:30' }, early);
  const york = find(plan, 'yorkshire-puddings', 'Bake').kit;
  const carrots = find(plan, 'honey-citrus-carrots', 'Roast').kit;
  expect(york.split(' · ')[0]).not.toBe(carrots.split(' · ')[0]);
});

test('more than the ovens can take is a warning, not an impossible plan', () => {
  const plan = planRoast({ ...beef, people: 40 }, parts);
  expect(plan.warnings.join(' ')).toMatch(/Too much for the ovens at \d\d:\d\d/);
});

test('more people means more trays', () => {
  const at15 = find(planRoast(beef, parts), 'goose-fat-roasties', 'Roast');
  const at30 = find(planRoast({ ...beef, people: 30 }, parts), 'goose-fat-roasties', 'Roast');
  expect(at15.trays).toBe(2);
  expect(at30.trays).toBe(4);
});

test('lamb: the joint roasts hands-off, but a long service countdown is pointed out', () => {
  const plan = planRoast({ main: 'lamb', sides: ['goose-fat-roasties', 'mint-sauce'], people: 6, serve: '13:30' }, parts);
  expect(find(plan, 'roast-lamb', 'Roast')).toMatchObject({ time: '11:00', phase: 'Out and about', quick: true });
  expect(find(plan, 'mint-sauce', 'Make the mint sauce').phase).toBe('Morning prep');
});

test('sides that suit the main, and the main\'s own steps, are the only ones used', () => {
  const plan = planRoast({ ...beef, sides: [...beef.sides, 'mint-sauce'] }, parts);
  expect(plan.phases.flatMap((ph) => ph.steps).some((s) => s.part === 'mint-sauce')).toBe(false);
  expect(plan.warnings.join(' ')).toMatch(/mint-sauce doesn't go with beef/);
});

test('hands-on work between morning prep and the countdown is flagged', () => {
  const needy = new Map(parts);
  needy.set('gravy', p('gravy', 'side', [], 6, [{ title: 'Stir the gravy', before: 150, minutes: 10, kit: 'hob', when: 'service' }]));
  const plan = planRoast({ ...beef, sides: ['gravy'] }, needy);
  expect(plan.warnings.join(' ')).toMatch(/needs you in the kitchen at 11:00/);
});

test('the kit timeline lists each appliance in time order', () => {
  const plan = planRoast(beef, parts);
  expect(plan.kit['Oven 1'].map((k) => k.time)).toEqual(['11:55', '12:15', '12:36', '12:42']);
  expect(Object.keys(plan.kit)).toEqual(expect.arrayContaining(['Oven 1', 'Oven 2', 'Oven 3', 'APO', 'TM7']));
});

test("prep and serve times that don't fit together are pointed out", () => {
  const late = planRoast({ ...beef, serve: '13:30', prepAt: '12:30' }, parts);
  expect(late.warnings.join(' ')).toMatch(/Morning prep runs into the lunchtime countdown/);
  const early = planRoast({ main: 'lamb', sides: [], people: 6, serve: '10:00', prepAt: '08:45' }, parts);
  expect(early.warnings.join(' ')).toMatch(/starts at 07:30, before your prep at 08:45/);
});
