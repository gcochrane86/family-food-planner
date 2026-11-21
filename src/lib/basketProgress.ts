import type { BasketRun } from './types';

/** How long a tap waits for the Mac before the app warns: the watcher checks every 10 seconds. */
const PICKUP_MS = 2 * 60 * 1000;
/** How long a fill can go without reporting progress before the app warns. */
const STALL_MS = 5 * 60 * 1000;

export interface RunView { label: string; warning: string | null; pct: number | null; item: string | null }

/** What the Shop tab's progress bar shows for a fill that's waiting or under way. */
export function runView(run: BasketRun, now: number): RunView {
  if (run.status === 'requested') {
    const late = now - Date.parse(run.requested_at) > PICKUP_MS;
    return {
      label: 'Waiting for your Mac to start Claude…', pct: null, item: null,
      warning: late ? "Your Mac hasn't picked this up. Check it's on and awake, with Chrome open." : null,
    };
  }
  const p = run.progress ?? null;
  const last = p?.at ?? run.started_at ?? null;
  const warning = last && now - Date.parse(last) > STALL_MS
    ? 'No progress for 5 minutes. Your Mac may have gone to sleep, or Chrome was closed.' : null;
  if (p?.stage === 'emptying') return { label: 'Emptying your trolley…', warning, pct: 0, item: null };
  if (p?.stage === 'adding' && p.total) {
    const done = p.done ?? 0;
    return { label: `Adding ${done} of ${p.total}`, warning, pct: Math.round((done / p.total) * 100), item: p.item };
  }
  if (p?.stage === 'adding') return { label: 'Adding to your trolley…', warning, pct: null, item: p.item };
  return { label: 'Claude is opening Sainsbury’s…', warning, pct: 0, item: null };
}

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Which of the week's deliveries a Sainsbury's order covers, by its delivery date: up to the Monday it's the first
 *  shop (Sainsbury's may move a Sunday slot to Monday), from the Tuesday the second. A cancelled order covers none. */
export function orderCovers(order: { status: string; delivery_date: string | null }, weekStart: string): 'sun' | 'tue' | null {
  if (order.status === 'cancelled' || !order.delivery_date) return null;
  const d = order.delivery_date;
  if (d >= addDays(weekStart, -3) && d <= weekStart) return 'sun';
  if (d > weekStart && d <= addDays(weekStart, 6)) return 'tue';
  return null;
}
