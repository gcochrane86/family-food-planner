// Checks a recipe seed file ({ recipes: [...] }) before anything is written. Empty list means valid.
const PHASES = ['prep_8pm', 'finish', 'reheat'];
const MACHINES = ['tm7', 'apo', 'hy24', 'meater', 'hob', 'oven', 'kettle'];
const KINDS = ['meal', 'component'];
const ROLES = ['sauce', 'protein', 'veg', 'carb', 'bread'];
const SOURCES = ['hellofresh', 'own_doc', 'claude', 'cookidoo', 'web'];
const PROTEINS = ['chicken', 'fish', 'red_meat', 'veggie', 'egg', 'other'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateRecipeSeed(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file) || !Array.isArray(file.recipes)) {
    return ['file must be an object with a "recipes" list'];
  }
  const problems = [];
  const seen = new Set();
  file.recipes.forEach((r, i) => {
    const at = `recipes[${i}]`;
    if (!isText(r?.slug) || !SLUG.test(r.slug)) problems.push(`${at}.slug must be lower-case-with-dashes`);
    else if (seen.has(r.slug)) problems.push(`${at}.slug "${r.slug}" is used twice`);
    else seen.add(r.slug);
    if (!isText(r?.title)) problems.push(`${at}.title missing`);
    if (!KINDS.includes(r?.kind)) problems.push(`${at}.kind must be meal or component`);
    if (r?.component_role != null && !ROLES.includes(r.component_role)) problems.push(`${at}.component_role must be one of ${ROLES.join(', ')}`);
    if ((r?.kind === 'meal' || r?.protein != null) && !PROTEINS.includes(r?.protein)) problems.push(`${at}.protein must be one of ${PROTEINS.join(', ')}`);
    if (!SOURCES.includes(r?.source)) problems.push(`${at}.source must be one of ${SOURCES.join(', ')}`);
    if (!isNum(r?.base_portions) || r.base_portions <= 0 || r.base_portions >= 100) problems.push(`${at}.base_portions must be a positive number under 100`);
    if (r?.status != null && !['draft', 'active', 'archived'].includes(r.status)) problems.push(`${at}.status must be draft, active or archived`);
    for (const k of ['prep_minutes', 'finish_minutes', 'hands_off_minutes']) {
      if (r?.[k] != null && (!Number.isInteger(r[k]) || r[k] < 0)) problems.push(`${at}.${k} must be whole minutes`);
    }
    if (r?.salt_per_portion_g != null && (!isNum(r.salt_per_portion_g) || r.salt_per_portion_g < 0 || r.salt_per_portion_g >= 100)) {
      problems.push(`${at}.salt_per_portion_g must be a number under 100`);
    }
    (Array.isArray(r?.ingredients) ? r.ingredients : (problems.push(`${at}.ingredients must be a list`), [])).forEach((g, j) => {
      if (!isText(g?.name)) problems.push(`${at}.ingredients[${j}].name missing`);
      if (g?.qty != null && !isNum(g.qty)) problems.push(`${at}.ingredients[${j}].qty must be a number or null`);
      if (g?.unit != null && typeof g.unit !== 'string') problems.push(`${at}.ingredients[${j}].unit must be text`);
    });
    (Array.isArray(r?.steps) ? r.steps : (problems.push(`${at}.steps must be a list`), [])).forEach((s, j) => {
      if (!PHASES.includes(s?.phase)) problems.push(`${at}.steps[${j}].phase must be prep_8pm, finish or reheat`);
      if (s?.machine != null && !MACHINES.includes(s.machine)) problems.push(`${at}.steps[${j}].machine must be one of ${MACHINES.join(', ')}`);
      if (!isText(s?.title)) problems.push(`${at}.steps[${j}].title missing`);
      if (!isText(s?.body)) problems.push(`${at}.steps[${j}].body missing`);
      if (s?.at != null && (!Number.isInteger(s.at) || s.at < 0)) problems.push(`${at}.steps[${j}].at must be whole minutes`);
      if (s?.settings != null && typeof s.settings !== 'string') problems.push(`${at}.steps[${j}].settings must be text`);
      if (s?.timer != null && (!Number.isInteger(s.timer) || s.timer <= 0)) problems.push(`${at}.steps[${j}].timer must be whole minutes`);
    });
  });
  return problems;
}

/** A seed recipe's row in `recipes`. */
export function recipeRow(householdId, r) {
  return {
    household_id: householdId, slug: r.slug, title: r.title, subtitle: r.subtitle ?? null, kind: r.kind,
    component_role: r.component_role ?? null, source: r.source, base_portions: r.base_portions,
    reheats_well: !!r.reheats_well, freezes_well: !!r.freezes_well, toddler_ok: r.toddler_ok !== false,
    toddler_note: r.toddler_note ?? null, protein: r.protein ?? null, salt_per_portion_g: r.salt_per_portion_g ?? null,
    prep_minutes: r.prep_minutes ?? 0, finish_minutes: r.finish_minutes ?? 0, hands_off_minutes: r.hands_off_minutes ?? 0,
    tags: r.tags ?? [], equipment: r.equipment ?? [], reheat: r.reheat ?? null, status: r.status ?? 'active',
  };
}

/** A seed recipe's ingredients and steps, as replace_recipe_contents takes them. */
export function contentRows(r) {
  const position = { prep_8pm: 0, finish: 0, reheat: 0 };
  const steps = r.steps.map((s) => ({
    phase: s.phase, position: ++position[s.phase], at_minute: s.at ?? null, title: s.title, body: s.body,
    machine: s.machine ?? null, settings: s.settings ?? null, timer_minutes: s.timer ?? null,
  }));
  const ingredients = r.ingredients.map((g, i) => ({
    position: i + 1, group_name: g.group ?? null, name: g.name, qty: g.qty ?? null,
    unit: g.unit ?? '', note: g.note ?? null, qty_approx: !!g.approx,
  }));
  return { ingredients, steps };
}

const SEED_FIELDS = ['slug', 'title', 'subtitle', 'kind', 'component_role', 'source', 'base_portions', 'reheats_well', 'freezes_well',
  'toddler_ok', 'toddler_note', 'protein', 'salt_per_portion_g', 'prep_minutes', 'finish_minutes', 'hands_off_minutes', 'tags', 'equipment',
  'reheat', 'status'];
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
  }));
  return r;
}
