import { useEffect, useRef, useState } from 'react';

/** The ⚙︎ menu on a recipe: the occasional actions (a new main photo, printing), kept out of the way. */
export default function RecipeMenu({ items }: { items: { label: string; onSelect: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button ref={button} type="button" aria-label="Recipe settings" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-base text-muted">⚙︎</button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 grid min-w-44 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect(); }}
              className="rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-60">
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
