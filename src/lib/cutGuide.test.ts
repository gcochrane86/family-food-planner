import { cutGuide, readPxPerMm, savePxPerMm } from './cutGuide';

test('carrot in 3cm chunks: the instruction, what chunks means, a 3cm marker and a life-size square', () => {
  const g = cutGuide('carrot', '1½', 'large, peeled, cut into 3cm chunks')!;
  expect(g.instruction).toBe('Peel and cut the carrot into 3cm chunks');
  expect(g.meaning).toMatch(/rough cubes/i);
  expect(g.sizes).toEqual([{ mm: 30, label: '3cm chunks' }]);
  expect(g.square).toBe(30);
  expect(g.prep.key).toBe('carrot|chunks (3cm)');
});

test('ginger: the 3 cm piece and the 2mm discs are both marked', () => {
  const g = cutGuide('ginger', '3 cm', 'peeled, sliced into 2mm discs')!;
  expect(g.sizes).toEqual([{ mm: 30, label: '3cm piece' }, { mm: 2, label: '2mm discs' }]);
  expect(g.meaning).toMatch(/thin rounds/i);
  expect(g.square).toBeNull();
});

test('spring onion in 2mm rings', () => {
  const g = cutGuide('spring onion', '3', 'trimmed, thinly sliced into 2mm rings')!;
  expect(g.sizes).toEqual([{ mm: 2, label: '2mm rings' }]);
  expect(g.meaning).not.toBeNull();
});

test('no size: words only; nothing to say: no guide', () => {
  const g = cutGuide('red onion', '1½', 'peeled, halved')!;
  expect(g.sizes).toEqual([]);
  expect(g.meaning).toMatch(/two halves/);
  expect(cutGuide('soy sauce', '2 tbsp', null)).toBeNull();
});

test('the ruler setting is kept on the device, and missing storage means not set', () => {
  savePxPerMm(6.04);
  expect(readPxPerMm()).toBeCloseTo(6.04);
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readPxPerMm()).toBeNull();
  spy.mockRestore();
});
