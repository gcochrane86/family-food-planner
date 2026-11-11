import { keepPhotos } from './photoCache';

function fakeCaches(have: string[]) {
  const stored = new Map(have.map((u) => [u, new Response('x')]));
  const cache = {
    match: vi.fn(async (u: string) => stored.get(u)),
    put: vi.fn(async (u: string, r: Response) => { stored.set(u, r); }),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  return { cache, stored };
}
afterEach(() => { vi.unstubAllGlobals(); });

test('downloads only the photos not already on the device, into the photo store', async () => {
  const { cache, stored } = fakeCaches(['https://img/a.jpg']);
  const fetched: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string) => { fetched.push(u); return new Response('img'); }));
  expect(await keepPhotos(['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg', 'https://img/b.jpg'])).toBe(2);
  expect(fetched.sort()).toEqual(['https://img/b.jpg', 'https://img/c.jpg']);
  expect(cache.put).toHaveBeenCalledTimes(2);
  expect([...stored.keys()].sort()).toEqual(['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg']);
});

test('a photo that fails to download is skipped, and the rest still come', async () => {
  fakeCaches([]);
  vi.stubGlobal('fetch', vi.fn(async (u: string) => { if (u.endsWith('bad.jpg')) throw new Error('offline'); return new Response('img', { status: u.endsWith('gone.jpg') ? 404 : 200 }); }));
  expect(await keepPhotos(['https://img/bad.jpg', 'https://img/gone.jpg', 'https://img/ok.jpg'])).toBe(1);
});

test('without a photo store (an old browser) it does nothing', async () => {
  vi.stubGlobal('caches', undefined);
  expect(await keepPhotos(['https://img/a.jpg'])).toBe(0);
});
