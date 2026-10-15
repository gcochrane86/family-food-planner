import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { DEFAULT_SETTINGS, validateSettings } from '../../lib/household';
import { repo } from '../../lib/repo';
import type { DeliverySlot, Settings, Weekday } from '../../lib/types';
import { card, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const DAY_NAMES: Record<Weekday, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex w-max max-w-full gap-1 rounded-xl bg-surface-2 p-1">
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Shopping() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, error, loading, reload } = useAsync(() => repo.getSettings(hid), [hid]);
  const [form, setForm] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => { if (data) setForm(data); }, [data]);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => { setForm((f) => ({ ...f, [key]: value })); setStatus('idle'); };

  function setShops(n: 1 | 2) {
    const slots = n === 1 ? form.delivery_slots.slice(0, 1) : [...form.delivery_slots, DEFAULT_SETTINGS.delivery_slots[1]].slice(0, 2);
    setForm((f) => ({ ...f, shops_per_week: n, delivery_slots: slots }));
    setStatus('idle');
  }
  const setSlot = (i: number, patch: Partial<DeliverySlot>) =>
    set('delivery_slots', form.delivery_slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    setBanner(null);
    setStatus('saving');
    const clean = validateSettings(form);
    try {
      await repo.saveSettings(hid, clean);
      setForm(clean);
      setStatus('saved');
    } catch {
      setBanner(SAVE_ERROR);
      setStatus('idle');
    }
  }

  return (
    <Page title="Planning & shopping" intro="Defaults for each week's plan and the Sainsbury's deliveries." loading={loading} error={error} onRetry={reload}>
      <form className={`${card} grid gap-5 p-4`} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Segmented label="Plan length" value={form.default_plan_days} onChange={(v) => set('default_plan_days', v)}
          options={[{ value: 5, label: '5 days' }, { value: 7, label: '7 days' }]} />
        <label className="grid gap-1.5 text-sm font-semibold">
          Weekday dinner limit (minutes at dinner time)
          <input id="dinner-limit" type="number" min={10} max={120} step={5} className={`${input} w-28`} value={form.weekday_dinner_max_min}
            onChange={(e) => set('weekday_dinner_max_min', Number(e.target.value))} />
        </label>
        <Segmented label="Deliveries per week" value={form.shops_per_week} onChange={setShops}
          options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]} />
        {form.delivery_slots.map((slot, i) => (
          <fieldset key={i} className="grid gap-2">
            <legend className="mb-1.5 text-sm font-semibold">Delivery {i + 1}</legend>
            <div className="flex flex-wrap gap-2">
              <select aria-label={`Delivery ${i + 1} day`} id={`slot-${i}-day`} className={`${input} w-auto`} value={slot.day}
                onChange={(e) => setSlot(i, { day: e.target.value as Weekday })}>
                {Object.entries(DAY_NAMES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input aria-label={`Delivery ${i + 1} from`} id={`slot-${i}-start`} type="time" className={`${input} w-auto`} value={slot.start}
                onChange={(e) => setSlot(i, { start: e.target.value })} />
              <input aria-label={`Delivery ${i + 1} until`} id={`slot-${i}-end`} type="time" className={`${input} w-auto`} value={slot.end}
                onChange={(e) => setSlot(i, { end: e.target.value })} />
            </div>
          </fieldset>
        ))}
        <label className="flex items-center gap-3 font-semibold">
          <input id="delivery-pass" type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={form.delivery_pass}
            onChange={(e) => set('delivery_pass', e.target.checked)} />
          I have a Delivery Pass
        </label>
        <label className="flex items-center gap-3 font-semibold">
          <input id="nectar" type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={form.use_nectar}
            onChange={(e) => set('use_nectar', e.target.checked)} />
          Use Nectar prices
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          New recipes to try each week
          <input id="adventure" type="number" min={0} max={7} className={`${input} w-28`} value={form.adventure}
            onChange={(e) => set('adventure', Number(e.target.value))} />
        </label>
        {banner && <ErrorBanner message={banner} />}
        <div className="flex items-center gap-3">
          <button type="submit" className={primary} disabled={status === 'saving'}>Save</button>
          {status === 'saved' && <span role="status" className="font-semibold text-accent">Saved</span>}
        </div>
      </form>
    </Page>
  );
}
