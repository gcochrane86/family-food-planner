import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DayCard, { dayLabel } from './DayCard';
import type { WeekState } from './useWeek';

/** A day's full options, over the week grid: a bottom sheet on the phone, a centred card on the iPad. */
export default function DaySheet({ date, w, onClose }: { date: string; w: WeekState; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // In a portal above the bottom nav (z-20), so the nav never covers the end of the sheet.
  return createPortal(
    <div className="fixed inset-0 z-30 grid items-end justify-items-center bg-black/45 md:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={dayLabel(date)}
        className="grid max-h-[88%] w-full max-w-[640px] gap-3 overflow-auto rounded-t-3xl bg-bg pt-2.5 gutter pb-[calc(20px+env(safe-area-inset-bottom,0px))] md:rounded-3xl">
        <span className="h-1.5 w-10 justify-self-center rounded-full bg-line" aria-hidden />
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{dayLabel(date)}</h2>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-lg">×</button>
        </div>
        <DayCard date={date} w={w} hideTitle />
      </div>
    </div>,
    document.body,
  );
}
