import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { Member, Settings, WeekPattern } from '../../lib/types';
import { useAsync } from '../settings/useAsync';
import { WEEKDAYS } from '../../../supabase/functions/_shared/cookingTime.ts';
import { setPrepDay, usualChoices, type PlanChoices } from '../../../supabase/functions/_shared/planChoices.ts';
import { addDays } from '../../../supabase/functions/_shared/planner.ts';

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STEPS = [30, 45, 60, 90, 120];
const LIMITS = [20, 30, 45, 60];

const dayMonth = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
/** 60 → "1 hr", 90 → "1½ hr", 45 → "45 min". */
export const timeLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hr` : m % 60 === 30 ? `${(m - 30) / 60 || ''}½ hr` : `${m} min`);

/** The Claude app, asked to plan (or replan) a week; the choices are read from the plan request. */
export function planUrl(weekStart: string, replace: boolean, note: string | null): string {
  const when = dayMonth(weekStart, { weekday: 'short', day: 'numeric', month: 'short' });
  const ask = `${replace ? 'Replan' : 'Plan'} the week of ${when} (${weekStart}) for the Family Food Planner${replace ? ', replacing the draft' : ''}. My choices for the week are saved with the plan request.${note?.trim() ? ` Note: ${note.trim()}` : ''}`;
  return `https://claude.ai/new?q=${encodeURIComponent(ask)}`;
}

