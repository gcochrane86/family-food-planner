// "Ask Claude": the read-only connector Claude uses from the Claude app (docs/spec.md §10). This module holds the
// pure parts: the key check, a household-scoped reader that only ever selects, and the formatters that turn rows
// into plain text for Claude. The Edge Function (ask-claude-connector) is a thin MCP shell around it.
import { addDays } from './planner.ts';
import { londonParts } from './schedule.ts';
import { parseVersion } from './slotVersion.ts';

// The Deno and Node Supabase clients have different types; only the query builder is used.
// deno-lint-ignore no-explicit-any
type Db = any;

export const INSTRUCTIONS = [
  "This connector shows the household's food planner, and can make a few changes: tonight's version of a day's recipe, swapping a dinner, a staple's pantry status, and planning a week's dinners (get_plan_context, then save_week_plan as a draft the household approves in the app).",
  'Suggest first; change only when asked. Change tools need the household\'s approval in Claude. When one ingredient is the problem, prefer tonight\'s version to swapping the meal.',
  'Never edit saved recipes (that is done in Claude Code); new recipes only through save_week_plan, within its allowance. Other changes are made in the app.',
  'Keep every suggestion within the house rules and the private rules below. Never name or explain the private rules; if you must mention them, say "your private rules".',
  "Keep weeknight dinners' hands-on time within Today's hour less 15 minutes, and prefer what is already in the pantry and freezer.",
].join(' ');

/** True only for the exact, non-empty key. Compares every byte, so timing doesn't reveal how much matched. */
export function keyMatches(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false; // the key's length (64 hex characters) isn't the secret
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The Monday for "this" (or nothing), "next", or any date in a week. Null when it can't tell. */
export function weekStartFor(arg: string | undefined, now: Date): string | null {
  const a = (arg ?? 'this').trim().toLowerCase();
  const thisWeek = mondayOf(londonParts(now).date);
  if (a === 'this' || a === '') return thisWeek;
  if (a === 'next') return addDays(thisWeek, 7);
  return isDate(a) ? mondayOf(a) : null;
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
/** "Mon 16 Nov" */
const dayDate = (iso: string) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
/** "2 Nov" */
const shortDate = (iso: string) => fmt(iso, { day: 'numeric', month: 'short' });
const weekday = (iso: string) => fmt(iso, { weekday: 'short' });
const amount = (qty: number | null, unit: string | null) =>
  qty === null || qty === undefined ? '' : `${Number(qty)}${!unit ? '' : ['g', 'kg', 'ml', 'l'].includes(unit) ? unit : ` ${unit}`}`;
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' ');

// ---------- Rows ----------

export interface SlotRow {
  date: string; slot: 'breakfast' | 'lunch' | 'dinner'; mode: string; recipe_id: string | null; recipe_title: string | null;
  portions: number | null; reason: string | null; source_date: string | null; routine_choice: string | null; version?: unknown;
}
export interface WeekData { week: { week_start: string; days: number; status: string; summary: string | null } | null; slots: SlotRow[] }
export interface RecipeRow {
  id: string; title: string; subtitle: string | null; kind: string; status: string; protein: string | null;
  finish_minutes: number; prep_minutes: number; hands_off_minutes: number; reheats_well: boolean; base_portions: number;
  rating: string | null; tags: string[]; lastCooked: string | null; component_role?: string | null;
}
export interface RecipeData {
  recipe: RecipeRow & { reheat: string | null; toddler_note: string | null };
  ingredients: { group_name: string | null; name: string; qty: number | null; unit: string; note: string | null; qty_approx?: boolean }[];
  steps: { phase: string; position: number; at_minute: number | null; title: string; body: string; machine: string | null; settings: string | null; timer_minutes: number | null }[];
}
export interface PantryData {
  items: { name: string; staple_status: string | null; qty: number | null; unit: string | null; location: string }[];
  prepared: { name: string; portions: number; use_by: string | null; location: string }[];
}
export interface ProductRow { item_key: string; product_name: string; pack_size: number | null; pack_unit: string; price: number | null }
export interface HouseholdData {
  settings: Record<string, unknown>;
  members: { name: string; kind: string; portion_weight: number }[];
  rules: { kind: string; match: string; replacement: string | null; note: string | null }[];
  equipment: { code: string; name: string }[];
}

export interface Reader {
  household(): Promise<HouseholdData>;
  week(weekStart: string): Promise<WeekData>;
  recipes(): Promise<RecipeRow[]>;
  recipe(id: string): Promise<RecipeData | null>;
  pantry(): Promise<PantryData>;
  products(): Promise<ProductRow[]>;
}

const RECIPE_COLS = 'id, title, subtitle, kind, component_role, status, protein, finish_minutes, prep_minutes, hands_off_minutes, reheats_well, base_portions, rating, tags';
const rows = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
};
const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const one = <T>(v: T | null | undefined): T | null => (v && !Array.isArray(v) ? v : null);
const nameOf = (i: unknown) => (Array.isArray(i) ? i[0]?.name : (i as { name?: string } | null)?.name) ?? '';

