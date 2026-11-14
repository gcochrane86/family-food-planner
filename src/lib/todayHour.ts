import { isRawProtein, keepsDays, needsChopping } from './chopAhead';
import { formatQty, machineLabel, stepIngredients } from './recipes';
import type { Machine, PrepAhead, RecipeDetail, RecipeIngredient, RecipeStep } from './types';
import { chopInstruction, isCartoonPrep, prepKey } from '../../supabase/functions/_shared/prepCut.ts';
import { getOutList, type GetOutGroup } from './getOut';

/**
 * Today's hour: one cooking hour a day (17:30–18:30 by default). Chopping first, in one session; then tonight's
 * dinner, with tomorrow's prep, a night-before breakfast and tomorrow's lunch fitted into the waits; then plate up,
 * pack the leftovers lunch, wipe down and start the dishwasher.
 */

type Cooked = { recipe: RecipeDetail; portions: number };
/** A roast's prep the evening before, from its own plan (shown, not fitted into the hour). */
export interface RoastAhead { title: string; steps: { time: string; title: string; partTitle: string }[]; /** The roast's cook view. */ link?: string }

export interface HourInput {
  date: string;
  start: string;
  minutes: number;
  tm7Bowls: 1 | 2;
  tm7Machines: 1 | 2;
  /** Tonight's cooked dinner, if there is one, and whether its prep was done in yesterday's hour (ahead, the default),
   *  skipped to tonight (on_the_day: only its must-do prep was done) or not done after all (missed). */
  tonight?: (Cooked & { prepAhead?: PrepAhead }) | null;
  /** Yesterday's hour ran, so tonight's prep (and veg that keeps) was done then, as tonight's prepAhead says. */
  yesterdayPlanned: boolean;
  /** Your photos of your machines, by machine code (Settings → Kitchen), for steps that are only about a machine. */
  kitPhotos?: Record<string, { path: string; name: string }>;
  /** Saved chopping photos, by ingredient-and-cut key (prepCut.ts). */
  prepPhotos?: Record<string, string>;
  tomorrow?: {
    /** prepAhead: its optional prep is done tonight (the default); must-do prep always is. */
    dinner?: (Cooked & { prepAhead?: boolean }) | null;
    /** A roast tomorrow: its evening-before prep, shown on the first page. */
    roast?: RoastAhead | null;
    /** leftovers: pack tonight's; make: make it tonight; ahead: a home lunch made on the day, whose night-before part
     *  (the chicken sandwich's roast chicken) is done tonight. */
    lunch?: { kind: 'leftovers'; title: string } | { kind: 'make'; title: string; recipe?: RecipeDetail } | { kind: 'ahead'; title: string; recipe: RecipeDetail } | null;
    /** Only a breakfast made the night before. */
    breakfast?: { title: string; recipe?: RecipeDetail } | null;
  } | null;
}

export interface ChopGroup {
  label: string;
  /** bowl / tm7: chop now; box: chop now for tomorrow; fridge: chopped yesterday, just check it's there. */
  where: 'bowl' | 'tm7' | 'box' | 'fridge';
  items: { name: string; qty: string; note: string | null }[];
  raw: boolean;
}

export interface HourStep {
  at: string;
  end: string;
  /** serve: plating up, shown with the dish photo large and centred. */
  kind: 'chop' | 'cook' | 'extra' | 'clean' | 'serve';
  title: string;
  body: string;
  kit: string | null;
  timer: number | null;
  ingredients: RecipeIngredient[];
  factor: number;
  /** Pictures for the step (stored photo paths): the step's own photo, else its recipe's; several for the chopping. */
  photos: { path: string; alt: string; prep?: { name: string; note: string | null; key: string; label: string };
    /** The recipe step this picture stands for, so it can be given its own photo. */
    step?: { recipeId: string; stepId: string; title: string; has: boolean; own: boolean } }[];
  /** For a step from a day's dinner recipe: which day's dinner and which of its steps (to change it for that day). */
  source?: { date: string; phase: 'prep_8pm' | 'finish'; title: string };
}

