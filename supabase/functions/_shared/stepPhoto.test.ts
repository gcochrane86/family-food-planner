import { stepPhotoPrompt, stepPhotoRefusal, stepPhotoWriteGuard } from './stepPhoto';

const step = (body: string, machine: string | null = 'tm7', phase = 'finish', title = 'Step') => ({ title, body, machine, phase });
const curry = [
  step('Chop the **onions** and sauté.'),
  step('Add the **chickpeas** and **coconut milk**.'),
  step('Stir in the **spinach** and **chickpeas**.'),
];

test('the prompt names only ingredients added so far', () => {
  const p = stepPhotoPrompt('Chickpea Curry', curry, 1);
  expect(p).toContain('Only these ingredients are in it so far: onions, chickpeas, coconut milk.');
  expect(p).not.toContain('spinach');
  expect(stepPhotoPrompt('Chickpea Curry', curry, 2)).toContain('onions, chickpeas, coconut milk, spinach.');
});

test('the prompt is a close-up of food with no machine', () => {
  const p = stepPhotoPrompt('Curry', curry, 0);
  expect(p).toContain('directly above');
  expect(p).toContain('No appliance');
  expect(p).toContain('No text');
  expect(p).not.toContain('**');
  expect(p).toContain('stainless steel mixing bowl');
  expect(stepPhotoPrompt('X', [step('Fry the **beef**.', 'hob')], 0)).toContain('pan');
  for (const m of ['apo', 'hy24', 'oven']) expect(stepPhotoPrompt('X', [step('Roast the **squash**.', m)], 0)).toContain('baking tray');
  expect(stepPhotoPrompt('X', [step('Slice the **lemon**.', null)], 0)).toContain('chopping board');
});

test('the prompt asks for the reference photo\'s table and light', () => {
  expect(stepPhotoPrompt('Curry', curry, 0)).toContain('same table, light and colours as the reference photo');
});

test('a prep step is shown as made-ahead', () => {
  const p = stepPhotoPrompt('Salmon', [step('Mix the **yoghurt** and **dill**.', 'tm7', 'prep_8pm')], 0);
  expect(p).toContain('the night before');
  expect(p).toContain('jar or container');
});

test('stepPhotoRefusal says why a photo cannot be made', () => {
  const liked = { rating: 'up', hero_image_path: 'h.jpg' };
  const empty = { image_path: null, image_source: null };
  expect(stepPhotoRefusal({ ...liked, rating: null }, empty, false)).toBe('Only liked recipes get step photos.');
  expect(stepPhotoRefusal({ ...liked, rating: 'down' }, empty, false)).toBe('Only liked recipes get step photos.');
  expect(stepPhotoRefusal({ ...liked, hero_image_path: null }, empty, false)).toBe('Make the main photo first.');
  expect(stepPhotoRefusal(liked, { image_path: 'a.jpg', image_source: 'own' }, true)).toBe('This step has your own photo.');
  expect(stepPhotoRefusal(liked, { image_path: 'a.jpg', image_source: 'generated' }, false)).toBe('This step already has a photo.');
  expect(stepPhotoRefusal(liked, { image_path: 'a.jpg', image_source: 'generated' }, true)).toBeNull();
  expect(stepPhotoRefusal(liked, empty, false)).toBeNull();
});

test('the photo is only saved if the step is still free (or still generated, for a redo)', () => {
  expect(stepPhotoWriteGuard(false)).toEqual({ column: 'image_path', equals: null });
  expect(stepPhotoWriteGuard(true)).toEqual({ column: 'image_source', equals: 'generated' });
});

test('a photo you ask for from the menu does not need a 👍, but your own photos and the main photo rules still hold', () => {
  const unrated = { rating: null, hero_image_path: 'h.jpg' };
  const empty = { image_path: null, image_source: null };
  expect(stepPhotoRefusal(unrated, empty, false, true)).toBeNull();
  expect(stepPhotoRefusal({ rating: 'down', hero_image_path: 'h.jpg' }, empty, false, true)).toBeNull();
  expect(stepPhotoRefusal({ ...unrated, hero_image_path: null }, empty, false, true)).toBe('Make the main photo first.');
  expect(stepPhotoRefusal(unrated, { image_path: 'a.jpg', image_source: 'own' }, true, true)).toBe('This step has your own photo.');
});
