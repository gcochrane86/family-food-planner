import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { BasketRun, CookidooRun } from '../../lib/types';
import type { WeekState } from './useWeek';

const SHOP: Record<BasketRun['status'], string> = {
  requested: "Sainsbury's: waiting for Claude", filling: "Sainsbury's: filling…", done: "✓ In Sainsbury's", failed: "Sainsbury's didn't finish",
};
const COOKIDOO: Record<CookidooRun['status'], string> = {
  requested: 'Cookidoo: waiting for Claude', filling: 'Cookidoo: sending…', done: '✓ In Cookidoo', failed: "Cookidoo didn't sync",
};
const busy = (s: string | undefined) => s === 'requested' || s === 'filling';
const row = 'grid justify-items-start gap-1.5 rounded-2xl bg-surface p-3.5';
const action = 'rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold disabled:opacity-50';

/** Tapping "✓ Approved": where the week's Sainsbury's fills and Cookidoo sync have got to, a button to send each
 *  again, and Back to draft (to change or replan the week; approving again re-syncs Cookidoo). */
export default function ApprovedSheet({ w, onClose }: { w: WeekState; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const title = `${w.shown === 'next' ? 'Next week' : 'This week'}: approved`;
  const deliveries: { d: BasketRun['delivery']; name: string }[] = w.shopsPerWeek === 1
    ? [{ d: 'sun', name: 'Your shop' }] : [{ d: 'sun', name: 'Sunday delivery' }, { d: 'tue', name: 'Tuesday delivery' }];

  return createPortal(
    <div className="fixed inset-0 z-30 grid items-end justify-items-center bg-black/45 md:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="grid max-h-[88%] w-full max-w-[520px] gap-3 overflow-auto rounded-t-3xl bg-bg pt-2.5 gutter pb-[calc(20px+env(safe-area-inset-bottom,0px))] md:rounded-3xl">
        <span className="h-1.5 w-10 justify-self-center rounded-full bg-line" aria-hidden />
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-lg">×</button>
        </div>

        {deliveries.map(({ d, name }) => {
          const run = w.baskets.find((r) => r.delivery === d);
          return (
            <div key={d} role="group" aria-label={name} className={row}>
              <b>{name}</b>
              <span className={run?.status === 'failed' ? 'text-warn' : 'text-muted'}>
                {run ? SHOP[run.status] : "○ Not sent to Sainsbury's yet"}{run?.summary ? `: ${run.summary}` : ''}
              </span>
              {run ? (
                <button type="button" disabled={busy(run.status)} onClick={() => void w.resendBasket(d)} className={action}>Send to Sainsbury's again</button>
              ) : (
                // The first fill starts on the Shop tab, where the freezer check is.
                <Link to="/shop" className="text-sm font-semibold text-accent underline">Open the Shop tab</Link>
              )}
            </div>
          );
        })}

        <div role="group" aria-label="Cookidoo" className={row}>
          <b>Cookidoo</b>
          <span className={w.cookidoo?.status === 'failed' ? 'text-warn' : 'text-muted'}>
            {w.cookidoo ? COOKIDOO[w.cookidoo.status] : '○ Cookidoo: not synced yet'}{w.cookidoo?.status === 'failed' && w.cookidoo.summary ? `: ${w.cookidoo.summary}` : ''}
          </span>
          <button type="button" disabled={busy(w.cookidoo?.status)} onClick={() => void w.retryCookidoo()} className={action}>Sync Cookidoo again</button>
        </div>

        <div className="grid justify-items-start gap-2 rounded-2xl border border-line p-3.5">
          {confirm ? (
            <>
              <p className="m-0 text-sm">
                The week goes back to draft so you can change it or replan it with Claude. Anything already added stays in
                your Sainsbury's trolley and Cookidoo until you approve again (then use Empty and refill on the Shop tab if the
                shopping changed).
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={async () => { if (await w.unapprove()) onClose(); }} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">Yes, back to draft</button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-lg px-3 py-1.5 font-semibold text-muted">Cancel</button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="font-semibold text-accent underline">Back to draft</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
