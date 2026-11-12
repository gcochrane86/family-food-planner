import { useEffect, useState } from 'react';
import ProgressLine from '../../components/ProgressLine';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import PhotoFrame from '../../components/PhotoFrame';
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
  const [menu, setMenu] = useState<Held | null>(null);
  // A photo being made or saved in the background, shown as a bar along the bottom until it's done.
  const [working, setWorking] = useState<{ label: string; error?: string } | null>(null);
  const [photos, setPhotos] = useState<{ done: number; total: number; finished?: boolean; error?: string } | null>(null);
  const steps: (HourStep & { afterDinner?: boolean })[] = data ? [...data.plan.steps, ...data.plan.after.map((s) => ({ ...s, afterDinner: true }))] : [];
  // A plan that changed since (a swapped dinner) can be shorter: come back to its last step, not past it.
  useEffect(() => { if (data && index > steps.length - 1) setIndex(steps.length - 1); }, [data, index, steps.length]);
  const step = index >= 0 ? steps[Math.min(index, steps.length - 1)] : undefined;

  /** Remakes a chopping photo, or saves your own, then shows it (everywhere that cut is used). */
  async function fixPrep(label: string, run: () => Promise<unknown>) {
    setWorking({ label });
    try { await run(); reload(); setWorking(null); } catch (e) { setWorking({ label, error: `Couldn't change that photo: ${e instanceof Error ? e.message : String(e)}` }); }
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
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 md:max-w-6xl">
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
          <section aria-label={`Step ${Math.min(index, steps.length - 1) + 1} of ${steps.length}`}
            className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-5 md:max-w-6xl md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-start md:gap-10">
            <div className="grid content-start gap-3">
            {step.afterDinner
              ? <span className="text-sm font-bold uppercase tracking-[0.08em] text-lcd-ink">After dinner</span>
              : <span className="font-mono text-5xl font-bold tabular-nums">{step.at}<span className="ml-2 text-xl text-[#9AA89F]">to {step.end}</span></span>}
            <h1 className="m-0 text-[clamp(24px,3.4vw,36px)] font-bold leading-tight">{step.title}</h1>
            {step.kit && <span className="text-lg text-[#C9D3CC]">{step.kit}</span>}
            {step.kind === 'chop' && data ? (
              <div className="grid gap-4">
                {data.plan.chop.filter((g) => g.where !== 'fridge').map((g, i) => (
                  <div key={i} className="grid gap-1.5">
                    <b className="text-[clamp(17px,2.2vw,22px)] text-white">{g.label}{g.raw ? ' · last, on its own mat' : ''}</b>
                    <ul className="m-0 grid list-none gap-1.5 p-0">
                      {g.items.map((it) => (
                        <li key={it.name} className="grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-3 rounded-xl bg-white/5 px-3 py-2 text-[clamp(17px,2.2vw,22px)]">
                          <span className="font-mono font-bold text-lcd-ink tabular-nums">{it.qty}</span>
                          <span className="text-[#DDE5DF]">{it.name}{it.note && <span className="text-[#9AA89F]"> · {it.note}</span>}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[clamp(19px,2.6vw,26px)] leading-snug text-[#DDE5DF] [&_b]:text-white"><StepText text={step.body} /></p>
            )}
            {step.ingredients.length > 0 && <StepUses body={step.body} ingredients={step.ingredients} factor={step.factor} />}
            </div>
            <StepPictures step={step} onHold={setMenu} />
          </section>
        );
      })()}

      {step && (
        <div className="mx-auto flex w-full max-w-3xl justify-between gap-3 md:max-w-6xl">
          <button type="button" onClick={() => setIndex((i) => i - 1)}
            className="rounded-xl bg-white/10 px-6 py-3.5 text-base font-semibold text-white">Back</button>
          {index < steps.length - 1
            ? <button type="button" onClick={() => setIndex((i) => i + 1)} className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B]">Next</button>
            : <Link to="/week" className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B] no-underline">Done</Link>}
        </div>
      )}
      {menu?.prep && (() => { const p = menu.prep; return (
        <PhotoOptions title={p.label} note="Changes this photo wherever this cut is used." onClose={() => setMenu(null)}
          onRemake={(hint) => void fixPrep('Making a new photo', () => repo.generatePrepPhoto(householdId!, p.name, p.note, true, hint || undefined))}
          onOwn={(file) => void fixPrep('Saving your photo', async () => repo.uploadPrepPhoto(householdId!, p.key, p.label, await resizeImage(file, 1600)))} />); })()}
      {menu?.step && (() => { const st = menu.step; return (
        <PhotoOptions title={st.title} note="Gives this step its own photo, in cook mode too." onClose={() => setMenu(null)}
          onRemake={(hint) => void fixPrep('Making a new photo', () => repo.generateStepPhoto(st.recipeId, st.stepId, st.has, true, { ...(hint ? { hint } : {}), ...(st.own ? { replaceOwn: true } : {}) }))}
          onOwn={(file) => void fixPrep('Saving your photo', async () => repo.uploadStepPhoto(householdId!, st.stepId, await resizeImage(file, 1600)))} />); })()}
      {working && <Working label={working.label} error={working.error} onClose={() => setWorking(null)} />}
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
  if (state) return (
    <div role="status" aria-label="Making step photos" className="grid gap-2 text-[#C9D3CC]">
      <span>Making step photos: {state.done} of {state.total}… (you can carry on)</span>
      <ProgressLine />
    </div>
  );
  if (!n) return null;
  return (
    <button type="button" onClick={() => onStart(recipes.filter((r) => missing(r) > 0))} className="justify-self-start rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">
      Add step photos ✨ ({n} photos, about {photoCost(n)})
    </button>
  );
}

/** A step's pictures: one large photo, a strip for the chopping, or an icon for cleaning. */
type Prep = NonNullable<HourStep['photos'][number]['prep']>;
type Held = { prep?: Prep; step?: NonNullable<HourStep['photos'][number]['step']> };
function StepPictures({ step, onHold }: { step: HourStep; onHold: (h: Held) => void }) {
  if (!step.photos.length) return step.kind === 'clean' ? <span role="img" aria-label="Cleaning" className="text-6xl">🧽</span> : null;
  return <PhotoFrame photos={step.photos.map((p) => ({ path: p.path, alt: p.alt, caption: p.prep?.label,
    onHold: p.prep ? () => onHold({ prep: p.prep }) : p.step ? () => onHold({ step: p.step }) : undefined }))} />;
}

/** A chopping photo's options, opened by holding it: a new photo, or your own, for that cut everywhere. */
function PhotoOptions({ title, note, onRemake, onOwn, onClose }: { title: string; note: string; onRemake: (hint: string) => void; onOwn: (file: File) => void; onClose: () => void }) {
  const item = 'block w-full rounded-xl bg-white/10 px-4 py-3 text-left text-base font-semibold text-white';
  const [asking, setAsking] = useState(false);
  const [hint, setHint] = useState('');
  return (
    <div className="fixed inset-0 z-[60] grid items-end justify-items-center bg-black/50 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="grid w-full max-w-md gap-2 rounded-t-3xl bg-[#121814] p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] text-white md:rounded-3xl">
        <p className="m-0 mb-1 font-bold">{title}</p>
        <p className="m-0 mb-2 text-sm text-[#9AA89F]">{note}</p>
        {asking ? (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); onClose(); onRemake(hint.trim()); }}>
            <label className="grid gap-1 text-sm text-[#C9D3CC]">What should it show? (optional)
              <input autoFocus value={hint} maxLength={200} onChange={(e) => setHint(e.target.value)} placeholder="e.g. bigger chunks, skins on"
                className="rounded-xl bg-white/10 px-3 py-2.5 text-base text-white placeholder:text-[#7C887F]" />
            </label>
            <button type="submit" className="rounded-xl bg-lcd-ink px-4 py-3 text-base font-semibold text-[#0A0E0B]">Make it</button>
          </form>
        ) : <button type="button" className={item} onClick={() => setAsking(true)}>Make a new photo</button>}
        <label className={`${item} cursor-pointer`}>Use my own photo
          <input type="file" accept="image/*" className="sr-only" aria-label="Use my own photo"
            onChange={(e) => { const f = e.target.files?.[0]; onClose(); if (f) onOwn(f); }} />
        </label>
        <button type="button" className="mt-1 px-4 py-2 text-[#9AA89F]" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}


/** A bar along the bottom while a photo is made or saved in the background; if it fails, it says why. */
function Working({ label, error, onClose }: { label: string; error?: string; onClose: () => void }) {
  return (
    <div role="status" aria-label={error ? 'Photo failed' : label}
      className="fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-[55] mx-auto grid w-[min(92%,480px)] gap-2 rounded-2xl bg-[#26302A] px-4 py-3 text-white shadow-lg">
      {error ? (
        <span className="flex items-start gap-3 text-[#FFD9A0]"><span className="flex-1">{error}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="text-white/70">×</button></span>
      ) : (<>
        <span className="text-sm font-semibold">{label}… <span className="font-normal text-[#9AA89F]">usually 10–30 seconds, you can carry on</span></span>
        <ProgressLine />
      </>)}
    </div>
  );
}