export interface HourPlan {
  chop: ChopGroup[];
  /** Everything to get out of the fridge, freezer and cupboard for the hour, with its cartoon picture once made. */
  getOut: GetOutGroup[];
  /** Ingredients on that list without a picture yet, for "Add step photos". */
  iconsMissing: { name: string; key: string }[];
  /** The cuts being chopped that have no chopping photo yet (one each), for "Add step photos". */
  prepMissing: { name: string; note: string | null; key: string; label: string; redraw?: boolean }[];
  steps: HourStep[];
  /** Minutes you're busy (not counting the waits). */
  handsOn: number;
  toWash: string[];
  /** Extras that didn't fit: do these after dinner. */
  after: HourStep[];
  warnings: string[];
  /** Tomorrow's dinner prep: how many optional steps there are to tick, the must-do ones, and whether the optional
   *  ones are in this hour. Null without a cooked dinner with prep tomorrow. */
  forTomorrow: { title: string; optional: number; mustDo: string[]; ahead: boolean } | null;
  /** Tonight's prep that yesterday's hour did (or was meant to): null when yesterday's hour didn't run or there's none. */
  doneLastNight: { title: string; steps: string[]; state: PrepAhead } | null;
  roastAhead: RoastAhead | null;
}

const nextDay = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const HANDS_OFF = new Set<Machine>(['tm7', 'apo', 'oven', 'hy24']);
/** A machine that only does one thing at a time (the hob has several rings). */
const SINGLE = new Set<Machine>(['apo', 'hy24', 'oven']);
const RINSE = 2;
/** The most a must-do prep step that missed its night (a long marinade) gets in tonight's hour. */
const CARRIED_MAX = 30;
const CHOP_CLEAN = 2;
const lengthOf = (s: RecipeStep) => s.timer_minutes ?? 5;
const isHandsOff = (s: { machine: Machine | null; timer_minutes: number | null }) =>
  !!s.machine && HANDS_OFF.has(s.machine) && (s.timer_minutes ?? 0) >= 5;
const kitOf = (s: RecipeStep) => (s.machine ? [machineLabel(s.machine), s.settings].filter(Boolean).join(' · ') : s.settings);
const factorOf = (c: Cooked) => c.portions / (c.recipe.base_portions || c.portions || 1);

/** Something on the timeline. `busy` is when you're needed; `machine` is what it takes up. */
interface Slot { start: number; end: number; busy: boolean; machine: Machine | null; step: HourStep; chain: number | 'dinner' | null }

