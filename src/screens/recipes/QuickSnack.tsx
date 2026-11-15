import { useState } from 'react';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';

type Item = { name: string; qty: string; unit: string };
const field = 'rounded-lg border border-line bg-bg px-3 py-2 text-base font-normal';

/** "Quick snack": a name, one portion's items with amounts, and whether the toddler can have it. No steps, no photo;
 *  bought for the days it's eaten, never made (docs/superpowers/specs/2026-11-15-snacks-in-recipes-design.md). */
export default function QuickSnack({ householdId, onAdded }: { householdId: string; onAdded: (r: Recipe) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<Item[]>([{ name: '', qty: '', unit: '' }]);
  const [toddler, setToddler] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, k: keyof Item, v: string) => setItems((list) => list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const kept = items.filter((x) => x.name.trim());
    const parsed = kept.map((x) => ({ name: x.name.trim(), qty: x.qty.trim() ? Number(x.qty.replace(',', '.')) : null, unit: x.unit.trim() }));
    if (!title.trim()) { setProblem('Give it a name.'); return; }
    if (!parsed.length) { setProblem('Add at least one item.'); return; }
    if (parsed.some((x) => x.qty !== null && !(Number.isFinite(x.qty) && x.qty > 0))) { setProblem('Amounts are numbers above 0.'); return; }
    setProblem(null);
    setBusy(true);
    try {
      onAdded(await repo.addQuickSnack(householdId, { title: title.trim(), items: parsed, toddler_ok: toddler }));
      setOpen(false); setTitle(''); setItems([{ name: '', qty: '', unit: '' }]); setToddler(true);
    } catch {
      setProblem("Couldn't save it. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Quick snack</button>;
  }
  return (
    <form aria-label="Add a quick snack" noValidate onSubmit={(e) => void save(e)} className="grid w-full gap-2 rounded-2xl border border-line bg-surface p-4">
      <label className="grid gap-1 text-sm font-semibold">Name
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Apple & almonds" className={field} />
      </label>
      <p className="m-0 text-sm font-semibold">One portion</p>
      {items.map((x, i) => (
        <div key={i} className="flex gap-2">
          <input aria-label={`Item ${i + 1}`} value={x.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="almonds" className={`${field} min-w-0 flex-1`} />
          <input aria-label={`Item ${i + 1} amount`} inputMode="decimal" value={x.qty} onChange={(e) => set(i, 'qty', e.target.value)} placeholder="30" className={`${field} w-16`} />
          <input aria-label={`Item ${i + 1} unit`} value={x.unit} onChange={(e) => set(i, 'unit', e.target.value)} placeholder="g" className={`${field} w-16`} />
        </div>
      ))}
      <button type="button" onClick={() => setItems((l) => [...l, { name: '', qty: '', unit: '' }])} className="justify-self-start text-sm font-semibold text-accent underline">Add an item</button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={toddler} onChange={(e) => setToddler(e.target.checked)} /> OK for the toddler
      </label>
      <p className="m-0 text-xs text-muted">Leave the unit empty for whole things (1 apple). The numbers are worked out from the items; Claude fills in any it doesn't know when it next plans.</p>
      {problem && <p role="alert" className="m-0 text-sm font-semibold text-warn">{problem}</p>}
      <span className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Save quick snack</button>
        <button type="button" onClick={() => { setOpen(false); setProblem(null); }} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
      </span>
    </form>
  );
}
