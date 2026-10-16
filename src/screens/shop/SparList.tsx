import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import { SAVE_ERROR, useAsync } from '../settings/useAsync';

const MAX = 80;

/** Things to grab at the Spar (5 minutes' walk) when they can't wait for the next delivery. */
export default function SparList() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, reload } = useAsync(() => repo.listQuick(hid), [hid]);
  const [name, setName] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  async function add() {
    const clean = name.trim().slice(0, MAX);
    if (!clean) return;
    setBanner(null);
    try {
      const item = await repo.addQuick(hid, clean);
      setData((list) => [...(list ?? []), item]);
      setName('');
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  async function toggle(id: string, done: boolean) {
    setData((list) => (list ?? []).map((i) => (i.id === id ? { ...i, done } : i)));
    try {
      await repo.setQuickDone(id, done);
    } catch {
      setData((list) => (list ?? []).map((i) => (i.id === id ? { ...i, done: !done } : i)));
      setBanner(SAVE_ERROR);
    }
  }

  async function clearDone() {
    setBanner(null);
    try {
      await repo.clearQuickDone(hid);
      setData((list) => (list ?? []).filter((i) => !i.done));
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  const items = data ?? [];
  return (
    <section aria-label="Spar list" className="grid gap-2 rounded-2xl bg-surface-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Spar list</h2>
        {items.some((i) => i.done) && (
          <button type="button" onClick={() => void clearDone()} className="text-sm font-semibold text-muted underline">Clear done</button>
        )}
      </div>
      <p className="m-0 text-sm text-muted">For gaps that can't wait for the next delivery.</p>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {banner && <ErrorBanner message={banner} />}
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-xl bg-surface">
          {items.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={i.done} aria-label={i.name}
                  onChange={(e) => void toggle(i.id, e.target.checked)} />
                <span className={i.done ? 'text-muted line-through' : 'font-semibold'}>{i.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input id="spar-new" aria-label="Add to the Spar list" placeholder="e.g. Coriander" maxLength={200}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={!name.trim()} className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-60">Add</button>
      </form>
    </section>
  );
}