export function planHour(input: HourInput): HourPlan {
  const start = toMin(input.start);
  const plateAt = start + input.minutes - 10;
  const tomorrow = input.tomorrow ?? null;
  const warnings: string[] = [];

  // 1. What to chop, grouped by the step it goes into; raw meat and fish last.
  const used: { i: RecipeIngredient; factor: number }[] = [];
  const chop = chopList(input, used);
  const items = chop.filter((g) => g.where !== 'fridge').reduce((n, g) => n + g.items.length, 0);

  const slots: Slot[] = [];
  const add = (start: number, length: number, busy: boolean, machine: Machine | null, step: Omit<HourStep, 'at' | 'end'>, chain: Slot['chain'] = null) => {
    const slot: Slot = { start, end: start + length, busy, machine, chain, step: { ...step, at: clock(start), end: clock(start + length) } };
    slots.push(slot);
    return slot;
  };
  const plain = { kit: null, timer: null, ingredients: [] as RecipeIngredient[], factor: 1, photos: [] as HourStep['photos'] };
  const hero = (r: RecipeDetail | null | undefined) => (r?.hero_image_path ? [{ path: r.hero_image_path, alt: r.title }] : []);
  // The chopping is for tonight, tomorrow's dinner, and whatever else is made in the hour.
  const lunchRecipe = tomorrow?.lunch?.kind === 'make' ? tomorrow.lunch.recipe : null;
  // A chopping-board photo for each cut, in chopping order; until there are any, the recipes' own photos.
  const cuts = chop.filter((g) => g.where !== 'fridge').flatMap((g) => g.items).map((i) => ({ name: i.name, note: i.note, ...prepKey(i.name, i.note) }))
    .filter((c, n, all) => all.findIndex((x) => x.key === c.key) === n);
  // Cuts with no chopping picture, and older realistic ones to redraw in the cartoon style.
  const prepMissing = cuts.filter((c) => !input.prepPhotos?.[c.key] || !isCartoonPrep(input.prepPhotos[c.key]))
    .map(({ name, note, key, label }) => ({ name, note, key, label, ...(input.prepPhotos?.[key] ? { redraw: true } : {}) }));
  const boards = cuts.filter((c) => input.prepPhotos?.[c.key])
    .map((c) => ({ path: input.prepPhotos![c.key], alt: c.label, prep: { name: c.name, note: c.note, key: c.key, label: c.label } }));
  const recipePhotos = [input.tonight?.recipe, tomorrow?.dinner?.recipe, tomorrow?.breakfast?.recipe, lunchRecipe].flatMap(hero)
    .filter((p, i, all) => all.findIndex((q) => q.path === p.path) === i);
  const chopPhotos = boards.length ? boards : recipePhotos;

  // 2. The chopping block, then the board and knife into the dishwasher.
  let base = start;
  if (items) {
    const length = Math.max(5, Math.ceil(1.5 * items));
    add(start, length, true, null, { ...plain, photos: chopPhotos, kind: 'chop', title: 'Chop all the ingredients below', body: chop.filter((g) => g.where !== 'fridge').flatMap((g) => g.items.map((i) => `${chopInstruction(i.name, i.note)}${i.qty ? ` (${i.qty})` : ''}.`)).join(' ') });
    add(start + length, CHOP_CLEAN, true, null, { ...plain, kind: 'clean', title: 'Board, knife and bowls into the dishwasher', body: 'Rinse the board, knife and bowls and load them now, so the side is clear.' });
    base = start + length + CHOP_CLEAN;
  }

  // 3. Tonight's dinner, at its own times from the end of the chopping.
  let dinnerEnd = base;
  if (input.tonight) {
    const factor = factorOf(input.tonight);
    const r = input.tonight.recipe;
    let prevEnd = base;
    // Prep that wasn't done in yesterday's hour comes first, then tonight's own steps from when it ends.
    for (const s of carriedPrep(input)) {
      // Must-do prep that missed its night (a long marinade) gets what it can tonight: at most 30 minutes, and a timed
      // step with no machine is a wait, not hands-on work.
      const must = !!s.needs_night_before;
      const length = must ? Math.min(lengthOf(s), CARRIED_MAX) : lengthOf(s);
      const waiting = must && !s.machine && (s.timer_minutes ?? 0) >= 10;
      const slot = add(prevEnd, length, !waiting && !isHandsOff(s), s.machine, { kind: 'cook', title: s.title, body: s.body, kit: kitOf(s), timer: s.timer_minutes, ingredients: stepIngredients(s.body, r.ingredients), factor, photos: stepPhotos(r, s, input.kitPhotos), source: { date: input.date, phase: 'prep_8pm', title: s.title } }, 'dinner');
      prevEnd = slot.end;
      dinnerEnd = Math.max(dinnerEnd, slot.end);
      if (s.needs_night_before) warnings.push(`${s.title}: this needed the night before, so it gets less time tonight`);
    }
    const cookFrom = prevEnd;
    for (const s of finishSteps(r)) {
      const at = s.at_minute !== null ? cookFrom + s.at_minute : prevEnd;
      const slot = add(at, lengthOf(s), !isHandsOff(s), s.machine, { kind: 'cook', title: s.title, body: s.body, kit: kitOf(s), timer: s.timer_minutes, ingredients: stepIngredients(s.body, r.ingredients), factor, photos: stepPhotos(r, s, input.kitPhotos), source: { date: input.date, phase: 'finish', title: s.title } }, 'dinner');
      prevEnd = slot.end;
      dinnerEnd = Math.max(dinnerEnd, slot.end);
    }
    if (dinnerEnd > plateAt) warnings.push(`Tonight's dinner runs to ${clock(dinnerEnd)}`);
  }
  const endAt = input.tonight ? Math.max(plateAt, dinnerEnd) : plateAt;

  // 4. Extras into the waits, each chain in order; what doesn't fit goes after dinner.
  const after: HourStep[] = [];
  const bowls = Math.max(input.tm7Bowls, input.tm7Machines);
  for (const [ci, chain] of extras(tomorrow, input.kitPhotos, nextDay(input.date)).entries()) {
    let earliest = base;
    let stuck = false;
    for (const e of chain) {
      const placed = stuck ? null : place(e, earliest, endAt, slots, input.tm7Machines, bowls, ci);
      if (!placed) {
        stuck = true;
        after.push({ ...e.step, at: '', end: '' });
        warnings.push(`Not enough time for ${e.step.title}: do it after dinner`);
        continue;
      }
      if (placed.rinseBefore !== null) add(placed.rinseBefore, RINSE, true, null, rinse(placed.afterDinner, input.kitPhotos));
      if (placed.rinseAfter !== null) add(placed.rinseAfter, RINSE, true, null, rinse(false, input.kitPhotos));
      const slot = add(placed.at, e.length, !e.handsOff, e.machine, e.step, ci);
      earliest = slot.end;
    }
  }

  // 5. The end of the hour.
  let tail = endAt;
  if (input.tonight) {
    add(tail, 5, true, null, { ...plain, photos: hero(input.tonight.recipe), kind: 'serve', title: 'Plate up', body: 'Plate up and serve.' });
    tail += 5;
  } else {
    tail = Math.max(base, ...slots.map((s) => s.end));
  }
  const lunch = tomorrow?.lunch;
  if (lunch?.kind === 'leftovers') {
    add(tail, 3, true, null, { ...plain, photos: hero(input.tonight?.recipe), kind: 'extra', title: `Pack tomorrow's lunch: ${lunch.title}`, body: "Box up tomorrow's lunch while it's warm, let it cool, then into the fridge." });
    tail += 3;
  }
  add(tail, Math.max(2, input.tonight ? endAt + 10 - tail : 5), true, null, { ...plain, kind: 'clean', title: 'Wipe down, load and start the dishwasher', body: 'Wipe the sides, load the last pans and start the dishwasher.' });

  const ordered = slots.map((s, i) => ({ s, i })).sort((a, b) => a.s.start - b.s.start || a.i - b.i).map(({ s }) => s);
  const steps = ordered.map((s) => s.step);
  const handsOn = ordered.filter((s) => s.busy).reduce((n, s) => n + (s.end - s.start), 0);
  // 6. What to get out: all of tonight's dinner, everything chopped, and what the extras use.
  const getOut = getOutList([
    ...(input.tonight ? input.tonight.recipe.ingredients.map((i) => ({ i, factor: factorOf(input.tonight!) })) : []),
    ...used,
    ...extras(tomorrow).flat().flatMap((e) => e.step.ingredients.map((i) => ({ i, factor: e.step.factor }))),
  ], input.prepPhotos);
  const iconsMissing = getOut.flatMap((g) => g.items).filter((i) => !i.icon).map(({ name, key }) => ({ name, key }));
  const d = tomorrow?.dinner;
  const dPrep = d ? prepSteps(d.recipe) : [];
  const forTomorrow = d && dPrep.length ? { title: d.recipe.title, optional: dPrep.filter((s) => !s.needs_night_before).length,
    mustDo: dPrep.filter((s) => s.needs_night_before).map((s) => s.title), ahead: d.prepAhead !== false } : null;
  const state = tonightState(input);
  const tPrep = input.tonight ? prepSteps(input.tonight.recipe) : [];
  const doneSteps = state === 'on_the_day' ? tPrep.filter((s) => s.needs_night_before) : tPrep;
  const doneLastNight = input.yesterdayPlanned && input.tonight && doneSteps.length
    ? { title: input.tonight.recipe.title, steps: doneSteps.map((s) => s.title), state } : null;
  return { chop, getOut, iconsMissing, prepMissing, steps, handsOn, toWash: toWash(items > 0, chop, [...steps, ...after], ordered, [...extras(tomorrow).flat()]), after, warnings,
    forTomorrow, doneLastNight, roastAhead: tomorrow?.roast ?? null };
}

