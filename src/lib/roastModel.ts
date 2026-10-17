// The roast builder's building blocks: a roast part (a main or a side) describes each of its steps by how long before
// serving it starts, how long it takes, and which kit it needs. A dinner planned as a roast records the choice.
export type RoastMain = 'beef' | 'chicken' | 'lamb';
export type RoastKit = 'oven' | 'grill' | 'warm' | 'apo' | 'tm7' | 'hob' | 'hy24' | 'counter';
export type RoastWhen = 'night' | 'morning' | 'service';

export interface RoastStep {
  title: string;
  before: number;   // minutes before serving that it starts
  minutes: number;  // how long it takes (or occupies its kit)
  kit: RoastKit;
  temp?: number;    // °C, for oven / apo / hy24
  fan?: boolean;
  trays?: number;   // oven shelves it takes per 8 people (0.5 = half a shelf)
  when: RoastWhen;
}
export interface RoastPart { part: 'main' | 'side'; mains: RoastMain[]; steps: RoastStep[] }
export interface RoastChoice { main: RoastMain; sides: string[]; people: number; serve: string }

export const MAINS: RoastMain[] = ['beef', 'chicken', 'lamb'];
const KITS: RoastKit[] = ['oven', 'grill', 'warm', 'apo', 'tm7', 'hob', 'hy24', 'counter'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Night before (12 hours or more ahead), the morning, or the service countdown, unless a step says. */
const defaultWhen = (before: number): RoastWhen => (before >= 720 ? 'night' : before > 90 ? 'morning' : 'service');

function parseStep(raw: unknown): RoastStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const before = num(s.before);
  const minutes = num(s.minutes);
  if (typeof s.title !== 'string' || !s.title.trim() || before === undefined || before < 0 || minutes === undefined || minutes < 0) return null;
  if (!KITS.includes(s.kit as RoastKit)) return null;
  const step: RoastStep = { title: s.title, before, minutes, kit: s.kit as RoastKit, trays: Math.max(0.25, num(s.trays) ?? 1), when: (['night', 'morning', 'service'] as const).includes(s.when as RoastWhen) ? s.when as RoastWhen : defaultWhen(before) };
  const temp = num(s.temp);
  if (temp !== undefined) step.temp = temp;
  if (typeof s.fan === 'boolean') step.fan = s.fan;
  return step;
}

/** A recipe's roast description, or null when it can't be planned. Parts with no mains listed suit every main. */
export function parseRoastPart(raw: unknown): RoastPart | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.part !== 'main' && r.part !== 'side') return null;
  if (!Array.isArray(r.steps)) return null;
  const steps = r.steps.map(parseStep);
  if (steps.some((s) => !s)) return null;
  const mains = Array.isArray(r.mains) ? r.mains.filter((m): m is RoastMain => MAINS.includes(m as RoastMain)) : [];
  return { part: r.part, mains: mains.length ? mains : [...MAINS], steps: steps as RoastStep[] };
}

/** A dinner's roast: a main, its sides (part slugs), 1–40 people and a serve time. */
export function parseRoastChoice(raw: unknown): RoastChoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const people = num(c.people);
  if (!MAINS.includes(c.main as RoastMain) || !Array.isArray(c.sides) || people === undefined || people < 1 || people > 40) return null;
  if (typeof c.serve !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.serve)) return null;
  return { main: c.main as RoastMain, sides: c.sides.filter((s): s is string => typeof s === 'string'), people: Math.round(people), serve: c.serve };
}
