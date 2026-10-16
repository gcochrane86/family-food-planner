import { forwardRef } from 'react';
import type { DaySummary } from '../../lib/weekSummary';
import { dayLabel } from './DayCard';

const row = 'grid grid-cols-[10px_minmax(0,1fr)] items-start gap-2 text-[13.5px] leading-snug md:grid-cols-[12px_minmax(0,1fr)] md:gap-3 md:text-lg';
const dot = 'mt-[0.32em] h-2.5 w-2.5 rounded-full md:h-3 md:w-3';
const text = 'min-w-0 break-words';

/** One day on the week grid: breakfast, lunch and dinner at a glance. Tap to open the day. */
const DayTile = forwardRef<HTMLButtonElement, { date: string; summary: DaySummary; today: boolean; onOpen: () => void }>(
  ({ date, summary, today, onOpen }, ref) => {
    const [weekday, dateNum] = dayLabel(date).split(' ');
    return (
      <button ref={ref} type="button" onClick={onOpen} aria-label={dayLabel(date)}
        className={`grid min-w-0 content-start gap-2 rounded-[22px] bg-surface p-3.5 text-left shadow-sm md:min-h-[230px] md:gap-3.5 md:rounded-[26px] md:p-5 active:scale-[.98] motion-reduce:active:scale-100 ${today ? 'outline outline-2 outline-accent' : ''}`}>
        <span className="flex items-baseline justify-between">
          <span className="font-bold text-accent md:text-xl">{weekday}</span>
          <span className="font-display text-2xl font-extrabold leading-none md:text-4xl">{dateNum}</span>
        </span>
        <span className={row}><i className={`${dot} bg-yolk`} /><span className={text}>{summary.breakfast}</span></span>
        <span className={row}><i className={`${dot} bg-teal`} /><span className={text}>{summary.lunch}</span></span>
        <span className={row}>
          <i className={`${dot} ${summary.dinnerOut ? 'border-2 border-muted' : 'bg-accent'}`} />
          <span className={`dinner ${text}`}>{summary.dinner}</span>
        </span>
      </button>
    );
  },
);
DayTile.displayName = 'DayTile';
export default DayTile;
