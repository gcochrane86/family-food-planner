// The roast builder's scheduler: from a main, its sides, how many people and when to eat, one plan that works
// backwards from serving. The owner's workflow (18 Oct 2026): prep at breakfast, go out, then about an hour of
// hands-on work before lunch. Oven steps go to Oven 1 or Oven 2 at compatible temperatures; Oven 3 warms and grills.
import { DONENESS, parseRoastPart, suits, type Doneness, type RoastChoice, type RoastKit, type RoastMain, type RoastStep } from './roastModel';

export interface RoastPartRecipe { id: string; slug: string; title: string; hero_image_path: string | null; base_portions: number; roast: unknown }
export type RoastPhaseName = 'Two days before' | 'Day before' | 'Night before' | 'Morning prep' | 'Out and about' | 'Service countdown';
export interface PlannedStep {
  time: string; end: string; title: string; part: string; partTitle: string; recipeId: string;
  phase: RoastPhaseName; kit: string; minutes: number; trays?: number;
  quick?: boolean; // a hands-off cook you only have to start (a joint into the oven)
}
export interface RoastPlan {
  phases: { name: RoastPhaseName; steps: PlannedStep[] }[];
  kit: Record<string, { time: string; label: string }[]>;
  warnings: string[];
}

/** The owner's roast is written for serving at 13:30 with prep from 08:45: 285 minutes apart. */
const MORNING_REF = 285;
const SERVICE_WINDOW = 95;  // the lunchtime countdown, at most
const SHELVES = 3;          // oven shelves per cavity
const SHARE_TEMP = 10;      // °C apart that can share a cavity
const PER_TRAY = 8;         // a step's trays are per 8 people

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmt = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

interface Slot { step: RoastStep; part: RoastPartRecipe; start: number; end: number; phase: RoastPhaseName; trays: number; place: string; label: string; quick: boolean; hold: boolean; core?: number | null }

