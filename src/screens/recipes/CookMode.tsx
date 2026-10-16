import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { resizeImage } from '../../lib/image';
import { machineLabel } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import { photoCost } from './RecipeCard';
import { remaining } from '../../lib/timer';
import type { Phase, RecipeStep } from '../../lib/types';
import { useAsync } from '../settings/useAsync';
import { StepText } from './MachineBadge';

/** Keeps the screen on while cooking, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const request = () => {
      const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      wl?.request('screen').then((l) => { lock = l; }).catch(() => {});
    };
    request();
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => {}); };
  }, []);
}

interface RunningTimer { key: string; label: string; endAt: number; done: boolean }

/** A short beep and a buzz, where the device allows them. */
function alarm() {
  try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* sound not available */ }
}

/**
 * Timers for one recipe that keep running while you move between steps or leave cook mode.
 * Each is a fixed end time, so the countdown is right after the iPad has been locked.
 */
function useTimers(recipeId: string) {
  const storageKey = `cook-timers:${recipeId}`;
  const [timers, setTimers] = useState<RunningTimer[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as RunningTimer[]; } catch { return []; }
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(timers)); } catch { /* private mode */ }
  }, [storageKey, timers]);

  const anyRunning = timers.some((t) => !t.done);
  useEffect(() => {
    if (!anyRunning) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [anyRunning]);

  useEffect(() => {
    if (!timers.some((t) => !t.done && t.endAt <= now)) return;
    alarm();
    setTimers((list) => list.map((t) => (!t.done && t.endAt <= now ? { ...t, done: true } : t)));
  }, [now, timers]);

  return {
    timers,
    now,
    start(key: string, label: string, minutes: number) {
      const at = Date.now();
      setNow(at);
      setTimers((list) => [...list.filter((t) => t.key !== key), { key, label, endAt: at + minutes * 60_000, done: false }]);
    },
    dismiss(key: string) { setTimers((list) => list.filter((t) => t.key !== key)); },
  };
}

