import { useState } from 'react';
import ErrorBanner from '../../components/ErrorBanner';
import { useAuth } from '../../auth/AuthProvider';
import { DEFAULT_SETTINGS } from '../../lib/household';
import { repo } from '../../lib/repo';
import type { Settings } from '../../lib/types';
import { card, input, Page } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

/** Today's hour: when the daily cooking hour is, which breakfasts are made the night before, and the TM7 kit. */
export default function TodayHourSettings() {
  const { householdId } = useAuth();
  const { data, setData, error, loading, reload } = useAsync(() => repo.getSettings(householdId!), [householdId]);
  const [banner, setBanner] = useState<string | null>(null);

  async function save(change: Partial<Settings>) {
    if (!data) return;
    const before = data;
    const next = { ...data, ...change };
    setBanner(null);
    setData(next);
    try { await repo.saveSettings(householdId!, next); } catch { setData(before); setBanner(SAVE_ERROR); }
  }

  const ahead = data?.breakfast_ahead ?? DEFAULT_SETTINGS.breakfast_ahead!;
  return (
    <Page title="Today's hour" intro="One cooking hour a day: tonight's dinner, tomorrow's lunch and anything made the night before, with the chopping first and the dishwasher last." loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      {data && (
        <>
          <section className={`${card} grid gap-3 p-4`}>
            <h2 className="m-0 text-lg font-bold">When</h2>
            <HourTimes start={data.hour_start ?? '17:30'} minutes={data.hour_minutes ?? 60} onSave={(c) => void save(c)} />
          </section>
          <section className={`${card} grid gap-2 p-4`}>
            <h2 className="m-0 text-lg font-bold">Breakfasts</h2>
            <p className="m-0 text-sm text-muted">Switch on the ones you make the night before. The rest are made fresh in the morning.</p>
            <ul className="m-0 grid list-none gap-1 p-0">
              {data.breakfasts.map((b) => {
                const on = ahead.includes(b);
                return (
                  <li key={b} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="font-semibold">{b}</span>
                    <button type="button" role="switch" aria-checked={on} aria-label={`${b}: made the night before`}
                      onClick={() => void save({ breakfast_ahead: on ? ahead.filter((x) => x !== b) : [...ahead, b] })}
                      className={`relative h-7 w-12 rounded-full transition ${on ? 'bg-accent' : 'bg-surface-2 border border-line'}`}>
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className={`${card} grid gap-3 p-4`}>
            <h2 className="m-0 text-lg font-bold">Thermomix</h2>
            <Choice legend="TM7 machines" name="tm7_machines" value={data.tm7_machines ?? 1} labels={['1 machine', '2 machines']} onChange={(v) => void save({ tm7_machines: v })} />
            <Choice legend="TM7 bowls" name="tm7_bowls" value={data.tm7_bowls ?? 1} labels={['1 bowl', '2 bowls']} onChange={(v) => void save({ tm7_bowls: v })} />
            <p className="m-0 text-sm text-muted">With one bowl, the hour leaves 2 minutes to rinse it between Thermomix jobs.</p>
          </section>
        </>
      )}
    </Page>
  );
}

function HourTimes({ start, minutes, onSave }: { start: string; minutes: number; onSave: (c: Partial<Settings>) => void }) {
  const [s, setS] = useState(start);
  const [m, setM] = useState(String(minutes));
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="grid gap-1 text-sm font-semibold">Starts at
        <input type="time" className={input} value={s} onChange={(e) => setS(e.target.value)}
          onBlur={() => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s) && s !== start) onSave({ hour_start: s }); }} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Minutes
        <input type="number" min={30} max={120} step={5} className={input} value={m} onChange={(e) => setM(e.target.value)}
          onBlur={() => {
            const n = Math.min(120, Math.max(30, Math.round(Number(m) || minutes)));
            setM(String(n));
            if (n !== minutes) onSave({ hour_minutes: n });
          }} />
      </label>
    </div>
  );
}

function Choice({ legend, name, value, labels, onChange }: { legend: string; name: string; value: 1 | 2; labels: [string, string]; onChange: (v: 1 | 2) => void }) {
  return (
    <fieldset className="m-0 grid gap-1 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="flex gap-2">
        {([1, 2] as const).map((n) => (
          <label key={n} className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center font-semibold ${value === n ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>
            <input type="radio" name={name} className="sr-only" checked={value === n} onChange={() => onChange(n)} />
            {labels[n - 1]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
