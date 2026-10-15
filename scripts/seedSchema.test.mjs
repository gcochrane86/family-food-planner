// @vitest-environment node
import { readFileSync } from 'node:fs';
import { validateSeed } from './seedSchema.mjs';

const example = JSON.parse(readFileSync(new URL('../seed/household.example.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(example));

test('the example seed is valid', () => {
  expect(validateSeed(example)).toEqual([]);
});

test('a portion weight of 5 is out of range', () => {
  const s = clone();
  s.members[0].portion_weight = 5;
  expect(validateSeed(s)).toContain('members[0].portion_weight out of range');
});

test('missing settings is reported', () => {
  const s = clone();
  delete s.settings;
  expect(validateSeed(s)).toContain('settings missing');
});

test('an office day for an unknown member is reported', () => {
  const s = clone();
  s.office_days.push({ member: 'Nobody', weekday: 2 });
  expect(validateSeed(s)).toContain('office_days[1].member "Nobody" is not in members');
});

test('a bad rule kind and a bad weekday are reported', () => {
  const s = clone();
  s.house_rules[0].kind = 'maybe';
  s.office_days[0].weekday = 7;
  expect(validateSeed(s)).toEqual(expect.arrayContaining([
    'house_rules[0].kind must be substitute, prefer or avoid',
    'office_days[0].weekday must be 0 (Mon) to 6 (Sun)',
  ]));
});

test('anything that is not an object is rejected', () => {
  expect(validateSeed(null)).toEqual(['seed must be a JSON object']);
});
