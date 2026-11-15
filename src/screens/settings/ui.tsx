import { useState } from 'react';
import { MAX_MINUTES, MIN_MINUTES, WEEKDAYS, type Weekday } from '../../../supabase/functions/_shared/cookingTime.ts';
import { Link } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';

export const card = 'rounded-2xl border border-line bg-surface';
export const input = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5';
export const button = 'rounded-xl border border-line bg-surface px-4 py-2.5 font-semibold disabled:opacity-60';
export const primary = 'rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-60';

/** A settings sub-screen: back link, title, intro and the load/error states. */
export function Page({ title, intro, loading, error, onRetry, children }: {
  title: string;
  intro?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 py-4">
      <Link to="/settings" className="text-sm font-semibold text-muted no-underline">← Settings</Link>
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <p className="mt-1 text-muted">{intro}</p>}
      </div>
      {error && <ErrorBanner message={error} onRetry={onRetry} />}
      {loading && !error ? <p className="text-muted">Loading…</p> : !error && children}
    </section>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** "Now" for a rule that's working today, "Coming" for one that's planned. */
export function Badge({ live }: { live: boolean }) {
  return (
    <span className={`mr-2 inline-block rounded-full px-2 py-0.5 align-[1px] text-[11px] font-bold uppercase tracking-[0.06em] ${live ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
      {live ? 'Now' : 'Coming'}
    </span>
  );
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Each day of the week's time for cooking, in minutes, saved when a box is left. */
export function DayTimes({ minutes, onSave }: { minutes: Record<Weekday, number>; onSave: (m: Record<Weekday, number>) => void }) {
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

