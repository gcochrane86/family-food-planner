/**
 * Time left as "mm:ss". Worked out from a fixed end time rather than by counting ticks, so it is
 * still right after the iPad has been locked or the tab was in the background.
 */
export function remaining(endAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((endAt - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