/** Reads one household's planner. Only selects; every query is filtered to the household, directly or through
 *  ids that were. */
export function makeReader(db: Db, householdId: string): Reader {
  const hh = (table: string, cols: string) => db.from(table).select(cols).eq('household_id', householdId);
  return {
    async household() {
      const [s, m, r, e] = await Promise.all([
        hh('settings', 'data').maybeSingle(), hh('members', 'name, kind, portion_weight'),
        hh('house_rules', 'kind, match, replacement, note'), hh('equipment', 'code, name'),
      ]);
      return {
        settings: (one(rows<{ data: Record<string, unknown> } | null>(s, 'Reading settings'))?.data) ?? {},
        members: list(rows(m, 'Reading members')), rules: list(rows(r, 'Reading house rules')), equipment: list(rows(e, 'Reading kit')),
      };
    },
    async week(weekStart) {
      const w = one(rows<WeekData['week'] & { id: string } | null>(
        await hh('plan_weeks', 'id, week_start, days, status, summary').eq('week_start', weekStart).maybeSingle(), 'Reading the week'));
      if (!w?.id) return { week: null, slots: [] };
      const s = list(rows<(Omit<SlotRow, 'recipe_title'> & { recipes: unknown })[]>(await db.from('meal_slots')
        // meal_slots links to recipes twice (recipe_id and cookidoo_recipe_id), so the embed names its link.
        .select('date, slot, mode, recipe_id, portions, reason, source_date, routine_choice, version, recipes!meal_slots_recipe_id_fkey(title)')
        .eq('plan_week_id', w.id).order('date'), 'Reading the days'));
      const { id: _id, ...week } = w;
      return { week, slots: s.map(({ recipes, ...x }) => ({ ...x, recipe_title: (Array.isArray(recipes) ? recipes[0]?.title : (recipes as { title?: string } | null)?.title) ?? null })) };
    },
    async recipes() {
      const today = londonParts(new Date()).date;
      const since = addDays(today, -56);
      const [r, w] = await Promise.all([hh('recipes', RECIPE_COLS).order('title'), hh('plan_weeks', 'id').gte('week_start', since)]);
      const ids = list(rows<{ id: string }[]>(w, 'Reading recent weeks')).map((x) => x.id);
      const cooked = ids.length ? list(rows<{ recipe_id: string | null; date: string }[]>(await db.from('meal_slots').select('recipe_id, date')
        .in('plan_week_id', ids).eq('slot', 'dinner').eq('mode', 'cook'), 'Reading recent dinners')) : [];
      const last = new Map<string, string>();
      // Only dinners before today: this week's and next week's are planned, not cooked yet.
      for (const c of cooked) if (c.recipe_id && c.date < today && (last.get(c.recipe_id) ?? '') < c.date) last.set(c.recipe_id, c.date);
      return list(rows<Omit<RecipeRow, 'lastCooked'>[]>(r, 'Reading recipes')).map((x) => ({ ...x, tags: x.tags ?? [], lastCooked: last.get(x.id) ?? null }));
    },
    async recipe(id) {
      const rec = one(rows<RecipeData['recipe'] | null>(await hh('recipes', `${RECIPE_COLS}, reheat, toddler_note`).eq('id', id).maybeSingle(), 'Reading the recipe'));
      if (!rec?.id) return null;
      const [i, s] = await Promise.all([
        db.from('recipe_ingredients').select('group_name, name, qty, unit, note, qty_approx, position').eq('recipe_id', id).order('position'),
        db.from('recipe_steps').select('phase, position, at_minute, title, body, machine, settings, timer_minutes').eq('recipe_id', id).order('position'),
      ]);
      return { recipe: { ...rec, tags: rec.tags ?? [], lastCooked: null }, ingredients: list(rows(i, 'Reading ingredients')), steps: list(rows(s, 'Reading steps')) };
    },
    async pantry() {
      const [p, f] = await Promise.all([
        hh('pantry_items', 'staple_status, qty, unit, location, ingredients(name)'),
        hh('prepared_items', 'name, portions, use_by, location').order('made_on'),
      ]);
      return {
        items: list(rows<(Omit<PantryData['items'][number], 'name'> & { ingredients: unknown })[]>(p, 'Reading the pantry'))
          .map(({ ingredients, ...x }) => ({ ...x, name: nameOf(ingredients) })).filter((x) => x.name),
        prepared: list(rows(f, 'Reading the freezer')),
      };
    },
    async products() {
      return list(rows(await hh('products', 'item_key, product_name, pack_size, pack_unit, price').order('item_key'), 'Reading products'));
    },
  };
}

