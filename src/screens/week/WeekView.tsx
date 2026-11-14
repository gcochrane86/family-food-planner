import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';
import { daySummary } from '../../lib/weekSummary';
import DaySheet from './DaySheet';
import FeedbackCard from './FeedbackCard';
import ApprovedSheet from './ApprovedSheet';
import ClaudeWeekNotes, { Failed, PlanForm, Planning, usePlanRequest } from './PlanWithClaude';
import DayTile from './DayTile';
import WeekTile from './WeekTile';
import { addDays, useWeek } from './useWeek';

export default function WeekView() {
  const w = useWeek();
  const plan = usePlanRequest(w);
  const [open, setOpen] = useState<string | null>(null);
  const [approvedOpen, setApprovedOpen] = useState(false);
  // ?day=YYYY-MM-DD (from a preview of that day's hour) opens that day's sheet, in whichever week it's in.
  const [params, setParams] = useSearchParams();
  const askedDay = params.get('day');
  useEffect(() => {
    if (!askedDay || w.loading) return;
    const inNext = askedDay >= w.starts.nextWeek;
    if (w.shown !== (inNext ? 'next' : 'this')) { w.setWhich(inNext ? 'next' : 'this'); return; }
    setOpen(askedDay);
    setParams({}, { replace: true });
  }, [askedDay, w.loading, w.shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = useRef(new Map<string, HTMLButtonElement | null>());
  // The planned days, plus any later day with a dinner of its own (a roast added to Sunday of a 5-day week).
  const dates = [...new Set([...Array.from({ length: w.week?.days ?? 7 }, (_, i) => addDays(w.weekStart, i)),
    ...w.slots.map((s) => s.date).filter((d) => d >= w.weekStart && d <= addDays(w.weekStart, 6))])].sort();
  const { weekday, hour, date: today } = w.starts.london;

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

      {!w.loading && !w.error && <FeedbackCard w={w} />}
      {w.error && <ErrorBanner message={w.error} onRetry={w.reload} />}
      {w.saveError && <ErrorBanner message={w.saveError} />}
      {w.loading && !w.error && <p className="text-muted">Loading…</p>}

      {!w.loading && !w.error && !w.week && (
        <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-line p-6">
          {plan.open ? <Planning w={w} /> : (<>
          <p className="m-0 font-semibold">{w.shown === 'next' ? 'The app proposes next week on Friday evening' : 'No menu for this week'}</p>
          <p className="m-0 text-sm text-muted">
            Or plan it with Claude any time: it opens the Claude app, plans from your specifications, recipes, freezer and pantry, and saves a draft here to approve.
            Quick menu uses the built-in planner straight away.
          </p>
          {plan.failed && <Failed w={w} summary={plan.req!.summary} note={plan.req!.note} />}
          <PlanForm label="Plan with Claude" onPlan={(note) => void w.planWithClaude(note)} />
          </>)}
          <button type="button" onClick={() => void w.propose()} className="font-semibold text-accent underline">Quick menu</button>
        </div>
      )}

      {w.week && dates.includes(today) && (
        <Link to="/today" className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 no-underline">
          <span>
            <span className="block font-bold">Today's hour · {w.hourStart}</span>
            <span className="block text-sm text-muted">{daySummary(today, w.slots, w.recipes, w.officeDays).dinner}</span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </Link>
      )}

      {w.week && (
        <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
          {dates.map((d) => (
            <DayTile key={d} date={d} today={d === today} summary={daySummary(d, w.slots, w.recipes, w.officeDays)}
              ref={(el) => { tiles.current.set(d, el); }} onOpen={() => setOpen(d)} />
          ))}
          <WeekTile approved={w.week.status !== 'draft'} saturdayMorning={weekday === 6 && hour < 14}
            onApprove={() => void w.approve()} cookidoo={w.cookidoo} onRetry={() => void w.retryCookidoo()} baskets={w.baskets} shopsPerWeek={w.shopsPerWeek}
            onOpen={() => setApprovedOpen(true)} />
        </div>
      )}
      {w.week && <ClaudeWeekNotes w={w} plan={plan} />}

      {!w.loading && (
        <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="justify-self-start font-semibold text-accent underline">
          Ask Claude about recipes and the plan ↗
        </a>
      )}

      {w.week && w.week.status !== 'draft' && approvedOpen && <ApprovedSheet w={w} onClose={() => setApprovedOpen(false)} />}
      {w.week && open && <DaySheet date={open} w={w} onClose={close} />}
    </section>
  );
}
