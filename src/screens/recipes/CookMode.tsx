import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { resizeImage } from '../../lib/image';
import { machineLabel } from '../../lib/recipes';
import { repo } from '../../lib/repo';
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

function Timer({ minutes, label }: { minutes: number; label: string }) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endAt === null) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [endAt]);
  const start = remaining(Date.now() + minutes * 60_000, Date.now());
  if (endAt === null) {
    return (
      <button type="button" onClick={() => { setNow(Date.now()); setEndAt(Date.now() + minutes * 60_000); }}
        className="rounded-xl bg-white/10 px-5 py-3 text-base font-semibold text-white">
        Start {start} timer
      </button>
    );
  }
  const left = remaining(endAt, now);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span role="timer" aria-label={`${label} timer`} className="font-mono text-5xl text-white tabular-nums">{left}</span>
      {left === '00:00' && <span className="font-semibold text-lcd-ink">Done</span>}
      <button type="button" onClick={() => setEndAt(null)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">Reset</button>
    </div>
  );
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
  useWakeLock();

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

  async function addPhoto(file: File | undefined) {
    if (!file || !step?.id || !recipe) return;
    setPhotoError(null);
    setSaving(true);
    try {
      const blob = await resizeImage(file);
      const path = await repo.uploadStepPhoto(householdId!, step.id, blob);
      setData({ ...recipe, steps: recipe.steps.map((s) => (s.id === step.id ? { ...s, image_path: path } : s)) });
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
        <button type="button" onClick={close} aria-label="Exit cook mode" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl">×</button>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 overflow-auto py-4">
        {!step ? (
          <p className="text-xl">No {phase === 'prep_8pm' ? '8pm prep' : 'dinner'} steps for this recipe.</p>
        ) : (
          <>
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
            {step.timer_minutes ? <Timer key={`${phase}-${index}`} minutes={step.timer_minutes} label={step.title} /> : null}
            {step.image_path && <img src={repo.heroUrl(step.image_path)} alt="Your photo of this step" className="max-h-64 self-start rounded-2xl object-cover" />}
            {photoError && <ErrorBanner message={photoError} />}
            <label className="self-start cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">
              {saving ? 'Saving photo…' : step.image_path ? 'Replace photo' : 'Add photo'}
              <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Add photo" disabled={saving}
                onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-3xl justify-between gap-3">
        <button type="button" disabled={index === 0} onClick={() => { setIndex((i) => i - 1); setPhotoError(null); }}
          className="rounded-xl bg-white/10 px-6 py-3.5 text-base font-semibold text-white disabled:opacity-35">Back</button>
        <button type="button" onClick={() => { if (last) close(); else { setIndex((i) => i + 1); setPhotoError(null); } }}
          className="rounded-xl bg-lcd-ink px-6 py-3.5 text-base font-semibold text-[#0A0E0B]">
          {last ? 'Done' : 'Next step'}
        </button>
      </div>
    </div>
  );
}
