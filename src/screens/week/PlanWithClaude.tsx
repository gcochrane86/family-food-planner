import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CANCELLED } from '../../lib/types';
import type { WeekState } from './useWeek';

const MINUTE = 60_000;

/** "Plan with Claude": the link to the week's choices (src/screens/week/PlanChoices.tsx, which opens the Claude app),
 *  a plan request still open or one that couldn't be made, and Claude's summary under a week Claude planned. */
export const planPath = (weekStart: string, replace = false) => `/plan?week=${weekStart}${replace ? '&replace=1' : ''}`;
export function usePlanRequest(w: WeekState) {
  const req = w.planRequest;
  // Claude saves a plan in seconds now (from the Claude app), so a request still open after 10 minutes was abandoned:
  // it no longer hides Plan with Claude.
  const open = !!req && (req.status === 'requested' || req.status === 'planning') && Date.now() - Date.parse(req.requested_at) < 10 * MINUTE;
  // A failure only matters while the week can still be planned (no week, or a draft older than the request).
  const failed = !!req && req.status === 'failed' && req.summary !== CANCELLED
    && (!w.week || (w.week.status === 'draft' && Date.parse(req.requested_at) > Date.parse(w.week.proposed_at)));
  const latest = useRef(w);
  latest.current = w;
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => void latest.current.checkRequest(), MINUTE);
    return () => clearInterval(t);
  }, [open]);
  return { req, open, failed };
}

export function Planning({ w }: { w: WeekState }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-2xl bg-accent-soft p-4">
      <p role="status" className="m-0 font-semibold">
        Waiting for Claude to save the plan for {w.shown === 'next' ? 'next week' : 'this week'}…
      </p>
      <button type="button" onClick={() => void w.cancelPlan()} className="text-sm font-semibold text-accent underline">Cancel</button>
    </div>
  );
}

export function Failed({ w, summary }: { w: WeekState; summary: string | null }) {
  return (
    <div role="alert" className="grid justify-items-start gap-2 rounded-2xl border border-warn p-4">
      <p className="m-0">Claude couldn't plan it{summary ? `: ${summary}` : '.'}</p>
      <Link to={planPath(w.weekStart, !!w.week)} className="font-semibold text-accent underline">Try again</Link>
    </div>
  );
}

/** Under the week: Claude's summary, and Replan with Claude while the week is a draft. */
export default function ClaudeWeekNotes({ w, plan }: { w: WeekState; plan: ReturnType<typeof usePlanRequest> }) {
  const { req, open, failed } = plan;
  if (!w.week) return null;
  return (
    <div className="grid gap-3">
      {w.week.planned_by === 'claude' && w.week.summary && (
        <section aria-label="Planned by Claude" className="grid gap-1 rounded-2xl bg-surface-2 p-4">
          <h2 className="m-0 text-base font-bold">Planned by Claude</h2>
          <p className="m-0 text-[15px] leading-snug">{w.week.summary}</p>
        </section>
      )}
      {open && <Planning w={w} />}
      {!open && failed && <Failed w={w} summary={req!.summary} />}
      {!open && w.week.status === 'draft' && (
        <Link to={planPath(w.weekStart, true)} className="justify-self-start font-semibold text-accent underline">Replan with Claude</Link>
      )}
    </div>
  );
}
