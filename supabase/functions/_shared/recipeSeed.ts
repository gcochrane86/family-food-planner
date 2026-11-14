// Recipe seed checks and rows, shared by the scripts (recipeSeed.mjs re-exports these) and the Ask Claude connector,
// which adds Claude's new recipes while planning a week. Checks a seed file ({ recipes: [...] }) before anything is
// written: an empty list means valid.
// deno-lint-ignore-file no-explicit-any
/** A recipe in the seed format (docs/playbooks/recipe-import.md). */
export type SeedRecipe = Record<string, any>;
const PHASES = ['prep_8pm', 'finish', 'reheat'];
const MACHINES = ['tm7', 'apo', 'hy24', 'meater', 'hob', 'oven', 'kettle'];
const KINDS = ['meal', 'component'];
const ROLES = ['sauce', 'protein', 'veg', 'carb', 'bread'];
const SOURCES = ['hellofresh', 'own_doc', 'claude', 'cookidoo', 'web'];
const PROTEINS = ['chicken', 'fish', 'red_meat', 'veggie', 'egg', 'other'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateRecipeSeed(file: any): string[] {
  if (!file || typeof file !== 'object' || Array.isArray(file) || !Array.isArray(file.recipes)) {
    return ['file must be an object with a "recipes" list'];
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  file.recipes.forEach((r: SeedRecipe, i: number) => {
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
    if (r?.photo != null && (typeof r.photo !== 'string' || r.photo.length > 600)) problems.push(`${at}.photo must be text up to 600 characters`);
    (Array.isArray(r?.ingredients) ? r.ingredients : (problems.push(`${at}.ingredients must be a list`), [])).forEach((g: any, j: number) => {
      if (!isText(g?.name)) problems.push(`${at}.ingredients[${j}].name missing`);
      if (g?.qty != null && !isNum(g.qty)) problems.push(`${at}.ingredients[${j}].qty must be a number or null`);
      if (g?.unit != null && typeof g.unit !== 'string') problems.push(`${at}.ingredients[${j}].unit must be text`);
    });
    (Array.isArray(r?.steps) ? r.steps : (problems.push(`${at}.steps must be a list`), [])).forEach((s: any, j: number) => {
      if (!PHASES.includes(s?.phase)) problems.push(`${at}.steps[${j}].phase must be prep_8pm, finish or reheat`);
      if (s?.machine != null && !MACHINES.includes(s.machine)) problems.push(`${at}.steps[${j}].machine must be one of ${MACHINES.join(', ')}`);
      if (!isText(s?.title)) problems.push(`${at}.steps[${j}].title missing`);
      if (!isText(s?.body)) problems.push(`${at}.steps[${j}].body missing`);
      if (s?.at != null && (!Number.isInteger(s.at) || s.at < 0)) problems.push(`${at}.steps[${j}].at must be whole minutes`);
      if (s?.settings != null && typeof s.settings !== 'string') problems.push(`${at}.steps[${j}].settings must be text`);
      if (s?.timer != null && (!Number.isInteger(s.timer) || s.timer <= 0)) problems.push(`${at}.steps[${j}].timer must be whole minutes`);
      if (s?.picture != null && typeof s.picture !== 'string') problems.push(`${at}.steps[${j}].picture must be text`);
      if (s?.night != null && typeof s.night !== 'boolean') problems.push(`${at}.steps[${j}].night must be true or false`);
      else if (s?.night === true && s?.phase !== 'prep_8pm') problems.push(`${at}.steps[${j}].night is only for prep_8pm steps`);
    });
    if (r?.roast != null) {
      const KITS = ['oven', 'grill', 'warm', 'apo', 'tm7', 'hob', 'hy24', 'counter'];
      const ro = r.roast;
      if (!['main', 'side'].includes(ro?.part)) problems.push(`${at}.roast.part must be main or side`);
      (Array.isArray(ro?.steps) ? ro.steps : (problems.push(`${at}.roast.steps must be a list`), [])).forEach((st: any, j: number) => {
        if (!isText(st?.title)) problems.push(`${at}.roast.steps[${j}].title missing`);
        if (!isNum(st?.before) || st.before < 0) problems.push(`${at}.roast.steps[${j}].before must be minutes before serving`);
        if (!isNum(st?.minutes) || st.minutes < 0) problems.push(`${at}.roast.steps[${j}].minutes must be minutes`);
        if (!KITS.includes(st?.kit)) problems.push(`${at}.roast.steps[${j}].kit must be one of ${KITS.join(', ')}`);
      });
    }
    if (r?.batch != null) {
      const b = r.batch;
      if (!isText(b?.name)) problems.push(`${at}.batch.name missing`);
      const groups = new Set((Array.isArray(r?.ingredients) ? r.ingredients : []).map((g: any) => g?.group).filter(Boolean));
      if (!groups.has(b?.group)) problems.push(`${at}.batch.group must be the name of an ingredient group`);
      if (!Array.isArray(b?.steps) || !b.steps.every(isText)) problems.push(`${at}.batch.steps must be a list of step titles`);
      if (b?.makes != null && (!Number.isInteger(b.makes) || b.makes < 2 || b.makes > 8)) problems.push(`${at}.batch.makes must be 2 to 8`);
      if (b?.freezer_days != null && (!Number.isInteger(b.freezer_days) || b.freezer_days < 1 || b.freezer_days > 365)) problems.push(`${at}.batch.freezer_days must be 1 to 365`);
    }
  });
  return problems;
}

/** A seed recipe's row in `recipes`. */
export function recipeRow(householdId: string, r: SeedRecipe): Record<string, unknown> {
  return {
    household_id: householdId, slug: r.slug, title: r.title, subtitle: r.subtitle ?? null, kind: r.kind,
    component_role: r.component_role ?? null, source: r.source, base_portions: r.base_portions,
    reheats_well: !!r.reheats_well, freezes_well: !!r.freezes_well, toddler_ok: r.toddler_ok !== false,
    toddler_note: r.toddler_note ?? null, protein: r.protein ?? null, salt_per_portion_g: r.salt_per_portion_g ?? null,
    prep_minutes: r.prep_minutes ?? 0, finish_minutes: r.finish_minutes ?? 0, hands_off_minutes: r.hands_off_minutes ?? 0,
    tags: r.tags ?? [], equipment: r.equipment ?? [], reheat: r.reheat ?? null, status: r.status ?? 'active',
    batch: r.batch ?? null,
    roast: r.roast ?? null,
    // The main photo's description (migration 0019); left out, a re-seed keeps the one saved.
    ...(typeof r.photo === 'string' && r.photo.trim() ? { hero_hint: r.photo.trim() } : {}),
  };
}

/** A seed recipe's ingredients and steps, as replace_recipe_contents takes them. */
export function contentRows(r: SeedRecipe): { ingredients: Record<string, unknown>[]; steps: Record<string, unknown>[] } {
  const position: Record<string, number> = { prep_8pm: 0, finish: 0, reheat: 0 };
  const steps = r.steps.map((s: any) => ({
    phase: s.phase, position: ++position[s.phase], at_minute: s.at ?? null, title: s.title, body: s.body,
    machine: s.machine ?? null, settings: s.settings ?? null, timer_minutes: s.timer ?? null,
    // What the step's cartoon picture shows; left out, the step keeps the one it has.
    ...(s.picture ? { photo_hint: s.picture } : {}),
    // A prep step that can't wait until the day's own hour (a long marinade, an overnight soak).
    needs_night_before: s.phase === 'prep_8pm' && s.night === true,
  }));
  const ingredients = r.ingredients.map((g: any, i: number) => ({
    position: i + 1, group_name: g.group ?? null, name: g.name, qty: g.qty ?? null,
    unit: g.unit ?? '', note: g.note ?? null, qty_approx: !!g.approx,
  }));
  return { ingredients, steps };
}

