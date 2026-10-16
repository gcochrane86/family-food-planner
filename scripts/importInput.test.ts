// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parseImport, parseImportFailed } from './importInput';

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
