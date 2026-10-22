// The roast builder's building blocks: a roast part (a main or a side) describes each of its steps by how long before
// serving it starts, how long it takes, and which kit it needs. A dinner planned as a roast records the choice.
export type RoastMain = 'beef' | 'chicken' | 'lamb' | 'turkey' | 'ham';
export type RoastKit = 'oven' | 'grill' | 'warm' | 'apo' | 'tm7' | 'hob' | 'hy24' | 'counter';
// day2 and day1: two days and one day ahead (23 December and Christmas Eve), at a set clock time (`at`).
export type RoastWhen = 'day2' | 'day1' | 'night' | 'morning' | 'service';

/** How a joint is cooked, with the MEATER's target (it rises a few degrees more as it rests). */
export type Doneness = 'rare' | 'medium_rare' | 'medium' | 'medium_well' | 'well_done';
export const DONENESS: { value: Doneness; label: string; core: number }[] = [
  { value: 'rare', label: 'Rare', core: 50 },
  { value: 'medium_rare', label: 'Medium rare', core: 54 },
  { value: 'medium', label: 'Medium', core: 58 },
  { value: 'medium_well', label: 'Medium well', core: 63 },
  { value: 'well_done', label: 'Well done', core: 68 },
];
const isDoneness = (v: unknown): v is Doneness => DONENESS.some((d) => d.value === v);

export interface RoastStep {
  title: string;
  before: number;   // minutes before serving that it starts
  minutes: number;  // how long it takes (or occupies its kit)
  kit: RoastKit;
  temp?: number;    // °C, for oven / apo / hy24
  fan?: boolean;
  trays?: number;   // oven shelves it takes per 8 people (0.5 = half a shelf)
  when: RoastWhen;
  at?: string;      // HH:MM, for day2 and day1 steps
  byDoneness?: Partial<Record<Doneness, number>>; // minutes for each doneness (the joint's roast)
}
export interface RoastPart {
  part: 'main' | 'side'; mains: RoastMain[]; steps: RoastStep[];
  cut?: string;          // a main's cut, e.g. "Ribeye" (several mains for one meat are a choice of cut)
  doneness?: Doneness;   // a joint cooked to taste starts here; slow-cooked cuts have none
}
export interface RoastChoice {
  main: RoastMain; sides: string[]; people: number; serve: string;
  occasion?: 'christmas';
  mains?: RoastMain[];  // every main, when there's more than one (turkey and ham)
  extras?: string[];    // the slugs of the main parts after the first, so shopping buys them too
  cut?: string;         // the first main's part (slug), when the meat has a choice of cuts
  doneness?: Doneness;  // for a cut cooked to taste
}

/** The Sunday roast's mains; Christmas dinner has its own. */
export const MAINS: RoastMain[] = ['beef', 'chicken', 'lamb'];
export const CHRISTMAS_MAINS: RoastMain[] = ['turkey', 'ham'];
const ALL_MAINS: RoastMain[] = [...MAINS, ...CHRISTMAS_MAINS];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Until a side names turkey or ham, it suits turkey when it suits chicken, and ham when it suits beef.
const LIKE: Partial<Record<RoastMain, RoastMain>> = { turkey: 'chicken', ham: 'beef' };

/** Whether a part goes with a main. */
export function suits(part: RoastPart, main: RoastMain): boolean {
  if (part.mains.includes(main)) return true;
  const like = LIKE[main];
  return !!like && !part.mains.some((m) => CHRISTMAS_MAINS.includes(m)) && part.mains.includes(like);
}

/** Every part a roast uses besides its first main (found by slug): the sides, then the other mains. */
export const roastPartSlugs = (c: RoastChoice): string[] => [...c.sides, ...(c.extras ?? [])];
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
  const when = (['day2', 'day1', 'night', 'morning', 'service'] as const).includes(s.when as RoastWhen) ? s.when as RoastWhen : defaultWhen(before);
  // A step a day or two ahead happens at a clock time.
  if ((when === 'day2' || when === 'day1') && !(typeof s.at === 'string' && HHMM.test(s.at))) return null;
  const step: RoastStep = { title: s.title, before, minutes, kit: s.kit as RoastKit, trays: Math.max(0.25, num(s.trays) ?? 1), when };
  if (typeof s.at === 'string' && HHMM.test(s.at)) step.at = s.at;
  if (s.byDoneness && typeof s.byDoneness === 'object') {
    const by = Object.fromEntries(Object.entries(s.byDoneness as Record<string, unknown>).filter(([k, v]) => isDoneness(k) && (num(v) ?? -1) > 0));
    if (Object.keys(by).length) step.byDoneness = by as Partial<Record<Doneness, number>>;
  }
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
  const mains = Array.isArray(r.mains) ? r.mains.filter((m): m is RoastMain => ALL_MAINS.includes(m as RoastMain)) : [];
  const part: RoastPart = { part: r.part, mains: mains.length ? mains : [...MAINS], steps: steps as RoastStep[] };
  if (typeof r.cut === 'string' && r.cut.trim()) part.cut = r.cut.trim();
  if (isDoneness(r.doneness)) part.doneness = r.doneness;
  return part;
}

/** A dinner's roast: a main, its sides (part slugs), 1–40 people and a serve time. */
export function parseRoastChoice(raw: unknown): RoastChoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const people = num(c.people);
  if (!ALL_MAINS.includes(c.main as RoastMain) || !Array.isArray(c.sides) || people === undefined || people < 1 || people > 40) return null;
  if (typeof c.serve !== 'string' || !HHMM.test(c.serve)) return null;
  const choice: RoastChoice = { main: c.main as RoastMain, sides: c.sides.filter((s): s is string => typeof s === 'string'), people: Math.round(people), serve: c.serve };
  if (c.occasion === 'christmas') choice.occasion = 'christmas';
  const mains = Array.isArray(c.mains) ? c.mains.filter((m): m is RoastMain => ALL_MAINS.includes(m as RoastMain)) : [];
  if (mains.length > 1) choice.mains = [...new Set(mains)];
  const extras = Array.isArray(c.extras) ? c.extras.filter((s): s is string => typeof s === 'string') : [];
  if (extras.length) choice.extras = extras;
  if (typeof c.cut === 'string' && c.cut) choice.cut = c.cut;
  if (isDoneness(c.doneness)) choice.doneness = c.doneness;
  return choice;
}

/** A roast choice as a link's query (the builder and its cook view), with the prep time if given. */
export function roastQuery(c: RoastChoice, prepAt?: string): string {
  return new URLSearchParams({
    ...(c.occasion ? { occasion: c.occasion } : {}), main: c.main, ...(c.mains ? { mains: c.mains.join(',') } : {}),
    ...(c.extras ? { extras: c.extras.join(',') } : {}), sides: c.sides.join(','), people: String(c.people), serve: c.serve,
    ...(c.cut ? { cut: c.cut } : {}), ...(c.doneness ? { doneness: c.doneness } : {}), ...(prepAt ? { prep: prepAt } : {}),
  }).toString();
}

/** A roast choice from a link's query, or null. */
export function choiceFromQuery(q: URLSearchParams): RoastChoice | null {
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
  return parseRoastChoice({
    occasion: q.get('occasion'), main: q.get('main'), mains: list('mains'), extras: list('extras'), sides: list('sides'),
    people: Number(q.get('people')), serve: q.get('serve'), cut: q.get('cut'), doneness: q.get('doneness'),
  });
}
