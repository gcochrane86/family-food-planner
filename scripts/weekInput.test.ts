// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parseWeekFailed, parseWeekPlan } from './weekInput';

const example = JSON.parse(readFileSync('seed/recipes.example.json', 'utf8')).recipes[0];
const week = { weekStart: '2026-10-26', days: 7, adventure: 1 };
const plan = (over: Record<string, unknown> = {}) => JSON.stringify({
  summary: 'A lighter week, fish on Thursday.',
  dinners: [{ date: '2026-10-26', recipe: 'honey-chilli', reason: 'Uses the ginger from Sunday' }, { date: '2026-10-29', recipe: 'salmon', reason: 'Fishmonger day' }],
  ...over,
});

describe('parseWeekPlan', () => {
  it('reads the summary, dinners and new recipes, marking new recipes as Claude\'s', () => {
    const out = parseWeekPlan(plan({ new_recipes: [{ ...example, source: 'web' }] }), week);
    expect(out.summary).toBe('A lighter week, fish on Thursday.');
    expect(out.dinners).toEqual([
      { date: '2026-10-26', recipe: 'honey-chilli', reason: 'Uses the ginger from Sunday' },
      { date: '2026-10-29', recipe: 'salmon', reason: 'Fishmonger day' },
    ]);
    expect(out.newRecipes[0].source).toBe('claude');
  });
  it('needs a summary and at least one dinner', () => {
    expect(() => parseWeekPlan(plan({ summary: '' }), week)).toThrow('"summary"');
    expect(() => parseWeekPlan(plan({ dinners: [] }), week)).toThrow('"dinners"');
  });
  it('refuses dates outside the week, and two dinners on one night', () => {
    expect(() => parseWeekPlan(plan({ dinners: [{ date: '2026-11-02', recipe: 'x', reason: 'r' }] }), week)).toThrow(/2026-11-02 is not in the week/);
    expect(() => parseWeekPlan(plan({ dinners: [{ date: '2026-10-26', recipe: 'x', reason: 'r' }, { date: '2026-10-26', recipe: 'y', reason: 'r' }] }), week))
      .toThrow(/two dinners on 2026-10-26/);
    expect(() => parseWeekPlan(plan({ dinners: [{ date: '2026-11-01', recipe: 'x', reason: 'r' }] }), { ...week, days: 5 })).toThrow(/not in the week/);
  });
  it('allows only the household\'s number of new recipes, each passing the seed rules', () => {
    expect(() => parseWeekPlan(plan({ new_recipes: [example, { ...example, slug: 'two' }] }), week)).toThrow(/at most 1 new recipe/);
    expect(() => parseWeekPlan(plan({ new_recipes: [{ ...example, steps: [{ phase: 'later', title: 'x', body: 'y' }] }] }), week))
      .toThrow(/phase must be prep_8pm, finish or reheat/);
  });
});

describe('parseWeekFailed', () => {
  it('reads the request id and why', () => {
    expect(parseWeekFailed('{"request":"r1","summary":"Not enough fish recipes"}')).toEqual({ request: 'r1', summary: 'Not enough fish recipes' });
  });
});
