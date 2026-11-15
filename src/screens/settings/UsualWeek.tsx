import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { Settings, WeekPattern } from '../../lib/types';
import { weekdayMinutes } from '../../../supabase/functions/_shared/cookingTime.ts';
import { card, DayTimes, Page } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LIMITS = [20, 30, 45, 60];
const chip = (on: boolean) =>
  `min-h-11 rounded-xl border text-sm font-semibold ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted'}`;

/** The usual week: what Plan with Claude fills in, and what the Friday-evening plan uses. */
export default function UsualWeek() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(
    async () => {
      const [members, pattern, settings] = await Promise.all([repo.listMembers(hid), repo.getWeekPattern(), repo.getSettings(hid)]);
      return { adults: members.filter((m) => m.kind === 'adult'), pattern, settings };
    },
    [hid],
  );
  const [banner, setBanner] = useState<string | null>(null);

  const isOffice = (memberId: string, weekday: number) =>
    !!data?.pattern.find((p) => p.member_id === memberId && p.weekday === weekday)?.office;

  async function toggleOffice(memberId: string, weekday: number) {
    if (!data) return;
    const office = !isOffice(memberId, weekday);
    const before = data.pattern;
    const next: WeekPattern[] = [...before.filter((p) => !(p.member_id === memberId && p.weekday === weekday)), { member_id: memberId, weekday, office }];
    setData({ ...data, pattern: next });
    setBanner(null);
    try { await repo.setOffice(memberId, weekday, office); } catch {
      setData((d) => (d ? { ...d, pattern: before } : d));
      setBanner(SAVE_ERROR);
    }
  }

  async function save(change: Partial<Settings>) {
    if (!data) return;
    const before = data.settings;
    const settings = { ...before, ...change };
    setBanner(null);
    setData({ ...data, settings });
    try { await repo.saveSettings(hid, settings); } catch {
      setData((d) => (d ? { ...d, settings: before } : d));
      setBanner(SAVE_ERROR);
    }
  }

  const s = data?.settings;
  const prep = s?.prep_days ?? [];
  return (
    <Page title="Usual week" intro="Plan with Claude starts from these, and you can change any of them for one week there. The Friday-evening plan uses them as they are."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      {data && s && (
        <>
          <section className={`${card} grid gap-3 p-4`}>
            <h2 className="m-0 text-lg font-bold">Office days</h2>
            <p className="m-0 text-sm text-muted">Packed lunch, overnight oats and a quicker dinner.</p>
            {data.adults.map((m) => (
              <div key={m.id} role="group" aria-label={m.name} className="grid gap-1.5">
                <p className="m-0 font-semibold">{m.name}</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {DAYS.slice(0, 5).map((d, i) => {
                    const on = isOffice(m.id, i);
                    return <button key={d} type="button" aria-pressed={on} onClick={() => void toggleOffice(m.id, i)} className={chip(on)}>{d}</button>;
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className={`${card} grid gap-3 p-4`}>
            <h2 className="m-0 text-lg font-bold">Longer prep days</h2>
            <p className="m-0 text-sm text-muted">Claude moves make-ahead work onto these days: batch sauces, marinades, roasting a chicken.</p>
            <div role="group" aria-label="Longer prep days" className="grid grid-cols-7 gap-1">
              {DAYS.map((d, i) => {
                const on = prep.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} className={chip(on)}
                    onClick={() => void save({ prep_days: on ? prep.filter((x) => x !== i) : [...prep, i].sort((a, b) => a - b) })}>{d}</button>
                );
              })}
            </div>
          </section>

          <section className={`${card} grid gap-3 p-4`}>
            <h2 className="m-0 text-lg font-bold">Time to cook each evening</h2>
            <p className="m-0 text-sm text-muted">Roughly how long each day has for the dinner, the next day's prep and anything made ahead.</p>
            <DayTimes minutes={weekdayMinutes(s)} onSave={(m) => void save({ cooking_minutes: m })} />
          </section>

          <section className={`${card} grid gap-3 p-4`}>
            <h2 className="m-0 text-lg font-bold">Weeknight dinners take at most</h2>
            <p className="m-0 text-sm text-muted">Monday to Friday. Weekends have no limit.</p>
            <div role="group" aria-label="Weeknight dinners take at most" className="grid auto-cols-fr grid-flow-col gap-1.5">
              {[...new Set([...LIMITS, s.weekday_dinner_max_min])].sort((a, b) => a - b).map((m) => {
                const on = s.weekday_dinner_max_min === m;
                return <button key={m} type="button" aria-pressed={on} className={chip(on)} onClick={() => void save({ weekday_dinner_max_min: m })}>{m} min</button>;
              })}
            </div>
          </section>

          <section className={`${card} flex items-center justify-between gap-3 p-4`}>
            <div className="grid gap-1">
              <h2 className="m-0 text-lg font-bold">New recipes from Claude</h2>
              <p className="m-0 text-sm text-muted">At most this many a week, flagged New to check.</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Fewer new recipes" disabled={s.adventure <= 0} onClick={() => void save({ adventure: s.adventure - 1 })}
                className="h-11 w-11 rounded-xl border border-line bg-surface text-xl font-bold disabled:opacity-40">−</button>
              <span aria-live="polite" className="min-w-7 text-center text-xl font-bold">{s.adventure}</span>
              <button type="button" aria-label="More new recipes" disabled={s.adventure >= 7} onClick={() => void save({ adventure: s.adventure + 1 })}
                className="h-11 w-11 rounded-xl border border-line bg-surface text-xl font-bold disabled:opacity-40">+</button>
            </div>
          </section>
        </>
      )}
    </Page>
  );
}
