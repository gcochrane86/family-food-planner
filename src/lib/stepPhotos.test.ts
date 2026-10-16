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
