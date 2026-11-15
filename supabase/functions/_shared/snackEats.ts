// Each person's snacks and meal partners (docs/superpowers/specs/2026-11-15-person-snacks-design.md). An eat is one
// person having a snack recipe at a meal or snack time, made on a make day. Makes aren't stored: they're the eats added
// up by make day and recipe, so everything is still made and bought as one family. Partners (overnight oats → 2 boiled
// eggs) are worked out from the planned breakfasts and lunches, so they follow any change. Pure: shared by the app,
// the connector and the Mac.
import { routineName } from './balance.ts';
import { addDays } from './planner.ts';

export interface Eat {
  date: string;
  slot: 'breakfast' | 'lunch' | 'snack_am' | 'snack_pm';
  member_id: string;
  recipe_id: string;
  qty: number;
  make_date: string;
  /** From a meal partner (worked out, never stored). */
  partner?: boolean;
  id?: string;
  /** Who put it on the week: Claude's plan, or the household (kept on a replan). */
  added_by?: 'claude' | 'household';
}
/** Routine name → member id → that person's partners for it. */
export type Partners = Record<string, Record<string, { recipe: string; qty: number }[]>>;
export interface SnackInfo { id: string; keeps_days: number | null; toddler_ok: boolean; /** Bought, never made. */ quick?: boolean }

type Slot = { date: string; slot: string; mode: string; recipe_id: string | null; routine_choice?: string | null; reason?: string | null; source_date?: string | null };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const SLOT_WORD = { snack_am: 'morning', snack_pm: 'afternoon' } as const;

/** The breakfast or lunch a day shows, by its plain routine name; null for a lunch that's a dinner (leftovers or a
 *  reheat), as balance.ts works it out. */
export function mealName(date: string, kind: 'breakfast' | 'lunch', slots: Slot[], recipes: Map<string, { reheats_well?: boolean }>,
  opts: { breakfasts?: string[]; homeLunches?: string[] } = {}): string | null {
  const s = slots.find((x) => x.date === date && x.slot === kind);
  if (!s) return null;
  if (kind === 'breakfast') return routineName(s.routine_choice ?? s.reason ?? opts.breakfasts?.[0]) || null;
  if (s.recipe_id || s.source_date || s.routine_choice === 'Leftovers') return null;
  if (s.mode === 'routine' && !s.routine_choice) {
    const last = slots.find((x) => x.date === addDays(date, -1) && x.slot === 'dinner' && x.mode === 'cook');
    if (last?.recipe_id && recipes.get(last.recipe_id)?.reheats_well) return null;
    return routineName(opts.homeLunches?.[0] ?? s.reason) || null;
  }
  return routineName(s.routine_choice ?? s.reason) || null;
}

/** The make day for something eaten on `date`: the latest make day before it that it keeps from, else the day before. */
function makeDayFor(date: string, keeps: number, makeDates: string[]): string {
  const ok = makeDates.filter((m) => m < date && daysBetween(m, date) <= keeps - 1).sort();
  return ok.length ? ok[ok.length - 1] : addDays(date, -1);
}

/** Each person's partners for the planned breakfasts and lunches on `dates`. */
export function partnerEats(dates: string[], slots: Slot[], partners: Partners | null | undefined, snacks: Map<string, SnackInfo>,
  makeDates: string[], recipes: Map<string, { reheats_well?: boolean }>, opts: { breakfasts?: string[]; homeLunches?: string[] } = {}): Eat[] {
  const out: Eat[] = [];
  if (!partners) return out;
  for (const date of dates) {
    for (const kind of ['breakfast', 'lunch'] as const) {
      const name = mealName(date, kind, slots, recipes, opts);
      const forMeal = name ? partners[name] : undefined;
      if (!forMeal) continue;
      for (const [member_id, items] of Object.entries(forMeal)) {
        for (const item of items ?? []) {
          const r = snacks.get(item.recipe);
          if (!r || !(item.qty > 0)) continue;
          out.push({ date, slot: kind, member_id, recipe_id: r.id, qty: item.qty, make_date: makeDayFor(date, r.keeps_days ?? 1, makeDates), partner: true });
        }
      }
    }
  }
  return out;
}

/** Where a new eat is made: a make of the same recipe on or before its day that still keeps, else the latest make day
 *  it keeps from, else the day before. */
export function placeEat(eat: Omit<Eat, 'make_date'>, existing: Eat[], keeps: number, makeDates: string[]): Eat {
  const joins = existing.filter((e) => e.recipe_id === eat.recipe_id && e.make_date <= eat.date && daysBetween(e.make_date, eat.date) <= keeps - 1)
    .map((e) => e.make_date).sort();
  return { ...eat, make_date: joins.length ? joins[joins.length - 1] : makeDayFor(eat.date, keeps, makeDates) };
}

/** The makes: eats added up by make day and recipe, as slots that shopping and Today's cooking read. `factor` gives
 *  servings of the recipe per snack (snackRules.snackFactor), so the make's portions are the recipe's. */
