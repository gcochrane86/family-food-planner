import { useEffect, useRef, useState } from 'react';
import { CANCELLED } from '../../lib/types';
import type { WeekState } from './useWeek';

const MINUTE = 60_000;

/** "Plan with Claude": the request form, Claude planning, a plan that couldn't be made, and Claude's summary. The
 *  scheduled task on the owner's Mac picks requests up every 15 minutes. */
export function usePlanRequest(w: WeekState) {
  const req = w.planRequest;
  const open = !!req && (req.status === 'requested' || req.status === 'planning');
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
        Claude is planning {w.shown === 'next' ? 'next week' : 'this week'}… usually within 15 minutes, while the Mac is on.
      </p>
      <button type="button" onClick={() => void w.cancelPlan()} className="text-sm font-semibold text-accent underline">Cancel</button>
    </div>
  );
}

export function Failed({ w, summary, note }: { w: WeekState; summary: string | null; note: string | null }) {
  return (
    <div role="alert" className="grid justify-items-start gap-2 rounded-2xl border border-warn p-4">
      <p className="m-0">Claude couldn't plan it{summary ? `: ${summary}` : '.'}</p>
      <button type="button" onClick={() => void w.planWithClaude(note, !!w.week)} className="font-semibold text-accent underline">Try again</button>
    </div>
  );
}

export function PlanForm({ label, onPlan, onCancel }: { label: string; onPlan: (note: string) => void; onCancel?: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="grid w-full gap-2">
      <label className="grid gap-1 text-sm font-semibold">
        Anything for this week?
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2}
          placeholder="e.g. out Wednesday, use up the lamb, something lighter"
          className="rounded-xl border border-line bg-surface p-2.5 text-[15px] font-normal" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onPlan(note)} className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink">{label}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 font-semibold text-muted">Cancel</button>}
      </div>
    </div>
  );
}

/** Under the week: Claude's summary, and Replan with Claude while the week is a draft. */
export default function ClaudeWeekNotes({ w, plan }: { w: WeekState; plan: ReturnType<typeof usePlanRequest> }) {
  const { req, open, failed } = plan;
  const [replanning, setReplanning] = useState(false);
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
      {!open && failed && <Failed w={w} summary={req!.summary} note={req!.note} />}
      {!open && w.week.status === 'draft' && (replanning ? (
        <div className="grid gap-2 rounded-2xl border border-line p-4">
          <p className="m-0 text-sm">Claude replaces this draft, including any changes you've made to it.</p>
          <PlanForm label="Replan" onPlan={(note) => { setReplanning(false); void w.planWithClaude(note, true); }} onCancel={() => setReplanning(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setReplanning(true)} className="justify-self-start font-semibold text-accent underline">Replan with Claude</button>
      ))}
    </div>
  );
}
