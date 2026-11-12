import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import StoredPhoto from '../../components/StoredPhoto';
import { PHOTO_LARGE } from '../../lib/photoSizes';
import { makeStepPhotos } from '../../lib/stepPhotos';
import { repo } from '../../lib/repo';
import { resizeImage } from '../../lib/image';
import type { ChopGroup, HourInput, HourPlan, HourStep } from '../../lib/todayHour';
import type { RecipeDetail } from '../../lib/types';
import { photoCost } from '../recipes/RecipeCard';
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
  const { householdId } = useAuth();
  const { data, error, loading, reload } = useTodayHour();
  const key = `today-hour:${todayInLondon()}`;
  const [index, setIndex] = useState<number>(() => { try { return Number(sessionStorage.getItem(key) ?? -1); } catch { return -1; } });
  useEffect(() => { try { sessionStorage.setItem(key, String(index)); } catch { /* private mode */ } }, [key, index]);
  const [photos, setPhotos] = useState<{ done: number; total: number; finished?: boolean; error?: string } | null>(null);
  const steps: (HourStep & { afterDinner?: boolean })[] = data ? [...data.plan.steps, ...data.plan.after.map((s) => ({ ...s, afterDinner: true }))] : [];
  // A plan that changed since (a swapped dinner) can be shorter: come back to its last step, not past it.
  useEffect(() => { if (data && index > steps.length - 1) setIndex(steps.length - 1); }, [data, index, steps.length]);
  const step = index >= 0 ? steps[Math.min(index, steps.length - 1)] : undefined;

  /** Remakes a chopping photo, or saves your own, then shows it (everywhere that cut is used). */
  async function fixPrep(run: () => Promise<unknown>) {
    try { await run(); reload(); } catch (e) { setPhotos({ done: 0, total: 0, error: `Couldn't change that photo: ${e instanceof Error ? e.message : String(e)}` }); }
  }

  /** Makes the missing step photos for the hour's recipes, one at a time, then shows them. */
  async function addPhotos(recipes: RecipeDetail[], prep: HourPlan['prepMissing']) {
    const total = prep.length + recipes.reduce((n, r) => n + photosNeeded(r), 0);
    let before = 0;
    setPhotos({ done: 0, total });
    // The chopping-board photos first: one per cut, reused by every recipe that cuts it the same way.
    for (const c of prep) {
      try { await repo.generatePrepPhoto(householdId!, c.name, c.note); } catch (e) { setPhotos({ done: before, total, error: `Couldn't make the chopping photo for ${c.label}: ${e instanceof Error ? e.message : String(e)}` }); return; }
      before += 1;
      setPhotos({ done: before, total });
    }
    for (const r of recipes) {
      // Step photos are made in the style of the main photo, so a recipe without one gets it first.
      if (!r.hero_image_path) {
        try { await repo.generateHero(r.id); } catch (e) { setPhotos({ done: before, total, error: `Couldn't make the main photo for ${r.title}: ${e instanceof Error ? e.message : String(e)}` }); return; }
        before += 1;
        setPhotos({ done: before, total });
      }
      const result = await makeStepPhotos(r.id, r.steps, (done) => setPhotos({ done: before + done, total }), { asked: true });
      before += result.made;
      if (result.error) { setPhotos({ done: before, total, error: `Couldn't make step photos: ${result.error}` }); return; }
    }
    setPhotos({ done: before, total, finished: true });
    reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-4 overflow-auto bg-lcd p-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-[calc(16px+env(safe-area-inset-bottom,0px))] text-white md:p-8">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <b className="text-lg">Today's hour{step ? ` · ${Math.min(index, steps.length - 1) + 1} of ${steps.length}` : ''}</b>
        <Link to="/week" aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl text-white no-underline">×</Link>
      </div>


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
            <MissingPhotos recipes={hourRecipes(input)} prep={plan.prepMissing} state={photos} onStart={(rs) => void addPhotos(rs, plan.prepMissing)} />
            {steps.length > 0 && (
              <button type="button" onClick={() => setIndex(0)} className="justify-self-start rounded-xl bg-lcd-ink px-8 py-3.5 text-lg font-semibold text-[#0A0E0B]">Start</button>
            )}
          </section>
        );
      })()}

      {step && (() => {
        return (
          <section aria-label={`Step ${Math.min(index, steps.length - 1) + 1} of ${steps.length}`} className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-3">
            {step.afterDinner
              ? <span className="text-sm font-bold uppercase tracking-[0.08em] text-lcd-ink">After dinner</span>
              : <span className="font-mono text-5xl font-bold tabular-nums">{step.at}<span className="ml-2 text-xl text-[#9AA89F]">to {step.end}</span></span>}
            <h1 className="m-0 text-[clamp(24px,3.4vw,36px)] font-bold leading-tight">{step.title}</h1>
            <StepPictures step={step} onRemake={(p) => void fixPrep(() => repo.generatePrepPhoto(householdId!, p.name, p.note, true))}
              onOwn={(p, file) => void fixPrep(async () => repo.uploadPrepPhoto(householdId!, p.key, p.label, await resizeImage(file, 1600)))} />
            {step.kit && <span className="text-lg text-[#C9D3CC]">{step.kit}</span>}
            {step.kind === 'chop' && data ? (
              <ul className="m-0 grid list-none gap-2 p-0 text-[clamp(18px,2.4vw,24px)] text-[#DDE5DF]">
                {data.plan.chop.filter((g) => g.where !== 'fridge').map((g, i) => <li key={i}><b className="text-white">{g.label}</b>{g.raw ? ' (last, on its own mat)' : ''}: {g.items.map((it) => it.name).join(', ')}</li>)}
              </ul>
            ) : (
              <p className="m-0 text-[clamp(19px,2.6vw,26px)] leading-snug text-[#DDE5DF] [&_b]:text-white"><StepText text={step.body} /></p>
            )}
            {step.ingredients.length > 0 && <StepUses body={step.body} ingredients={step.ingredients} factor={step.factor} />}
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

/** The recipes cooked or prepared in the hour. */
function hourRecipes(input: HourInput): RecipeDetail[] {
  const lunch = input.tomorrow?.lunch;
  const all = [input.tonight?.recipe, input.tomorrow?.dinner?.recipe, input.tomorrow?.breakfast?.recipe, lunch?.kind === 'make' ? lunch.recipe : undefined];
  return all.filter((r): r is RecipeDetail => !!r).filter((r, i, rs) => rs.findIndex((x) => x.id === r.id) === i);
}
const missing = (r: RecipeDetail) => r.steps.filter((s) => s.id && !s.image_path).length;
/** The photos a recipe needs: its missing step photos, and its main photo first if it has none. */
const photosNeeded = (r: RecipeDetail) => missing(r) + (missing(r) > 0 && !r.hero_image_path ? 1 : 0);

/** "Add step photos" for the hour's recipes, and how it's getting on. */
function MissingPhotos({ recipes, prep, state, onStart }: { recipes: RecipeDetail[]; prep: HourPlan['prepMissing']; state: { done: number; total: number; finished?: boolean; error?: string } | null; onStart: (rs: RecipeDetail[]) => void }) {
  const n = prep.length + recipes.reduce((t, r) => t + photosNeeded(r), 0);
  if (state?.error) return <p className="m-0 rounded-xl bg-[#3A2A12] px-3 py-2 text-[#FFD9A0]">{state.error}</p>;
  if (state?.finished) return <p className="m-0 text-[#C9D3CC]">Step photos made ({state.done}).</p>;
  if (state) return <p role="status" className="m-0 text-[#C9D3CC]">Making step photos: {state.done} of {state.total}… (you can carry on)</p>;
  if (!n) return null;
  return (
    <button type="button" onClick={() => onStart(recipes.filter((r) => missing(r) > 0))} className="justify-self-start rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">
      Add step photos ✨ ({n} photos, about {photoCost(n)})
    </button>
  );
}

/** A step's pictures: one large photo, a strip for the chopping, or an icon for cleaning. */
type Prep = NonNullable<HourStep['photos'][number]['prep']>;
function StepPictures({ step, onRemake, onOwn }: { step: HourStep; onRemake: (p: Prep) => void; onOwn: (p: Prep, file: File) => void }) {
  if (!step.photos.length) return step.kind === 'clean' ? <span role="img" aria-label="Cleaning" className="text-5xl">🧽</span> : null;
  if (step.photos.length > 1 || step.photos.some((p) => p.prep)) {
    return (
      <div className="flex gap-2 overflow-x-auto">
        {step.photos.map((p) => (
          <figure key={p.path} className="m-0 grid shrink-0 gap-1">
            <StoredPhoto path={p.path} width={PHOTO_LARGE} alt={p.alt} className="h-28 w-40 rounded-xl object-cover md:h-36 md:w-52" />
            {p.prep && (
              <figcaption className="flex items-center gap-2 text-xs text-[#9AA89F]">
                <span className="min-w-0 flex-1 truncate">{p.prep.label}</span>
                <button type="button" aria-label={`Remake ${p.prep.label}`} onClick={() => onRemake(p.prep!)} className="underline">Remake</button>
                <label className="cursor-pointer underline">Mine
                  <input type="file" accept="image/*" className="sr-only" aria-label={`Use my photo for ${p.prep.label}`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onOwn(p.prep!, f); }} />
                </label>
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    );
  }
  const [p] = step.photos;
  return <StoredPhoto path={p.path} width={PHOTO_LARGE} alt={p.alt} className="aspect-[4/3] w-full max-h-72 rounded-2xl object-cover" />;
}
