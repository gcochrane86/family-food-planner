import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const HOLD_MS = 550;
const MOVE_PX = 8; // a press that moves further than this is a scroll, not a hold

/** One meal's photo card on the day sheet. A tap follows `to` (the recipe) or, without one, does `onHold`; holding
 *  it, or right-clicking, does `onHold` (the meal's options). */
export function HoldCard({ label, to, onHold, className = '', children }: {
  label: string; to?: string; onHold?: () => void; className?: string; children: React.ReactNode;
}) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);
  const cancel = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };
  useEffect(() => cancel, []);
  const props = {
    'aria-label': label,
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false;
      if (!onHold) return;
      cancel();
      hold.current = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { held.current = true; hold.current = null; onHold(); }, HOLD_MS) };
    },
    onPointerMove: (e: React.PointerEvent) => { if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > MOVE_PX) cancel(); },
    onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { if (!onHold) return; e.preventDefault(); cancel(); onHold(); },
    onClick: (e: React.MouseEvent) => {
      // After a hold, the release isn't a tap.
      if (held.current) { held.current = false; e.preventDefault(); return; }
      if (!to) onHold?.();
    },
    className: `block w-full select-none overflow-hidden rounded-[20px] bg-surface text-left text-ink no-underline shadow-sm [-webkit-touch-callout:none] ${className}`,
  };
  return to ? <Link to={to} draggable={false} {...props}>{children}</Link> : <button type="button" {...props}>{children}</button>;
}

/** A meal's options, over the day sheet. */
export function OptionsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    // Capture Escape so it closes this, not the day sheet underneath.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid items-end justify-items-center bg-black/40 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="grid max-h-[85%] w-full max-w-[600px] gap-3 overflow-auto rounded-t-3xl bg-bg p-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] shadow-xl md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-xl font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink">Done</button>
        </div>
        {children}
      </div>
    </div>
  );
}
