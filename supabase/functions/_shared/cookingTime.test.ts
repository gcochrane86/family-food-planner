import { dayMinutes, minutesInWords, weekMinutes, weekdayMinutes } from './cookingTime.ts';

test('every day is an hour until the household says otherwise', () => {
  expect(weekdayMinutes({})).toEqual({ mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 });
});

test('an old hour length is every day\'s time', () => {
  expect(weekdayMinutes({ hour_minutes: 75 }).thu).toBe(75);
});

test('each day its own time; values out of range fall back', () => {
  const m = weekdayMinutes({ cooking_minutes: { wed: 120, thu: 10, fri: 500, sat: 'x' } });
  expect(m).toEqual({ mon: 60, tue: 60, wed: 120, thu: 60, fri: 60, sat: 60, sun: 60 });
});

test("a week's own time for a date wins over the weekday's", () => {
  const s = { cooking_minutes: { wed: 120 } };
  expect(dayMinutes('2026-11-18', s, { '2026-11-18': 90 })).toBe(90); // a Wednesday
  expect(dayMinutes('2026-11-25', s, { '2026-11-18': 90 })).toBe(120);
  expect(dayMinutes('2026-11-20', s, null)).toBe(60);
  expect(dayMinutes('2026-11-18', s, { '2026-11-18': 5 })).toBe(120);
});

test('the week, Monday first', () => {
  expect(weekMinutes('2026-11-16', { cooking_minutes: { sun: 150 } }, { '2026-11-18': 90 })).toEqual([60, 60, 90, 60, 60, 60, 150]);
});

test('minutes in words', () => {
  expect(minutesInWords(60)).toBe('an hour');
  expect(minutesInWords(90)).toBe('an hour and a half');
  expect(minutesInWords(120)).toBe('2 hours');
  expect(minutesInWords(150)).toBe('2 and a half hours');
  expect(minutesInWords(45)).toBe('45 minutes');
  expect(minutesInWords(75)).toBe('1 hour 15 minutes');
});
