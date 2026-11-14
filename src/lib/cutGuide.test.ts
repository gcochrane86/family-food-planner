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

test('a note that is not a cut (drained, to serve) gives no guide', () => {
  expect(cutGuide('chickpeas', '400g', 'drained and rinsed')).toBeNull();
  expect(cutGuide('coriander', '1 bunch', 'to serve')).toBeNull();
});

test('what the cut means follows the same cut as the instruction', () => {
  expect(cutGuide('lemon', '1', 'finely grated zest')!.meaning).toMatch(/grater/);
  expect(cutGuide('ginger', '1', 'thumb-sized piece, grated')!.meaning).toMatch(/grater/);
  expect(cutGuide('carrot', '2', 'sliced into discs')!.meaning).toMatch(/thin rounds/i);
});

test('amounts with a half or "about" still get their marker; cms counts', () => {
  expect(cutGuide('ginger', '2½ cm', null)!.sizes).toEqual([{ mm: 25, label: '2½cm piece' }]);
  expect(cutGuide('ginger', 'about 3 cm', null)!.sizes).toEqual([{ mm: 30, label: '3cm piece' }]);
  expect(cutGuide('leek', '1', 'sliced 2cms thick')!.sizes).toEqual([{ mm: 20, label: '2cm thick' }]);
});
