import { findImageData, GEMINI_MODEL, geminiRequest, heroPrompt } from './hero';

const honey = {
  title: 'Almond-Crusted Honey Chilli Chicken',
  subtitle: 'with peppers & basmati rice',
  ingredients: [
    { name: 'chicken breast or thigh' }, { name: 'whole almonds' }, { name: 'egg white' }, { name: 'paprika' },
    { name: 'sea salt' }, { name: 'bell peppers' }, { name: 'red onions' }, { name: 'honey' }, { name: 'soy sauce' },
    { name: 'olive oil' }, { name: 'basmati rice' },
  ],
};

test('the prompt names the dish and up to 5 main ingredients, skipping seasonings', () => {
  const p = heroPrompt(honey);
  expect(p).toContain('Almond-Crusted Honey Chilli Chicken, with peppers & basmati rice');
  expect(p).toMatch(/Main ingredients: chicken breast or thigh, whole almonds, egg white, bell peppers, red onions\./);
  expect(p).not.toMatch(/sea salt|olive oil|paprika/);
});

test('the prompt keeps the house style and rules out text and hands', () => {
  const p = heroPrompt({ title: 'Fish Pie', subtitle: null, ingredients: [] });
  expect(p).toMatch(/matte stoneware/);
  expect(p).toMatch(/pale oak table/);
  expect(p).toMatch(/No text, no labels, no hands/);
  expect(p).not.toMatch(/Main ingredients/);
});

test('the request asks the cheapest image model for a 4:3 JPEG at 1K', () => {
  expect(GEMINI_MODEL).toBe('gemini-3.1-flash-lite-image');
  expect(geminiRequest('a photo')).toEqual({
    model: 'gemini-3.1-flash-lite-image',
    input: 'a photo',
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '4:3', image_size: '1K' },
  });
});

test('the image is found wherever it sits in the response', () => {
  const response = { id: 'x', steps: [{ type: 'thinking' }, { type: 'model_output', content: [{ type: 'text', text: 'Here' }, { type: 'image', data: 'QUJD', mime_type: 'image/jpeg' }] }] };
  expect(findImageData(response)).toEqual({ data: 'QUJD', mimeType: 'image/jpeg' });
});

test('the older inline_data shape is understood too', () => {
  const response = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'WFla' } }] } }] };
  expect(findImageData(response)).toEqual({ data: 'WFla', mimeType: 'image/png' });
});

test('no image means null', () => {
  expect(findImageData({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Sorry' }] }] })).toBeNull();
});
