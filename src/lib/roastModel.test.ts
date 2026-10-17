import { parseRoastPart, parseRoastChoice } from './roastModel';

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