function rinse(afterDinner: boolean, kit?: Kit): Omit<HourStep, 'at' | 'end'> {
  const body = afterDinner
    ? "Tip tonight's dinner into a warm dish and cover it, then rinse the TM7 bowl so it is ready for the next job."
    : 'Rinse the TM7 bowl so it is ready for the next job.';
  return { kind: 'clean', title: 'Rinse the TM7 bowl', body, kit: 'TM7', timer: null, ingredients: [], factor: 1, photos: kitPhoto(kit, 'tm7') };
}

/** A recipe step's own photo, else the recipe's main photo. */
type Kit = HourInput['kitPhotos'];
const kitPhoto = (kit: Kit, machine: string | null): HourStep['photos'] => {
  const k = machine ? kit?.[machine] : undefined;
  return k ? [{ path: k.path, alt: k.name }] : [];
};
/** A recipe step's own photo; for a step with no ingredients in it (just a machine), your photo of that machine;
 *  else the recipe's main photo. */
export function stepPhotos(r: RecipeDetail, s: RecipeStep, kit?: Kit): HourStep['photos'] {
  const step = s.id ? { recipeId: r.id, stepId: s.id, title: s.title, has: !!s.image_path, own: s.image_source === 'own' } : undefined;
  const machineOnly = !!s.machine && !/\*\*.+?\*\*/.test(s.body);
  const photos: HourStep['photos'] = s.image_path ? [{ path: s.image_path, alt: 'Photo of this step' }]
    : machineOnly && kitPhoto(kit, s.machine).length ? kitPhoto(kit, s.machine)
    : r.hero_image_path ? [{ path: r.hero_image_path, alt: r.title }] : [];
  return photos.map((p) => ({ ...p, step }));
}

