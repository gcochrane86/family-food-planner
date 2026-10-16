import type { CookidooRun } from '../../lib/types';

/** The eighth tile on the week grid: where the week stands, its balance, and Approve. */
const COOKIDOO: Record<CookidooRun['status'], string> = {
  requested: 'Cookidoo: waiting for Claude', filling: 'Cookidoo: sending…', done: '✓ In Cookidoo', failed: "Cookidoo didn't sync",
};

export default function WeekTile({ approved, saturdayMorning, onApprove, cookidoo = null, onRetry }:
  { approved: boolean; saturdayMorning: boolean; onApprove: () => void; cookidoo?: CookidooRun | null; onRetry?: () => void }) {
  return (
    <div className={`grid content-between gap-2 rounded-[22px] p-3.5 md:min-h-[230px] md:gap-3 md:rounded-[26px] md:p-5 ${approved ? 'bg-accent-soft' : 'bg-accent text-accent-ink'}`}>
      <div className="grid gap-1">
        <h2 className="text-[17px] font-bold md:text-2xl">
          {approved ? '✓ Approved' : saturdayMorning ? "Approve by 2pm today for Sunday's delivery" : "Next week's menu is ready"}
        </h2>
        {!approved && !saturdayMorning && <p className="m-0 text-[13px] opacity-90 md:text-base">Approve by Saturday 2pm for the Sunday delivery.</p>}
        {approved && cookidoo && (
          <p className={`m-0 text-[13px] md:text-base ${cookidoo.status === 'failed' ? 'text-warn' : 'text-muted'}`}>
            {COOKIDOO[cookidoo.status]}{cookidoo.status === 'failed' && cookidoo.summary ? `: ${cookidoo.summary}` : ''}
            {cookidoo.status === 'failed' && onRetry && (
              <> <button type="button" onClick={onRetry} className="font-semibold text-accent underline">Try again</button></>
            )}
          </p>
        )}
      </div>
      {!approved && (
        <button type="button" onClick={onApprove} className="rounded-xl bg-accent-ink px-3 py-2.5 font-bold text-accent md:py-3.5 md:text-lg">Approve week</button>
      )}
    </div>
  );
}
