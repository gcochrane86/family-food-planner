import { choiceFromQuery, parseRoastPart, parseRoastChoice, roastPartSlugs, roastQuery, suits } from './roastModel';

const step = { title: 'Roasties in', before: 48, minutes: 44, kit: 'oven', temp: 210, fan: true, trays: 2, when: 'service' };

test('reads a roast part, with sensible defaults', () => {
  expect(parseRoastPart({ part: 'side', mains: ['beef', 'lamb'], steps: [step, { title: 'Peel', before: 300, minutes: 20, kit: 'counter' }] })).toEqual({
    part: 'side', mains: ['beef', 'lamb'],
    steps: [{ ...step }, { title: 'Peel', before: 300, minutes: 20, kit: 'counter', trays: 1, when: 'morning' }],
  });
});

test('a part with no mains listed suits every main', () => {
  expect(parseRoastPart({ part: 'side', steps: [step] })!.mains).toEqual(['beef', 'chicken', 'lamb']);
});

test('rejects what it cannot plan', () => {
  expect(parseRoastPart(null)).toBeNull();
  expect(parseRoastPart({ part: 'pudding', steps: [] })).toBeNull();
  expect(parseRoastPart({ part: 'side', steps: [{ ...step, kit: 'microwave' }] })).toBeNull();
  expect(parseRoastPart({ part: 'side', steps: [{ ...step, title: '' }] })).toBeNull();
  expect(parseRoastPart({ part: 'side', steps: [{ ...step, minutes: -5 }] })).toBeNull();
});

test('a dinner\'s roast choice: main, sides, people 1–40, serve HH:MM', () => {
  expect(parseRoastChoice({ main: 'beef', sides: ['roasties'], people: 15, serve: '13:30' })).toEqual({ main: 'beef', sides: ['roasties'], people: 15, serve: '13:30' });
  expect(parseRoastChoice({ main: 'pork', sides: [], people: 4, serve: '13:30' })).toBeNull();
  expect(parseRoastChoice({ main: 'beef', sides: [], people: 0, serve: '13:30' })).toBeNull();
  expect(parseRoastChoice({ main: 'beef', sides: [], people: 4, serve: '25:00' })).toBeNull();
});

test('a step can be one or two days ahead, at a set time', () => {
  const part = parseRoastPart({ part: 'main', mains: ['ham'], steps: [
    { title: 'Soak the gammon', before: 0, minutes: 5, kit: 'counter', when: 'day2', at: '18:00' },
    { title: 'Simmer', before: 0, minutes: 150, kit: 'hob', when: 'day1', at: '10:00' }] })!;
  expect(part.mains).toEqual(['ham']);
  expect(part.steps.map((s) => [s.when, s.at])).toEqual([['day2', '18:00'], ['day1', '10:00']]);
  expect(parseRoastPart({ part: 'main', mains: ['ham'], steps: [{ title: 'x', before: 0, minutes: 5, kit: 'counter', when: 'day1' }] })).toBeNull();
});

test('a Christmas choice keeps every main and the extra main parts', () => {
  const c = parseRoastChoice({ occasion: 'christmas', main: 'turkey', mains: ['turkey', 'ham'], extras: ['christmas-ham'], sides: ['roast-gravy'], people: 10, serve: '14:00' })!;
  expect(c).toMatchObject({ occasion: 'christmas', main: 'turkey', mains: ['turkey', 'ham'], extras: ['christmas-ham'] });
  expect(roastPartSlugs(c)).toEqual(['roast-gravy', 'christmas-ham']);
});

test('until it names them, a side suits turkey when it suits chicken, and ham when it suits beef', () => {
  const side = (mains: string[]) => parseRoastPart({ part: 'side', mains, steps: [] })!;
  expect(suits(side(['chicken']), 'turkey')).toBe(true);
  expect(suits(side(['beef']), 'turkey')).toBe(false);
  expect(suits(side(['beef']), 'ham')).toBe(true);
  expect(suits(side(['lamb']), 'ham')).toBe(false);
  expect(suits(side(['turkey']), 'turkey')).toBe(true);
});

test('a main can name its cut, a default doneness, and step times for each doneness', () => {
  const part = parseRoastPart({ part: 'main', mains: ['beef'], cut: 'Ribeye', doneness: 'medium', steps: [
    { title: 'Roast', before: 100, minutes: 80, kit: 'oven', temp: 180, when: 'service', byDoneness: { rare: 60, medium: 80, well_done: 110, burnt: 999 } }] })!;
  expect(part).toMatchObject({ cut: 'Ribeye', doneness: 'medium' });
  expect(part.steps[0].byDoneness).toEqual({ rare: 60, medium: 80, well_done: 110 });
  expect(parseRoastPart({ part: 'main', mains: ['beef'], cut: 'Brisket', steps: [] })).toMatchObject({ cut: 'Brisket' });
  expect(parseRoastPart({ part: 'main', mains: ['beef'], cut: 'Brisket', steps: [] })!.doneness).toBeUndefined();
});

test('a roast choice keeps its cut and doneness', () => {
  expect(parseRoastChoice({ main: 'beef', cut: 'roast-ribeye', doneness: 'medium_rare', sides: [], people: 6, serve: '13:30' }))
    .toMatchObject({ cut: 'roast-ribeye', doneness: 'medium_rare' });
  expect(parseRoastChoice({ main: 'beef', doneness: 'blue', sides: [], people: 6, serve: '13:30' })!.doneness).toBeUndefined();
});

test('a roast choice goes to and from a link the same', () => {
  const c = { occasion: 'christmas' as const, main: 'turkey' as const, mains: ['turkey', 'ham'] as ('turkey' | 'ham')[], extras: ['christmas-ham'], sides: ['roast-gravy'], people: 10, serve: '14:00' };
  expect(choiceFromQuery(new URLSearchParams(roastQuery(c)))).toEqual(c);
  const beef = { main: 'beef' as const, cut: 'roast-ribeye', doneness: 'medium_rare' as const, sides: [], people: 6, serve: '13:30' };
  expect(choiceFromQuery(new URLSearchParams(roastQuery(beef)))).toEqual(beef);
  expect(new URLSearchParams(roastQuery(beef, '09:15')).get('prep')).toBe('09:15');
});
