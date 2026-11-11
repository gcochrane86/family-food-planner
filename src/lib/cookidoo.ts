// Turns a recipe into the text Claude types into Cookidoo's Created Recipes, and works out My Week changes (spec §10).
import { formatQty, machineLabel, scaleFactor } from './recipes';
import type { MealSlot, Recipe, RecipeDetail } from './types';
import { leftoverLunchPortions } from './weekSummary';

const PHASE_ORDER: Record<string, number> = { prep_8pm: 0, finish: 1, reheat: 2 };

export interface CookidooText {
  title: string; portions: number; ingredients: string[]; steps: string[];
  stepsHtml: string[]; // the same steps for Cookidoo's step editor, with settings chips the TM7 can guide
}

const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One setting ("5 min · 120°C · ↺ speed 1") as Cookidoo's step editor stores it (checked against the household's
 *  own Cookidoo recipes, 11 Nov 2026): a <cr-tts> chip for time, temperature and speed, a <cr-mode name="steaming">
 *  chip for Varoma, spoon speed as speed "soft", reverse as direction "CCW". One it can't chip (dough mode,
 *  butterfly) stays as words. */
function chip(segment: string): string {
  const all = segment.split(' · ').map((x) => x.trim()).filter(Boolean);
  // A note after the settings ("MC off", "basket on lid") stays as words after the chip.
  const settingWord = (x: string) => /^(↺\s*)?(\d+(\.\d+)?\s*(min|sec)(\s+\d+\s*sec)?|\d+°C|Varoma|speed \d+(\.\d+)?|spoon speed|soft|speed soft)$/.test(x);
  let cut = all.length;
  while (cut > 0 && !settingWord(all[cut - 1])) cut--;
  const split = cut > 0 && cut < all.length && all.slice(0, cut).every(settingWord);
  const parts = split ? all.slice(0, cut) : all;
  const note = split ? ` ${escape(all.slice(cut).join(', '))}` : '';
  const label = parts.join('/').replace(/↺ /g, '↺/');
  let seconds: number | null = null;
  let temp: string | null = null;
  let speed: string | null = null;
  let varoma = false;
  const reverse = parts.some((x) => x.includes('↺'));
  for (const raw of parts) {
    const x = raw.replace('↺', '').trim();
    const t = x.match(/^(\d+(?:\.\d+)?)\s*(min|sec)(?:\s+(\d+)\s*sec)?$/);
    if (t) { seconds = Math.round(Number(t[1]) * (t[2] === 'min' ? 60 : 1) + Number(t[3] ?? 0)); continue; }
    const c = x.match(/^(\d+)°C$/);
    if (c) { temp = c[1]; continue; }
    if (x === 'Varoma') { varoma = true; continue; }
    const sp = x.match(/^speed (\d+(?:\.\d+)?)$/);
    if (sp) { speed = sp[1]; continue; }
    // Spoon speed is Cookidoo's "soft".
    if (x === 'spoon speed' || x === 'soft' || x === 'speed soft') { speed = 'soft'; continue; }
    if (!x) continue;
    return escape(all.join('/').replace(/↺ /g, '↺/')); // something without a chip
  }
  if (seconds === null || speed === null) return escape(all.join('/').replace(/↺ /g, '↺/'));
  if (varoma) return `<cr-mode time="${seconds}" time-unit="s" speed="${speed}" direction="${reverse ? 'CCW' : 'CW'}" name="steaming" accessory="Varoma">${escape(label)}</cr-mode>${note}`;
  return `<cr-tts time="${seconds}" time-unit="s"${temp ? ` temperature="${temp}" temperature-unit="C"` : ''} speed="${speed}"${reverse ? ' direction="CCW"' : ''}>${escape(label)}</cr-tts>${note}`;
}

/** A step's settings ("3 sec · speed 7 → 4 sec · speed 5") as chips, joined by "then". */
export function settingsHtml(settings: string): string {
  return settings.split(' → ').map(chip).join(', then ');
}

/** Only the Thermomix parts of a recipe go to Cookidoo (the owner's choice, 17 Oct 2026). */
export function hasTm7Steps(recipe: Pick<RecipeDetail, 'steps'>): boolean {
  return recipe.steps.some((s) => s.machine === 'tm7');
}

const words = (t: string) => t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
/** Singular and plural spellings of a word: tomato/tomatoes, chilli/chillies, berry/berries, olive/olives. */
function forms(w: string): Set<string> {
  const f = new Set([w]);
  if (w.endsWith('ies')) { f.add(`${w.slice(0, -3)}y`); f.add(`${w.slice(0, -3)}i`); }
  if (w.endsWith('es')) f.add(w.slice(0, -2));
  if (w.endsWith('s')) f.add(w.slice(0, -1));
  return f;
}
const same = (a: string, b: string) => { const fb = forms(b); return [...forms(a)].some((x) => fb.has(x)); };
const PARTS = ['zest', 'juice', 'flour', 'leaves', 'wedges']; // "lemon zest" is the lemon

/** The one ingredient a bolded name in a step refers to: an exact name first, then the one whose main (last) word
 *  matches, then the fewest extra words. "rice" → "basmati rice", not "rice vinegar". */
