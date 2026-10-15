import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { WeekPattern as Pattern } from '../../lib/types';
import { card, Page } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekPattern() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(
    async () => {
      const [members, pattern] = await Promise.all([repo.listMembers(hid), repo.getWeekPattern()]);
      return { members: members.filter((m) => m.kind === 'adult'), pattern };
    },
    [hid],
  );
  const [banner, setBanner] = useState<string | null>(null);

  const isOffice = (memberId: string, weekday: number) =>
    !!data?.pattern.find((p) => p.member_id === memberId && p.weekday === weekday)?.office;

  async function toggle(memberId: string, weekday: number) {
    if (!data) return;
    const office = !isOffice(memberId, weekday);
    const before = data.pattern;
    const next: Pattern[] = [...before.filter((p) => !(p.member_id === memberId && p.weekday === weekday)), { member_id: memberId, weekday, office }];
    setData({ ...data, pattern: next });
    setBanner(null);
    try {
      await repo.setOffice(memberId, weekday, office);
    } catch {
      setData((d) => (d ? { ...d, pattern: before } : d));
      setBanner(SAVE_ERROR);
    }
  }

  return (
    <Page title="Office days" intro="Office days get a packed lunch and a quick dinner. Days that change week to week are asked about when you plan."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      {data?.members.map((m) => (
        <div key={m.id} role="group" aria-label={m.name} className={`${card} grid gap-3 p-4`}>
          <p className="font-semibold">{m.name}</p>
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((d, i) => {
              const on = isOffice(m.id, i);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => void toggle(m.id, i)}
                  className={`rounded-xl border py-2.5 text-sm font-semibold ${on ? 'border-yolk bg-yolk-soft text-yolk' : 'border-line bg-surface text-muted'}`}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Page>
  );
}
