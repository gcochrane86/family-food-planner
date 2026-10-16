// Checks a recipe seed file ({ recipes: [...] }) before anything is written. Empty list means valid.
const PHASES = ['prep_8pm', 'finish', 'reheat'];
const MACHINES = ['tm7', 'apo', 'hy24', 'meater', 'hob', 'oven', 'kettle'];
const KINDS = ['meal', 'component'];
const ROLES = ['sauce', 'protein', 'veg', 'carb', 'bread'];
const SOURCES = ['hellofresh', 'own_doc', 'claude'];
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
