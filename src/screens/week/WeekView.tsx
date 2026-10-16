import { useEffect, useState } from 'react';
import ErrorBanner from '../../components/ErrorBanner';
import DayCard from './DayCard';
import { addDays, useWeek } from './useWeek';

function useWide(query = '(min-width: 760px)') {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return wide;
}

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekView() {
  const w = useWeek();
  const wide = useWide();
  const [day, setDay] = useState(0);
  const dates = Array.from({ length: w.week?.days ?? 7 }, (_, i) => addDays(w.weekStart, i));
  const { weekday, hour } = w.starts.london;
  const isDraft = w.week?.status === 'draft';

  return (
    <section className="grid gap-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">{w.shown === 'next' ? 'Next week' : 'This week'}</h1>
        <div role="tablist" aria-label="Week" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(['this', 'next'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={w.shown === k} onClick={() => { w.setWhich(k); setDay(0); }}
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
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ${isDraft ? 'bg-yolk-soft' : 'bg-accent-soft'}`}>
          <p className="m-0 font-semibold">
            {!isDraft ? '✓ Approved'
              : weekday === 6 && hour < 14 ? "Approve by 2pm today for Sunday's delivery"
                : "Next week's menu is ready"}
          </p>
          {isDraft && <button type="button" onClick={() => void w.approve()} className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink">Approve week</button>}
        </div>
      )}

      {w.week && !wide && (
        <>
          <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1">
            {dates.map((d, i) => (
              <button key={d} type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)}
                className={`flex flex-col items-center rounded-xl py-1.5 text-xs ${day === i ? 'bg-ink text-bg' : 'text-muted'}`}>
                {SHORT[i]} <b className="font-display text-lg">{Number(d.slice(8))}</b>
              </button>
            ))}
          </div>
          <DayCard key={dates[day]} date={dates[Math.min(day, dates.length - 1)]} w={w} />
        </>
      )}

      {w.week && wide && (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
          {dates.map((d) => <DayCard key={d} date={d} w={w} />)}
        </div>
      )}
    </section>
  );
}
