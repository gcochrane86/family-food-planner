import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Shopping from '../shop/Shopping';

/** After Approve week: the week's shopping (the same lists as the Shop tab) and one Send to Sainsbury's. */
export default function ShoppingSheet({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-30 grid items-end justify-items-center bg-black/45 md:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Your shopping"
        className="grid max-h-[92%] w-full max-w-[560px] gap-4 overflow-auto rounded-t-3xl bg-bg pt-2.5 gutter pb-[calc(16px+env(safe-area-inset-bottom,0px))] md:rounded-3xl">
        <span className="h-1.5 w-10 justify-self-center rounded-full bg-line" aria-hidden />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Your shopping</h2>
            <p className="m-0 text-sm text-muted">Week approved. Tick off what you already have, then send it.</p>
          </div>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-lg">×</button>
        </div>
        <Shopping weekStart={weekStart} inSheet onDone={onClose} />
      </div>
    </div>,
    document.body,
  );
}
