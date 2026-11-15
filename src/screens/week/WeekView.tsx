import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';
import { daySummary } from '../../lib/weekSummary';
import DaySheet from './DaySheet';
import FeedbackCard from './FeedbackCard';
import ApprovedSheet from './ApprovedSheet';
import ShoppingSheet from './ShoppingSheet';
import ClaudeWeekNotes, { Failed, Planning, planPath, usePlanRequest } from './PlanWithClaude';
import DayTile from './DayTile';
import WeekTile from './WeekTile';
import { addDays, useWeek } from './useWeek';
import { isDay } from '../../lib/dayVersion';

/** "Monday". */
const weekdayLong = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

export default function WeekView() {
  const w = useWeek();
  const plan = usePlanRequest(w);
  const [open, setOpen] = useState<string | null>(null);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  // ?day=YYYY-MM-DD (from a preview of that day's hour) opens that day's sheet, in whichever week it's in.
  const [params, setParams] = useSearchParams();
  const askedDay = params.get('day');
  useEffect(() => {
    if (!askedDay || w.loading) return;
    // Only a real day in this week or next: anything else is ignored.
    if (!isDay(askedDay) || askedDay < w.starts.thisWeek || askedDay > addDays(w.starts.nextWeek, 6)) { setParams({}, { replace: true }); return; }
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
            Or plan it with Claude any time: pick this week's office days, nights off and cooking time, then the Claude app plans from your specifications, recipes, freezer and pantry and saves a draft here to approve.
            Quick menu uses the built-in planner straight away.
          </p>
          {plan.failed && <Failed w={w} summary={plan.req!.summary} />}
          <Link to={planPath(w.weekStart)} className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink no-underline">Plan with Claude</Link>
          </>)}
          <button type="button" onClick={() => void w.propose()} className="font-semibold text-accent underline">Quick menu</button>
        </div>
      )}

      {w.week && dates.includes(today) && (
        <Link to="/today" className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 no-underline">
          <span>
            <span className="block font-bold">Today's cooking</span>
            <span className="block text-sm text-muted">{daySummary(today, w.slots, w.recipes, w.officeDays).dinner}</span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </Link>
      )}

      {w.newPartners && Object.keys(w.newPartners).length > 0 && (
        <section aria-label="New meal partners" className="grid gap-2 rounded-2xl border-2 border-yolk bg-surface p-4">
          <h2 className="m-0 text-base font-bold">New meal partners</h2>
          <p className="m-0 text-sm text-muted">Claude suggests these to balance your days. Approving the week keeps them (change them in Settings → Household).</p>
          <ul className="m-0 grid list-none gap-1 p-0 text-sm">
            {Object.entries(w.newPartners).flatMap(([meal, byMember]) => Object.entries(byMember).map(([id, items]) => (
              <li key={`${meal}|${id}`}>{items.length
                ? `${meal} now comes with ${items.map((it) => `${it.qty} × ${[...w.recipes.values()].find((r) => r.slug === it.recipe)?.title ?? it.recipe}`).join(' and ')} for ${w.memberName(id)}`
                : `${meal} no longer comes with anything for ${w.memberName(id)}`}</li>
            )))}
          </ul>
        </section>
      )}

      {w.newDinners.length > 0 && (
        <section aria-label="New recipes to check" className="grid gap-2 rounded-2xl border-2 border-yolk bg-surface p-4">
          <h2 className="m-0 text-base font-bold">New recipes to check</h2>
          <p className="m-0 text-sm text-muted">Claude made these up for this week, to use up leftovers or add variety. Check them before you approve.</p>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {w.newDinners.map(({ date, recipe }) => (
              <li key={date}>
                <span className="font-semibold">{weekdayLong(date)}: </span>
                <Link to={`/recipes/${recipe.id}`} className="font-semibold text-accent underline">{recipe.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {w.week && (
        <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
          {/* Monday's prep, done the Sunday before (its cooking has Monday's breakfast and lunch made ahead, and the
              dinner's prep), until the week starts. */}
          {today < w.weekStart && (() => {
            const sunday = addDays(w.weekStart, -1);
            const isToday = today === sunday;
            const when = isToday ? 'tonight' : new Date(`${sunday}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
            return (
              <Link to={isToday ? '/today' : `/today?day=${sunday}`} aria-label={`Monday prep, ${when}`}
                className={`grid min-w-0 content-start gap-2 rounded-[22px] bg-surface p-3.5 text-left no-underline shadow-sm md:min-h-[230px] md:gap-3.5 md:rounded-[26px] md:p-5 ${isToday ? 'outline outline-2 outline-accent' : ''}`}>
                <span className="font-bold text-accent md:text-xl">Monday prep</span>
                <span className="text-[13.5px] leading-snug md:text-lg">{isToday ? 'Tonight' : `Sunday ${sunday.slice(8).replace(/^0/, '')}`}: Monday's breakfast, lunch and dinner prep</span>
                <span className="text-sm font-semibold text-accent">Open the prep ›</span>
              </Link>
            );
          })()}
          {dates.map((d) => (
            <DayTile key={d} date={d} today={d === today} summary={daySummary(d, w.slots, w.recipes, w.officeDays)}
              isNew={w.newDinners.some((n) => n.date === d)}
              ref={(el) => { tiles.current.set(d, el); }} onOpen={() => setOpen(d)} />
          ))}
          <WeekTile approved={w.week.status !== 'draft'} saturdayMorning={weekday === 6 && hour < 14}
            onApprove={async () => { if (await w.approve()) setShoppingOpen(true); }} cookidoo={w.cookidoo} onRetry={() => void w.retryCookidoo()} baskets={w.baskets} shopsPerWeek={w.shopsPerWeek}
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
      {w.week && shoppingOpen && <ShoppingSheet weekStart={w.weekStart} onClose={() => setShoppingOpen(false)} />}
      {w.week && open && <DaySheet date={open} w={w} onClose={close} />}
    </section>
  );
}
