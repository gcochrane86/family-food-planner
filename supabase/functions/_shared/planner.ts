// The weekly planner. Shared by the app (swaps and changes) and the propose-week Edge Function (Friday 7pm),
// so both follow the same rules. Pure functions, no imports: runs in the browser, Deno and Vitest.

export type Protein = 'chicken' | 'fish' | 'red_meat' | 'veggie' | 'egg' | 'other';
export type SlotKind = 'breakfast' | 'lunch' | 'dinner';
export type SlotMode = 'cook' | 'reheat' | 'leftovers' | 'out' | 'routine' | 'packed';

export interface PlannerRecipe {
  id: string;
  title: string;
  protein: Protein | null;
  finishMinutes: number;
  reheatsWell: boolean;
  basePortions: number;
}

export interface Balance { chicken: number; fish: number; red_meat: number; veggie: number }

export interface PlannerInput {
  weekStart: string;          // Monday, YYYY-MM-DD
  days: 5 | 7;
  recipes: PlannerRecipe[];   // meals only
  recentRecipeIds: string[];  // dinners from the last 14 days
  officeDays: number[];       // 0 = Monday
  balance: Balance;
  weekdayMaxMin: number;
  householdPortions: number;
  seed: number;
  breakfasts?: string[];      // your breakfast options; the built-in rotation when missing
}

export interface ProposedSlot {
  date: string;
  slot: SlotKind;
  recipeId: string | null;
  mode: SlotMode;
  portions: number | null;
  guests: number;
  locked: boolean;
  reason: string | null;
  sourceDate: string | null;  // for leftovers at lunch: the dinner they come from
}

const NAME: Record<Protein, string> = { chicken: 'chicken', fish: 'fish', red_meat: 'red meat', veggie: 'veggie', egg: 'egg', other: 'other' };
const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GUEST_PORTION = 1.25;
const OFFICE_MAX = 20;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayIndex = (weekStart: string, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000);

/** Small seeded random number generator, so a week is repeatable in tests but varies from week to week. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(list: T[], rnd: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function timeLimit(input: PlannerInput, i: number): number {
  if (i >= 5) return Infinity;
  return input.officeDays.includes(i) ? Math.min(OFFICE_MAX, input.weekdayMaxMin) : input.weekdayMaxMin;
}

/** Order of proteins across the dinner nights: meets the targets, avoids two in a row, and has a recipe for each. */
function proteinSequence(input: PlannerInput, nights: number[], rnd: () => number, fixed: Map<number, Protein | null>): (Protein | null)[] {
  const b = input.balance;
  const wanted: (Protein | null)[] = [
    ...Array(b.chicken).fill('chicken'), ...Array(b.fish).fill('fish'),
    ...Array(b.red_meat).fill('red_meat'), ...Array(b.veggie).fill('veggie'),
  ].slice(0, nights.length);
  while (wanted.length < nights.length) wanted.push(null);
  // Nights already decided (the cook-once dinner) use up one of their protein's places.
  for (const p of fixed.values()) {
    const at = wanted.indexOf(p);
    wanted.splice(at >= 0 ? at : Math.max(0, wanted.lastIndexOf(null)), 1);
  }
  const place = (rest: (Protein | null)[]) => {
    const out: (Protein | null)[] = [];
    let j = 0;
    for (let k = 0; k < nights.length; k++) out.push(fixed.has(k) ? fixed.get(k)! : rest[j++] ?? null);
    return out;
  };
  const fresh = input.recipes.filter((r) => !input.recentRecipeIds.includes(r.id));
  const score = (seq: (Protein | null)[]) => seq.reduce((s, p, k) => {
    let v = s;
    if (k > 0 && p && p === seq[k - 1]) v -= 5;
    if (p && !fresh.some((r) => r.protein === p && r.finishMinutes <= timeLimit(input, nights[k]))) v -= 1;
    return v;
  }, 0);
  let best = place(wanted);
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 300 && bestScore < 0; attempt++) {
    const seq = place(shuffle(wanted, rnd));
    const s = score(seq);
    if (s > bestScore) { best = seq; bestScore = s; }
  }
  return best;
}

