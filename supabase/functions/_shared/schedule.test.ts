import { londonParts, nextMonday, shouldPropose } from './schedule';

test.each([
  ['Fri 10 Jul 2026 18:30 UTC is 19:30 in London (summer)', '2026-07-10T18:30:00Z', true],
  ['Fri 10 Jul 2026 19:30 UTC is 20:30 in London: a retry run', '2026-07-10T19:30:00Z', true],
  ['Fri 10 Jul 2026 17:30 UTC is 18:30 in London: too early', '2026-07-10T17:30:00Z', false],
  ['Fri 4 Dec 2026 19:15 UTC is 19:15 in London (winter)', '2026-12-04T19:15:00Z', true],
  ['Fri 4 Dec 2026 18:15 UTC is 18:15 in London', '2026-12-04T18:15:00Z', false],
  ['Thursday 19:00 London', '2026-12-03T19:00:00Z', false],
  ['Fri 30 Oct 2026, first Friday after the clocks go back', '2026-10-30T19:05:00Z', true],
])('%s', (_label, iso, go) => {
  expect(shouldPropose(new Date(iso)).go).toBe(go);
});

test('the plan is for the Monday after', () => {
  expect(shouldPropose(new Date('2026-10-16T18:00:00Z')).weekStart).toBe('2026-10-19');
  expect(shouldPropose(new Date('2026-12-04T19:15:00Z')).weekStart).toBe('2026-12-07');
});

test('next Monday from any day', () => {
  expect(nextMonday('2026-10-16')).toBe('2026-10-19'); // Friday
  expect(nextMonday('2026-10-19')).toBe('2026-10-26'); // a Monday → the following one
  expect(nextMonday('2026-10-18')).toBe('2026-10-19'); // Sunday
});

test('London date and hour', () => {
  expect(londonParts(new Date('2026-07-10T23:30:00Z'))).toEqual({ date: '2026-07-11', hour: 0, weekday: 6 });
});
