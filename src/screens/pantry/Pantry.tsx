import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { formatQty } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import type { PantryEntry, PreparedItem, StapleStatus } from '../../lib/types';
import { SAVE_ERROR, useAsync } from '../settings/useAsync';

type Tab = 'freezer' | 'fridge' | 'cupboard';
const TABS: { id: Tab; label: string }[] = [{ id: 'freezer', label: 'Freezer' }, { id: 'fridge', label: 'Fridge' }, { id: 'cupboard', label: 'Cupboard' }];
const STATUSES: StapleStatus[] = ['have', 'low', 'out'];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-base';
const small = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold';
const card = 'rounded-2xl border border-line bg-surface';

/** The Pantry tab: batch portions in the freezer, and the fridge and cupboard (staples plus anything you've added). */
export default function Pantry() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload, fresh } = useAsync(
    async () => ({ prepared: await repo.listPrepared(hid), pantry: await repo.listPantry(hid) }), [hid], { keep: `ffp.pantry.${hid}` });
  const [tab, setTab] = useState<Tab>('freezer');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [lastOne, setLastOne] = useState<PreparedItem | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const prepared = data?.prepared ?? [];
  const pantry = data?.pantry ?? [];
  const now = today();
  const expired = (i: PreparedItem) => !!i.use_by && i.use_by < now;
  const freezer = prepared.filter((i) => i.location === 'freezer' && i.portions > 0)
    .sort((a, b) => Number(expired(b)) - Number(expired(a)) || (a.use_by ?? '9999').localeCompare(b.use_by ?? '9999'));

  async function save(change: () => Promise<void>, apply: () => void, undo: () => void) {
    setBanner(null);
    apply();
    try { await change(); } catch { undo(); setBanner(SAVE_ERROR); }
  }
  const setPrepared = (list: PreparedItem[]) => setData((d) => d && { ...d, prepared: list });
  const setPantry = (list: PantryEntry[]) => setData((d) => d && { ...d, pantry: list });

  function portions(item: PreparedItem, n: number) {
    const before = prepared;
    void save(() => repo.setPreparedPortions(item.id, n),
      () => setPrepared(n <= 0 ? before.filter((i) => i.id !== item.id) : before.map((i) => (i.id === item.id ? { ...i, portions: n } : i))),
      () => setPrepared(before));
  }
  function staple(e: PantryEntry, status: StapleStatus) {
    const before = pantry;
    void save(() => repo.setStaple(e.id, status), () => setPantry(before.map((x) => (x.id === e.id ? { ...x, staple: status } : x))), () => setPantry(before));
  }
  function remove(e: PantryEntry) {
    const before = pantry;
    void save(() => repo.removePantryItem(e.id), () => setPantry(before.filter((x) => x.id !== e.id)), () => setPantry(before));
  }

  const matches = query.trim() ? pantry.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase())) : [];

  return (
    <section className="grid gap-4 py-4">
      <h1 className="text-3xl font-bold">Pantry</h1>
      {data && !fresh && !error && <p className="m-0 text-sm text-muted">Checking for changes…</p>}
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {banner && <ErrorBanner message={banner} />}

      <div className="grid gap-2">
        <input type="search" aria-label="We're out of…" placeholder="We're out of…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="rounded-xl border border-line bg-surface px-4 py-2.5 text-base" />
        {matches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {matches.map((e) => (
              <button key={e.id} type="button" aria-label={`Out of ${e.name}`} disabled={!fresh} className={small}
                onClick={() => { if (e.staple) staple(e, 'out'); else remove(e); setQuery(''); }}>
                {e.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div role="tablist" className="flex gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setAdding(false); }}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === t.id ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data && <p className="text-muted">Loading…</p>}

      {tab === 'freezer' && data && (
        <div className="grid gap-3">
          {freezer.length === 0 && <p className="text-muted">Nothing in the freezer yet. Batches you make go here.</p>}
          {freezer.length > 0 && (
            <ul className={`${card} m-0 list-none divide-y divide-line p-0`}>
              {freezer.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <b>{i.name}</b> · {i.portions} portion{i.portions === 1 ? '' : 's'} · made {shortDate(i.made_on)}
                    {expired(i)
                      ? <span className="font-semibold text-warn"> · use or bin</span>
                      : i.use_by && <span className="text-muted"> · use by {shortDate(i.use_by)}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    <button type="button" aria-label={`One fewer ${i.name}`} disabled={!fresh} className={`${small} disabled:opacity-50`} onClick={() => (i.portions <= 1 ? setLastOne(i) : portions(i, i.portions - 1))}>−</button>
                    <button type="button" aria-label={`One more ${i.name}`} disabled={!fresh} className={`${small} disabled:opacity-50`} onClick={() => portions(i, i.portions + 1)}>+</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {adding ? <AddFrozen onCancel={() => setAdding(false)} onAdd={async (item) => {
            try { const saved = await repo.addPrepared(hid, item); setPrepared([...prepared, saved]); setAdding(false); } catch { setBanner(SAVE_ERROR); }
          }} /> : <button type="button" className={`${small} justify-self-start`} onClick={() => setAdding(true)}>+ Add to freezer</button>}
        </div>
      )}

      {tab !== 'freezer' && data && (
        <div className="grid gap-3">
          {(() => {
            const here = pantry.filter((e) => e.location === tab);
            const staples = here.filter((e) => e.staple);
            const own = here.filter((e) => !e.staple);
            return (
              <>
                {here.length === 0 && <p className="text-muted">Nothing here yet.</p>}
                {staples.length > 0 && (
                  <div className={`${card} grid divide-y divide-line`}>
                    {staples.map((e) => (
                      <div key={e.id} role="group" aria-label={e.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0 font-semibold">{e.name}</span>
                        <span className="flex shrink-0 gap-1">
                          {STATUSES.map((st) => (
                            <button key={st} type="button" aria-pressed={e.staple === st} disabled={!fresh} onClick={() => { if (e.staple !== st) staple(e, st); }}
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${e.staple === st ? (st === 'have' ? 'bg-accent text-accent-ink' : st === 'low' ? 'bg-yolk text-bg' : 'bg-warn text-bg') : 'bg-surface-2 text-muted'}`}>
                              {st}
                            </button>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {own.length > 0 && (
                  <ul className={`${card} m-0 list-none divide-y divide-line p-0`}>
                    {own.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0"><b>{e.name}</b>{e.qty !== null && <span className="text-muted"> · {formatQty(e.qty, e.unit ?? '', false)}</span>}</span>
                        <button type="button" aria-label={`Remove ${e.name}`} disabled={!fresh} className="px-2 text-lg text-muted disabled:opacity-50" onClick={() => remove(e)}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()}
          {adding ? <AddItem where={tab} onCancel={() => setAdding(false)} onAdd={async (name, qty, unit) => {
            try { const saved = await repo.addPantryItem(hid, name, tab, qty, unit); setPantry([...pantry, saved]); setAdding(false); } catch { setBanner(SAVE_ERROR); }
          }} /> : <button type="button" className={`${small} justify-self-start`} onClick={() => setAdding(true)}>+ Add to {tab}</button>}
        </div>
      )}

      {lastOne && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setLastOne(null)}>
          <div role="alertdialog" aria-modal="true" aria-label="Used the last one?" onClick={(e) => e.stopPropagation()} className="grid w-full max-w-sm gap-3 rounded-2xl bg-surface p-5 shadow-xl">
            <h2 className="m-0 text-lg font-bold">Used the last one?</h2>
            <p className="m-0 text-sm">That takes {lastOne.name} out of the freezer.</p>
            <span className="flex gap-2">
              <button type="button" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink" onClick={() => { portions(lastOne, 0); setLastOne(null); }}>Yes, it's gone</button>
              <button type="button" className={small} onClick={() => setLastOne(null)}>Keep it</button>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function AddFrozen({ onAdd, onCancel }: { onAdd: (item: Omit<PreparedItem, 'id' | 'household_id'>) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(90);
  const ok = name.trim() && count >= 1 && count <= 20 && days >= 1;
  return (
    <form aria-label="Add to freezer" className={`${card} grid gap-2 p-4`}
      onSubmit={(e) => { e.preventDefault(); if (ok) void onAdd({ recipe_id: null, name: name.trim(), portions: count, location: 'freezer', made_on: today(), use_by: addDays(today(), days) }); }}>
      <label className="grid gap-1 text-sm font-semibold">Name<input className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <span className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm font-semibold">Portions<input className={input} type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
        <label className="grid gap-1 text-sm font-semibold">Keeps for (days)<input className={input} type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
      </span>
      <span className="flex gap-2">
        <button type="submit" disabled={!ok} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50">Add</button>
        <button type="button" className={small} onClick={onCancel}>Cancel</button>
      </span>
    </form>
  );
}

function AddItem({ where, onAdd, onCancel }: { where: 'fridge' | 'cupboard'; onAdd: (name: string, qty: number | null, unit: string | null) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const amount = qty.trim() ? Number(qty.replace(',', '.')) : null;
  const ok = name.trim() && (amount === null || (Number.isFinite(amount) && amount >= 0));
  return (
    <form aria-label={`Add to ${where}`} className={`${card} grid gap-2 p-4`}
      onSubmit={(e) => { e.preventDefault(); if (ok) void onAdd(name.trim(), amount, unit.trim() || null); }}>
      <label className="grid gap-1 text-sm font-semibold">Name<input className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <span className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm font-semibold">Amount<input className={input} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Unit<input className={input} value={unit} placeholder="g, ml, each…" onChange={(e) => setUnit(e.target.value)} /></label>
      </span>
      <span className="flex gap-2">
        <button type="submit" disabled={!ok} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50">Add</button>
        <button type="button" className={small} onClick={onCancel}>Cancel</button>
      </span>
    </form>
  );
}
