// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parseImport, parseImportFailed, parseRework, parseReworkFailed } from './importInput';

const example = JSON.parse(readFileSync('seed/recipes.example.json', 'utf8')).recipes[0];

describe('parseImport', () => {
  it('reads a converted recipe and a summary, marking it as from the web', () => {
    const out = parseImport(JSON.stringify({ recipe: { ...example, source: 'own_doc' }, summary: 'Added it: 6 portions.' }));
    expect(out.recipe.source).toBe('web');
    expect(out.recipe.slug).toBe(example.slug);
    expect(out.summary).toBe('Added it: 6 portions.');
  });
  it('refuses a recipe the seed rules reject, listing the problems', () => {
    expect(() => parseImport(JSON.stringify({ recipe: { ...example, steps: [{ phase: 'later', title: 'x', body: 'y' }] }, summary: 's' })))
      .toThrow(/phase must be prep_8pm, finish or reheat/);
  });
  it('needs a summary', () => {
    expect(() => parseImport(JSON.stringify({ recipe: example }))).toThrow('"summary"');
  });
});

describe('parseImportFailed', () => {
  it('reads the import id and why it failed', () => {
    expect(parseImportFailed('{"import":"i1","summary":"The site blocked reading the page."}'))
      .toEqual({ import: 'i1', summary: 'The site blocked reading the page.' });
  });
  it('needs a reason', () => {
    expect(() => parseImportFailed('{"import":"i1"}')).toThrow('"summary"');
  });
});

describe('parseRework', () => {
  it('reads a reworked recipe and a summary, keeping the recipe source as given', () => {
    const out = parseRework(JSON.stringify({ recipe: example, summary: 'Chicken now in the Anova.' }));
    expect(out.recipe.source).toBe(example.source);
    expect(out.summary).toBe('Chicken now in the Anova.');
  });
  it('refuses an invalid recipe', () => {
    expect(() => parseRework(JSON.stringify({ recipe: { ...example, steps: 'none' }, summary: 's' }))).toThrow(/steps must be a list/);
  });
});

describe('parseReworkFailed', () => {
  it('reads the rework id and why', () => {
    expect(parseReworkFailed('{"rework":"w1","summary":"The request was unclear."}')).toEqual({ rework: 'w1', summary: 'The request was unclear.' });
  });
});
