import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';
import { useTimers } from '../../lib/cookTimers';
import { remaining } from '../../lib/timer';
import type { ChopGroup, HourStep } from '../../lib/todayHour';
import { useWakeLock } from '../../lib/wakeLock';
import { StepText } from '../recipes/MachineBadge';
import StepUses from '../recipes/StepUses';
import { todayInLondon, useTodayHour } from './useTodayHour';

const addMinutes = (hhmm: string, n: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + n;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const WHERE: Record<ChopGroup['where'], string> = { bowl: 'one bowl', tm7: 'one bowl (into the TM7)', box: 'a lidded box, into the fridge', fridge: 'check they are there' };

/** Today's hour: the plan for the evening's cooking hour, then one step at a time, with timers and the screen kept on. */
export default function TodayHour() {
  useWakeLock();
  const { data, error, loading, reload } = useTodayHour();
  const key = `today-hour:${todayInLondon()}`;
  const [index, setIndex] = useState<number>(() => { try { return Number(sessionStorage.getItem(key) ?? -1); } catch { return -1; } });
  useEffect(() => { try { sessionStorage.setItem(key, String(index)); } catch { /* private mode */ } }, [key, index]);
  const { timers, now, start, dismiss } = useTimers(key);
  const steps: (HourStep & { afterDinner?: boolean })[] = data ? [...data.plan.steps, ...data.plan.after.map((s) => ({ ...s, afterDinner: true }))] : [];
  // A plan that changed since (a swapped dinner) can be shorter: come back to its last step, not past it.
  useEffect(() => { if (data && index > steps.length - 1) setIndex(steps.length - 1); }, [data, index, steps.length]);
  const step = index >= 0 ? steps[Math.min(index, steps.length - 1)] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-4 overflow-auto bg-lcd p-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-[calc(16px+env(safe-area-inset-bottom,0px))] text-white md:p-8">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <b className="text-lg">Today's hour{step ? ` · ${Math.min(index, steps.length - 1) + 1} of ${steps.length}` : ''}</b>
        <Link to="/week" aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl text-white no-underline">×</Link>
      </div>

      {timers.length > 0 && (
        <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-2">
          {timers.map((t) => (
            <span key={t.key} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ${t.done ? 'bg-lcd-ink text-[#0A0E0B]' : 'bg-white/10 text-white'}`}>
              <span className="font-semibold">{t.label}</span>
              <span role="timer" aria-label={`${t.label} timer`} className="font-mono tabular-nums">{t.done ? 'done' : remaining(t.endAt, now)}</span>
              <button type="button" onClick={() => dismiss(t.key)} aria-label={`Clear ${t.label} timer`} className="opacity-70">×</button>
            </span>
          ))}
        </div>
      )}
      <div role="status" className="sr-only">{timers.filter((t) => t.done).map((t) => `${t.label}: done`).join('. ')}</div>

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <p className="text-[#9AA89F]">Loading…</p>}

      {data && !step && (() => {
        const { input, plan } = data;
        return (
          <section className="mx-auto grid w-full max-w-3xl content-start gap-4">
            <h1 className="m-0 text-[clamp(26px,3.6vw,38px)] font-bold">Today's hour · {input.start}–{addMinutes(input.start, input.minutes)}</h1>
            <p className="m-0 text-lg text-[#C9D3CC]">{input.tonight ? `Tonight: ${input.tonight.recipe.title}` : 'No dinner to cook tonight'}</p>
            <p className="m-0 text-[#C9D3CC]">{plan.handsOn} minutes hands-on</p>
            {plan.warnings.map((w) => <p key={w} className="m-0 rounded-xl bg-[#3A2A12] px-3 py-2 text-[#FFD9A0]">{w}</p>)}
            {plan.chop.length > 0 && (
              <section aria-label="Chopping" className="grid gap-3 rounded-2xl bg-white/5 p-4">
                <h2 className="m-0 text-sm font-bold uppercase tracking-[0.08em] text-lcd-ink">Chop first, all in one go</h2>
                {plan.chop.map((g, i) => (
                  <div key={`${g.label}-${i}`} className="grid gap-1">
                    <b>{g.label}</b>
                    <span className="text-sm text-[#9AA89F]">{g.raw ? 'Raw: last, on its own mat · ' : ''}{WHERE[g.where]}</span>
                    <ul className="m-0 grid list-none gap-0.5 p-0 text-[#DDE5DF]">
                      {g.items.map((it) => <li key={it.name}>{[it.qty, it.name].filter(Boolean).join(' ')}{it.note ? `, ${it.note}` : ''}</li>)}
                    </ul>
                  </div>
                ))}
              </section>
            )}
            {plan.toWash.length > 0 && <p className="m-0 text-[#C9D3CC]">To wash: {plan.toWash.join(', ')}. One dishwasher load.</p>}
            {steps.length > 0 && (
              <button type="button" onClick={() => setIndex(0)} className="justify-self-start rounded-xl bg-lcd-ink px-8 py-3.5 text-lg font-semibold text-[#0A0E0B]">Start</button>
            )}
          </section>
        );
      })()}

      {step && (() => {
        const tkey = `${index}|${step.title}`;
        const running = timers.find((t) => t.key === tkey);
        return (
          <section aria-label={`Step ${Math.min(index, steps.length - 1) + 1} of ${steps.length}`} className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-3">
            {step.afterDinner
              ? <span className="text-sm font-bold uppercase tracking-[0.08em] text-lcd-ink">After dinner</span>
              : <span className="font-mono text-5xl font-bold tabular-nums">{step.at}<span className="ml-2 text-xl text-[#9AA89F]">to {step.end}</span></span>}
            <h1 className="m-0 text-[clamp(24px,3.4vw,36px)] font-bold leading-tight">{step.title}</h1>
            {step.kit && <span className="text-lg text-[#C9D3CC]">{step.kit}</span>}
            {step.kind === 'chop' && data ? (
              <ul className="m-0 grid list-none gap-2 p-0 text-[clamp(18px,2.4vw,24px)] text-[#DDE5DF]">
                {data.plan.chop.filter((g) => g.where !== 'fridge').map((g, i) => <li key={i}><b className="text-white">{g.label}</b>{g.raw ? ' (last, on its own mat)' : ''}: {g.items.map((it) => it.name).join(', ')}</li>)}
              </ul>
            ) : (
              <p className="m-0 text-[clamp(19px,2.6vw,26px)] leading-snug text-[#DDE5DF] [&_b]:text-white"><StepText text={step.body} /></p>
            )}
            {step.ingredients.length > 0 && <StepUses body={step.body} ingredients={step.ingredients} factor={step.factor} />}
            {(step.timer ?? 0) >= 2 && (running ? (
              <span aria-hidden="true" className="font-mono text-5xl tabular-nums">{running.done ? 'Done' : remaining(running.endAt, now)}</span>
            ) : (
              <button type="button" onClick={() => start(tkey, step.title, step.timer!)} className="self-start rounded-xl bg-white/10 px-5 py-3 text-base font-semibold text-white">
                Start {step.timer}-min timer
              </button>
            ))}
          </section>
        );
      })()}

      {step && (
        <div className="mx-auto flex w-full max-w-3xl justify-between gap-3">
          <button type="button" onClick={() => setIndex((i) => i - 1)}
            className="rounded-xl bg-white/10 px-6 py-3.5 text-base font-semibold text-white">Back</button>
          {index < steps.length - 1
            ? <button type="button" onClick={() => setIndex((i) => i + 1)} className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B]">Next</button>
            : <Link to="/week" className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B] no-underline">Done</Link>}
        </div>
      )}
    </div>
  );
}
