// Recipe seed helpers for the scripts. The checks and row builders live in supabase/functions/_shared/recipeSeed.ts
// (shared with the Ask Claude connector); Node 24 loads the .ts directly.
export { contentRows, recipeRow, validateRecipeSeed } from '../supabase/functions/_shared/recipeSeed.ts';

const SEED_FIELDS = ['slug', 'title', 'subtitle', 'kind', 'component_role', 'source', 'base_portions', 'reheats_well', 'freezes_well',
  'toddler_ok', 'toddler_note', 'protein', 'salt_per_portion_g', 'prep_minutes', 'finish_minutes', 'hands_off_minutes', 'tags', 'equipment',
  'reheat', 'status', 'batch', 'roast'];
const num = (v) => (v === null || v === undefined ? v : Number(v));

/** A saved recipe (row + ingredients + steps) in the seed format, e.g. for Claude to rework it. */
export function seedFromDetail(d) {
  const r = Object.fromEntries(SEED_FIELDS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));
  r.base_portions = num(r.base_portions);
  if (r.salt_per_portion_g != null) r.salt_per_portion_g = num(r.salt_per_portion_g);
  r.ingredients = [...d.ingredients].sort((a, b) => a.position - b.position).map((g) => ({
    group: g.group_name, name: g.name, qty: num(g.qty), unit: g.unit, note: g.note, approx: g.qty_approx,
  }));
  const order = { prep_8pm: 0, finish: 1, reheat: 2 };
  r.steps = [...d.steps].sort((a, b) => order[a.phase] - order[b.phase] || a.position - b.position).map((s) => ({
    phase: s.phase, at: s.at_minute, title: s.title, body: s.body, machine: s.machine, settings: s.settings, timer: s.timer_minutes,
    ...(s.photo_hint ? { picture: s.photo_hint } : {}),
    ...(s.needs_night_before ? { night: true } : {}),
  }));
  return r;
}
