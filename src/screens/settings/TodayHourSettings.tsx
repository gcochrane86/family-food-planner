import { useState } from 'react';
import ErrorBanner from '../../components/ErrorBanner';
import { useAuth } from '../../auth/AuthProvider';
import { DEFAULT_SETTINGS } from '../../lib/household';
import { repo } from '../../lib/repo';
import type { Settings } from '../../lib/types';
import { card, input, Page } from './ui';
import { MAX_MINUTES, MIN_MINUTES, WEEKDAYS, weekdayMinutes, type Weekday } from '../../../supabase/functions/_shared/cookingTime.ts';
import { SAVE_ERROR, useAsync } from './useAsync';

/** Today's cooking: how long each day has for cooking, which breakfasts are made the night before, and the TM7 kit. */
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
    <Page title="Today's cooking" intro="Each day's cooking: tonight's dinner, prep for tomorrow, tomorrow's lunch and anything made the night before, with the chopping first and the dishwasher last." loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      {data && (
        <>
          <section className={`${card} grid gap-3 p-4`}>
            <h2 className="m-0 text-lg font-bold">Time for cooking</h2>
            <p className="m-0 text-sm text-muted">Roughly how long each day has. The week's plan fits the dinners and the prep to it, and you can give a day more time when you plan.</p>
            <DayTimes minutes={weekdayMinutes(data)} onSave={(m) => void save({ cooking_minutes: m })} />
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
            <p className="m-0 text-sm text-muted">With one bowl, the cooking leaves 2 minutes to rinse it between Thermomix jobs.</p>
          </section>
        </>
      )}
    </Page>
  );
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function DayTimes({ minutes, onSave }: { minutes: Record<Weekday, number>; onSave: (m: Record<Weekday, number>) => void }) {
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(WEEKDAYS.map((d) => [d, String(minutes[d])])));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {WEEKDAYS.map((d, i) => (
        <label key={d} className="grid gap-1 text-sm font-semibold">
          <span>{DAY_NAMES[i]} <span className="sr-only">(minutes)</span><span aria-hidden="true" className="font-normal text-muted">min</span></span>
          <input type="number" min={MIN_MINUTES} max={MAX_MINUTES} step={15} className={input} value={text[d]}
            aria-label={`${DAY_NAMES[i]} (minutes)`}
            onChange={(e) => setText((t) => ({ ...t, [d]: e.target.value }))}
            onBlur={() => {
              const n = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(Number(text[d]) || minutes[d])));
              setText((t) => ({ ...t, [d]: String(n) }));
              if (n !== minutes[d]) onSave({ ...minutes, [d]: n });
            }} />
        </label>
      ))}
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