export function proposeWeek(input: PlannerInput): ProposedSlot[] {
  const rnd = mulberry32(input.seed);
  const dates = Array.from({ length: input.days }, (_, i) => addDays(input.weekStart, i));
  // Every night gets a dinner (the owner dropped the Sunday leftovers night on 17 Oct 2026).
  const nights = dates.map((_, i) => i);
  const chosen = new Map<number, { recipe: PlannerRecipe | null; notes: string[] }>();
  const used = new Set<string>();
  const recent = new Set(input.recentRecipeIds);

  const fixed = new Map<number, Protein | null>();
  const plannedProtein = proteinSequence(input, nights, rnd, fixed);

  function chosenProtein(k: number): Protein | null {
    if (k < 0 || k >= nights.length) return null;
    return chosen.get(nights[k])?.recipe?.protein ?? null;
  }

  nights.forEach((i, k) => {
    if (chosen.has(i)) return;
    const p = plannedProtein[k];
    const before = chosenProtein(k - 1);
    const after = chosen.get(nights[k + 1])?.recipe?.protein ?? plannedProtein[k + 1] ?? null;
    const notNeighbour = (r: PlannerRecipe) => r.protein !== before && r.protein !== after;
    const fits = (r: PlannerRecipe) => r.finishMinutes <= timeLimit(input, i);
    const unused = (r: PlannerRecipe) => !used.has(r.id);
    const wantedKind = (r: PlannerRecipe) => (p ? r.protein === p : notNeighbour(r));
    const rules: { test: (r: PlannerRecipe) => boolean; note: (r: PlannerRecipe) => string | null }[] = [
      { test: (r) => wantedKind(r) && fits(r) && unused(r) && !recent.has(r.id), note: () => null },
      { test: (r) => wantedKind(r) && fits(r) && unused(r), note: () => `made recently, but it's the only ${p ? NAME[p] : ''} option`.replace('  ', ' ') },
      { test: (r) => notNeighbour(r) && fits(r) && unused(r) && !recent.has(r.id), note: (r) => `no ${p ? NAME[p] : 'other'} recipe fits, so ${NAME[r.protein ?? 'other']} instead` },
      { test: (r) => fits(r) && unused(r), note: () => `${p ? `no ${NAME[p]} recipe fits` : 'few recipes fit'}, so a repeat of a recent dish` },
      { test: (r) => fits(r), note: () => 'repeat: not enough recipes for a different dinner every night' },
      { test: () => true, note: () => `longer than your ${input.weekdayMaxMin}-minute weekday limit` },
    ];
    for (const rule of rules) {
      const options = input.recipes.filter(rule.test);
      if (!options.length) continue;
      const pick = options[Math.floor(rnd() * options.length)];
      const note = rule.note(pick);
      chosen.set(i, { recipe: pick, notes: note ? [note] : [] });
      used.add(pick.id);
      return;
    }
    chosen.set(i, { recipe: null, notes: [] });
  });

  const slots: ProposedSlot[] = [];
  let homeBreakfasts = 0;
  const list: string[] = input.breakfasts ?? ['Overnight oats', ...BREAKFAST_TURNS];
  const hasOvernight = list.includes('Overnight oats');
  const homeTurns = list.filter((b) => b !== 'Overnight oats');
  const turns: string[] = homeTurns.length ? homeTurns : list;
  dates.forEach((date, i) => {
    const office = input.officeDays.includes(i);
    // Overnight oats on office days (made at 8pm the night before) when it's one of your breakfasts; other days
    // take turns through the rest of your list.
    const breakfast = office && hasOvernight ? 'Overnight oats' : turns[homeBreakfasts++ % turns.length];
    slots.push({
      date, slot: 'breakfast', recipeId: null, mode: 'routine', portions: null, guests: 0, locked: false, sourceDate: null,
      reason: breakfast,
    });

    slots.push({
      date, slot: 'lunch', recipeId: null, mode: office ? 'packed' : 'routine',
      portions: null, guests: 0, locked: false, sourceDate: null,
      reason: office ? 'Packed lunch' : homeLunch(i > 0 ? chosen.get(i - 1)?.recipe ?? null : null),
    });

    const c = chosen.get(i)!;
    if (!c.recipe) {
      slots.push({ date, slot: 'dinner', recipeId: null, mode: 'leftovers', portions: null, guests: 0, locked: false, sourceDate: null,
        reason: 'No recipe fits this night, so leftovers or the freezer' });
      return;
    }
    const r = c.recipe;
    const what = r.protein ? cap(NAME[r.protein]) : 'Dinner';
    let reason: string;
    if (office) reason = `${what}, quick (${r.finishMinutes} min) for an office day`;
    else if (i >= 5) reason = `${what}: a weekend cook (${r.finishMinutes} min)`;
    else reason = `${what} · ${r.finishMinutes} min`;
    if (c.notes.length) reason += ` · ${c.notes.join(' · ')}`;
    slots.push({
      date, slot: 'dinner', recipeId: r.id, mode: 'cook', guests: 0, locked: false, sourceDate: null,
      portions: input.householdPortions, reason,
    });
  });
  return slots;
}

export const BREAKFAST_TURNS = ['Baked oats', 'Eggs & porridge'] as const;

