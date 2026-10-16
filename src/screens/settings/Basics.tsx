import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { WeeklyBasic } from '../../lib/types';
import { button, card, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const UNITS: [string, string][] = [['', 'each'], ['g', 'g'], ['ml', 'ml']];
const DELIVERIES: [WeeklyBasic['delivery'], string][] = [['sun', 'Sunday'], ['tue', 'Tuesday'], ['split', 'Half each']];

export default function Basics() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(() => repo.listBasics(hid), [hid]);
  const [banner, setBanner] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');

  async function save(b: WeeklyBasic, before: WeeklyBasic[]) {
    setBanner(null);
    try {
      const saved = await repo.saveBasic(b);
      setData((list) => (list ?? []).map((x) => (x.id === b.id ? { ...b, ...saved } : x)));
    } catch {
      setData(before);
      setBanner(SAVE_ERROR);
    }
  }

  function edit(b: WeeklyBasic, change: Partial<WeeklyBasic>) {
    const before = data ?? [];
    const updated = { ...b, ...change };
    setData(before.map((x) => (x.id === b.id ? updated : x)));
    void save(updated, before);
  }

  function commitAmount(b: WeeklyBasic) {
    const text = amounts[b.id!];
    if (text === undefined) return;
    const value = text.trim() === '' ? null : Number(text.replace(',', '.'));
    if (value !== null && (!Number.isFinite(value) || value < 0)) { setBanner('Enter an amount of 0 or more, or leave it empty.'); return; }
    if (value !== b.qty) edit(b, { qty: value });
  }

  async function add() {
    setBanner(null);
    const value = qty.trim() === '' ? null : Number(qty.replace(',', '.'));
    try {
      const saved = await repo.saveBasic({
        household_id: hid, position: (data?.length ?? 0) + 1, name: name.trim(), qty: Number.isFinite(value) ? value : null,
        unit, approx: false, delivery: 'split',
      });
      setData((list) => [...(list ?? []), saved]);
      setName(''); setQty('');
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  async function remove(id: string) {
    setBanner(null);
    try {
      await repo.deleteBasic(id);
      setData((list) => (list ?? []).filter((x) => x.id !== id));
    } catch {
      setBanner(SAVE_ERROR);
    }
    setConfirm(null);
  }

  return (
    <Page title="Weekly basics" intro="Breakfast and lunch things bought every week, added to the shopping list for you."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      <ul className={`${card} divide-y divide-line`}>
        {data?.length === 0 && <li className="p-4 text-muted">No basics yet.</li>}
        {data?.map((b) => (
          <li key={b.id} role="group" aria-label={b.name} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <span className="font-semibold">{b.name}{b.approx && <span className="text-sm font-normal text-muted"> (about)</span>}</span>
            <span className="flex items-center gap-2">
              <input aria-label={`${b.name} amount`} inputMode="decimal" className={`${input} w-24 text-right`}
                value={amounts[b.id!] ?? (b.qty === null ? '' : String(b.qty))}
                onChange={(e) => setAmounts((a) => ({ ...a, [b.id!]: e.target.value }))} onBlur={() => commitAmount(b)} />
              <span className="text-sm text-muted">{b.unit || 'each'}</span>
            </span>
            <span className="flex items-center gap-2">
              <select aria-label={`${b.name} delivery`} className={`${input} w-auto`} value={b.delivery}
                onChange={(e) => edit(b, { delivery: e.target.value as WeeklyBasic['delivery'] })}>
                {DELIVERIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {confirm === b.id ? (
                <>
                  <button type="button" className={button} onClick={() => void remove(b.id!)}>Remove {b.name}</button>
                  <button type="button" className={button} onClick={() => setConfirm(null)}>Keep</button>
                </>
              ) : (
                <button type="button" className="text-sm text-muted underline" onClick={() => setConfirm(b.id!)}>Remove</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form className={`${card} grid gap-3 p-4`} onSubmit={(e) => { e.preventDefault(); if (name.trim()) void add(); }}>
        <p className="m-0 font-semibold">Add a basic</p>
        <div className="flex flex-wrap gap-2">
          <input aria-label="New basic" id="new-basic" placeholder="e.g. Bananas" className={`${input} min-w-0 flex-1`} value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="New basic amount" id="new-basic-qty" inputMode="decimal" placeholder="Amount" className={`${input} w-24`} value={qty} onChange={(e) => setQty(e.target.value)} />
          <select aria-label="New basic unit" id="new-basic-unit" className={`${input} w-auto`} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button type="submit" className={primary} disabled={!name.trim()}>Add</button>
        </div>
      </form>
    </Page>
  );
}
