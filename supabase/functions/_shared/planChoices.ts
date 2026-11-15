// Plan with Claude: the week's choices (office days, nights off, cooking time, prep days, the weeknight limit, new
// recipes, things to use up), filled in from the usual week and saved with the plan request. Pure: shared by the app
// (the screen), the planner input and the connector. See docs/superpowers/specs/2026-11-15-plan-choices-design.md.
import { MAX_MINUTES, MIN_MINUTES, weekMinutes } from './cookingTime.ts';
import { addDays, type PlannerInput } from './planner.ts';

export interface PlanChoices {
  /** Adult member id → office weekdays (0 = Monday … 4 = Friday). */
  office: Record<string, number[]>;
  /** Dates in the week with no dinner planned or bought. */
  nightsOff: string[];
  /** Date → minutes for cooking, every date of the week. */
  cookingMinutes: Record<string, number>;
  /** Longer prep days, weekdays 0–6. */
  prepDays: number[];
  weekdayMaxMin: number;
  newRecipes: number;
  /** Freezer and pantry things to build dinners around. */
  useUp: string[];
}

export const PREP_DAY_MINUTES = 120;
const LIMIT_DEFAULT = 30;
const NEW_DEFAULT = 1;
const NEW_MAX = 7;

type Settings = { cooking_minutes?: unknown; hour_minutes?: unknown; weekday_dinner_max_min?: unknown; adventure?: unknown; prep_days?: unknown };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const weekdays = (v: unknown, max: number): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((d): d is number => isInt(d) && d >= 0 && d <= max))].sort((a, b) => a - b) : [];
const weekDates = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
const limitOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : LIMIT_DEFAULT);
const newOf = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(NEW_MAX, Math.max(0, Math.round(v))) : fallback);

/** The usual week, as choices for the week starting `weekStart`. */
export function usualChoices(weekStart: string, settings: Settings, adults: { id: string }[],
  pattern: { member_id: string; weekday: number; office: boolean }[]): PlanChoices {
  const prepDays = weekdays(settings.prep_days, 6);
  // A longer prep day has at least 2 hours.
  const minutes = weekMinutes(weekStart, settings).map((m, i) => (prepDays.includes(i) ? Math.max(PREP_DAY_MINUTES, m) : m));
  return {
    office: Object.fromEntries(adults.map((a) => [a.id,
      weekdays(pattern.filter((p) => p.member_id === a.id && p.office).map((p) => p.weekday), 4)])),
    nightsOff: [],
    cookingMinutes: Object.fromEntries(weekDates(weekStart).map((d, i) => [d, minutes[i]])),
    prepDays,
    weekdayMaxMin: limitOf(settings.weekday_dinner_max_min),
    newRecipes: newOf(settings.adventure, NEW_DEFAULT),
    useUp: [],
  };
}

/** Choices read back from a plan request: anything outside the week or out of range is dropped. */
export function parseChoices(raw: unknown, weekStart: string): PlanChoices | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const dates = new Set(weekDates(weekStart));
  const office: Record<string, number[]> = {};
  if (r.office && typeof r.office === 'object' && !Array.isArray(r.office)) {
    for (const [id, days] of Object.entries(r.office as Record<string, unknown>)) if (Array.isArray(days)) office[id] = weekdays(days, 4);
  }
  const cookingMinutes: Record<string, number> = {};
  if (r.cookingMinutes && typeof r.cookingMinutes === 'object') {
    for (const [d, m] of Object.entries(r.cookingMinutes as Record<string, unknown>)) {
      if (dates.has(d) && typeof m === 'number' && Number.isFinite(m) && m >= MIN_MINUTES && m <= MAX_MINUTES) cookingMinutes[d] = Math.round(m);
    }
  }
  return {
    office,
    nightsOff: Array.isArray(r.nightsOff) ? [...new Set(r.nightsOff.filter((d): d is string => typeof d === 'string' && dates.has(d)))].sort() : [],
    cookingMinutes,
    prepDays: weekdays(r.prepDays, 6),
    weekdayMaxMin: limitOf(r.weekdayMaxMin),
    newRecipes: newOf(r.newRecipes, NEW_DEFAULT),
    useUp: Array.isArray(r.useUp)
      ? r.useUp.filter((u): u is string => typeof u === 'string' && !!u.trim()).slice(0, 20).map((u) => u.trim().slice(0, 80))
      : [],
  };
}

/** The planner input for a week planned with these choices. */
export function applyChoices(input: PlannerInput, c: PlanChoices): PlannerInput {
  const officeDays = [...new Set(Object.values(c.office).flat())].sort((a, b) => a - b);
  const base = input.dayMinutes ?? Array(7).fill(60);
  const dayMinutes = base.map((m, i) => c.cookingMinutes[addDays(input.weekStart, i)] ?? m);
  return { ...input, officeDays, dayMinutes, weekdayMaxMin: c.weekdayMaxMin, nightsOff: [...c.nightsOff] };
}

/** The week's own cooking times: only the dates that differ from the settings, or null when none do. */
export function ownCookingMinutes(c: PlanChoices, settings: Settings): Record<string, number> | null {
  const dates = Object.keys(c.cookingMinutes).sort();
  if (!dates.length) return null;
  const usual = weekMinutes(addDays(dates[0], -((new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7)), settings);
  const own: Record<string, number> = {};
  for (const d of dates) {
    const i = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    if (c.cookingMinutes[d] !== usual[i]) own[d] = c.cookingMinutes[d];
  }
  return Object.keys(own).length ? own : null;
}

/** Picks or unpicks a longer prep day: picked, it has at least 2 hours; unpicked, its usual time comes back. */
export function setPrepDay(c: PlanChoices, usual: PlanChoices, weekday: number, on: boolean): PlanChoices {
  const date = Object.keys(usual.cookingMinutes).sort()[weekday];
  const prepDays = on ? weekdays([...c.prepDays, weekday], 6) : c.prepDays.filter((d) => d !== weekday);
  const cookingMinutes = { ...c.cookingMinutes };
  if (date) cookingMinutes[date] = on ? Math.max(PREP_DAY_MINUTES, cookingMinutes[date] ?? 0) : usual.cookingMinutes[date];
  return { ...c, prepDays, cookingMinutes };
}
