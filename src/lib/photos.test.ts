import { smallPath } from './photos';

test("a photo's small copy sits beside it, named -sm.jpg, and a small copy is its own small copy", () => {
  expect(smallPath('h1/hero/abc-123.jpg')).toBe('h1/hero/abc-123-sm.jpg');
  expect(smallPath('h1/steps/s1-99.png')).toBe('h1/steps/s1-99-sm.jpg');
  expect(smallPath('h1/hero/abc-123-sm.jpg')).toBe('h1/hero/abc-123-sm.jpg');
});