const chip = (on: boolean, tone: 'yolk' | 'evening' | 'teal' | 'accent') => {
  const onClass = { yolk: 'border-yolk bg-yolk-soft text-ink', evening: 'border-evening bg-evening-soft text-ink', teal: 'border-teal bg-teal-soft text-ink', accent: 'border-accent bg-accent text-accent-ink' }[tone];
  return `min-h-11 rounded-xl border text-sm font-semibold ${on ? onClass : 'border-line bg-surface text-muted'}`;
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="grid gap-0.5">
        <h2 className="m-0 text-[17px] font-bold">{title}</h2>
        {hint && <p className="m-0 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

interface Loaded { settings: Settings; adults: Member[]; pattern: WeekPattern[]; useUp: string[] }

/** Plan with Claude: the week's choices, filled in from the usual week, then the Claude app. */
export default function PlanChoicesScreen() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const [params] = useSearchParams();
  const week = params.get('week') ?? '';
  const replace = params.get('replace') === '1';
  const { data, error, loading, reload } = useAsync<Loaded>(async () => {
    const [settings, members, pattern, prepared, pantry] = await Promise.all([
      repo.getSettings(hid), repo.listMembers(hid), repo.getWeekPattern(), repo.listPrepared(hid).catch(() => []), repo.listPantry(hid).catch(() => []),
    ]);
    const useUp = [
      ...prepared.map((p) => `${p.name} (${p.portions} portion${p.portions === 1 ? '' : 's'}, ${p.location})`),
      ...pantry.filter((p) => !p.staple && p.location === 'fridge').map((p) => p.name),
    ].slice(0, 16);
    return { settings, adults: members.filter((m) => m.kind === 'adult'), pattern, useUp };
  }, [hid]);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return <p className="py-6">No week to plan. <Link to="/week">Back to the week</Link></p>;
  return (
    <section className="grid gap-3.5 py-4">
      <Link to="/week" className="justify-self-start font-semibold text-accent no-underline">‹ Week</Link>
      {loading && <p className="text-muted">Loading…</p>}
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {data && <Form hid={hid} week={week} replace={replace} data={data} />}
    </section>
  );
}

function Form({ hid, week, replace, data }: { hid: string; week: string; replace: boolean; data: Loaded }) {
  const navigate = useNavigate();
  const usual = useMemo(() => usualChoices(week, data.settings, data.adults, data.pattern), [week, data]);
  const [c, setC] = useState<PlanChoices>(usual);
  const [note, setNote] = useState('');
  const [makeUsual, setMakeUsual] = useState(false);
  const [phase, setPhase] = useState<'form' | 'saving' | 'blocked'>('form');
  const [failed, setFailed] = useState<string | null>(null);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const toggle = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort((a, b) => a - b));

  const officeChanges = data.adults.flatMap((a) => [0, 1, 2, 3, 4].filter((d) => c.office[a.id]?.includes(d) !== usual.office[a.id]?.includes(d))
    .map((d) => ({ memberId: a.id, weekday: d, office: !!c.office[a.id]?.includes(d) })));
  const changed = officeChanges.length
    + dates.filter((d) => c.cookingMinutes[d] !== usual.cookingMinutes[d]).length
    + [0, 1, 2, 3, 4, 5, 6].filter((d) => c.prepDays.includes(d) !== usual.prepDays.includes(d)).length
    + (c.weekdayMaxMin !== usual.weekdayMaxMin ? 1 : 0) + (c.newRecipes !== usual.newRecipes ? 1 : 0);
  const summary = [
    `${7 - c.nightsOff.length} dinners`,
    ...(c.newRecipes ? [`up to ${c.newRecipes} new`] : []),
    ...(c.prepDays.length ? [`prep ${c.prepDays.map((d) => SHORT[d]).join(' + ')}`] : []),
    ...(c.useUp.length ? [`using up ${c.useUp.length}`] : []),
    ...(changed ? [`${changed} changed from usual`] : []),
  ].join(' · ');
  const url = planUrl(week, replace, note);

  async function plan() {
    setPhase('saving');
    setFailed(null);
    try {
      if (makeUsual && changed) {
        const cooking = Object.fromEntries(WEEKDAYS.map((d, i) => [d, c.cookingMinutes[dates[i]]]));
        await repo.saveUsualWeek(hid, { ...data.settings, cooking_minutes: cooking, weekday_dinner_max_min: c.weekdayMaxMin, adventure: c.newRecipes, prep_days: c.prepDays }, officeChanges);
      }
      await repo.requestWeekPlan(hid, week, note.trim() || null, replace, c);
    } catch {
      setFailed("Couldn't save your choices. Check your connection and try again.");
      setPhase('form');
      return;
    }
    const tab = window.open(url, '_blank');
    if (!tab) { setPhase('blocked'); return; }
    tab.opener = null;
    navigate('/week');
  }

  if (phase === 'blocked') {
    return (
      <div className="grid justify-items-start gap-3 rounded-2xl bg-accent-soft p-4">
        <p className="m-0 font-semibold">Your choices are saved.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink no-underline">Open the Claude app</a>
        <Link to="/week" className="font-semibold text-accent">Back to the week</Link>
      </div>
    );
  }

  const last = dates[6];
  return (
    <>
      <div className="grid gap-1">
        <h1 className="m-0 text-[26px] font-bold">Plan with Claude</h1>
        <p className="m-0 text-muted">
          {dayMonth(week, { weekday: 'short', day: 'numeric' })} – {dayMonth(last, { weekday: 'short', day: 'numeric', month: 'short' })}.
          {' '}Your usual settings are filled in: change anything for this week.{replace ? ' Claude replaces the draft, including any changes you made to it.' : ''}
        </p>
      </div>

      <Section title="Office days" hint="Packed lunch, overnight oats and a quicker dinner.">
        {data.adults.map((a) => (
          <div key={a.id} role="group" aria-label={a.name} className="grid gap-1.5">
            <span className="text-sm font-semibold">{a.name}</span>
            <div className="grid grid-cols-5 gap-1.5">
              {SHORT.slice(0, 5).map((d, i) => {
                const on = !!c.office[a.id]?.includes(i);
                const differs = on !== !!usual.office[a.id]?.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} aria-label={d} className={`${chip(on, 'yolk')} grid place-items-center leading-tight`}
                    onClick={() => setC({ ...c, office: { ...c.office, [a.id]: toggle(c.office[a.id] ?? [], i) } })}>
                    <span>{d}</span>{differs && <span className="text-[10px]">this week</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Nights off" hint="Out, takeaway or eating at someone's: no dinner planned or bought.">
        <div role="group" aria-label="Nights off" className="grid grid-cols-7 gap-1">
          {SHORT.map((d, i) => {
            const on = c.nightsOff.includes(dates[i]);
            return (
              <button key={d} type="button" aria-pressed={on} className={chip(on, 'evening')}
                onClick={() => setC({ ...c, nightsOff: on ? c.nightsOff.filter((x) => x !== dates[i]) : [...c.nightsOff, dates[i]].sort() })}>{d}</button>
            );
          })}
        </div>
      </Section>

      <Section title="Time to cook each evening" hint="Tap a day to change it: 30 min, 45, 1 hr, 1½, 2 hrs.">
        <div role="group" aria-label="Time to cook each evening" className="grid grid-cols-7 gap-1">
          {dates.map((date, i) => {
            const m = c.cookingMinutes[date];
            const differs = m !== usual.cookingMinutes[date];
            const next = STEPS[(STEPS.indexOf(m) + 1) % STEPS.length];
            return (
              <button key={date} type="button" aria-label={`${LONG[i]}, ${timeLabel(m)} to cook`}
                className={`grid min-h-14 place-items-center rounded-xl border px-0 py-1 leading-tight ${differs ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
                onClick={() => setC({ ...c, cookingMinutes: { ...c.cookingMinutes, [date]: next } })}>
                <span className="text-xs font-semibold text-muted">{SHORT[i]}</span>
                <span className="text-sm font-bold">{timeLabel(m)}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Longer prep days" hint="Claude moves make-ahead work here: batch sauces, marinades, roasting a chicken, chopping for later nights. Picking a day gives it at least 2 hrs.">
        <div role="group" aria-label="Longer prep days" className="grid grid-cols-7 gap-1">
          {SHORT.map((d, i) => {
            const on = c.prepDays.includes(i);
            return <button key={d} type="button" aria-pressed={on} className={chip(on, 'teal')} onClick={() => setC(setPrepDay(c, usual, i, !on))}>{d}</button>;
          })}
        </div>
        <p className="m-0 text-sm text-muted">
          {c.prepDays.length ? `Prep on ${c.prepDays.map((d) => LONG[d]).join(' and ')} covers the nights after it.` : 'No longer prep day: each evening does its own prep.'}
        </p>
      </Section>

      <Section title="Weeknight dinners take at most" hint="Monday to Friday. Weekends have no limit.">
        <div role="group" aria-label="Weeknight dinners take at most" className="grid grid-cols-4 gap-1.5">
          {LIMITS.map((m) => (
            <button key={m} type="button" aria-pressed={c.weekdayMaxMin === m} className={chip(c.weekdayMaxMin === m, 'accent')}
              onClick={() => setC({ ...c, weekdayMaxMin: m })}>{m} min</button>
          ))}
        </div>
      </Section>

      <section className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid min-w-0 gap-0.5">
          <h2 className="m-0 text-[17px] font-bold">New recipes from Claude</h2>
          <p className="m-0 text-sm text-muted">{c.newRecipes ? `At most ${c.newRecipes} this week, flagged New to check.` : 'Only recipes you already have.'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Fewer new recipes" disabled={c.newRecipes <= 0} onClick={() => setC({ ...c, newRecipes: c.newRecipes - 1 })}
            className="h-11 w-11 rounded-xl border border-line bg-surface text-xl font-bold disabled:opacity-40">−</button>
          <span aria-live="polite" className="min-w-7 text-center text-xl font-bold">{c.newRecipes}</span>
          <button type="button" aria-label="More new recipes" disabled={c.newRecipes >= 7} onClick={() => setC({ ...c, newRecipes: c.newRecipes + 1 })}
            className="h-11 w-11 rounded-xl border border-line bg-surface text-xl font-bold disabled:opacity-40">+</button>
        </div>
      </section>

      {data.useUp.length > 0 && (
        <Section title="Use these up" hint="From your freezer and fridge. Tap the ones Claude should build dinners around.">
          <div role="group" aria-label="Use these up" className="flex flex-wrap gap-1.5">
            {data.useUp.map((u) => {
              const on = c.useUp.includes(u);
              return (
                <button key={u} type="button" aria-pressed={on} onClick={() => setC({ ...c, useUp: on ? c.useUp.filter((x) => x !== u) : [...c.useUp, u] })}
                  className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold ${on ? 'border-teal bg-teal-soft text-ink' : 'border-line bg-surface'}`}>
                  {on ? '✓ ' : ''}{u}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <section className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="plan-note" className="text-[17px] font-bold">Anything else?</label>
        <textarea id="plan-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2}
          placeholder="e.g. something lighter, guests on Saturday" className="rounded-xl border border-line bg-surface p-2.5 font-normal" />
      </section>

      {failed && <ErrorBanner message={failed} />}
      <div className="grid gap-2.5 pt-1">
        {changed > 0 && (
          <label className="flex min-h-11 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={makeUsual} onChange={(e) => setMakeUsual(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
            Make this week's changes my usual
          </label>
        )}
        <button type="button" disabled={phase === 'saving'} onClick={() => void plan()}
          className="min-h-[52px] rounded-2xl bg-accent font-bold text-accent-ink disabled:opacity-60">Plan with Claude</button>
        <p className="m-0 text-center text-sm text-muted">{summary}</p>
      </div>
    </>
  );
}
