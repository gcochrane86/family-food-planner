import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { useTimers } from '../../lib/cookTimers';
import { repo } from '../../lib/repo';
import { planRoast, type RoastPartRecipe } from '../../lib/roast';
import { choiceFromQuery, parseRoastPart, roastQuery } from '../../lib/roastModel';
import { remaining } from '../../lib/timer';
import type { Recipe, RecipeStep } from '../../lib/types';
import { useWakeLock } from '../../lib/wakeLock';
import { useAsync } from '../settings/useAsync';
import HeroImage from './HeroImage';
import { StepText } from './MachineBadge';

const CHRISTMAS_PHASE: Record<string, string> = {
  'Two days before': '23 December', 'Day before': 'Christmas Eve', 'Morning prep': 'Christmas morning', 'Out and about': 'Late morning',
};

/** Cook view for a roast: the plan one step at a time, in time order, with what to do (from each part's recipe),
 *  a timer for each step, and the screen kept on. */
export default function RoastCook() {
  useWakeLock();
  const { householdId } = useAuth();
  const hid = householdId!;
  const [params] = useSearchParams();
  const choice = useMemo(() => choiceFromQuery(params), [params]);
  const prepAt = params.get('prep') ?? '08:45';
  const { data, error, loading, reload } = useAsync(async () => {
    const recipes = await repo.listRecipes(hid);
    const parts = new Map(recipes.filter((r: Recipe) => parseRoastPart(r.roast)).map((r: Recipe) => [r.slug, r as RoastPartRecipe & Recipe]));
    const plan = choice ? planRoast({ ...choice, prepAt }, parts) : null;
    // Each part's own recipe steps, for what to do at each roast step (matched by title).
    const used = [...new Set(plan?.phases.flatMap((ph) => ph.steps.map((s) => s.recipeId)) ?? [])];
    const details = await Promise.all(used.map((id) => repo.getRecipe(id).catch(() => null)));
    const how = new Map<string, RecipeStep>();
    for (const d of details) for (const st of d?.steps ?? []) how.set(`${d!.id}|${st.title.toLowerCase()}`, st);
    return { parts, plan, how };
  }, [hid, choice, prepAt]);
  const steps = useMemo(() => data?.plan?.phases.flatMap((ph) => ph.steps) ?? [], [data]);
  const key = `roast-cook:${params.toString()}`;
  const [index, setIndex] = useState(() => { try { return Number(sessionStorage.getItem(key) ?? 0) || 0; } catch { return 0; } });
  useEffect(() => { try { sessionStorage.setItem(key, String(index)); } catch { /* private mode */ } }, [key, index]);
  const { timers, now, start, dismiss } = useTimers(key);
  const step = steps[Math.min(index, Math.max(0, steps.length - 1))];
  const back = choice ? `/recipes/roast?${roastQuery(choice, prepAt)}` : '/recipes/roast';
  const christmas = choice?.occasion === 'christmas';
  const phase = (n: string) => (christmas ? CHRISTMAS_PHASE[n] ?? n : n);

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-4 overflow-auto bg-lcd p-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-[calc(16px+env(safe-area-inset-bottom,0px))] text-white md:p-8">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <b className="text-lg">{christmas ? 'Christmas dinner' : 'Sunday roast'}{steps.length ? ` · ${Math.min(index, steps.length - 1) + 1} of ${steps.length}` : ''}</b>
        <Link to={back} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl text-white no-underline">×</Link>
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
      {data && !step && <p>Nothing to cook in this plan. <Link to={back} className="text-lcd-ink">Back to the builder</Link></p>}

      {step && (() => {
        const label = `${step.partTitle}: ${step.title}`;
        const how = data!.how.get(`${step.recipeId}|${step.title.toLowerCase()}`);
        const part = data!.parts.get(step.part);
        const tkey = `${step.part}|${step.title}`;
        const running = timers.find((t) => t.key === tkey);
        return (
          <section aria-label={`Step ${Math.min(index, steps.length - 1) + 1} of ${steps.length}`} className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-3 md:grid-cols-[minmax(0,1fr)_260px] md:gap-6">
            <div className="grid content-start gap-3">
              <span className="text-sm font-bold uppercase tracking-[0.08em] text-lcd-ink">{phase(step.phase)}</span>
              <span className="font-mono text-5xl font-bold tabular-nums">{step.time}<span className="ml-2 text-xl text-[#9AA89F]">to {step.end}</span></span>
              <h1 className="m-0 text-[clamp(24px,3.4vw,36px)] font-bold leading-tight">{label}</h1>
              {step.kit && <span className="text-lg text-[#C9D3CC]">{step.kit}{step.trays ? ` · ${step.trays} shel${step.trays === 1 ? 'f' : 'ves'}` : ''}</span>}
              {how?.body && <p className="m-0 text-[clamp(19px,2.6vw,26px)] leading-snug text-[#DDE5DF] [&_b]:text-white"><StepText text={how.body} /></p>}
              {step.minutes >= 2 && (running ? (
                <span aria-hidden="true" className="font-mono text-5xl tabular-nums">{running.done ? 'Done' : remaining(running.endAt, now)}</span>
              ) : (
                <button type="button" onClick={() => start(tkey, label, step.minutes)} className="self-start rounded-xl bg-white/10 px-5 py-3 text-base font-semibold text-white">
                  Start {step.minutes}-min timer
                </button>
              ))}
            </div>
            {part && <HeroImage recipe={part} className="aspect-[4/3] w-full rounded-2xl" />}
          </section>
        );
      })()}

      {step && (
        <div className="mx-auto flex w-full max-w-3xl justify-between gap-3">
          <button type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-xl bg-white/10 px-6 py-3.5 text-base font-semibold text-white disabled:opacity-35">Back</button>
          {index < steps.length - 1
            ? <button type="button" onClick={() => setIndex((i) => i + 1)} className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B]">Next</button>
            : <Link to={back} className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B] no-underline">Done</Link>}
        </div>
      )}
    </div>
  );
}
