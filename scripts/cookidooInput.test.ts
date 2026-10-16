// @vitest-environment node
import { parseCookidooFinish, parseRecordDay, parseRecordRecipe } from './cookidooInput';

describe('parseRecordRecipe', () => {
  it('reads a recipe id, Cookidoo link and portions', () => {
    expect(parseRecordRecipe('{"recipeId":"r1","url":"https://cookidoo.co.uk/created-recipes/en-GB/01ABC","portions":6}'))
      .toEqual({ recipeId: 'r1', url: 'https://cookidoo.co.uk/created-recipes/en-GB/01ABC', portions: 6 });
  });
  it('only takes cookidoo.co.uk links', () => {
    expect(() => parseRecordRecipe('{"recipeId":"r1","url":"https://evil.example/x","portions":6}')).toThrow('url');
    expect(() => parseRecordRecipe('{"recipeId":"r1","url":"http://cookidoo.co.uk/x","portions":6}')).toThrow('url');
  });
  it('needs positive portions', () => {
    expect(() => parseRecordRecipe('{"recipeId":"r1","url":"https://cookidoo.co.uk/x","portions":0}')).toThrow('portions');
  });
});

describe('parseRecordDay', () => {
  it('reads a date and a recipe, or null to clear the day', () => {
    expect(parseRecordDay('{"date":"2026-10-19","recipeId":"r1"}')).toEqual({ date: '2026-10-19', recipeId: 'r1' });
    expect(parseRecordDay('{"date":"2026-10-19","recipeId":null}')).toEqual({ date: '2026-10-19', recipeId: null });
  });
  it('dates must be YYYY-MM-DD', () => {
    expect(() => parseRecordDay('{"date":"19/10/2026","recipeId":"r1"}')).toThrow('date');
  });
});

describe('parseCookidooFinish', () => {
  it('only accepts done or failed, and caps the summary', () => {
    expect(() => parseCookidooFinish('{"run":"x","status":"filling"}')).toThrow('status');
    expect(parseCookidooFinish(`{"run":"x","status":"done","summary":"${'s'.repeat(3000)}"}`).summary).toHaveLength(2000);
  });
});
