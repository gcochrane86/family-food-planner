import { useCallback, useMemo, useRef, useState } from 'react';
import ErrorBanner from '../../components/ErrorBanner';
import { daySummary, proteinBalance } from '../../lib/weekSummary';
import DaySheet from './DaySheet';
import DayTile from './DayTile';
import WeekTile from './WeekTile';
import { addDays, useWeek } from './useWeek';

export default function WeekView() {
  const w = useWeek();
  const [open, setOpen] = useState<string | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement | null>());
  const dates = Array.from({ length: w.week?.days ?? 7 }, (_, i) => addDays(w.weekStart, i));
  const { weekday, hour, date: today } = w.starts.london;
  const balance = useMemo(() => proteinBalance(w.slots, w.recipes), [w.slots, w.recipes]);

  const close = useCallback(() => {
    setOpen((d) => {
      if (d) requestAnimationFrame(() => tiles.current.get(d)?.focus());
      return null;
    });
  }, []);

  return (
    <section className="grid gap-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">{w.shown === 'next' ? 'Next week' : 'This week'}</h1>
        <div role="tablist" aria-label="Week" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(['this', 'next'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={w.shown === k} onClick={() => { w.setWhich(k); setOpen(null); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${w.shown === k ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
              {k === 'this' ? 'This week' : 'Next week'}
            </button>
          ))}
        </div>
      </div>

      {w.error && <ErrorBanner message={w.error} onRetry={w.reload} />}
      {w.saveError && <ErrorBanner message={w.saveError} />}
      {w.loading && !w.error && <p className="text-muted">Loading…</p>}

      {!w.loading && !w.error && !w.week && (
        <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-line p-6">
          <p className="m-0 font-semibold">{w.shown === 'next' ? 'Your first menu arrives Friday at 7pm' : 'No menu for this week'}</p>
          <p className="m-0 text-sm text-muted">It will suggest a balanced week: chicken, fish, red meat and veggie, fitted around office days.</p>
          <button type="button" onClick={() => void w.propose()} className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink">Propose now</button>
        </div>
      )}

      {w.week && (
        <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
          {dates.map((d) => (
            <DayTile key={d} date={d} today={d === today} summary={daySummary(d, w.slots, w.recipes, w.officeDays)}
              ref={(el) => { tiles.current.set(d, el); }} onOpen={() => setOpen(d)} />
          ))}
          <WeekTile approved={w.week.status !== 'draft'} saturdayMorning={weekday === 6 && hour < 14} balance={balance}
            onApprove={() => void w.approve()} cookidoo={w.cookidoo} onRetry={() => void w.retryCookidoo()} />
        </div>
      )}

      {w.week && open && <DaySheet date={open} w={w} onClose={close} />}
    </section>
  );
}