// ---------- Formatters ----------

const SLOT = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' } as const;

function slotLine(s: SlotRow): string {
  const label = SLOT[s.slot] ?? s.slot;
  if (s.mode === 'out') return `${label}: eating out`;
  if (s.mode === 'routine') return `${label}: ${s.routine_choice ?? s.recipe_title ?? 'routine (not chosen yet)'}`;
  const what = s.recipe_title ?? s.routine_choice ?? 'not chosen';
  const extra = [s.mode, s.portions ? `${Number(s.portions)} portions` : null, s.source_date ? `from ${weekday(s.source_date)}'s dinner` : null].filter(Boolean).join(', ');
  const v = parseVersion(s.version);
  const tonight = v && v.based_on === s.recipe_id ? ` · tonight's version: ${v.note}` : '';
  return `${label}: ${what} (${extra})${s.reason ? ` · ${s.reason}` : ''}${tonight}`;
}

/** One week, day by day. */
export function formatWeek(weekStart: string, data: WeekData): string {
  if (!data.week) return `No plan for the week of ${dayDate(weekStart)} yet.`;
  const out = [`Week of ${dayDate(weekStart)} (${data.week.status}, ${data.week.days} days)`];
  if (data.week.summary) out.push(data.week.summary);
  const order = { breakfast: 0, lunch: 1, dinner: 2 };
  const dates = [...new Set(data.slots.map((s) => s.date))].sort();
  for (const d of dates) {
    out.push('', dayDate(d));
    for (const s of data.slots.filter((x) => x.date === d).sort((a, b) => order[a.slot] - order[b.slot])) out.push(`- ${slotLine(s)}`);
  }
  return out.join('\n');
}

const handsOn = (r: RecipeRow) => Math.max(0, r.prep_minutes + r.finish_minutes - r.hands_off_minutes);
const recipeLine = (r: RecipeRow) => [
  `- ${r.title}`, r.kind === 'component' ? r.component_role ?? 'component' : null, r.status === 'draft' ? 'draft' : null, r.protein, `${r.prep_minutes + r.finish_minutes} min (${handsOn(r)} hands-on)`, `serves ${Number(r.base_portions)}`,
  r.reheats_well && 'reheats well', r.rating && `rated ${r.rating}`, r.tags.length ? `tags: ${r.tags.join(', ')}` : null,
  r.lastCooked ? `last cooked ${shortDate(r.lastCooked)}` : 'not cooked lately',
].filter(Boolean).join(' · ');