const prepSteps = (r: RecipeDetail) => r.steps.filter((s) => s.phase === 'prep_8pm').sort((a, b) => a.position - b.position);
/** Tomorrow's prep done tonight: must-do steps always, the rest when prep ahead is on. */
const tomorrowPrep = (d: NonNullable<NonNullable<HourInput['tomorrow']>['dinner']>) =>
  prepSteps(d.recipe).filter((s) => s.needs_night_before || d.prepAhead !== false);
/** What tonight's prep state is: no hour yesterday means nothing was done. */
const tonightState = (input: HourInput): PrepAhead => (input.yesterdayPlanned ? input.tonight?.prepAhead ?? 'ahead' : 'missed');
/** Tonight's prep that wasn't done yesterday, so it's done tonight before the cook. */
function carriedPrep(input: HourInput): RecipeStep[] {
  if (!input.tonight) return [];
  const state = tonightState(input);
  const prep = prepSteps(input.tonight.recipe);
  return state === 'missed' ? prep : state === 'on_the_day' ? prep.filter((s) => !s.needs_night_before) : [];
}

const finishSteps = (r: RecipeDetail) => r.steps.filter((s) => s.phase === 'finish').sort((a, b) => a.position - b.position);

interface Extra { length: number; handsOff: boolean; machine: Machine | null; step: Omit<HourStep, 'at' | 'end'> }

/** Tomorrow's prep steps, the night-before breakfast, then a lunch to make: each a chain of steps done in order. */
function extras(tomorrow: HourInput['tomorrow'], kit?: Kit, tomorrowDate?: string): Extra[][] {
  if (!tomorrow) return [];
  const fromSteps = (r: RecipeDetail, steps: RecipeStep[], prefix: string, factor: number, dinner = false): Extra[] =>
    steps.map((s) => ({
      length: lengthOf(s), handsOff: isHandsOff(s), machine: s.machine,
      step: { kind: 'extra', title: `${prefix}${s.title}`, body: s.body, kit: kitOf(s), timer: s.timer_minutes, ingredients: stepIngredients(s.body, r.ingredients), factor, photos: stepPhotos(r, s, kit),
        ...(dinner && tomorrowDate ? { source: { date: tomorrowDate, phase: 'prep_8pm' as const, title: s.title } } : {}) },
    }));
  const simple = (title: string, body: string): Extra[] =>
    [{ length: 5, handsOff: false, machine: null, step: { kind: 'extra', title, body, kit: null, timer: null, ingredients: [], factor: 1, photos: [] } }];
  const chains: Extra[][] = [];
  if (tomorrow.dinner) {
    const r = tomorrow.dinner.recipe;
    const prep = tomorrowPrep(tomorrow.dinner);
    if (prep.length) chains.push(fromSteps(r, prep, 'For tomorrow: ', factorOf(tomorrow.dinner), true));
  }
  const b = tomorrow.breakfast;
  if (b) {
    const steps = b.recipe ? finishSteps(b.recipe) : [];
    chains.push(steps.length ? fromSteps(b.recipe!, steps, `${b.title}: `, 1) : simple(`Make the ${b.title.toLowerCase()}`, 'Make it now and keep it in the fridge for the morning.'));
  }
  const l = tomorrow.lunch;
  if (l?.kind === 'ahead') {
    const prep = l.recipe.steps.filter((s) => s.phase === 'prep_8pm').sort((a, b) => a.position - b.position);
    if (prep.length) chains.push(fromSteps(l.recipe, prep, "For tomorrow's lunch: ", 1));
  }
  if (l?.kind === 'make') {
    const steps = l.recipe ? finishSteps(l.recipe) : [];
    chains.push(steps.length ? fromSteps(l.recipe!, steps, "Tomorrow's lunch: ", 1) : simple(`Make tomorrow's lunch: ${l.title}`, 'Make it and box it up for the fridge.'));
  }
  return chains;
}

