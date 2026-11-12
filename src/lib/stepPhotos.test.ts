import { makeStepPhotos } from './stepPhotos';

const h = vi.hoisted(() => ({ generateStepPhoto: vi.fn() }));
vi.mock('./repo', () => ({ repo: { generateStepPhoto: h.generateStepPhoto } }));

beforeEach(() => {
  h.generateStepPhoto.mockReset();
  h.generateStepPhoto.mockImplementation(async (r: string, s: string) => `${r}/${s}.jpg`);
});

const steps = (...paths: (string | null)[]) => paths.map((p, i) => ({ id: `s${i + 1}`, image_path: p }));

test('makes photos for steps without one, in order', async () => {
  const progress: string[] = [];
  const result = await makeStepPhotos('r1', steps(null, 'own.jpg', null), (done, total) => progress.push(`${done} of ${total}`));
  expect(h.generateStepPhoto.mock.calls.map((c) => c[1])).toEqual(['s1', 's3']);
  expect(progress).toEqual(['0 of 2', '1 of 2', '2 of 2']);
  expect(result).toEqual({ made: 2, error: null });
});

test('stops at the first failure', async () => {
  h.generateStepPhoto.mockRejectedValueOnce(new Error("Google couldn't make the image: quota"));
  const result = await makeStepPhotos('r1', steps(null, null), () => {});
  expect(h.generateStepPhoto).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ made: 0, error: "Google couldn't make the image: quota" });
});

test('resumes with only the steps that have no photo', async () => {
  await makeStepPhotos('r1', steps('a.jpg', 'b.jpg', null), () => {});
  expect(h.generateStepPhoto.mock.calls.map((c) => c[1])).toEqual(['s3']);
});

test('a second call while running shares the first run', async () => {
  const first = makeStepPhotos('r1', steps(null, null), () => {});
  const second = makeStepPhotos('r1', steps(null, null), () => {});
  await Promise.all([first, second]);
  expect(h.generateStepPhoto).toHaveBeenCalledTimes(2);
});

test('each new photo is reported with its step and path', async () => {
  const seen: [string?, string?][] = [];
  await makeStepPhotos('r1', steps(null), (_d, _t, stepId, path) => seen.push([stepId, path]));
  expect(seen).toEqual([[undefined, undefined], ['s1', 'r1/s1.jpg']]);
});

test('photos asked for from the menu are sent as asked', async () => {
  await makeStepPhotos('r9', steps(null), () => {}, { asked: true });
  expect(h.generateStepPhoto).toHaveBeenCalledWith('r9', 's1', false, true);
});

test('your own description for a step is sent with it', async () => {
  await makeStepPhotos('r9', steps(null, null), () => {}, { asked: true, hints: { s2: 'Rice steaming in the basket' } });
  expect(h.generateStepPhoto).toHaveBeenCalledWith('r9', 's1', false, true);
  expect(h.generateStepPhoto).toHaveBeenCalledWith('r9', 's2', false, true, { hint: 'Rice steaming in the basket' });
});

test('with redraw, older realistic generated photos are made again as cartoons; cartoons and your own photos are kept', async () => {
  const list = [
    { id: 's1', image_path: 'h1/steps/r1-s1-1.jpg', image_source: 'generated' },
    { id: 's2', image_path: 'h1/steps/cartoon-r1-s2-1.jpg', image_source: 'generated' },
    { id: 's3', image_path: 'h1/steps/own.jpg', image_source: 'own' },
    { id: 's4', image_path: null, image_source: null },
  ];
  const result = await makeStepPhotos('r9', list, () => {}, { asked: true, redraw: true });
  expect(result.made).toBe(2);
  expect(h.generateStepPhoto.mock.calls).toEqual([['r9', 's1', true, true], ['r9', 's4', false, true]]);
});
