// Tonight's version: a day's meal can carry its own version of the recipe (the full ingredients and steps for that
// day, a one-line note and which parts changed), made by Claude through the Ask Claude connector. The saved recipe is
// untouched. Shared by the connector (which builds and checks it) and the app (which shows it when that day is cooked
// or shopped for). See docs/spec.md §10, "Ask Claude: changes you approve".

export interface VersionIngredient { group_name: string | null; name: string; qty: number | null; unit: string; note: string | null; qty_approx: boolean; changed: boolean }
export interface VersionStep {
  phase: string; position: number; at_minute: number | null; title: string; body: string; machine: string | null;
  settings: string | null; timer_minutes: number | null; changed: boolean;
}
export interface SlotVersion { based_on: string; note: string; ingredients: VersionIngredient[]; steps: VersionStep[] }

type InIngredient = { group_name?: string | null; name: string; qty?: number | null; unit?: string; note?: string | null; replaces?: string };
type InStep = {
  phase: string; position?: number; at_minute?: number | null; title: string; body: string; machine?: string | null;
  settings?: string | null; timer_minutes?: number | null; replaces?: string;
};
export interface VersionInput { note: string; ingredients: InIngredient[]; removed_ingredients?: string[]; steps: InStep[]; removed_steps?: string[] }

type SavedIngredient = { group_name: string | null; name: string; qty: number | null; unit: string; note: string | null; qty_approx?: boolean };
type SavedStep = { phase: string; position: number; at_minute: number | null; title: string; body: string; machine: string | null; settings: string | null; timer_minutes: number | null; image_path?: string | null; image_source?: string | null };
type Saved = { id: string; ingredients: SavedIngredient[]; steps: SavedStep[] };

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const MAX_INGREDIENTS = 80;
const MAX_STEPS = 60;
const PHASES = ['prep_8pm', 'finish', 'reheat'];

/** Builds tonight's version from the saved recipe and Claude's changes, or says why it can't. `changed` is worked
 *  out here, never taken from the caller. Anything in the saved recipe must be kept, replaced or removed on purpose. */
export function buildVersion(saved: Saved, input: VersionInput): { version: SlotVersion } | { error: string } {
  const note = text(input?.note);
  if (!note) return { error: "Say in one line what's different tonight." };
  const ins = Array.isArray(input.ingredients) ? input.ingredients : [];
  const sts = Array.isArray(input.steps) ? input.steps : [];
  if (!ins.length) return { error: 'Tonight\'s version needs its ingredients.' };
  if (ins.length > MAX_INGREDIENTS) return { error: `Tonight's version can have at most ${MAX_INGREDIENTS} ingredients.` };
  if (sts.length > MAX_STEPS) return { error: `Tonight's version can have at most ${MAX_STEPS} steps.` };
  if (ins.some((i) => !text(i?.name))) return { error: 'Every ingredient needs a name.' };
  if (sts.some((s) => !text(s?.title) || !text(s?.body) || !PHASES.includes(s.phase))) return { error: `Every step needs a title, a body and a phase (${PHASES.join(', ')}).` };

  // Every saved ingredient and step is accounted for: kept, replaced, or removed on purpose.
  const removedI = new Set((input.removed_ingredients ?? []).map(key));
  const keptI = new Set([...ins.map((i) => key(i.name)), ...ins.map((i) => key(i.replaces))]);
  const lostI = saved.ingredients.find((i) => !keptI.has(key(i.name)) && !removedI.has(key(i.name)));
  if (lostI) return { error: `Tonight's version leaves out "${lostI.name}" without saying so: add it back, put it in removed_ingredients, or name it in replaces.` };
  const removedS = new Set((input.removed_steps ?? []).map(key));
  const keptS = new Set([...sts.map((s) => key(s.title)), ...sts.map((s) => key(s.replaces))]);
  const lostS = saved.steps.find((s) => !keptS.has(key(s.title)) && !removedS.has(key(s.title)));
  if (lostS) return { error: `Tonight's version leaves out the step "${lostS.title}" without saying so: add it back, put it in removed_steps, or name it in replaces.` };

  const savedI = new Map(saved.ingredients.map((i) => [key(i.name), i]));
  const ingredients: VersionIngredient[] = ins.map((i) => {
    const v = { group_name: text(i.group_name), name: i.name.trim(), qty: num(i.qty), unit: (i.unit ?? '').trim(), note: text(i.note) };
    const was = i.replaces ? undefined : savedI.get(key(v.name));
    const changed = !was || num(was.qty) !== v.qty || (was.unit ?? '') !== v.unit || (was.note ?? null) !== v.note;
    return { ...v, qty_approx: was?.qty_approx ?? false, changed };
  });
  const savedS = new Map(saved.steps.map((s) => [`${s.phase}|${key(s.title)}`, s]));
  const counts: Record<string, number> = {};
  const steps: VersionStep[] = PHASES.flatMap((phase) => sts.filter((s) => s.phase === phase)).map((s) => {
    const v = {
      phase: s.phase, position: (counts[s.phase] = (counts[s.phase] ?? 0) + 1), at_minute: num(s.at_minute), title: s.title.trim(),
      body: s.body.trim(), machine: text(s.machine), settings: text(s.settings), timer_minutes: num(s.timer_minutes),
    };
    const was = s.replaces ? undefined : savedS.get(`${v.phase}|${key(v.title)}`);
    const changed = !was || was.body !== v.body || num(was.at_minute) !== v.at_minute || (was.machine ?? null) !== v.machine
      || (was.settings ?? null) !== v.settings || num(was.timer_minutes) !== v.timer_minutes;
    return { ...v, changed };
  });
  return { version: { based_on: saved.id, note, ingredients, steps } };
}

/** A stored version, if it has the right shape; anything else is treated as none. */
export function parseVersion(v: unknown): SlotVersion | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<SlotVersion>;
  return typeof o.based_on === 'string' && typeof o.note === 'string' && Array.isArray(o.ingredients) && Array.isArray(o.steps) ? (o as SlotVersion) : null;
}

/** The recipe as it's cooked that day: the version's ingredients and steps when the version was made from this
 *  recipe, otherwise the recipe itself, unchanged. Steps keep their saved photo when the step is the same one. */
export function applyVersion<R extends Saved>(recipe: R, version: unknown): R & { versionNote?: string; changedIngredients?: Set<string>; changedSteps?: Set<number> } {
  const v = parseVersion(version);
  if (!v || v.based_on !== recipe.id) return recipe;
  const photo = new Map(recipe.steps.map((s) => [`${s.phase}|${key(s.title)}`, { image_path: s.image_path ?? null, image_source: s.image_source ?? null }]));
  const ingredients = v.ingredients.map((i, n) => ({ ...i, position: n + 1 }));
  const steps = v.steps.map((s) => ({ ...s, ...(photo.get(`${s.phase}|${key(s.title)}`) ?? { image_path: null, image_source: null }) }));
  return {
    ...recipe, ingredients, steps, versionNote: v.note,
    changedIngredients: new Set(v.ingredients.filter((i) => i.changed).map((i) => i.name)),
    changedSteps: new Set(v.steps.map((s, n) => (s.changed ? n : -1)).filter((n) => n >= 0)),
  } as R & { versionNote?: string; changedIngredients?: Set<string>; changedSteps?: Set<number> };
}