export default function CookMode() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { householdId } = useAuth();
  const { data: recipe, setData, error, loading, reload } = useAsync(() => repo.getRecipe(id), [id]);
  const [phase, setPhase] = useState<Phase>('finish');
  const [index, setIndex] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newPhoto, setNewPhoto] = useState<{ hint: string; busy: boolean; error: string | null } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useWakeLock();
  const { timers, now, start: startTimer, dismiss } = useTimers(id);

  const close = () => navigate(`/recipes/${id}`);
  const shell = 'fixed inset-0 z-50 flex flex-col bg-lcd text-[#EEF3EF]';
  const pad = {
    paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    paddingLeft: 'max(20px, env(safe-area-inset-left, 0px))',
    paddingRight: 'max(20px, env(safe-area-inset-right, 0px))',
  };

  if (error) return <div className={shell} style={pad}><ErrorBanner message={error} onRetry={reload} /></div>;
  if (loading || !recipe) {
    return <div className={shell} style={pad}>{!loading && <p>This recipe isn't in your library.</p>}{loading && <p>Loading…</p>}</div>;
  }

  const steps = recipe.steps.filter((s) => s.phase === phase);
  const step: RecipeStep | undefined = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const goBack = () => { if (index > 0) { setIndex((i) => i - 1); setPhotoError(null); } };
  const goNext = () => { if (!last) { setIndex((i) => i + 1); setPhotoError(null); } };

  /** Swipe left for the next step, right to go back. Mostly-vertical drags scroll instead. */
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goNext(); else goBack();
  }

  /** "Make a new photo ✨": an AI photo of this step from your own one-sentence description (or the recipe's). */
  async function makeNewPhoto() {
    if (!newPhoto || !step?.id || !recipe) return;
    const hint = newPhoto.hint.trim();
    const own = !!step.image_path && step.image_source !== 'generated';
    const opts = { ...(hint ? { hint } : {}), ...(own ? { replaceOwn: true } : {}) };
    setNewPhoto({ ...newPhoto, busy: true, error: null });
    try {
      const path = Object.keys(opts).length
        ? await repo.generateStepPhoto(recipe.id, step.id, !!step.image_path, true, opts)
        : await repo.generateStepPhoto(recipe.id, step.id, !!step.image_path, true);
      setData({ ...recipe, steps: recipe.steps.map((s) => (s.id === step.id ? { ...s, image_path: path, image_source: 'generated' as const, photo_hint: hint || s.photo_hint } : s)) });
      setNewPhoto(null);
    } catch (e) {
      setNewPhoto({ hint: newPhoto.hint, busy: false, error: `Couldn't make the photo: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function addPhoto(file: File | undefined) {
    if (!file || !step?.id || !recipe) return;
    setPhotoError(null);
    setSaving(true);
    try {
      const blob = await resizeImage(file);
      const path = await repo.uploadStepPhoto(householdId!, step.id, blob);
      setData({ ...recipe, steps: recipe.steps.map((s) => (s.id === step.id ? { ...s, image_path: path, image_source: 'own' as const } : s)) });
    } catch {
      setPhotoError("Couldn't save the photo. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={shell} style={pad}>
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Phase" className="flex gap-1 rounded-xl bg-white/10 p-1">
          {(['prep_8pm', 'finish'] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={phase === p} onClick={() => { setPhase(p); setIndex(0); setPhotoError(null); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${phase === p ? 'bg-white/20 text-white' : 'text-[#9AA89F]'}`}>
              {p === 'prep_8pm' ? '8pm prep' : 'Dinner'}
            </button>
          ))}
        </div>
        <div className="relative flex items-center gap-2">
          <button type="button" aria-label="Cook mode settings" aria-haspopup="menu" aria-expanded={menuOpen} disabled={!step}
            onClick={() => setMenuOpen((o) => !o)} onKeyDown={(e) => { if (e.key === 'Escape') setMenuOpen(false); }}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg text-white disabled:opacity-35">⚙︎</button>
          {menuOpen && step && (
            <div role="menu" className="absolute right-12 top-11 z-10 grid min-w-56 rounded-xl bg-[#1F2822] p-1 shadow-lg"
              onKeyDown={(e) => { if (e.key === 'Escape') setMenuOpen(false); }}>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setNewPhoto({ hint: step.photo_hint ?? '', busy: false, error: null }); }}
                className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-white hover:bg-white/10">Make a new photo ✨</button>
              <label htmlFor="step-photo-input" role="menuitem" tabIndex={0} onClick={() => setMenuOpen(false)}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
                Use your own photo
              </label>
            </div>
          )}
          <button type="button" onClick={close} aria-label="Exit cook mode" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl">×</button>
        </div>
      </div>

      {timers.length > 0 && (
        <div className="mx-auto mt-3 flex w-full max-w-3xl flex-wrap gap-2 md:max-w-6xl">
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

      <section aria-label="Step" onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }} onTouchEnd={onTouchEnd}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 overflow-auto py-4 md:grid md:max-w-6xl md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-center md:gap-10">
        {!step ? (
          <p className="text-xl">No {phase === 'prep_8pm' ? '8pm prep' : 'dinner'} steps for this recipe.</p>
        ) : (
          <>
            <div className="flex flex-col gap-5">
            <p className="font-mono text-sm text-lcd-ink">
              {recipe.title.toUpperCase()} · Step {index + 1} of {steps.length}{step.at_minute !== null ? ` · at ${step.at_minute} min` : ''}
            </p>
            <h1 className="text-[clamp(28px,5vw,46px)] font-bold text-white">{step.title}</h1>
            {step.machine && (
              <div className="self-start rounded-2xl border border-lcd-ink/35 px-4 py-3 font-mono text-[clamp(18px,3vw,30px)] text-lcd-ink">
                <small className="mb-0.5 block text-xs text-[#9AA89F]">{machineLabel(step.machine)}</small>
                {step.settings}
              </div>
            )}
            <p className="text-[clamp(19px,2.8vw,28px)] leading-snug text-[#DDE5DF] [&_b]:text-white"><StepText text={step.body} /></p>
            {step.timer_minutes ? (() => {
              const key = `${phase}-${step.id ?? index}`;
              const running = timers.find((t) => t.key === key);
              return running ? (
                <span aria-hidden="true" className="font-mono text-5xl text-white tabular-nums">{running.done ? 'Done' : remaining(running.endAt, now)}</span>
              ) : (
                <button type="button" onClick={() => startTimer(key, step.title, step.timer_minutes!)}
                  className="self-start rounded-xl bg-white/10 px-5 py-3 text-base font-semibold text-white">
                  Start {remaining(step.timer_minutes * 60_000, 0)} timer
                </button>
              );
            })() : null}
            </div>
            <div className="flex flex-col gap-3">
              {(() => {
                const path = step.image_path ?? recipe.hero_image_path;
                if (!path) return null;
                const alt = !step.image_path ? recipe.title : step.image_source === 'generated' ? 'Photo of this step' : 'Your photo of this step';
                return <img src={repo.heroUrl(path)} alt={alt} className={`aspect-[4/3] w-full max-h-64 rounded-2xl object-cover md:max-h-none ${step.image_path ? '' : 'hidden md:block'}`} />;
              })()}
            {photoError && <ErrorBanner message={photoError} />}
            {saving && <p className="m-0 text-sm font-semibold text-lcd-ink">Saving photo…</p>}
            <input id="step-photo-input" type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Add photo" disabled={saving}
              onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </>
        )}
      </section>

      {newPhoto && step && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-5" onClick={(e) => { if (e.target === e.currentTarget && !newPhoto.busy) setNewPhoto(null); }}>
          <div role="dialog" aria-modal="true" aria-label="New photo for this step" className="grid w-full max-w-md gap-3 rounded-2xl bg-[#1F2822] p-5 text-white">
            <h2 className="text-xl font-bold">New photo: {step.title}</h2>
            <label className="grid gap-1.5 text-sm font-semibold">
              In one sentence, what should the photo show? (optional)
              <input type="text" maxLength={200} autoFocus disabled={newPhoto.busy} value={newPhoto.hint}
                onChange={(e) => setNewPhoto({ ...newPhoto, hint: e.target.value })}
                placeholder="e.g. Chickpeas bubbling in a creamy tomato sauce"
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-base font-normal text-white placeholder:text-[#9AA89F]" />
            </label>
            <p className="m-0 text-sm text-[#9AA89F]">
              About {photoCost(1)}.{step.image_path && step.image_source !== 'generated' ? ' This replaces your own photo.' : ''}
            </p>
            {newPhoto.busy && <p role="status" className="m-0 font-semibold text-lcd-ink">Making your photo… this takes about 10–20 seconds.</p>}
            {newPhoto.error && <p role="alert" className="m-0 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{newPhoto.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={newPhoto.busy} onClick={() => setNewPhoto(null)} className="rounded-xl bg-white/10 px-4 py-2.5 font-semibold disabled:opacity-40">Cancel</button>
              <button type="button" disabled={newPhoto.busy} onClick={() => void makeNewPhoto()} className="rounded-xl bg-lcd-ink px-4 py-2.5 font-semibold text-[#0A0E0B] disabled:opacity-60">Make photo</button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl justify-between gap-3 md:max-w-6xl">
        <button type="button" disabled={index === 0} onClick={goBack}
          className="rounded-xl bg-white/10 px-6 py-3.5 text-base font-semibold text-white disabled:opacity-35">Back</button>
        <button type="button" onClick={() => { if (last) close(); else goNext(); }}
          className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B]">
          {last ? 'Done' : 'Next step'}
        </button>
      </div>
    </div>
  );
}
