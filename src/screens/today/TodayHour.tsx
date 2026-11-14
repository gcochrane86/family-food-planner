import { useEffect, useRef, useState } from 'react';
import ProgressLine from '../../components/ProgressLine';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import PhotoFrame from '../../components/PhotoFrame';
import { makeStepPhotos, needsRedraw } from '../../lib/stepPhotos';
import { repo } from '../../lib/repo';
import { resizeImage } from '../../lib/image';
import type { HourInput, HourPlan, HourStep } from '../../lib/todayHour';
import type { PrepAhead, RecipeDetail } from '../../lib/types';
import { photoCost } from '../recipes/RecipeCard';
import { useWakeLock } from '../../lib/wakeLock';
import { StepText } from '../recipes/MachineBadge';
import { withFahrenheit } from '../../lib/recipes';
import { Card, Tile } from '../../components/IngredientCard';
import { Hold } from '../../components/PhotoFrame';
import StoredPhoto from '../../components/StoredPhoto';
import { PHOTO_LARGE, PHOTO_SMALL } from '../../lib/photoSizes';
import { ingredientTiles, type GetOutGroup, type GetOutItem } from '../../lib/getOut';
import { chopInstruction, iconKey } from '../../../supabase/functions/_shared/prepCut.ts';
import ListenSwitch from '../../components/ListenSwitch';
import { speakable } from '../../lib/voice';
import { todayInLondon, useTodayHour } from './useTodayHour';