export function makeSlots(eats: Eat[], factor: (recipeId: string) => number = () => 1): { date: string; slot: 'snack'; mode: 'cook'; recipe_id: string; portions: number; reason: string; source_date: null }[] {
  const by = new Map<string, { date: string; slot: 'snack'; mode: 'cook'; recipe_id: string; portions: number; reason: string; source_date: null }>();
  for (const e of eats) {
    const key = `${e.make_date}|${e.recipe_id}`;
    const m = by.get(key) ?? { date: e.make_date, slot: 'snack' as const, mode: 'cook' as const, recipe_id: e.recipe_id, portions: 0, reason: 'Snack', source_date: null };
    m.portions = Math.round((m.portions + e.qty * factor(e.recipe_id)) * 100) / 100;
    by.set(key, m);
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || a.recipe_id.localeCompare(b.recipe_id));
}

type Member = { id: string; name: string; kind: string };
type Pool = Map<string, SnackInfo & { slug: string }>;
const findPerson = (members: Member[], name: unknown) => {
  const m = members.find((x) => x.name.toLowerCase() === String(name ?? '').trim().toLowerCase());
  if (!m) throw new Error(`No one called "${name}". Use a name from members.`);
  return m;
};
const findSnack = (pool: Pool, name: unknown) => {
  const t = String(name ?? '').trim().toLowerCase();
  const r = pool.get(t) ?? [...pool.values()].find((x) => x.slug === t);
  if (!r) throw new Error(`No snack recipe "${name}". Use one from snackRecipes, or add it as a new recipe with kind "snack".`);
  return r;
};
const quantity = (v: unknown, what: string) => {
  const q = v == null ? 1 : Number(v);
  if (!Number.isFinite(q) || q <= 0 || q > 6) throw new Error(`${what}: qty must be more than 0 and at most 6`);
  return q;
};

/** Claude's snacks: `[{ person, date, slot: 'am' | 'pm', recipe, qty, make_date }]`, checked. `snacks` is keyed by
 *  slug and lower-case title. */
export function parseEats(raw: unknown, ctx: { dates: string[]; makeDates: string[]; members: Member[]; snacks: Pool }): Eat[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('"snacks" must be a list');
  const taken = new Set<string>();
  return raw.map((s: Record<string, unknown>) => {
    const m = findPerson(ctx.members, s?.person);
    const r = findSnack(ctx.snacks, s?.recipe);
    const date = String(s?.date ?? '');
    if (!ctx.dates.includes(date)) throw new Error(`${date || 'A snack with no date'} isn't in the week`);
    if (s.slot !== 'am' && s.slot !== 'pm') throw new Error(`${r.slug}: slot must be am or pm`);
    const slot = s.slot === 'am' ? 'snack_am' : 'snack_pm';
    // A quick snack isn't made: it's bought for the day it's eaten.
    const make = r.quick ? date : String(s?.make_date ?? '');
    if (!r.quick && !ctx.makeDates.includes(make)) throw new Error(`${make || 'A snack with no make_date'} isn't a snack-making day. Use one of ${ctx.makeDates.join(', ')}.`);
    if (date < make) throw new Error(`${r.slug} on ${date} is before it's made (${make})`);
    const keeps = r.keeps_days ?? 1;
    if (daysBetween(make, date) > keeps - 1) throw new Error(`${r.slug} keeps ${keeps} days from ${make}, so not until ${date}`);
    if (m.kind === 'child' && !r.toddler_ok) throw new Error(`${r.slug} isn't toddler-friendly, so not for ${m.name}`);
    const key = `${m.id}|${date}|${slot}`;
    if (taken.has(key)) throw new Error(`${m.name} has two ${SLOT_WORD[slot]} snacks on ${date}`);
    taken.add(key);
    return { date, slot, member_id: m.id, recipe_id: r.id, qty: quantity(s.qty, r.slug), make_date: make };
  });
}

/** Claude's new or changed partners: `[{ meal, person, recipe, qty }]` (qty 0 removes that person's partners for the
 *  meal). */
export function parsePartners(raw: unknown, ctx: { members: Member[]; snacks: Pool; meals: string[] }): Partners | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new Error('"partners" must be a list');
  const out: Partners = {};
  for (const p of raw as Record<string, unknown>[]) {
    const meal = routineName(String(p?.meal ?? ''));
    if (!ctx.meals.includes(meal)) throw new Error(`"${p?.meal}" isn't one of the breakfasts or lunches (${ctx.meals.join(', ')})`);
    const m = findPerson(ctx.members, p?.person);
    const list = ((out[meal] ??= {})[m.id] ??= []);
    if (Number(p?.qty) === 0) continue;
    const r = findSnack(ctx.snacks, p?.recipe);
    if (r.quick) throw new Error(`${r.slug} is a quick snack, and quick snacks can't be meal partners yet. Plan it as a snack instead.`);
    if (m.kind === 'child' && !r.toddler_ok) throw new Error(`${r.slug} isn't toddler-friendly, so not for ${m.name}`);
    list.push({ recipe: r.slug, qty: quantity(p.qty, r.slug) });
  }
  return Object.keys(out).length ? out : null;
}
