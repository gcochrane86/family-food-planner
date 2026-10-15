import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { nextStaple } from '../../lib/household';
import { repo } from '../../lib/repo';
import type { StapleStatus } from '../../lib/types';
import { input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const LABEL: Record<StapleStatus, string> = { have: 'Have', low: 'Low', out: 'Out' };
const STYLE: Record<StapleStatus, string> = {
  have: 'border-line bg-surface',
  low: 'border-yolk bg-yolk-soft',
  out: 'border-warn bg-warn-soft',
};
const TAG: Record<StapleStatus, string> = { have: 'text-accent', low: 'text-yolk', out: 'text-warn' };

export default function Staples() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(() => repo.listStaples(hid), [hid]);
  const [banner, setBanner] = useState<string | null>(null);
  const [name, setName] = useState('');

  async function cycle(id: string) {
    if (!data) return;
    const before = data;
    const item = data.find((s) => s.id === id)!;
    const status = nextStaple(item.status);
    setData(data.map((s) => (s.id === id ? { ...s, status } : s)));
    setBanner(null);
    try {
      await repo.setStaple(id, status);
    } catch {
      setData(before);
      setBanner(SAVE_ERROR);
    }
  }

  async function add() {
    setBanner(null);
    try {
      const staple = await repo.addStaple(hid, name.trim());
      setData((d) => [...(d ?? []).filter((s) => s.id !== staple.id), staple].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  return (
    <Page title="Cupboard staples" intro="Tap to change: have → low → out. Low and out go on the next shopping list."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
        {data?.map((s) => (
          <button key={s.id} type="button" onClick={() => void cycle(s.id)}
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left ${STYLE[s.status]}`}>
            <span className="sr-only">{`${s.name} · ${LABEL[s.status]}`}</span>
            <span aria-hidden="true" className="min-w-0 font-semibold">{s.name}</span>
            <span aria-hidden="true" className={`text-xs font-bold uppercase tracking-wide ${TAG[s.status]}`}>{LABEL[s.status]}</span>
          </button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void add(); }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Add a staple</span>
          <input id="new-staple" placeholder="Add a staple, e.g. Porridge oats" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className={primary} disabled={!name.trim()}>Add</button>
      </form>
    </Page>
  );
}