const overlaps = (a: number, b: number, s: { start: number; end: number }) => a < s.end && s.start < b;

/** The earliest time an extra fits: you're free (for its whole length, or just to set a machine going), its machine
 *  is free, and with one TM7 bowl there's time to rinse it between jobs. */
function place(e: Extra, earliest: number, endAt: number, slots: Slot[], machines: number, bowls: number, chain: number):
  { at: number; rinseBefore: number | null; rinseAfter: number | null; afterDinner: boolean } | null {
  // With one bowl, tonight's dinner holds the bowl from its first TM7 step to its last.
  const dinnerTm7 = slots.filter((s) => s.machine === 'tm7' && s.chain === 'dinner');
  const held = bowls < 2 && dinnerTm7.length > 1
    ? { start: Math.min(...dinnerTm7.map((s) => s.start)), end: Math.max(...dinnerTm7.map((s) => s.end)) } : null;
  const free = (a: number, b: number) => !slots.some((s) => s.busy && overlaps(a, b, s));
  for (let t = earliest; t + e.length <= endAt; t++) {
    if (!free(t, e.handsOff ? t + 1 : t + e.length)) continue;
    const end = t + e.length;
    if (e.machine && SINGLE.has(e.machine) && slots.some((s) => s.machine === e.machine && overlaps(t, end, s))) continue;
    let rinseBefore: number | null = null;
    let rinseAfter: number | null = null;
    let afterDinner = false;
    if (e.machine === 'tm7') {
      if (held && overlaps(t, end, held)) continue;
      const tm7 = slots.filter((s) => s.machine === 'tm7');
      if (bowls < 2 || machines < 2) {
        if (tm7.some((s) => overlaps(t, end, s))) continue;
      } else if (tm7.filter((s) => overlaps(t, end, s)).length >= machines) continue;
      if (bowls < 2) {
        const before = tm7.filter((s) => s.end <= t).sort((a, b) => b.end - a.end)[0];
        const next = tm7.filter((s) => s.start >= end).sort((a, b) => a.start - b.start)[0];
        // A recipe's own TM7 steps follow on in the bowl, so there's no rinse between them.
        if (before && before.chain !== chain) {
          afterDinner = before.chain === 'dinner';
          if (t - before.end < RINSE || !free(t - RINSE, t)) continue;
          rinseBefore = t - RINSE;
        }
        if (next && next.chain !== chain) {
          if (next.start - end < RINSE || !free(end, end + RINSE)) continue;
          rinseAfter = end;
        }
      }
    }
    return { at: t, rinseBefore, rinseAfter, afterDinner };
  }
  return null;
}

/** Tonight's dinner, tomorrow's prep (done tonight), breakfast and lunch: chopped now. Tomorrow's dinner: what keeps
 *  is chopped now and boxed. */