/** What to have for a home lunch: last night's leftovers if that dinner reheats well, otherwise a sandwich. */
export function homeLunch(lastNight: { title: string; reheatsWell: boolean } | null): string {
  return lastNight?.reheatsWell ? `Leftover ${lastNight.title}, or a chicken sandwich` : 'Chicken sandwich on sourdough';
}

// Changes ----------------------------------------------------------------------

const clone = (plan: ProposedSlot[]) => plan.map((s) => ({ ...s }));
const dinnerAt = (plan: ProposedSlot[], date: string) => plan.find((s) => s.slot === 'dinner' && s.date === date);

/** Lunches that were going to be leftovers of this dinner go back to their usual routine. */
function releaseLeftovers(plan: ProposedSlot[], date: string) {
  for (const s of plan) {
    if (s.slot === 'lunch' && s.sourceDate === date) {
      const packed = s.mode === 'packed';
      Object.assign(s, { recipeId: null, sourceDate: null, mode: packed ? 'packed' : 'routine', reason: packed ? 'Packed lunch' : homeLunch(null) });
    }
  }
}

export function alternatives(plan: ProposedSlot[], date: string, input: PlannerInput, n = 3): { recipeId: string; reason: string }[] {
  const i = dayIndex(input.weekStart, date);
  const current = dinnerAt(plan, date)?.recipeId ?? null;
  const others = plan.filter((s) => s.slot === 'dinner' && s.date !== date && s.mode === 'cook' && s.recipeId);
  const byId = new Map(input.recipes.map((r) => [r.id, r]));
  const used = new Set(others.map((s) => s.recipeId));
  const count = (p: Protein) => others.filter((s) => byId.get(s.recipeId!)?.protein === p).length;
  const neighbour = (d: number) => byId.get(dinnerAt(plan, addDays(date, d))?.recipeId ?? '')?.protein ?? null;
  const before = neighbour(-1);
  const after = neighbour(1);
  const rnd = mulberry32(input.seed + i + 1);
  const target = (p: Protein | null) => (p && p in input.balance ? input.balance[p as keyof Balance] : 0);

  return input.recipes
    .filter((r) => r.id !== current && !used.has(r.id) && r.finishMinutes <= timeLimit(input, i))
    .map((r) => {
      const p = r.protein;
      let score = rnd() * 0.5;
      if (p && count(p) < target(p)) score += 3;
      if (p !== before && p !== after) score += 2;
      if (input.recentRecipeIds.includes(r.id)) score -= 2;
      const what = p ? NAME[p] : 'dinner';
      let reason = p && count(p) < target(p) ? `Keeps the week balanced: adds a ${what} night`
        : p === before ? `${cap(what)} again after ${DAY[i - 1]}` : `${cap(what)} · ${r.finishMinutes} min`;
      if (input.recentRecipeIds.includes(r.id)) reason += ' · made recently';
      return { recipeId: r.id, reason, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ recipeId, reason }) => ({ recipeId, reason }));
}

export function applySwap(plan: ProposedSlot[], date: string, recipeId: string, input: PlannerInput): ProposedSlot[] {
  const next = clone(plan);
  const d = dinnerAt(next, date);
  if (!d) return next;
  releaseLeftovers(next, date);
  Object.assign(d, { recipeId, mode: 'cook', locked: true, reason: 'Your choice', portions: input.householdPortions + d.guests * GUEST_PORTION });
  return next;
}

export function applyOut(plan: ProposedSlot[], date: string): ProposedSlot[] {
  const next = clone(plan);
  const d = dinnerAt(next, date);
  if (!d) return next;
  releaseLeftovers(next, date);
  Object.assign(d, { recipeId: null, mode: 'out', portions: null, guests: 0, locked: true, reason: 'Out tonight' });
  return next;
}

export function applyLeftovers(plan: ProposedSlot[], date: string): ProposedSlot[] {
  const next = clone(plan);
  const d = dinnerAt(next, date);
  if (!d) return next;
  releaseLeftovers(next, date);
  Object.assign(d, { recipeId: null, mode: 'leftovers', portions: null, guests: 0, locked: true, reason: 'Leftovers or freezer night' });
  return next;
}

export function applyGuests(plan: ProposedSlot[], date: string, guests: number, input: PlannerInput): ProposedSlot[] {
  const next = clone(plan);
  const d = dinnerAt(next, date);
  if (!d || d.mode !== 'cook') return next;
  const withoutGuests = (d.portions ?? input.householdPortions) - d.guests * GUEST_PORTION;
  Object.assign(d, { guests, portions: withoutGuests + guests * GUEST_PORTION });
  return next;
}