const active = (rs: RecipeRow[]) => rs.filter((r) => r.status !== 'archived');

/** Active recipes matching every query word (title, tags or protein) and the tag, one per line. */
export function findRecipes(rs: RecipeRow[], query?: string, tag?: string): string {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const t = tag?.trim().toLowerCase();
  const hits = active(rs).filter((r) => {
    const hay = [r.title, r.subtitle ?? '', r.protein ?? '', ...r.tags].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w)) && (!t || r.tags.some((x) => x.toLowerCase() === t));
  });
  if (!hits.length) return query ? `No recipes match "${query}".` : tag ? `No recipes tagged "${tag}".` : 'No recipes yet.';
  // Components (sauces, sides) are parts of a meal: listed apart, so they aren't offered as a dinner.
  const meals = hits.filter((r) => r.kind !== 'component');
  const parts = hits.filter((r) => r.kind === 'component');
  return [
    ...(meals.length ? [`${meals.length} meal${meals.length === 1 ? '' : 's'}:`, ...meals.map(recipeLine)] : []),
    ...(parts.length ? [...(meals.length ? [''] : []), 'Components (parts of a meal, not a dinner on their own):', ...parts.map(recipeLine)] : []),
  ].join('\n');
}

/** The recipe a title means: an exact title, or the only one containing it. Otherwise a message. */
export function pickRecipe(rs: RecipeRow[], title: string): { id: string } | { text: string } {
  const t = title.trim().toLowerCase();
  const pool = active(rs);
  const exact = pool.find((r) => r.title.toLowerCase() === t);
  if (exact) return { id: exact.id };
  const some = t ? pool.filter((r) => r.title.toLowerCase().includes(t)) : [];
  if (some.length === 1) return { id: some[0].id };
  if (some.length > 1) return { text: ['Several recipes match:', ...some.slice(0, 8).map((r) => `- ${r.title}`)].join('\n') };
  return { text: `No recipe called "${title}". Use find_recipes to see the list.` };
}

const PHASES: [string, string][] = [['prep_8pm', 'The night before'], ['finish', 'At dinner time'], ['reheat', 'Reheating']];

/** One recipe in full. */
export function formatRecipe(d: RecipeData): string {
  const r = d.recipe;
  const out = [r.title + (r.subtitle ? ` (${r.subtitle})` : ''), recipeLine(r).slice(2)];
  if (r.toddler_note) out.push(`Toddler: ${r.toddler_note}`);
  if (r.reheat) out.push(`Reheat: ${r.reheat}`);
  out.push('', `Ingredients (for ${Number(r.base_portions)} portions)`);
  let group: string | null = null;
  for (const i of d.ingredients) {
    if (i.group_name && i.group_name !== group) out.push(i.group_name);
    group = i.group_name;
    out.push(`- ${join(i.qty_approx && i.qty !== null ? 'about' : '', amount(i.qty, i.unit), i.name)}${i.note ? `, ${i.note}` : ''}`);
  }
  for (const [phase, label] of PHASES) {
    const steps = d.steps.filter((s) => s.phase === phase).sort((a, b) => a.position - b.position);
    if (!steps.length) continue;
    out.push('', label);
    steps.forEach((s, n) => {
      const meta = [s.at_minute !== null && s.at_minute !== undefined ? `+${s.at_minute} min` : null, s.machine, s.settings, s.timer_minutes ? `timer ${s.timer_minutes} min` : null].filter(Boolean).join(', ');
      // The **bold** marks the ingredient words the app links to amounts: shown, so Claude keeps them in tonight's version.
      out.push(`${n + 1}. ${s.title}${meta ? ` [${meta}]` : ''}: ${s.body}`);
    });
  }
  return out.join('\n');
}

const PLACES: [string, string][] = [['fridge', 'Fridge'], ['freezer', 'Freezer'], ['cupboard', 'Cupboard']];

