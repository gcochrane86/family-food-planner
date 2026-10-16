// When the Friday proposal runs. The scheduler fires hourly on Friday evenings in UTC; this decides
// which of those runs is 7pm in London, so the menu arrives at 7pm in both summer and winter time.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** London date (YYYY-MM-DD), hour (0–23) and ISO weekday (1 = Monday … 7 = Sunday). */
export function londonParts(now: Date): { date: string; hour: number; weekday: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: WEEKDAYS.indexOf(parts.weekday) + 1 };
}

/** The first Monday after the given date (a Monday gives the following Monday). */
export function nextMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const iso = ((d.getUTCDay() + 6) % 7) + 1;
  d.setUTCDate(d.getUTCDate() + (8 - iso));
  return d.toISOString().slice(0, 10);
}

export function shouldPropose(now: Date): { go: boolean; weekStart: string } {
  const { date, hour, weekday } = londonParts(now);
  return { go: weekday === 5 && hour === 19, weekStart: nextMonday(date) };
}
