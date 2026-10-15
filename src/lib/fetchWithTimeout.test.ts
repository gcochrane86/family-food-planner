import { fetchWithTimeout } from './fetchWithTimeout';

/** A fetch that never answers, but stops when its signal aborts (as the real one does). */
const hangingFetch = (_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation timed out.', 'TimeoutError')));
  });

test('a request that never answers fails after the timeout', async () => {
  vi.useFakeTimers();
  const request = fetchWithTimeout(hangingFetch, 10_000)('https://example.test');
  const settled = expect(request).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(10_000);
  await settled;
  vi.useRealTimers();
});

test('a quick answer passes straight through', async () => {
  const ok = new Response('ok');
  await expect(fetchWithTimeout(async () => ok, 10_000)('https://example.test')).resolves.toBe(ok);
});