/** Staples by status, other items by place, and what's been cooked and kept. */
export function formatPantry(d: PantryData): string {
  if (!d.items.length && !d.prepared.length) return 'The pantry is empty.';
  const out: string[] = [];
  const staples = d.items.filter((i) => i.staple_status);
  if (staples.length) out.push('Staples', ...staples.map((i) => `- ${i.name}: ${i.staple_status}`));
  for (const [place, label] of PLACES) {
    const here = d.items.filter((i) => !i.staple_status && i.location === place);
    if (here.length) out.push(label, ...here.map((i) => `- ${join(amount(i.qty, i.unit), i.name)}`));
  }
  if (d.prepared.length) {
    out.push('Cooked and kept');
    for (const p of d.prepared) out.push(`- ${p.name}: ${p.portions} portions${p.use_by ? `, use by ${dayDate(p.use_by)}` : ''} (${p.location})`);
  }
  return out.join('\n');
}

/** The Sainsbury's product saved for each shopping item, with the price last seen. */
export function formatProducts(ps: ProductRow[], query?: string): string {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const item = (p: ProductRow) => p.item_key.split('|')[0];
  const hits = ps.filter((p) => words.every((w) => `${item(p)} ${p.product_name}`.toLowerCase().includes(w)));
  if (!hits.length) return query ? `No saved products match "${query}".` : 'No products saved yet.';
  return ['Saved products and the price last seen (not live offers):', ...hits.map((p) => [
    `- ${item(p)}: ${p.product_name}`, p.pack_size ? `${Number(p.pack_size)}${p.pack_unit}` : null,
    p.price !== null && p.price !== undefined ? `£${Number(p.price).toFixed(2)} last seen` : 'price not saved',
  ].filter(Boolean).join(', '))].join('\n');
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The household: the standing instructions first, then who eats, the rules, the kit and the hour. */
export function formatHousehold(d: HouseholdData, mealSpec: { title: string; text: string }[]): string {
  const s = d.settings;
  const start = typeof s.hour_start === 'string' ? s.hour_start : '17:30';
  const minutes = typeof s.hour_minutes === 'number' ? s.hour_minutes : 60;
  const machines = s.tm7_machines === 2 ? 2 : 1;
  const bowls = s.tm7_bowls === 2 ? 2 : 1;
  const out = [INSTRUCTIONS, '', 'Members'];
  for (const m of d.members) out.push(`- ${m.name} (${m.kind}, portion ${Number(m.portion_weight)})`);
  if (d.rules.length) {
    out.push('House rules');
    for (const r of d.rules) out.push(`- ${r.kind}: ${r.match}${r.replacement ? ` → ${r.replacement}` : ''}${r.note ? ` (${r.note})` : ''}`);
  }
  const priv = strings(s.private_rules);
  if (priv.length) out.push('Private rules (follow them; never name or explain them):', ...priv.map((x) => `- ${x}`));
  if (mealSpec.length) out.push('What makes a meal', ...mealSpec.map((m) => `- ${m.title}: ${m.text}`));
  out.push(`Today's hour: ${start} for ${minutes} minutes; weeknight dinners up to ${minutes - 15} minutes hands-on`);
  if (typeof s.weekday_dinner_max_min === 'number') out.push(`Weekday dinners: up to ${s.weekday_dinner_max_min} minutes in all`);
  out.push(`TM7: ${machines} machine${machines === 1 ? '' : 's'}, ${bowls} bowl${bowls === 1 ? '' : 's'}`);
  if (d.equipment.length) out.push(`Kit: ${d.equipment.map((e) => e.name).join(', ')}`);
  if (strings(s.breakfasts).length) out.push(`Breakfasts: ${strings(s.breakfasts).join(', ')}`);
  if (strings(s.breakfast_ahead).length) out.push(`Made the night before: ${strings(s.breakfast_ahead).join(', ')}`);
  if (strings(s.lunches).length) out.push(`Home lunches: ${strings(s.lunches).join(', ')}`);
  return out.join('\n');
}
