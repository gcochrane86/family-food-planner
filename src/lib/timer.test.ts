import { remaining } from './timer';
import { fitWithin } from './image';

test('remaining time is worked out from the end time', () => {
  const now = 1_000_000;
  expect(remaining(now + 125_000, now)).toBe('02:05');
  expect(remaining(now + 20 * 60_000, now)).toBe('20:00');
  expect(remaining(now + 61 * 60_000, now)).toBe('61:00');
});

test('remaining time never goes below zero', () => {
  expect(remaining(1000, 5000)).toBe('00:00');
});

test('part seconds round up so the timer shows 00:01 until it is really done', () => {
  expect(remaining(1500, 1000)).toBe('00:01');
});

test('photos are scaled to fit inside the longest edge, keeping their shape', () => {
  expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
});
