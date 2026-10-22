// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parseImport, parseImportFailed, parseRework, parseReworkFailed, vttToText, youTubeId } from './importInput';

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

describe('YouTube links', () => {
  it('finds the video id in the usual link shapes, and nothing else', () => {
    expect(youTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://www.bbcgoodfood.com/recipes/x')).toBeNull();
    expect(youTubeId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youTubeId('https://www.youtube.com/watch?v=bad;rm -rf')).toBeNull();
  });
  it('turns subtitles into plain text, without timings, tags or the repeats auto-captions have', () => {
    const vtt = ['WEBVTT', 'Kind: captions', 'Language: en', '',
      '00:00:01.000 --> 00:00:03.000 align:start position:0%', 'so<00:00:01.500><c> first</c> fry the onions', '',
      '00:00:03.000 --> 00:00:05.000', 'so first fry the onions', 'then add 2 tbsp of tomato paste &amp; stir', '',
      '00:00:05.000 --> 00:00:06.000', 'then add 2 tbsp of tomato paste &amp; stir'].join('\n');
    expect(vttToText(vtt)).toBe('so first fry the onions then add 2 tbsp of tomato paste & stir');
  });
});
