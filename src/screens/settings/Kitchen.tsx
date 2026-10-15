import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import { card, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Kitchen() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(() => repo.listEquipment(hid), [hid]);
  const [banner, setBanner] = useState<string | null>(null);
  const [name, setName] = useState('');

  async function add() {
    setBanner(null);
    try {
      const item = await repo.saveEquipment({ household_id: hid, code: slug(name), name: name.trim() });
      setData((d) => [...(d ?? []).filter((x) => x.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  async function remove(id: string) {
    setBanner(null);
    try {
      await repo.deleteEquipment(id);
      setData((d) => (d ?? []).filter((x) => x.id !== id));
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  return (
    <Page title="Kitchen" intro="Recipes are only suggested if you have what they need, and steps use your machines."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      <ul className={`${card} divide-y divide-line`}>
        {data?.length === 0 && <li className="p-4 text-muted">Nothing added yet.</li>}
        {data?.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 p-4">
            <span className="font-semibold">{e.name}</span>
            <button type="button" className="text-sm text-muted underline" onClick={() => void remove(e.id)}>Remove {e.name}</button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void add(); }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Add equipment</span>
          <input id="new-equipment" placeholder="Add equipment, e.g. Slow cooker" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className={primary} disabled={!name.trim()}>Add</button>
      </form>
    </Page>
  );
}
