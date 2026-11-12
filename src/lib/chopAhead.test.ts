import { describe, expect, it } from 'vitest';
import { isRawProtein, keepsDays, needsChopping } from './chopAhead';

describe('keepsDays', () => {
  it('knows how long each kind of veg keeps once cut', () => {
    expect(keepsDays('red onion')).toBe(4);
    expect(keepsDays('onion')).toBe(2);
    expect(keepsDays('salmon fillets')).toBe(0);
    expect(keepsDays('coriander')).toBe(0);
    expect(keepsDays('garlic')).toBe(1);
    expect(keepsDays('carrots')).toBe(4);
    expect(keepsDays('chicken thighs')).toBe(1);
  });
  it('gives 1 day for anything not listed', () => {
    expect(keepsDays('halloumi')).toBe(1);
  });
  it('matches the longest name', () => {
    expect(keepsDays('spring onions')).toBe(2);
    expect(keepsDays('large red onion')).toBe(4);
    expect(keepsDays('cherry tomatoes')).toBe(0);
  });
});

describe('needsChopping', () => {
  it('is true when the note says to cut it', () => {
    expect(needsChopping({ name: 'onion', note: 'finely chopped' })).toBe(true);
    expect(needsChopping({ name: 'broccoli', note: 'cut into florets' })).toBe(true);
    expect(needsChopping({ name: 'garlic', note: 'crushed' })).toBe(true);
  });
  it('is false for things that come ready to use', () => {
    expect(needsChopping({ name: 'tinned tomatoes', note: null })).toBe(false);
    expect(needsChopping({ name: 'ground cumin', note: null })).toBe(false);
  });
});

describe('isRawProtein', () => {
  it('spots raw meat and fish', () => {
    expect(isRawProtein('chicken thigh')).toBe(true);
    expect(isRawProtein('beef mince')).toBe(true);
    expect(isRawProtein('salmon fillets')).toBe(true);
    expect(isRawProtein('chickpeas')).toBe(false);
    expect(isRawProtein('chicken stock')).toBe(false);
  });
});

test('needsChopping knows "cut into pieces" and "in chunks"', () => {
  expect(needsChopping({ name: 'carrot', note: 'cut into 3–4 cm pieces' })).toBe(true);
  expect(needsChopping({ name: 'salmon', note: '3 cm pieces' })).toBe(true);
  expect(needsChopping({ name: 'brisket', note: 'in 5cm chunks' })).toBe(true);
});
