/**
 * Wraps fetch so a request that never answers (weak signal, captive Wi-Fi) fails after `ms`
 * instead of leaving the app on "Loading…". A caller's own signal still takes priority.
 */
export function fetchWithTimeout(fetchImpl: typeof fetch, ms: number): typeof fetch {
  return (input, init) => fetchImpl(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(ms) });
}
