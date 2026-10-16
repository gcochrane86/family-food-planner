import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';
import type { WeekState } from './useWeek';

const SWIPE = 110; // px sideways to count as a swipe

/** Swap a dinner by swiping through the best-fitting alternatives (spec §6), or browse the whole library. */
export default function SwapStack({ date, dayName, w, onClose }: { date: string; dayName: string; w: WeekState; onClose: () => void }) {
  const cards = useMemo(() => w.alternatives(date, 5), [w, date]);
  const [at, setAt] = useState(0);
  const [browse, setBrowse] = useState(false);
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Capture Escape here so it closes only the stack, not the day underneath.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const choose = (recipeId: string) => { w.swap(date, recipeId); onClose(); };
  const skip = () => { setDrag(0); setAt((n) => n + 1); };
  const card = cards[at];
  const recipe = (id: string): Recipe | undefined => w.recipes.get(id);
  const meals = [...w.recipes.values()].filter((r) => r.kind === 'meal' && r.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Swap ${dayName}'s dinner`}
      className="fixed inset-0 z-40 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-3.5 bg-bg pt-[calc(14px+env(safe-area-inset-top,0px))] pb-[calc(20px+env(safe-area-inset-bottom,0px))] gutter">
      <div className="mx-auto flex w-full max-w-[520px] items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold">Swap {dayName}'s dinner</h2>
          <p className="m-0 text-[13.5px] text-muted">{card && !browse ? `${at + 1} of ${cards.length} · swipe right to choose, left to skip` : 'Pick any recipe'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-lg">×</button>
      </div>

      <div className="relative mx-auto w-full max-w-[520px] min-h-0">
        {card && !browse ? (
          [cards[at + 1], card].map((c, k) => {
            if (!c) return null;
            const r = recipe(c.recipeId);
            const isTop = k === 1;
            return (
              <div key={c.recipeId} role="group" aria-label={`Suggestion: ${r?.title ?? ''}`}
                onTouchStart={isTop ? (e) => { const t = e.touches[0]; start.current = t ? { x: t.clientX, y: t.clientY } : null; } : undefined}
                onTouchMove={isTop ? (e) => { const t = e.touches[0]; if (start.current && t) setDrag(t.clientX - start.current.x); } : undefined}
                onTouchEnd={isTop ? (e) => {
                  const s = start.current; start.current = null; const t = e.changedTouches[0];
                  if (!s || !t) return;
                  const dx = t.clientX - s.x; const dy = t.clientY - s.y;
                  if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < SWIPE) { setDrag(0); return; } // a scroll, or not far enough
                  if (dx > 0) choose(c.recipeId); else skip();
                } : undefined}
                style={isTop ? { transform: `translateX(${drag}px) rotate(${drag / 18}deg)` } : undefined}
                className={`absolute inset-0 grid grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-[26px] bg-surface shadow-lg [touch-action:pan-y] ${isTop ? (drag ? '' : 'transition-transform') : 'translate-y-2.5 scale-95'}`}>
                {r?.hero_image_path
                  ? <img src={repo.heroUrl(r.hero_image_path)} alt="" className="h-full w-full object-cover" />
                  : <div className="grid h-full place-items-center bg-gradient-to-br from-yolk-soft to-surface-2 p-4 text-center font-semibold text-muted">Photo of {r?.title}</div>}
                <div className="grid gap-1 px-[18px] pb-5 pt-4">
                  <h3 className="font-display text-[22px] font-bold leading-tight">{r?.title}</h3>
                  <span className="text-muted">{c.reason}</span>
                </div>
              </div>
            );
          })
        ) : browse ? (
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3">
            <input type="search" aria-label="Search recipes" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-2.5" />
            <ul className="m-0 grid list-none content-start gap-1.5 overflow-auto p-0">
              {meals.map((r) => (
                <li key={r.id}><button type="button" onClick={() => choose(r.id)} className="w-full rounded-xl bg-surface px-3 py-2.5 text-left font-semibold">{r.title}</button></li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="grid h-full place-items-center content-center gap-3 text-center text-muted">
            <p className="m-0">Nothing grabbed you?</p>
            <button type="button" onClick={() => setBrowse(true)} className="rounded-xl border border-line bg-surface px-4 py-2.5 font-bold text-ink">Browse all recipes</button>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-6">
        {card && !browse && (
          <>
            <button type="button" aria-label="Skip" onClick={skip} className="grid h-16 w-16 place-items-center rounded-full bg-surface text-3xl font-extrabold text-warn shadow">✕</button>
            <button type="button" aria-label="Choose" onClick={() => choose(card.recipeId)} className="grid h-16 w-16 place-items-center rounded-full bg-accent text-3xl font-extrabold text-accent-ink shadow">✓</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
