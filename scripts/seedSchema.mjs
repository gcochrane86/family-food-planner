// Checks a household seed file before anything is written. Returns a list of problems; empty means valid.
const KINDS = ['adult', 'child'];
const RULE_KINDS = ['substitute', 'prefer', 'avoid'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isText = (v) => typeof v === 'string' && v.trim() !== '';

export function validateSeed(seed) {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) return ['seed must be a JSON object'];
  const problems = [];

  const members = Array.isArray(seed.members) ? seed.members : (problems.push('members must be a list'), []);
  members.forEach((m, i) => {
    if (!isText(m?.name)) problems.push(`members[${i}].name missing`);
    if (!KINDS.includes(m?.kind)) problems.push(`members[${i}].kind must be adult or child`);
    if (typeof m?.portion_weight !== 'number' || m.portion_weight < 0.1 || m.portion_weight > 3) {
      problems.push(`members[${i}].portion_weight out of range`);
    }
  });
  const names = new Set(members.map((m) => m?.name));

  (Array.isArray(seed.office_days) ? seed.office_days : []).forEach((d, i) => {
    if (!names.has(d?.member)) problems.push(`office_days[${i}].member "${d?.member}" is not in members`);
    if (!Number.isInteger(d?.weekday) || d.weekday < 0 || d.weekday > 6) problems.push(`office_days[${i}].weekday must be 0 (Mon) to 6 (Sun)`);
  });

  if (!seed.settings || typeof seed.settings !== 'object') {
    problems.push('settings missing');
  } else {
    (seed.settings.delivery_slots ?? []).forEach((s, i) => {
      if (!DAYS.includes(s?.day) || !TIME.test(s?.start ?? '') || !TIME.test(s?.end ?? '')) {
        problems.push(`settings.delivery_slots[${i}] needs day (mon–sun) and start/end as HH:MM`);
      }
    });
  }

  (Array.isArray(seed.equipment) ? seed.equipment : []).forEach((e, i) => {
    if (!isText(e?.code) || !isText(e?.name)) problems.push(`equipment[${i}] needs code and name`);
  });
  (Array.isArray(seed.house_rules) ? seed.house_rules : []).forEach((r, i) => {
    if (!RULE_KINDS.includes(r?.kind)) problems.push(`house_rules[${i}].kind must be substitute, prefer or avoid`);
    if (!isText(r?.match)) problems.push(`house_rules[${i}].match missing`);
  });
  (Array.isArray(seed.basics) ? seed.basics : []).forEach((b, i) => {
    if (!isText(b?.name)) problems.push(`basics[${i}].name missing`);
    if (b?.qty != null && (typeof b.qty !== 'number' || b.qty < 0)) problems.push(`basics[${i}].qty must be a number of 0 or more`);
    if (!['', 'g', 'ml'].includes(b?.unit ?? '')) problems.push(`basics[${i}].unit must be "", "g" or "ml"`);
    if (!['sun', 'tue', 'split'].includes(b?.delivery)) problems.push(`basics[${i}].delivery must be sun, tue or split`);
  });
  (Array.isArray(seed.staples) ? seed.staples : []).forEach((s, i) => {
    if (!isText(s)) problems.push(`staples[${i}] must be a name`);
  });

  return problems;
}
