import { DEFAULT_BREAKFASTS, HOME_LUNCHES } from './mealPhotos';
import type { DeliverySlot, Member, Settings, StapleStatus } from './types';

const WEIGHT_ERROR = 'Enter a number between 0.1 and 3';

/** Parses a portion weight as typed on a phone: "1,25" and "1.25" both mean 1.25. */
export function parseWeight(input: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: WEIGHT_ERROR };
  const value = Number(s);
  if (value < 0.1 || value > 3) return { ok: false, error: WEIGHT_ERROR };
  return { ok: true, value };
}

/** Standard portions one household dinner needs (spec §3: 1.25 + 1.25 + 0.5 = 3.0). */
export function householdPortions(members: Pick<Member, 'portion_weight'>[]): number {
  const total = members.reduce((sum, m) => sum + Number(m.portion_weight), 0);
  return Math.round(total * 100) / 100;
}

const STAPLE_CYCLE: StapleStatus[] = ['have', 'low', 'out'];
export function nextStaple(s: StapleStatus): StapleStatus {
  return STAPLE_CYCLE[(STAPLE_CYCLE.indexOf(s) + 1) % STAPLE_CYCLE.length];
}

export const DEFAULT_SETTINGS: Settings = {
  weekday_dinner_max_min: 30,
  default_plan_days: 7,
  shops_per_week: 2,
  delivery_slots: [
    { day: 'sun', start: '19:00', end: '20:00' },
    { day: 'tue', start: '19:00', end: '20:00' },
  ],
  delivery_pass: false,
  use_nectar: false,
  adventure: 1,
  breakfasts: DEFAULT_BREAKFASTS,
  lunches: HOME_LUNCHES,
};

const DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isSlot = (x: unknown): x is DeliverySlot => {
  const s = x as DeliverySlot;
  return !!s && DAYS.has(s.day) && TIME.test(s.start) && TIME.test(s.end);
};

/** Reads stored settings JSON, keeping valid values and filling the rest from the defaults. */
/** A breakfast or lunch list: trimmed names of 1–60 characters, no repeats (ignoring case), at most 20. */
function mealList(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    const name = typeof x === 'string' ? x.trim() : '';
    if (!name || name.length > 60 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.length ? out.slice(0, 20) : fallback;
}

export function validateSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const minutes = num(r.weekday_dinner_max_min);
  return {
    weekday_dinner_max_min: minutes === undefined ? d.weekday_dinner_max_min : Math.min(120, Math.max(10, Math.round(minutes))),
    default_plan_days: r.default_plan_days === 5 || r.default_plan_days === 7 ? r.default_plan_days : d.default_plan_days,
    shops_per_week: r.shops_per_week === 1 || r.shops_per_week === 2 ? r.shops_per_week : d.shops_per_week,
    delivery_slots: Array.isArray(r.delivery_slots) && r.delivery_slots.every(isSlot) ? r.delivery_slots : d.delivery_slots,
    delivery_pass: bool(r.delivery_pass, d.delivery_pass),
    use_nectar: bool(r.use_nectar, d.use_nectar),
    adventure: num(r.adventure) !== undefined ? Math.min(7, Math.max(0, Math.round(r.adventure as number))) : d.adventure,
    breakfasts: mealList(r.breakfasts, d.breakfasts),
    lunches: mealList(r.lunches, d.lunches),
  };
}