function ingredientFor<T extends { name: string }>(phrase: string[], ingredients: T[]): T | undefined {
  for (const want of [phrase, phrase.filter((w) => !PARTS.includes(w))]) {
    if (!want.length) continue;
    const found = ingredients
      .map((i) => ({ i, ws: words(i.name) }))
      .filter(({ ws }) => want.every((w) => ws.some((x) => same(x, w))))
      .map(({ i, ws }) => ({ i, extra: ws.length - want.length, head: same(ws[ws.length - 1], want[want.length - 1]) ? 0 : 1 }))
      .sort((a, b) => Number(a.extra !== 0) - Number(b.extra !== 0) || a.head - b.head || a.extra - b.extra);
    if (found.length) return found[0].i;
  }
  return undefined;
}

/** The TM7 steps, in cooking order, and only the ingredients named (in **bold**) in them, scaled to the portions. */
export function cookidooRecipe(recipe: RecipeDetail, portions: number): CookidooText {
  const factor = scaleFactor(portions, recipe.base_portions);
  const tm7 = recipe.steps.filter((s) => s.machine === 'tm7');
  const named = tm7.flatMap((s) => [...s.body.matchAll(/\*\*(.+?)\*\*/g)].map((m) => words(m[1]))).filter((w) => w.length);
  const picked = new Set(named.map((n) => ingredientFor(n, recipe.ingredients)).filter(Boolean));
  const used = recipe.ingredients.filter((i) => picked.has(i));
  const ingredients = used.map((i) => {
    const qty = formatQty(i.qty === null ? null : i.qty * factor, i.unit, i.qty_approx);
    return [qty, i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');
  });
  const ordered = [...tm7].sort((a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9) || a.position - b.position);
  const stepsHtml = ordered.map((s) => {
    const before = s.phase === 'prep_8pm' ? 'The night before: ' : '';
    return `${escape(before + s.body.replace(/\*\*/g, ''))}${s.settings ? ` ${settingsHtml(s.settings)}` : ''}`;
  });
  const steps = ordered
    .map((s) => {
      const body = s.body.replace(/\*\*/g, '');
      // Cookidoo writes TM settings as "13 min/100°C/speed 3"; other machines are named in words.
      const settings = !s.settings ? '' : s.machine === 'tm7' ? ` ${s.settings.split(' · ').join('/')}`
        : ` (${s.machine ? machineLabel(s.machine) : 'Settings'}: ${s.settings})`;
      return `${s.phase === 'prep_8pm' ? 'The night before: ' : ''}${body}${settings}`;
    });
  return { title: recipe.title, portions, ingredients, steps, stepsHtml };
}

type Day = { date: string; recipeId: string };

/** What to add to and remove from My Week. `current` is only what Claude put there, so hand-added entries are never touched. */
export function myWeekChanges(wanted: Day[], current: { date: string; recipeId: string | null }[]): { add: Day[]; remove: Day[] } {
  const now = new Map(current.filter((c): c is Day => !!c.recipeId).map((c) => [c.date, c.recipeId]));
  const want = new Map(wanted.map((w) => [w.date, w.recipeId]));
  const remove = [...now].filter(([date, id]) => want.get(date) !== id).map(([date, recipeId]) => ({ date, recipeId }));
  const add = [...want].filter(([date, id]) => now.get(date) !== id).map(([date, recipeId]) => ({ date, recipeId }));
  return { add, remove };
}

/**
 * The servings to write in Cookidoo: whole numbers (Cookidoo has no half servings), rounded up. A recipe planned
 * more than once in a week is sent once, at the larger portions. With no planned portions, the recipe's own.
 */
export function portionsToSend(slots: MealSlot[], recipeId: string, basePortions: number, recipes?: Map<string, Recipe>): number {
  // With the recipes known, a dinner that's also the next day's lunch is cooked for both.
  const most = Math.max(0, ...slots.filter((s) => s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id === recipeId)
    .map((s) => Number(s.portions ?? 0) + (recipes ? leftoverLunchPortions(s, slots, recipes) : 0)));
  return Math.ceil(most > 0 ? most : basePortions);
}

/** A short fingerprint of the text sent to Cookidoo, so the sync can tell whether anything really changed. */
export function textHash(text: CookidooText): string {
  let h = 2166136261;
  for (const c of JSON.stringify(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Whether a recipe needs creating or editing in Cookidoo. An imported recipe's original is never edited. */
export function whyToSend(r: { cookidoo_url: string | null; cookidoo_hash: string | null; cookidoo_own_url: string | null }, hash: string): 'new' | 'changed' | null {
  if (r.cookidoo_own_url) return null;
  if (!r.cookidoo_url) return 'new';
  return r.cookidoo_hash === hash ? null : 'changed';
}

/** How a sync ends: if something changed while it ran, it asks again rather than calling the week done. */
export function finishStatus(run: { requested_at: string; started_at: string | null }, wanted: 'done' | 'failed'): 'done' | 'failed' | 'requested' {
  return run.started_at && Date.parse(run.requested_at) > Date.parse(run.started_at) ? 'requested' : wanted;
}
