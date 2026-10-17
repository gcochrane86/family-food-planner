import { useEffect, useRef, useState } from 'react';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';
import MealPhoto from './MealPhoto';

export interface MealOption { value: string; name: string; recipe?: Recipe; removable: boolean }

/** Options sharing one card, e.g. every "… sandwich" under Sandwich. Choosing the card lists them underneath. */
export interface OptionGroup {
  label: string;     // the card's name, e.g. "Sandwich"
  suffix: string;    // what the members' names end with, e.g. "sandwich"
  addLabel: string;  // e.g. "filling" → "+ Add a filling"
}

const HOLD_MS = 550;
const MOVE_PX = 8; // a press that moves further than this is a scroll, not a hold

/** A swipeable row of photo cards to pick a breakfast or lunch. + adds an option; holding a card (or right-clicking it)
 *  offers to take it off the list. Options in a `group` share one card; choosing it picks the member you've had least
 *  (by `usage`, then list order) and lists the members underneath. */
export default function MealOptions({ label, options, picked, onPick, onAdd, onRemove, groups = [], usage = {} }: {
  label: 'Breakfast' | 'Lunch'; options: MealOption[]; picked: string; groups?: OptionGroup[]; usage?: Record<string, number>;
  onPick: (value: string) => void;
  /** Adds the option; resolves to a problem to show, or null. */
  onAdd: (name: string, photo: boolean) => Promise<string | null>;
  onRemove: (value: string) => void;
}) {
  const noun = label.toLowerCase();
  const [removing, setRemoving] = useState<MealOption | null>(null);
  const [adding, setAdding] = useState(false);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);
  const removable = options.filter((o) => o.removable);

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<OptionGroup | null>(null);
  const tail = (g: OptionGroup) => new RegExp(`\\s*${g.suffix}$`, 'i');
  const groupOf = (o: MealOption) => (o.removable ? groups.find((g) => tail(g).test(o.name)) : undefined);
  const members = (g: OptionGroup) => options.filter((o) => groupOf(o) === g);
  const short = (o: MealOption) => { const g = groupOf(o); return g ? o.name.replace(tail(g), '') : o.name; };
  /** The member you've had least, first in the list on a tie. */
  const suggest = (list: MealOption[]) => list.reduce((best, o) => ((usage[o.value] ?? 0) < (usage[best.value] ?? 0) ? o : best));
  // Folded away until you tap the card (the owner's choice), even when one of its fillings is picked.
  const shownGroup = groups.find((g) => g.label === openGroup && members(g).length > 0);

  const cancelHold = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };
  useEffect(() => cancelHold, []);

  /** Press-and-hold (or right-click) to remove; a quick tap picks. */
  const pressProps = (o: MealOption, pick: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false;
      if (!o.removable) return;
      cancelHold();
      hold.current = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { held.current = true; hold.current = null; setRemoving(o); }, HOLD_MS) };
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > MOVE_PX) cancelHold();
    },
    onPointerUp: cancelHold, onPointerLeave: cancelHold, onPointerCancel: cancelHold,
    onContextMenu: (e: React.MouseEvent) => { if (!o.removable) return; e.preventDefault(); cancelHold(); setRemoving(o); },
    onClick: () => { if (held.current) { held.current = false; return; } pick(); },
  });

  const card = (key: string, name: string, on: boolean, recipe: Recipe | undefined, props: object, caption?: string) => (
    <button key={key} type="button" aria-label={name} aria-pressed={on} {...props}
      className={`relative w-[44%] max-w-[220px] shrink-0 select-none snap-start overflow-hidden rounded-[20px] border-[3px] bg-surface text-left shadow-sm [-webkit-touch-callout:none] ${on ? 'border-accent' : 'border-transparent'}`}>
      <MealPhoto recipe={recipe} alt={name} className="aspect-[4/3]" />
      {on && <span aria-hidden className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-accent font-bold text-accent-ink">✓</span>}
      <span className="block px-3 py-2 text-sm font-bold leading-snug">{name}{caption && <span className="block text-xs font-semibold text-muted">{caption}</span>}</span>
    </button>
  );

  return (
    <div role="group" aria-label={`${label} options`} className="grid gap-2">
      <div onScroll={cancelHold} className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {options.map((o) => {
          const g = groupOf(o);
          if (g) {
            const list = members(g);
            if (o !== list[0]) return null;
            const chosen = list.find((m) => m.value === picked);
            const shown = chosen ?? suggest(list);
            return card(`group:${g.label}`, g.label, !!chosen, shown.recipe, {
              onClick: () => {
                if (openGroup === g.label) { setOpenGroup(null); return; }
                setOpenGroup(g.label);
                if (!chosen) onPick(suggest(list).value);
              },
            }, chosen ? short(chosen) : undefined);
          }
          const on = picked === o.value;
          return card(o.value, o.name, on, o.recipe, pressProps(o, () => { setOpenGroup(null); if (!on) onPick(o.value); }));
        })}
        <button type="button" aria-label={`Add a ${noun}`} onClick={() => setAdding(true)}
          className="grid w-[30%] max-w-[150px] shrink-0 snap-start place-items-center rounded-[20px] border-2 border-dashed border-line text-3xl font-bold text-muted">+</button>
      </div>
      {shownGroup && (
        <div role="group" aria-label={`${shownGroup.label} fillings`} className="grid divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {members(shownGroup).map((o) => {
            const on = picked === o.value;
            return (
              <button key={o.value} type="button" aria-label={o.name} aria-pressed={on} {...pressProps(o, () => { if (!on) onPick(o.value); })}
                className="flex select-none items-center gap-3 px-3 py-2 text-left [-webkit-touch-callout:none]">
                {o.recipe?.hero_image_path
                  ? <img src={repo.heroUrl(o.recipe.hero_image_path, 300)} alt="" draggable={false} className="h-11 w-14 shrink-0 rounded-lg object-cover" />
                  : <span aria-hidden className="h-11 w-14 shrink-0 rounded-lg bg-surface-2" />}
                <span className="flex-1 font-semibold">{short(o)}</span>
                <span aria-hidden className={`h-5 w-5 shrink-0 rounded-full ${on ? 'border-[6px] border-accent' : 'border-2 border-line'}`} />
              </button>
            );
          })}
          <button type="button" onClick={() => setAddingTo(shownGroup)} className="px-3 py-2.5 text-left text-sm font-semibold text-muted">+ Add a {shownGroup.addLabel}</button>
        </div>
      )}
      {removable.length > 0 && <p className="m-0 text-xs text-muted">Hold a {noun} to remove it.</p>}

      {removing && (removable.length > 1 ? (
        <Modal role="alertdialog" title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)}>
          <p className="m-0 text-sm">This takes it off your {noun} options. Its recipe stays in your library.</p>
          <span className="flex gap-2">
            <button type="button" onClick={() => { onRemove(removing.value); setRemoving(null); }} className="rounded-lg bg-warn px-3 py-1.5 text-sm font-semibold text-bg">Remove</button>
            <button type="button" onClick={() => setRemoving(null)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
          </span>
        </Modal>
      ) : (
        <Modal role="alertdialog" title={`Can't remove ${removing.name}`} onClose={() => setRemoving(null)}>
          <p className="m-0 text-sm">You need at least one {noun}. Add another first.</p>
          <button type="button" onClick={() => setRemoving(null)} className="justify-self-start rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">OK</button>
        </Modal>
      ))}
      {adding && <AddOption noun={noun} onAdd={onAdd} onClose={() => setAdding(false)} />}
      {addingTo && (
        <AddOption noun={addingTo.addLabel} onAdd={(n, photo) => onAdd(tail(addingTo).test(n) ? n : `${n} ${addingTo.suffix}`, photo)} onClose={() => setAddingTo(null)} />
      )}
    </div>
  );
}

