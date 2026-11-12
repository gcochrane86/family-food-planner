import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import StoredPhoto from '../../components/StoredPhoto';
import { resizeImage } from '../../lib/image';
import { repo } from '../../lib/repo';
import type { Equipment } from '../../lib/types';
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

  async function addPhoto(item: Equipment, file: File | undefined) {
    if (!file) return;
    setBanner(null);
    try {
      const path = await repo.uploadEquipmentPhoto(hid, item, await resizeImage(file, 1200));
      setData((d) => (d ?? []).map((x) => {
        if (x.id !== item.id) return x;
        const photos = [...(x.photos ?? []), path].slice(-3);
        return { ...x, photos, photo: photos[0] };
      }));
    } catch {
      setBanner("Couldn't save the photo. Try again.");
    }
  }

  async function removePhoto(item: Equipment, path: string) {
    setBanner(null);
    try {
      await repo.removeEquipmentPhoto(item, path);
      setData((d) => (d ?? []).map((x) => {
        if (x.id !== item.id) return x;
        const photos = (x.photos ?? []).filter((p) => p !== path);
        return { ...x, photos, photo: photos[0] ?? null };
      }));
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
            <span className="grid gap-2">
              <span className="font-semibold">{e.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                {(e.photos ?? []).map((p, i) => (
                  <span key={p} className="relative">
                    <StoredPhoto path={p} width={160} alt={i === 0 ? e.name : `${e.name} (${i + 1})`} className="aspect-[4/3] w-20 rounded-lg object-cover" />
                    <button type="button" aria-label={`Remove photo ${i + 1} of ${e.name}`} onClick={() => void removePhoto(e, p)}
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs text-bg">×</button>
                  </span>
                ))}
                {(e.photos ?? []).length < 3 && (
                  <label className="grid aspect-[4/3] w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-center text-xs text-accent">
                    {(e.photos ?? []).length ? 'Add another' : 'Add photo'}
                    <input type="file" accept="image/*" className="sr-only" aria-label={`${(e.photos ?? []).length ? 'Add another photo of' : 'Add a photo of'} ${e.name}`}
                      onChange={(ev) => void addPhoto(e, ev.target.files?.[0])} />
                  </label>
                )}
              </span>
            </span>
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