function chopList(input: HourInput, used: { i: RecipeIngredient; factor: number }[] = []): ChopGroup[] {
  const groups: ChopGroup[] = [];
  const seen = new Set<RecipeIngredient>();
  const item = (i: RecipeIngredient, factor: number) => (used.push({ i, factor }), { name: i.name, qty: formatQty(i.qty === null ? null : i.qty * factor, i.unit, i.qty_approx), note: i.note });
  const push = (label: string, where: ChopGroup['where'], list: RecipeIngredient[], factor: number) => {
    const veg = list.filter((i) => !isRawProtein(i.name));
    const raw = list.filter((i) => isRawProtein(i.name));
    if (veg.length) groups.push({ label, where, items: veg.map((i) => item(i, factor)), raw: false });
    if (raw.length) groups.push({ label, where: where === 'tm7' ? 'bowl' : where, items: raw.map((i) => item(i, factor)), raw: true });
  };
  const fromSteps = (r: RecipeDetail, steps: RecipeStep[], factor: number, label: (s: RecipeStep) => string, keep: (i: RecipeIngredient) => boolean) => {
    for (const s of steps) {
      const list = stepIngredients(s.body, r.ingredients).filter((i) => !seen.has(i) && needsChopping(i) && keep(i));
      list.forEach((i) => seen.add(i));
      const where = s.machine === 'tm7' && /^\d+ sec/.test(s.settings ?? '') ? 'tm7' : 'bowl';
      push(label(s), where, list, factor);
    }
  };
  const rest = (r: RecipeDetail, factor: number, label: string, where: ChopGroup['where'], keep: (i: RecipeIngredient) => boolean) => {
    const list = r.ingredients.filter((i) => !seen.has(i) && needsChopping(i) && keep(i));
    list.forEach((i) => seen.add(i));
    push(label, where, list, factor);
  };

  if (input.tonight) {
    const r = input.tonight.recipe;
    const f = factorOf(input.tonight);
    // Chopped in yesterday's hour, if there was one: anything that keeps a day or more. Listed to check, not dropped.
    const fridge: RecipeIngredient[] = [];
    const keep = (i: RecipeIngredient) => {
      if (!(tonightState(input) === 'ahead' && keepsDays(i.name) >= 1)) return true;
      if (!fridge.includes(i)) fridge.push(i);
      return false;
    };
    fromSteps(r, [...carriedPrep(input), ...finishSteps(r)], f, (s) => `For ${s.title}`, keep);
    rest(r, f, `For ${r.title}`, 'bowl', keep);
    fridge.forEach((i) => seen.add(i));
    if (fridge.length) groups.unshift({ label: 'From the fridge box (chopped yesterday)', where: 'fridge', items: fridge.map((i) => item(i, f)), raw: false });
  }
  const t = input.tomorrow;
  const all = () => true;
  if (t?.dinner) {
    const r = t.dinner.recipe;
    const f = factorOf(t.dinner);
    fromSteps(r, tomorrowPrep(t.dinner), f, (s) => `For tomorrow's prep: ${s.title}`, all);
  }
  for (const x of [t?.breakfast, t?.lunch?.kind === 'make' ? t.lunch : null]) {
    if (x && 'recipe' in x && x.recipe) fromSteps(x.recipe, finishSteps(x.recipe), 1, () => `For ${x.title}`, all);
  }
  // What keeps of tomorrow's dinner is chopped now and boxed: part of tomorrow's prep, so only when that's on.
  if (t?.dinner && t.dinner.prepAhead !== false) {
    const r = t.dinner.recipe;
    const f = factorOf(t.dinner);
    const box: RecipeIngredient[] = [];
    for (const s of finishSteps(r)) for (const i of stepIngredients(s.body, r.ingredients)) if (!seen.has(i) && !box.includes(i)) box.push(i);
    for (const i of r.ingredients) if (!seen.has(i) && !box.includes(i)) box.push(i);
    const keepable = box.filter((i) => needsChopping(i) && keepsDays(i.name) >= 1);
    keepable.forEach((i) => seen.add(i));
    push(`For tomorrow: ${r.title}`, 'box', keepable, f);
  }
  return [...groups.filter((g) => !g.raw), ...groups.filter((g) => g.raw)];
}

const BY_MACHINE: Partial<Record<Machine, string>> = { tm7: 'TM7 bowl', hob: 'Pan', oven: 'Tray', apo: 'Tray', hy24: 'Air-fryer basket' };
const BY_WORD: [RegExp, string][] = [
  [/\b(sauce|frying )?pans?\b/i, 'Pan'],
  [/\bpots?\b/i, 'Pot'],
  [/\bcasseroles?\b/i, 'Casserole'],
  [/\btrays?\b/i, 'Tray'],
  [/\b(baking|oven|ovenproof|roasting|gratin|pie) dish(es)?\b/i, 'Dish'],
  [/(?<!(tm7|mixing|thermomix) )\bbowls?\b/i, 'Bowl'],
];

function toWash(chopped: boolean, chop: ChopGroup[], steps: HourStep[], slots: Slot[], ex: Extra[]): string[] {
  const out: string[] = [];
  const addOne = (x: string) => { if (!out.includes(x)) out.push(x); };
  if (chopped) {
    addOne('Board');
    addOne('Knife');
    if (chop.some((g) => g.where === 'bowl' || g.where === 'tm7')) addOne('Prep bowls');
  }
  const machineOf = new Map<string, Machine | null>();
  for (const s of slots) machineOf.set(s.step.title, s.machine);
  for (const e of ex) machineOf.set(e.step.title, e.machine);
  for (const s of steps) {
    if (s.kind === 'chop' || s.kind === 'clean') continue;
    const m = machineOf.get(s.title);
    if (m && BY_MACHINE[m]) addOne(BY_MACHINE[m]!);
    for (const [re, name] of BY_WORD) if (re.test(s.body)) addOne(name);
  }
  return out;
}
