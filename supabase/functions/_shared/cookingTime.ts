// Today's cooking: how long each day has for cooking (the dinner, prep for the next day, and the extras). Set per day
// of the week in Settings (an hour unless changed), and changeable for one week when it's planned (plan_weeks).
// Pure: shared by the app, the planner and the connector.

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const MIN_MINUTES = 30;
export const MAX_MINUTES = 240;
const DEFAULT = 60;

type Settings = { cooking_minutes?: unknown; hour_minutes?: unknown };

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= MIN_MINUTES && v <= MAX_MINUTES;

/** Each day of the week's cooking time: its own setting, else the old single hour length, else an hour. */
export function weekdayMinutes(settings: Settings): Record<Weekday, number> {
  const fallback = valid(settings.hour_minutes) ? Math.round(settings.hour_minutes) : DEFAULT;
  const own = (settings.cooking_minutes ?? {}) as Record<string, unknown>;
  return Object.fromEntries(WEEKDAYS.map((d) => [d, valid(own[d]) ? Math.round(own[d] as number) : fallback])) as Record<Weekday, number>;
}

/** Monday = 0 … Sunday = 6, for a YYYY-MM-DD date. */
const weekdayOf = (date: string): Weekday => WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];

/** A date's cooking time: the week's own time for that date when it has one, else its weekday's. */
export function dayMinutes(date: string, settings: Settings, week?: Record<string, unknown> | null): number {
  const own = week?.[date];
  return valid(own) ? Math.round(own) : weekdayMinutes(settings)[weekdayOf(date)];
}

/** The seven days from a Monday. */
export function weekMinutes(weekStart: string, settings: Settings, week?: Record<string, unknown> | null): number[] {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return WEEKDAYS.map((_, i) => dayMinutes(new Date(start + i * 86_400_000).toISOString().slice(0, 10), settings, week));
}

/** 60 → "an hour", 90 → "an hour and a half", 120 → "2 hours", 75 → "1 hour 15 minutes", 45 → "45 minutes". */
export function minutesInWords(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} minutes`;
  if (m === 0) return h === 1 ? 'an hour' : `${h} hours`;
  if (m === 30) return h === 1 ? 'an hour and a half' : `${h} and a half hours`;
  return `${h} hour${h === 1 ? '' : 's'} ${m} minutes`;
}
