import { prepKey, prepPhotoPrompt } from './prepCut';

test('the same cut in different words is one photo; a different cut or colour is another', () => {
  const k = (name: string, note: string | null) => prepKey(name, note).key;
  expect(k('new potatoes', 'halved')).toBe(k('New potato', 'cut in half'));
  expect(k('potatoes', 'in pieces')).toBe(k('potato', 'roughly chopped'));
  expect(k('potatoes', 'in pieces')).toBe(k('Potatoes', 'cut into chunks'));
  expect(k('red pepper', 'sliced into strips')).not.toBe(k('red pepper', 'diced'));
  expect(k('red pepper', 'diced')).not.toBe(k('green pepper', 'diced'));
  expect(k('new potatoes', 'halved')).not.toBe(k('baking potatoes', 'halved'));
});

test('cuts read from the recipe note, with sizes kept', () => {
  const cut = (note: string | null, name = 'carrot') => prepKey(name, note).cut;
  expect(cut('10mm batons', 'chicken breast')).toBe('strips (10mm)');
  expect(cut('finely chopped')).toBe('finely diced');
  expect(cut('diced 1cm')).toBe('diced (1cm)');
  expect(cut('thinly sliced')).toBe('thinly sliced');
  expect(cut('sliced into rings', 'red onion')).toBe('rings');
  expect(cut('crushed', 'garlic')).toBe('crushed');
  expect(cut('grated')).toBe('grated');
  expect(cut('in florets', 'broccoli')).toBe('florets');
  expect(cut('quartered', 'onion')).toBe('quartered');
  expect(cut('peeled and cut into wedges', 'potato')).toBe('wedges');
  expect(cut('cut on the diagonal into 3cm lengths')).toBe('cut on the diagonal into 3cm lengths');
  expect(cut(null)).toBe('chopped');
});

test('the label reads naturally, and the prompt names the exact cut', () => {
  const p = prepKey('Red peppers', 'sliced into 1cm strips');
  expect(p.label).toBe('red pepper, strips (1cm)');
  const prompt = prepPhotoPrompt(p);
  expect(prompt).toContain('red pepper');
  expect(prompt).toContain('strips (1cm)');
  expect(prompt).toMatch(/chopping board/i);
  expect(prompt).toMatch(/no hands/i);
});

test('your words and your own board go into the chopping photo request', () => {
  const p = prepKey('potatoes', 'halved');
  expect(prepPhotoPrompt(p, 'bigger pieces, skins on')).toContain('Also: bigger pieces, skins on.');
  expect(prepPhotoPrompt(p, '  ')).not.toContain('Also:');
  const own = prepPhotoPrompt(p, null, true);
  expect(own).toMatch(/reference photo shows the household's own chopping board/i);
  expect(own).not.toContain('wooden chopping board');
});