export function planRoast(choice: RoastChoice & { prepAt?: string }, parts: Map<string, RoastPartRecipe>): RoastPlan {
  const warnings: string[] = [];
  const serve = toMin(choice.serve);
  const prep = toMin(choice.prepAt ?? '08:45');
  // Every main (Christmas can have turkey and ham), then the sides that go with at least one of them.
  const mains: RoastMain[] = choice.mains?.length ? choice.mains : [choice.main];
  const chosen: RoastPartRecipe[] = [];
  for (const [i, m] of mains.entries()) {
    const isMain = (p: RoastPartRecipe | undefined) => !!p && parseRoastPart(p.roast)?.part === 'main' && parseRoastPart(p.roast)!.mains.includes(m);
    // The chosen cut (brisket, silverside, ribeye…), else the first main for that meat.
    const cut = i === 0 && choice.cut ? parts.get(choice.cut) : undefined;
    const main = isMain(cut) ? cut : [...parts.values()].find(isMain);
    if (main) chosen.push(main); else warnings.push(`No ${m} main in your roast recipes yet.`);
  }
  for (const slug of choice.sides) {
    const p = parts.get(slug);
    const r = p ? parseRoastPart(p.roast) : null;
    if (!p || !r || r.part !== 'side') continue;
    if (!mains.some((m) => suits(r, m))) { warnings.push(`${p.title} doesn't go with ${mains.join(' or ')}, so it's left out.`); continue; }
    chosen.push(p);
  }

  // When each step starts and ends.
  const slots: Slot[] = [];
  for (const part of chosen) {
    const desc = parseRoastPart(part.roast)!;
    // A joint cooked to taste: its roast takes longer or shorter, so it goes in earlier or later.
    const doneness: Doneness | undefined = desc.doneness ? (part.slug === choice.cut || chosen[0] === part ? choice.doneness ?? desc.doneness : desc.doneness) : undefined;
    for (const raw of desc.steps) {
      const mins = doneness ? raw.byDoneness?.[doneness] : undefined;
      const step: RoastStep = mins ? { ...raw, minutes: mins, before: raw.before + (mins - raw.minutes) } : raw;
      const core = mins ? DONENESS.find((d) => d.value === doneness)!.core : null;
      // A day or two ahead (23 December, Christmas Eve): at its own clock time, on that day.
      if (step.when === 'day2' || step.when === 'day1') {
        const start = toMin(step.at!) - (step.when === 'day2' ? 2 : 1) * 1440;
        const phase: RoastPhaseName = step.when === 'day2' ? 'Two days before' : 'Day before';
        slots.push({ step, part, start, end: start + step.minutes, phase, trays: Math.ceil(((step.trays ?? 1) * choice.people) / PER_TRAY), place: '', label: '', quick: false, hold: false, core: null });
        continue;
      }
      let start: number;
      if (step.when === 'night') start = prep - (step.before - MORNING_REF);
      else if (step.when === 'morning') start = prep + (MORNING_REF - step.before);
      else start = serve - step.before;
      // A morning step that runs on into lunchtime (the brisket holding) ends at the same point before serving.
      const endsBefore = step.before - step.minutes;
      const hold = step.when !== 'service' && endsBefore <= SERVICE_WINDOW;
      const end = hold ? serve - endsBefore : start + step.minutes;
      const phase: RoastPhaseName = step.when === 'night' ? 'Night before' : step.when === 'morning' ? 'Morning prep'
        : step.before > SERVICE_WINDOW ? 'Out and about' : 'Service countdown';
      const trays = Math.ceil(((step.trays ?? 1) * choice.people) / PER_TRAY);
      const quick = (step.kit === 'oven' || step.kit === 'apo' || step.kit === 'hy24') && step.minutes >= 45;
      slots.push({ step, part, start, end, phase, trays, place: '', label: '', quick, hold, core });
    }
  }
  slots.sort((a, b) => a.start - b.start || b.step.before - a.step.before);

  // The TM7 does one thing at a time: in the morning, a clash waits for the bowl.
  let tmFree = -Infinity;
  for (const s of slots.filter((x) => x.step.kit === 'tm7')) {
    if (s.start < tmFree && s.phase === 'Morning prep') { const d = tmFree - s.start; s.start += d; s.end += d; }
    tmFree = Math.max(tmFree, s.end);
  }

  // Ovens 1 and 2: same temperature first, then an empty oven, then one within 10°C, with shelves to spare.
  const inOven = (cavity: string, s: Slot) => slots.filter((x) => x !== s && x.place === cavity && x.start < s.end && s.start < x.end);
  for (const s of slots.filter((x) => x.step.kit === 'oven')) {
    const t = s.step.temp ?? 200;
    const fits = (cavity: string) => {
      const others = inOven(cavity, s);
      return others.every((o) => Math.abs((o.step.temp ?? 200) - t) <= SHARE_TEMP) && others.reduce((n, o) => n + o.trays, 0) + s.trays <= SHELVES;
    };
    const rank = (cavity: string) => {
      const others = inOven(cavity, s);
      return others.length === 0 ? 1 : others.every((o) => o.step.temp === t) ? 0 : 2;
    };
    const options = ['Oven 1', 'Oven 2'].filter(fits).sort((a, b) => rank(a) - rank(b));
    if (!options.length) {
      warnings.push(`Too much for the ovens at ${fmt(s.start)}: drop a side, or fewer people.`);
      s.place = 'Oven ?';
    } else s.place = options[0];
    s.label = `${s.place} · ${t}°C${s.step.fan ? ' fan' : ''}`;
  }

  // The APO: holds (70°C or less) can share; anything hotter takes it over and a hold moves to Oven 3 to keep warm.
  for (const s of slots.filter((x) => x.step.kit === 'apo')) {
    const t = s.step.temp ?? 0;
    const clash = slots.filter((x) => x !== s && x.place === 'APO' && x.start < s.end && s.start < x.end && Math.abs((x.step.temp ?? 0) - t) > SHARE_TEMP);
    if (clash.length && t <= 70) { s.place = 'Oven 3'; s.label = 'Oven 3 · warm'; continue; }
    for (const c of clash) {
      if ((c.step.temp ?? 0) <= 70) { c.place = 'Oven 3'; c.label = 'Oven 3 · warm'; }
      else warnings.push(`The APO is needed for two things at ${fmt(s.start)}.`);
    }
    s.place = 'APO';
    s.label = `APO · ${t}°C`;
  }
  const LABEL: Partial<Record<RoastKit, [string, string]>> = {
    grill: ['Oven 3', 'Oven 3 · grill'], warm: ['Oven 3', 'Oven 3 · warm'], tm7: ['TM7', 'TM7'], hob: ['Hob', 'Hob'], counter: ['', ''],
  };
  for (const s of slots) {
    if (s.place) continue;
    if (s.step.kit === 'hy24') { s.place = 'Air-fryer'; s.label = `Air-fryer · ${s.step.temp ?? 200}°C`; continue; }
    [s.place, s.label] = LABEL[s.step.kit] ?? ['', ''];
  }

  // A joint cooked to taste says what the MEATER should read.
  for (const s of slots) if (s.core) s.label = `${s.label}${s.label ? ' · ' : ''}to ${s.core}°C`;

  // Prep and serve times have to leave room for each other.
  const countdown = slots.filter((x) => x.phase === 'Service countdown').map((x) => x.start);
  const firstService = countdown.length ? Math.min(...countdown) : serve;
  if (slots.some((x) => x.phase === 'Morning prep' && !x.hold && x.end > firstService)) {
    warnings.push('Morning prep runs into the lunchtime countdown: prep from earlier, or eat later.');
  }
  for (const x of slots) {
    if (x.step.when !== 'night' && x.step.when !== 'day1' && x.step.when !== 'day2' && x.phase !== 'Morning prep' && x.start < prep) warnings.push(`${x.part.title}: ${x.step.title.toLowerCase()} starts at ${fmt(x.start)}, before your prep at ${fmt(prep)}.`);
  }

  // The owner's workflow: between morning prep and the countdown, only hands-off kit.
  for (const s of slots) {
    if (s.phase === 'Out and about' && !s.quick) warnings.push(`${s.part.title}: ${s.step.title.toLowerCase()} needs you in the kitchen at ${fmt(s.start)}.`);
  }

  const steps: PlannedStep[] = slots.sort((a, b) => a.start - b.start).map((s) => ({
    time: fmt(s.start), end: fmt(s.end), title: s.step.title, part: s.part.slug, partTitle: s.part.title, recipeId: s.part.id,
    phase: s.phase, kit: s.label, minutes: s.step.minutes, ...(s.step.kit === 'oven' ? { trays: s.trays } : {}), ...(s.quick ? { quick: true } : {}),
  }));
  const names: RoastPhaseName[] = ['Two days before', 'Day before', 'Night before', 'Morning prep', 'Out and about', 'Service countdown'];
  const ahead: RoastPhaseName[] = ['Two days before', 'Day before', 'Night before'];
  const phases = names.map((name) => ({ name, steps: steps.filter((x) => x.phase === name) }))
    .filter((ph) => ph.steps.length || !ahead.includes(ph.name));
  const kit: RoastPlan['kit'] = {};
  for (const s of slots) {
    if (!s.place) continue;
    (kit[s.place] ??= []).push({ time: fmt(s.start), label: `${s.label.split(' · ').slice(1).join(' · ') || s.place} · ${s.part.title}: ${s.step.title}` });
  }
  return { phases, kit, warnings: [...new Set(warnings)] };
}