const addMinutes = (hhmm: string, n: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + n;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Today's hour: the plan for the evening's cooking hour, then one step at a time, with timers and the screen kept on. */
export default function TodayHour() {
  useWakeLock();
  const { householdId } = useAuth();
  const { data, error, loading, reload } = useTodayHour();
  const key = `today-hour:${todayInLondon()}`;
  // What's been got out today (ticked on the first page), kept on this device until tomorrow.
  const gotKey = `today-got:${todayInLondon()}`;
  const [got, setGot] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(gotKey) ?? '[]'); } catch { return []; } });
  const tick = (k: string) => setGot((g) => {
    const next = g.includes(k) ? g.filter((x) => x !== k) : [...g, k];
    try { localStorage.setItem(gotKey, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  const [index, setIndex] = useState<number>(() => { try { return Number(sessionStorage.getItem(key) ?? -1); } catch { return -1; } });
  useEffect(() => { try { sessionStorage.setItem(key, String(index)); } catch { /* private mode */ } }, [key, index]);
  const [menu, setMenu] = useState<Held | null>(null);
  // What tonight's prep was before "I didn't get to it", so Undo puts that back (ahead when not known).
  const [prepBefore, setPrepBefore] = useState<PrepAhead>('ahead');
  // A photo being made or saved in the background, shown as a bar along the bottom until it's done.
  const [working, setWorking] = useState<{ label: string; error?: string } | null>(null);
  const [photos, setPhotos] = useState<{ done: number; total: number; finished?: boolean; error?: string } | null>(null);
  const steps: (HourStep & { afterDinner?: boolean })[] = data ? [...data.plan.steps, ...data.plan.after.map((s) => ({ ...s, afterDinner: true }))] : [];
  // A plan that changed since (a swapped dinner) can be shorter: come back to its last step, not past it.
  useEffect(() => { if (data && index > steps.length - 1) setIndex(steps.length - 1); }, [data, index, steps.length]);
  const step = index >= 0 ? steps[Math.min(index, steps.length - 1)] : undefined;
  /** Swipe left for the next step, right to go back; a mostly up-and-down drag scrolls instead. */
  const touch = useRef<{ x: number; y: number } | null>(null);
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) setIndex((i) => Math.min(i + 1, steps.length - 1));
    else setIndex((i) => Math.max(i - 1, -1));
  }

  /** Remakes a chopping photo, or saves your own, then shows it (everywhere that cut is used). */
  async function fixPrep(label: string, run: () => Promise<unknown>) {
    setWorking({ label });
    try { await run(); reload(); setWorking(null); } catch (e) { setWorking({ label, error: `Couldn't change that photo: ${e instanceof Error ? e.message : String(e)}` }); }
  }

  /** Makes the missing step photos for the hour's recipes, one at a time, then shows them. */
  /** Making photos stopped on an error: say why, and show the photos made so far (Try again carries on from there). */
  function stopped(done: number, total: number, error: string) {
    setPhotos({ done, total, error });
    reload();
  }

  async function addPhotos(recipes: RecipeDetail[], prep: HourPlan['prepMissing'], icons: HourPlan['iconsMissing']) {
    const total = icons.length + prep.length + recipes.reduce((n, r) => n + photosNeeded(r), 0);
    let before = 0;
    setPhotos({ done: 0, total });
    // The "get it out" pictures first: one small cartoon per ingredient, reused wherever it comes up.
    for (const c of icons) {
      try { await repo.generatePrepPhoto(householdId!, c.name, null, false, undefined, true); } catch (e) { return stopped(before, total, `Couldn't make the picture for ${c.name}: ${e instanceof Error ? e.message : String(e)}`); }
      before += 1;
      setPhotos({ done: before, total });
    }
    // The chopping-board photos first: one per cut, reused by every recipe that cuts it the same way.
    for (const c of prep) {
      try { await (c.redraw ? repo.generatePrepPhoto(householdId!, c.name, c.note, true) : repo.generatePrepPhoto(householdId!, c.name, c.note)); } catch (e) { return stopped(before, total, `Couldn't make the chopping photo for ${c.label}: ${e instanceof Error ? e.message : String(e)}`); }
      before += 1;
      setPhotos({ done: before, total });
    }
    for (const r of recipes) {
      // Step photos are made in the style of the main photo, so a recipe without one gets it first.
      if (!r.hero_image_path) {
        try { await repo.generateHero(r.id); } catch (e) { return stopped(before, total, `Couldn't make the main photo for ${r.title}: ${e instanceof Error ? e.message : String(e)}`); }
        before += 1;
        setPhotos({ done: before, total });
      }
      const result = await makeStepPhotos(r.id, r.steps, (done) => setPhotos({ done: before + done, total }), { asked: true, redraw: true });
      before += result.made;
      if (result.error) { return stopped(before, total, `Couldn't make step photos: ${result.error}`); }
    }
    setPhotos({ done: before, total, finished: true });
    reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-4 overflow-auto bg-white p-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-[calc(16px+env(safe-area-inset-bottom,0px))] text-[#1B211D] md:p-8">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 md:max-w-6xl">
        <b className="text-lg">Today's hour{step ? ` · ${Math.min(index, steps.length - 1) + 1} of ${steps.length}` : ''}</b>
        <div className="flex items-center gap-2">
          {data && steps.length > 0 && (
            <ListenSwitch light onNext={() => setIndex((i) => Math.min(i + 1, steps.length - 1))} onBack={() => setIndex((i) => Math.max(i - 1, -1))}
              text={() => (step ? speakable(step.title, step.kind === 'chop' ? data.plan.chop.flatMap((g) => g.items.map((it) => `${chopInstruction(it.name, it.note)}${it.qty ? `, ${it.qty}` : ''}`)).join('. ') : step.body) : '')} />
          )}
          <Link to="/week" aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-[#E9ECE4] text-xl text-[#1B211D] no-underline">×</Link>
        </div>
      </div>


      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <p className="text-[#5D6760]">Loading…</p>}

      {data && !step && (() => {
        const { input, plan, tonightSlot, tomorrowSlot } = data;
        const setPrep = (slotId: string | undefined, value: PrepAhead) => {
          if (!slotId) return;
          void repo.setPrepAhead(slotId, value).then(reload, () => setWorking({ label: "Couldn't save that", error: 'Check your connection and try again.' }));
        };
        return (
          <section className="mx-auto grid w-full max-w-3xl content-start gap-4">
            <h1 className="m-0 text-[clamp(26px,3.6vw,38px)] font-bold">Today's hour · {input.start}–{addMinutes(input.start, input.minutes)}</h1>
            <p className="m-0 text-lg text-[#3F4A43]">{input.tonight ? `Tonight: ${input.tonight.recipe.title}` : 'No dinner to cook tonight'}</p>
            <p className="m-0 text-[#3F4A43]">{plan.handsOn} minutes hands-on</p>
            {plan.warnings.map((w) => <p key={w} className="m-0 rounded-xl bg-[#FBEFD0] px-3 py-2 text-[#7A4F00]">{w}</p>)}
            {plan.doneLastNight && <DoneLastNight done={plan.doneLastNight} onChange={(v) => {
              if (v === 'missed') setPrepBefore(plan.doneLastNight!.state);
              setPrep(tonightSlot?.id, v === 'missed' ? v : prepBefore);
            }} />}
            {plan.getOut.length > 0 && <GetOut groups={plan.getOut} got={got} onTick={tick} onHold={(it) => setMenu({ prep: { name: it.name, note: null, key: it.key, label: it.name, icon: true } })} />}
            {plan.forTomorrow && <ForTomorrow prep={plan.forTomorrow} onChange={(on) => setPrep(tomorrowSlot?.id, on ? 'ahead' : 'on_the_day')} />}
            {plan.roastAhead && <RoastTomorrow roast={plan.roastAhead} />}
            <MissingPhotos recipes={hourRecipes(input)} prep={plan.prepMissing} icons={plan.iconsMissing} state={photos} onStart={(rs) => void addPhotos(rs, plan.prepMissing, plan.iconsMissing)} />
            {steps.length > 0 && (
              <button type="button" onClick={() => setIndex(0)} className="justify-self-start rounded-xl bg-[#2D6A3E] px-8 py-3.5 text-lg font-semibold text-white">Start</button>
            )}
          </section>
        );
      })()}

      {step && (() => {
        return (
          <section aria-label={`Step ${Math.min(index, steps.length - 1) + 1} of ${steps.length}`}
            onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }} onTouchEnd={onTouchEnd}
            data-layout={centred(step) ? 'centred' : 'step'}
            // Plating up and clean-up: the text, then the picture large and centred. Other steps: text left, pictures right.
            className={centred(step)
              ? 'mx-auto grid w-full max-w-4xl flex-1 content-start justify-items-center gap-6 text-center'
              : 'mx-auto grid w-full max-w-3xl flex-1 content-start gap-5 md:max-w-6xl md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-start md:gap-10'}>
            <div className="grid content-start gap-3">
            {step.afterDinner
              ? <span className="text-sm font-bold uppercase tracking-[0.08em] text-[#2D6A3E]">After dinner</span>
              : <span className="font-mono text-5xl font-bold tabular-nums">{step.at}<span className="ml-2 text-xl text-[#5D6760]">to {step.end}</span></span>}
            <h1 className="m-0 text-[clamp(24px,3.4vw,36px)] font-bold leading-tight">{step.title}</h1>
            {step.kit && <span className="font-mono text-[clamp(22px,3vw,32px)] font-bold leading-tight text-[#1B211D]">{withFahrenheit(step.kit)}</span>}
            {step.kind === 'chop' && data ? (
              <div className="grid gap-4">
                {(() => {
                  // One plain list; a heading only where it changes what you do.
                  const live = data.plan.chop.filter((g) => g.where !== 'fridge');
                  const sections = [
                    { label: null, items: live.filter((g) => !g.raw && g.where !== 'box').flatMap((g) => g.items) },
                    { label: 'For tomorrow: into a lidded box in the fridge', items: live.filter((g) => !g.raw && g.where === 'box').flatMap((g) => g.items) },
                    { label: 'Raw meat and fish: last, on a separate board', items: live.filter((g) => g.raw).flatMap((g) => g.items) },
                  ].filter((x) => x.items.length);
                  return sections.map((sec) => (
                    <div key={sec.label ?? 'chop'} className="grid gap-2">
                      {sec.label && <b className="text-[clamp(17px,2.2vw,22px)] text-[#1B211D]">{sec.label}</b>}
                      <ul aria-label={sec.label ? sec.label.split(':')[0] : 'To chop'} className="m-0 grid list-none gap-3 p-0">
                        {sec.items.map((it, n) => {
                          const k = iconKey(it.name);
                          return (
                            <li key={`${it.name}-${n}`} className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-4">
                              <Card item={{ name: k.ingredient, qty: it.qty, key: k.key, icon: data.input.prepPhotos?.[k.key] ?? null }}
                                onHold={() => setMenu({ prep: { name: k.ingredient, note: null, key: k.key, label: k.ingredient, icon: true } })} />
                              <span className="text-[clamp(19px,2.6vw,26px)] font-semibold leading-snug text-[#1B211D]">{chopInstruction(it.name, it.note)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <p className="m-0 text-[clamp(19px,2.6vw,26px)] leading-snug text-[#1B211D] [&_b]:text-[#1B211D]"><StepText text={step.body} /></p>
            )}
            {step.ingredients.length > 0 && data && (
              <ul aria-label="For this step" className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-4">
                {ingredientTiles(step.ingredients.map((i) => ({ i, factor: step.factor })), data.input.prepPhotos ?? {}, { water: true }).map((t) => (
                  <Tile key={t.key} item={t} note={t.note} onHold={() => setMenu({ prep: { name: t.name, note: null, key: t.key, label: t.name, icon: true } })} />
                ))}
              </ul>
            )}
            </div>
            <div className={centred(step) ? 'grid w-full max-w-4xl justify-items-center' : ''}><StepPictures step={step} onHold={setMenu} big={centred(step)} icons={step.kind === 'chop' ? chopIcons(data) : []} /></div>
          </section>
        );
      })()}

      {step && (
        <div className="mx-auto flex w-full max-w-3xl justify-between gap-3 md:max-w-6xl">
          <button type="button" onClick={() => setIndex((i) => i - 1)}
            className="rounded-xl bg-[#E9ECE4] px-6 py-3.5 text-base font-semibold text-[#1B211D]">Back</button>
          {index < steps.length - 1
            ? <button type="button" onClick={() => setIndex((i) => i + 1)} className="rounded-xl bg-[#2D6A3E] px-6 py-3.5 text-base font-semibold text-white">Next</button>
            : <Link to="/week" className="rounded-xl bg-[#2D6A3E] px-6 py-3.5 text-base font-semibold text-white no-underline">Done</Link>}
        </div>
      )}
      {menu?.prep && (() => { const p = menu.prep; return (
        <PhotoOptions title={p.label} note={p.icon ? 'Changes this picture wherever this ingredient comes up.' : 'Changes this photo wherever this cut is used.'} onClose={() => setMenu(null)}
          onRemake={(hint) => void fixPrep('Making a new photo', () => (p.icon
            ? repo.generatePrepPhoto(householdId!, p.name, null, true, hint || undefined, true)
            : repo.generatePrepPhoto(householdId!, p.name, p.note, true, hint || undefined)))}
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
const missing = (r: RecipeDetail) => r.steps.filter((s) => s.id && (!s.image_path || needsRedraw(s))).length;
/** The photos a recipe needs: its missing step photos, and its main photo first if it has none. */
const photosNeeded = (r: RecipeDetail) => missing(r) + (missing(r) > 0 && !r.hero_image_path ? 1 : 0);

/** "Add step photos" for the hour's recipes, and how it's getting on. */
function MissingPhotos({ recipes, prep, icons, state, onStart }: { recipes: RecipeDetail[]; prep: HourPlan['prepMissing']; icons: HourPlan['iconsMissing']; state: { done: number; total: number; finished?: boolean; error?: string } | null; onStart: (rs: RecipeDetail[]) => void }) {
  const n = icons.length + prep.length + recipes.reduce((t, r) => t + photosNeeded(r), 0);
  if (state?.error) return (
    <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 rounded-xl bg-[#FBEFD0] px-3 py-2 text-[#7A4F00]">{state.error}</p>
      {n > 0 && <button type="button" onClick={() => onStart(recipes.filter((r) => missing(r) > 0))} className="rounded-xl bg-[#E9ECE4] px-4 py-2 text-sm font-semibold text-[#1B211D]">Try again</button>}
    </div>
  );
  if (state?.finished) return <p className="m-0 text-[#3F4A43]">Step photos made ({state.done}).</p>;
  if (state) return (
    <div role="status" aria-label="Making step photos" className="grid gap-2 text-[#3F4A43]">
      <span>Making step photos: {state.done} of {state.total}… (you can carry on)</span>
      <ProgressLine className="bg-[#E9ECE4]" bar="bg-[#2D6A3E]" />
    </div>
  );
  if (!n) return null;
  return (
    <button type="button" onClick={() => onStart(recipes.filter((r) => missing(r) > 0))} className="justify-self-start rounded-xl bg-[#E9ECE4] px-4 py-2 text-sm font-semibold text-[#1B211D]">
      Add step photos ✨ ({n} photos, about {photoCost(n)})
    </button>
  );
}

/** A step's pictures: one large photo, a strip for the chopping, or an icon for cleaning. */
type Prep = NonNullable<HourStep['photos'][number]['prep']>;
type Held = { prep?: Prep & { icon?: boolean }; step?: NonNullable<HourStep['photos'][number]['step']> };
/** Plating up and clean-up steps are laid out centred, the picture large under the text. */
const centred = (s: HourStep) => s.kind === 'serve' || s.kind === 'clean';

/** The cartoons of everything chopped in the hour (those made so far), for the chopping picture. */
function chopIcons(data: { input: HourInput; plan: HourPlan } | null | undefined): { name: string; path: string }[] {
  if (!data) return [];
  const seen = new Set<string>();
  return data.plan.chop.filter((g) => g.where !== 'fridge').flatMap((g) => g.items).map((it) => iconKey(it.name))
    .filter((k) => !seen.has(k.key) && seen.add(k.key) && data.input.prepPhotos?.[k.key])
    .map((k) => ({ name: k.ingredient, path: data.input.prepPhotos![k.key] }));
}

function StepPictures({ step, onHold, big = false, icons = [] }: { step: HourStep; onHold: (h: Held) => void; big?: boolean; icons?: { name: string; path: string }[] }) {
  if (step.kind === 'chop' && icons.length) {
    // One picture: the chopping board, with a small cartoon of each thing to chop beside it, all on white.
    const board = step.photos.find((p) => p.prep);
    return (
      <figure aria-label={`Everything to chop: ${icons.map((i) => i.name).join(', ')}`}
        className={`m-0 grid aspect-[4/3] w-full items-center gap-2 overflow-hidden rounded-2xl bg-white p-3 ${board ? 'grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]' : ''}`}>
        {board && (
          <Hold onHold={() => onHold({ prep: board.prep })}>
            <StoredPhoto path={board.path} width={PHOTO_LARGE} alt={board.alt} draggable={false} className="w-full object-contain mix-blend-multiply" />
          </Hold>
        )}
        <div className={`grid content-center justify-items-center gap-1 ${icons.length > 3 || !board ? 'grid-cols-2' : ''} ${!board && icons.length > 4 ? 'grid-cols-3' : ''}`}>
          {icons.map((i) => <StoredPhoto key={i.path} path={i.path} width={PHOTO_SMALL} alt="" draggable={false} className="aspect-square w-full max-w-[160px] object-contain mix-blend-multiply" />)}
        </div>
      </figure>
    );
  }
  if (!step.photos.length) return step.kind === 'clean' ? <span role="img" aria-label="Cleaning" className={big ? 'text-[clamp(120px,22vw,220px)] leading-none' : 'text-6xl'}>🧽</span> : null;
  return <PhotoFrame photos={step.photos.map((p) => ({ path: p.path, alt: p.alt,
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
              <input autoFocus value={hint} maxLength={600} onChange={(e) => setHint(e.target.value)} placeholder="e.g. bigger chunks, skins on"
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

const KEPT: Record<GetOutGroup['where'], string> = { fridge: 'Fridge', freezer: 'Freezer', cupboard: 'Cupboard' };

/** "Get it out": a small cartoon of each thing the hour uses, with its name and amount underneath, by where it's
 *  kept. Hold a picture to remake it or use your own. */
function GetOut({ groups, got, onTick, onHold }: { groups: GetOutGroup[]; got: string[]; onTick: (key: string) => void; onHold: (it: GetOutItem) => void }) {
  return (
    <section aria-label="Get it out" className="grid gap-4 rounded-2xl bg-[#F3F4EF] p-4">
      <h2 className="m-0 text-sm font-bold uppercase tracking-[0.08em] text-[#2D6A3E]">Get it out</h2>
      <p className="m-0 -mt-2 text-sm text-[#5D6760]">Tap each one as you get it out.</p>
      {groups.map((g) => {
        // Still to get first; what's out drops to the end.
        const items = [...g.items.filter((it) => !got.includes(it.key)), ...g.items.filter((it) => got.includes(it.key))];
        return (
          <div key={g.where} className="grid gap-2">
            <b>{KEPT[g.where]}</b>
            <ul aria-label={KEPT[g.where]} className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-4 md:grid-cols-6">
              {items.map((it) => {
                const done = got.includes(it.key);
                return (
                  <li key={it.key} className="grid">
                    <button type="button" role="checkbox" aria-checked={done} aria-label={it.name} onClick={() => onTick(it.key)}
                      className={`relative grid text-left transition-opacity ${done ? 'opacity-45' : ''}`}>
                      <Card item={it} onHold={() => onHold(it)} />
                      {done && <span aria-hidden="true" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-[#2D6A3E] text-lg font-bold text-white">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/** Tomorrow's dinner prep: the optional part as one tick (recommended, on by default); must-do steps as plain lines. */
function ForTomorrow({ prep, onChange }: { prep: NonNullable<HourPlan['forTomorrow']>; onChange: (on: boolean) => void }) {
  return (
    <section aria-label="Prep for tomorrow" className="grid gap-2 rounded-2xl bg-[#F3F4EF] p-4">
      <h2 className="m-0 text-sm font-bold uppercase tracking-[0.08em] text-[#2D6A3E]">For tomorrow</h2>
      {prep.optional > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span>Prep for tomorrow's {prep.title} <small className="block text-[#5D6760]">Recommended: {prep.ahead ? 'in this hour' : 'off, so it\'s done in tomorrow\'s hour'}</small></span>
          <button type="button" role="switch" aria-checked={prep.ahead} aria-label={`Prep for tomorrow's ${prep.title} (recommended)`} onClick={() => onChange(!prep.ahead)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${prep.ahead ? 'bg-[#2D6A3E]' : 'bg-[#C9CEC6]'}`}>
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${prep.ahead ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}
      {prep.mustDo.length > 0 && <p className="m-0 font-semibold">{`Needs the night before: ${prep.mustDo.join(', ')}`}</p>}
    </section>
  );
}

/** Tonight's prep that yesterday's hour did, with a way to say it didn't happen (it then comes into tonight). */
function DoneLastNight({ done, onChange }: { done: NonNullable<HourPlan['doneLastNight']>; onChange: (v: PrepAhead) => void }) {
  const missed = done.state === 'missed';
  return (
    <section aria-label="Done last night" className="grid justify-items-start gap-2 rounded-2xl bg-[#F3F4EF] p-4">
      <p className="m-0">{missed ? `Not done last night: the prep for tonight's ${done.title} is in tonight's hour.` : `Done last night: prep for tonight's ${done.title} (${done.steps.join(', ')}).`}</p>
      {missed
        ? <button type="button" onClick={() => onChange('ahead')} className="font-semibold text-[#2D6A3E] underline">Undo</button>
        : <button type="button" onClick={() => onChange('missed')} className="font-semibold text-[#2D6A3E] underline">I didn't get to it</button>}
    </section>
  );
}

/** A roast tomorrow: its own plan's evening-before prep, always done (not fitted into the hour). */
function RoastTomorrow({ roast }: { roast: NonNullable<HourPlan['roastAhead']> }) {
  return (
    <section aria-label="Tomorrow's roast" className="grid justify-items-start gap-2 rounded-2xl bg-[#F3F4EF] p-4">
      <h2 className="m-0 text-sm font-bold uppercase tracking-[0.08em] text-[#2D6A3E]">Tomorrow's roast: night-before prep</h2>
      <ul className="m-0 grid gap-1 pl-5">
        {roast.steps.map((st) => <li key={`${st.time}-${st.title}`}>{st.time} · {st.partTitle}: {st.title}</li>)}
      </ul>
      {roast.link && <Link to={roast.link} className="font-semibold text-[#2D6A3E] underline">Open the roast plan</Link>}
    </section>
  );
}