function AddOption({ noun, onAdd, onClose }: { noun: string; onAdd: (name: string, photo: boolean) => Promise<string | null>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) { setProblem('Give it a name.'); return; }
    setBusy(true);
    setProblem(null);
    const result = await onAdd(trimmed, photo);
    setBusy(false);
    if (result) setProblem(result); else onClose();
  }

  return (
    <Modal role="dialog" title={`Add a ${noun}`} onClose={busy ? () => {} : onClose}>
      <label className="grid gap-1 text-sm font-semibold">Name
        <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          placeholder={noun === 'breakfast' ? 'e.g. Granola bowl' : noun === 'lunch' ? 'e.g. Halloumi wrap' : 'e.g. Halloumi'} className="rounded-lg border border-line bg-bg px-3 py-2 text-base font-normal" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /> Make a photo (about 3p)
      </label>
      {busy && <p role="status" className="m-0 text-sm text-muted">{photo ? 'Adding it and making its photo…' : 'Adding it…'}</p>}
      {problem && <p role="alert" className="m-0 text-sm font-semibold text-warn">{problem}</p>}
      <span className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void add()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Add</button>
        <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
      </span>
    </Modal>
  );
}

function Modal({ role, title, onClose, children }: { role: 'dialog' | 'alertdialog'; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    // Capture Escape so it closes this box, not the day sheet underneath.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div role={role} aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="grid w-full max-w-sm gap-3 rounded-2xl bg-surface p-5 shadow-xl">
        <h3 className="m-0 text-lg font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
