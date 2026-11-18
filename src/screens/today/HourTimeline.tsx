import type { HourStep } from '../../lib/todayHour';

/** The day's cooking as bars on a timeline, so the overlaps show: what you do (solid) and what cooks on its own
 *  (lighter) at the same time. On a step (`current`), only that step and what overlaps it, with that step marked. */
export default function HourTimeline({ steps, current, onPick }: { steps: HourStep[]; current?: number; onPick?: (index: number) => void }) {
  const end = (s: HourStep) => s.from + s.length;
  const total = Math.max(1, ...steps.map(end));
  const now = current !== undefined ? steps[current] : undefined;
  const rows = steps.map((s, i) => ({ s, i }))
    .filter(({ s, i }) => !now || i === current || (s.from < end(now) && end(s) > now.from));
  // On a step the view is zoomed to the rows shown.
  const from = now ? Math.min(...rows.map((r) => r.s.from)) : 0;
  const span = now ? Math.max(1, Math.max(...rows.map((r) => end(r.s))) - from) : total;
  const pct = (n: number) => `${(n / span) * 100}%`;

  return (
    <ul aria-label="Timeline" className="m-0 grid list-none gap-1.5 rounded-2xl bg-[#F3F4EF] p-3 text-sm">
      {rows.map(({ s, i }) => {
        const label = `${s.title}: minutes ${s.from} to ${end(s)}${s.handsOff ? ', cooks on its own' : ''}`;
        const here = i === current;
        const inner = (
          <>
            <span className={`truncate ${here ? 'font-bold text-[#1B211D]' : 'text-[#3F4A43]'}`}>{s.title}</span>
            <span className="relative h-5 rounded-full bg-[#E4E7DF]">
              <span data-bar style={{ left: pct(s.from - from), width: pct(s.length) }}
                className={`absolute inset-y-0 flex min-w-[6px] items-center justify-end overflow-hidden rounded-full px-1.5 text-[11px] font-semibold
                  ${s.handsOff ? 'bg-[repeating-linear-gradient(135deg,#A9CDB2_0_6px,#C3DEC9_6px_12px)] text-[#1E4A2B]' : 'bg-[#2D6A3E] text-white'}
                  ${here ? 'ring-2 ring-[#1B211D] ring-offset-1' : ''}`}>
                {s.length >= 4 ? s.length : ''}
              </span>
            </span>
          </>
        );
        const row = 'grid w-full grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-2 text-left';
        return (
          <li key={i} aria-label={label} aria-current={here ? 'step' : undefined}>
            {onPick ? <button type="button" aria-label={label} onClick={() => onPick(i)} className={row}>{inner}</button> : <div className={row}>{inner}</div>}
          </li>
        );
      })}
      {!now && <li aria-hidden="true" className="flex gap-4 pt-1 text-xs text-[#5D6760]">
        <span><span className="mr-1 inline-block h-2.5 w-4 rounded-full bg-[#2D6A3E] align-middle" />You</span>
        <span><span className="mr-1 inline-block h-2.5 w-4 rounded-full bg-[repeating-linear-gradient(135deg,#A9CDB2_0_6px,#C3DEC9_6px_12px)] align-middle" />Cooks on its own</span>
        <span className="ml-auto">{total} min</span>
      </li>}
    </ul>
  );
}
