import type { BasketRun, CookidooRun } from '../../lib/types';

/** The eighth tile on the week grid: where the week stands, its balance, and Approve. */
const COOKIDOO: Record<CookidooRun['status'], string> = {
  requested: 'Cookidoo: waiting for Claude', filling: 'Cookidoo: sending…', done: '✓ In Cookidoo', failed: "Cookidoo didn't sync",
};

const DAY: Record<BasketRun['delivery'], string> = { sun: 'Sunday', tue: 'Tuesday' };

/** Where the week's Sainsbury's fills have got to, across its deliveries. */
export function sainsburysTick(runs: BasketRun[], shopsPerWeek: 1 | 2): { text: string; done: boolean; failed: boolean } {
  const deliveries: BasketRun['delivery'][] = shopsPerWeek === 1 ? ['sun'] : ['sun', 'tue'];
  const status = deliveries.map((d) => runs.find((r) => r.delivery === d)?.status ?? null);
  if (status.includes('failed')) return { text: "Sainsbury's didn't finish", done: false, failed: true };
  if (status.includes('filling')) return { text: "Sainsbury's: filling…", done: false, failed: false };
  if (status.includes('requested')) return { text: "Sainsbury's: waiting for Claude", done: false, failed: false };
  if (status.every((s) => s === 'done')) return { text: "✓ In Sainsbury's", done: true, failed: false };
  if (status.some((s) => s === 'done')) {
    const filled = deliveries.filter((_, i) => status[i] === 'done').map((d) => DAY[d]).join(' and ');
    const not = deliveries.filter((_, i) => status[i] !== 'done').map((d) => DAY[d]).join(' and ');
    return { text: `✓ ${filled} in Sainsbury's · ${not} not yet`, done: false, failed: false };
  }
  return { text: "○ Sainsbury's: not filled yet", done: false, failed: false };
}

export default function WeekTile({ approved, saturdayMorning, onApprove, cookidoo = null, onRetry, baskets = [], shopsPerWeek = 2, onOpen }:
  { approved: boolean; saturdayMorning: boolean; onApprove: () => void; cookidoo?: CookidooRun | null; onRetry?: () => void; baskets?: BasketRun[]; shopsPerWeek?: 1 | 2; onOpen?: () => void }) {
  const shop = sainsburysTick(baskets, shopsPerWeek);
  return (
    <div className={`grid content-between gap-2 rounded-[22px] p-3.5 md:min-h-[230px] md:gap-3 md:rounded-[26px] md:p-5 ${approved ? 'bg-accent-soft' : 'bg-accent text-accent-ink'}`}>
      <div className="grid gap-1">
        <h2 className="text-[17px] font-bold md:text-2xl">
          {approved ? (onOpen ? <button type="button" onClick={onOpen} className="text-left underline decoration-1 underline-offset-4">✓ Approved</button> : '✓ Approved')
            : saturdayMorning ? "Approve by 2pm today for Sunday's delivery" : "Next week's menu is ready"}
        </h2>
        {!approved && !saturdayMorning && <p className="m-0 text-[13px] opacity-90 md:text-base">Approve by Saturday 2pm for the Sunday delivery.</p>}
        {approved && (
          <ul aria-label="Where this week has got to" className="m-0 grid list-none gap-0.5 p-0 text-[13px] md:text-base">
            <li className={shop.failed ? 'text-warn' : shop.done ? 'font-semibold text-accent' : 'text-muted'}>{shop.text}</li>
            <li className={cookidoo?.status === 'failed' ? 'text-warn' : cookidoo?.status === 'done' ? 'font-semibold text-accent' : 'text-muted'}>
              {cookidoo ? COOKIDOO[cookidoo.status] : '○ Cookidoo: not synced yet'}{cookidoo?.status === 'failed' && cookidoo.summary ? `: ${cookidoo.summary}` : ''}
              {cookidoo?.status === 'failed' && onRetry && (
                <> <button type="button" onClick={onRetry} className="font-semibold text-accent underline">Try again</button></>
              )}
            </li>
          </ul>
        )}
      </div>
      {!approved && (
        <button type="button" onClick={onApprove} className="rounded-xl bg-accent-ink px-3 py-2.5 font-bold text-accent md:py-3.5 md:text-lg">Approve week</button>
      )}
    </div>
  );
}
