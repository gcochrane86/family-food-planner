import { PHOTO_LARGE } from '../../lib/photoSizes';
import ProgressLine from '../../components/ProgressLine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { householdPortions } from '../../lib/household';
import { formatQty, groupIngredients, machineLabel, scaleFactor, toddlerSaltNote, withFahrenheit } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import { dayParams, dayQuery, loadDayRecipe } from '../../lib/dayRecipe';
import { makeStepPhotos } from '../../lib/stepPhotos';
import type { Machine, RecipeBatch, RecipeDetail, RecipeStep } from '../../lib/types';
import { parseNutrition, type Nutrition } from '../../../supabase/functions/_shared/balance.ts';
import { snackFactor } from '../../../supabase/functions/_shared/snackRules.ts';
import { formatPortions } from '../settings/Household';
import { nextMake, weekMakes } from '../../lib/weekEats';
import { weekStarts } from '../week/useWeek';
import { useAsync } from '../settings/useAsync';
import HeroImage from './HeroImage';
import MachineBadge, { StepText } from './MachineBadge';
import RecipeMenu from './RecipeMenu';
import { parseBatch } from '../../lib/batch';
import ReworkRecipe from './ReworkRecipe';
import AddToAdhoc from '../adhoc/AddToAdhoc';
import UseForLunch from './UseForLunch';
import { iconKey } from '../../../supabase/functions/_shared/prepCut.ts';
import StoredPhoto from '../../components/StoredPhoto';

/** The original page's host for a web recipe, or null when there's no usable http(s) link. */
function linkHost(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try { return new URL(url).host || null; } catch { return null; }
}

const KNOWN_MACHINES = new Set(['tm7', 'apo', 'hy24', 'meater', 'hob', 'oven', 'kettle']);

/** The ingredients with no picture yet (one per picture: "leeks" and "leek" share one), by name as the recipe says it. */
export function missingIcons(r: { ingredients: { name: string }[] }, have: Set<string>): { name: string; key: string }[] {
  const out = new Map<string, { name: string; key: string }>();
  for (const i of r.ingredients) {
    const { key } = iconKey(i.name);
    if (!have.has(key) && !out.has(key)) out.set(key, { name: i.name, key });
  }
  return [...out.values()];
}

/** "Make the main photo, 3 step photos and 2 ingredient pictures". */
function addSentence(steps: number, icons: number, needHero: boolean): string {
  const parts = [
    ...(steps && needHero ? ['the main photo'] : []),
    ...(steps ? [`${steps} step photo${steps === 1 ? '' : 's'}`] : []),
    ...(icons ? [`${icons} ingredient picture${icons === 1 ? '' : 's'}`] : []),
  ];
  return `Make ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}`;
}

/** A rough cost for n AI photos: about 3p each with Google's image model. */
export function photoCost(n: number): string {
  const pence = n * 3;
  return pence < 100 ? `${pence}p` : `£${(pence / 100).toFixed(2)}`;
}

/** "keeps about 3 months" / "about 2 weeks". */
const keeps = (days: number) => (days >= 30 ? `about ${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'}` : `about ${Math.max(1, Math.round(days / 7))} week${Math.round(days / 7) > 1 ? 's' : ''}`);

function Steps({ steps, label, minutes, timeline, markAhead, batch }: {
  steps: RecipeStep[]; label: string; minutes?: number; timeline?: boolean; markAhead?: boolean; batch?: RecipeBatch | null;
}) {
  if (!steps.length) return null;
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <section aria-labelledby={id} className="mt-6 first:mt-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 id={id} className="text-xl font-bold">{label}</h2>
        {minutes !== undefined && minutes > 0 && <span className="text-sm font-semibold text-muted">{minutes} min</span>}
      </div>
      <ol className="grid gap-3">
        {steps.map((s, i) => (
          <li key={s.id ?? i} className={`grid gap-3 rounded-2xl border border-line bg-surface p-4 md:gap-5 md:p-5 ${s.image_path ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]' : ''}`}>
            <div className="grid content-start gap-2">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-lg font-bold">{i + 1}</span>
                <div>
                  <h3 className="text-lg font-bold leading-tight">{s.title}</h3>
                  {markAhead && s.phase === 'prep_8pm' && <small className="mr-2 rounded-full bg-evening-soft px-2 py-0.5 text-[11px] font-semibold text-evening">{s.needs_night_before ? 'Needs the night before' : 'Can be done the day before'}</small>}
                  {timeline && s.at_minute !== null && <small className="font-mono text-[11px] font-medium text-muted">at {s.at_minute} min</small>}
                </div>
              </div>
              {s.machine && <div><MachineBadge machine={s.machine} settings={s.settings} /></div>}
              <p className="m-0 text-[15.5px] leading-relaxed md:text-[17px]"><StepText text={s.body} /></p>
              {batch?.steps.includes(s.title) && (
                <p className="m-0 rounded-lg bg-evening-soft px-3 py-1.5 text-sm font-semibold text-evening">
                  Batch tip: make {batch.makes}× and freeze {batch.makes - 1} (keeps {keeps(batch.freezer_days)})
                </p>
              )}
            </div>
            {s.image_path && (
              <StoredPhoto path={s.image_path} width={PHOTO_LARGE} alt={`Step ${i + 1}: ${s.title}`} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

const MAX_PORTIONS = 40;

export default function RecipeCard() {
  const navigate = useNavigate();
  const [reworking, setReworking] = useState(false);
  const closeRework = useCallback(() => setReworking(false), []);
  const { id = '' } = useParams();
  const { householdId } = useAuth();
  // Opened from a day (…?day=&slot=), it's that day's tonight's version if there is one.
  const [params] = useSearchParams();
  const at = dayParams(params);
  const { data, setData, error, loading, reload } = useAsync(async () => {
    const [recipe, members, pictures] = await Promise.all([loadDayRecipe(id, householdId, at), repo.listMembers(householdId!),
      repo.listPrepPhotos(householdId!).catch(() => [])]);
    // A snack recipe is cooked for its make (everyone's snacks added up), not for the household at one sitting.
    const make = recipe?.kind === 'snack' && !recipe.quick ? await plannedMake(householdId!, recipe.id) : null;
    return { recipe, members, make, icons: new Set(pictures.map((p) => p.key)) };
  }, [id, householdId, at?.day, at?.slot]);
  const [portions, setPortions] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [tickError, setTickError] = useState<string | null>(null);
  const [snackOpen, setSnackOpen] = useState(false);
  const [stepProgress, setStepProgress] = useState<{ done: number; total: number; what?: string } | null>(null);
  const started = useRef<string | null>(null);

  const setStepPhoto = (stepId: string, path: string) => setData((d) => d && d.recipe ? {
    ...d, recipe: { ...d.recipe, steps: d.recipe.steps.map((s) => (s.id === stepId ? { ...s, image_path: path, image_source: 'generated' as const } : s)) },
  } : d);

  // A liked recipe gets a photo for every step: start, join or carry on that run whenever the recipe is open.
  const [photoPanel, setPhotoPanel] = useState<'add' | 'redo' | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});

  function runStepPhotos(r: { id: string; steps: RecipeStep[] }, asked: boolean, stepHints: Record<string, string> = {}) {
    void makeStepPhotos(r.id, r.steps, (done, total, stepId, path) => {
      setStepProgress({ done, total });
      if (stepId && path) setStepPhoto(stepId, path);
    }, { asked, hints: stepHints }).then((result) => {
      setStepProgress(null);
      if (result.error) setPhotoError(`Couldn't make step photos: ${result.error}`);
    });
  }

  const liked = data?.recipe?.rating === 'up' ? data.recipe : null;
  useEffect(() => {
    if (!liked || started.current === liked.id || !liked.steps.some((s) => s.id && !s.image_path)) return;
    started.current = liked.id;
    runStepPhotos(liked, false);
  }, [liked]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Remakes every AI step photo, one at a time; photos you took yourself are left alone. Stops at the first failure. */
  async function newStepPhotos(stepHints: Record<string, string> = {}) {
    if (!data?.recipe) return;
    const generated = data.recipe.steps.filter((s) => s.id && s.image_source === 'generated');
    setPhotoError(null);
    setStepProgress({ done: 0, total: generated.length });
    for (const [n, step] of generated.entries()) {
      try {
        const hint = stepHints[step.id!]?.trim();
        setStepPhoto(step.id!, hint ? await repo.generateStepPhoto(data.recipe.id, step.id!, true, true, { hint })
          : await repo.generateStepPhoto(data.recipe.id, step.id!, true, true));
        setStepProgress({ done: n + 1, total: generated.length });
      } catch (e) {
        setPhotoError(`Couldn't make step photos: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    setStepProgress(null);
  }

  /** Add step photos: the main photo first if there isn't one (step photos copy its style), then the missing steps. */
  async function addStepPhotos(stepHints: Record<string, string>) {
    if (!data?.recipe) return;
    const r = data.recipe;
    if (!r.hero_image_path && r.steps.some((st) => st.id && !st.image_path)) {
      setPhotoBusy(true);
      try {
        const path = await repo.generateHero(r.id);
        setData((d) => d && d.recipe ? { ...d, recipe: { ...d.recipe, hero_image_path: path, hero_image_source: 'generated' } } : d);
      } catch (e) {
        setPhotoError(`Couldn't make the main photo: ${e instanceof Error ? e.message : String(e)}`);
        return;
      } finally {
        setPhotoBusy(false);
      }
    }
    // The ingredient pictures (one per ingredient, shared by every recipe that uses it), then the step photos.
    const icons = missingIcons(r, data.icons);
    for (const [n, i] of icons.entries()) {
      setStepProgress({ done: n, total: icons.length, what: 'ingredient pictures' });
      try {
        await repo.generatePrepPhoto(householdId!, i.name, null, false, undefined, true);
        setData((d) => d ? { ...d, icons: new Set([...d.icons, i.key]) } : d);
      } catch (e) {
        setStepProgress(null);
        setPhotoError(`Couldn't make the picture for ${i.name}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    setStepProgress(null);
    if (!r.steps.some((st) => st.id && !st.image_path)) return;
    started.current = r.id;
    runStepPhotos(r, true, stepHints);
  }

  async function undoNotForUs() {
    if (!data?.recipe) return;
    try {
      await repo.rateRecipe(data.recipe.id, null);
      setData({ ...data, recipe: { ...data.recipe, rating: null } });
    } catch {
      setPhotoError("Couldn't undo that. Check your connection and try again.");
    }
  }

  async function newPhoto() {
    if (!data?.recipe) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const path = await repo.generateHero(data.recipe.id);
      setData({ ...data, recipe: { ...data.recipe, hero_image_path: path, hero_image_source: 'generated' } });
    } catch (e) {
      setPhotoError(`Couldn't make a photo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Flips "reheats well" (which decides leftover lunches), showing it at once and putting it back if the save fails. */
  async function flipReheats() {
    if (!data?.recipe) return;
    const value = !data.recipe.reheats_well;
    const set = (v: boolean) => setData((d) => d && d.recipe ? { ...d, recipe: { ...d.recipe, reheats_well: v } } : d);
    setTickError(null);
    set(value);
    try { await repo.setReheatsWell(data.recipe.id, value); } catch { set(!value); setTickError("Couldn't save. Check your connection and try again."); }
  }

  /** "Can be a snack": turning it on opens the snack details; turning it off saves at once. */
  async function saveSnack(o: { snack_ok: boolean; snack_portions: number | null; keeps_days: number | null; toddler_ok: boolean }) {
    if (!data?.recipe) return;
    const before = data.recipe;
    setTickError(null);
    setData((d) => d && d.recipe ? { ...d, recipe: { ...d.recipe, ...o } } : d);
    try { await repo.setSnackOptions(before.id, o); setSnackOpen(false); } catch {
      setData((d) => d && d.recipe ? { ...d, recipe: before } : d);
      setTickError("Couldn't save. Check your connection and try again.");
    }
  }

  if (error) return <div className="py-6"><ErrorBanner message={error} onRetry={reload} /></div>;
  if (loading || !data) return <p className="py-6 text-muted">Loading…</p>;
  const { recipe, members } = data;
  const originalHost = linkHost(recipe?.source_url);
  if (!recipe) {
    return (
      <section className="py-6">
        <p>This recipe isn't in your library.</p>
        <Link to="/recipes" className="font-semibold">← Recipes</Link>
      </section>
    );
  }

  const { make } = data;
  const batchSnack = recipe.kind === 'snack' && !recipe.quick;
  const household = make?.portions ?? (batchSnack ? recipe.base_portions : householdPortions(members) || recipe.base_portions);
  // A snack's tabs: its make and the whole batch the recipe makes; anything else, the household and bigger batches.
  const presets = (batchSnack ? [household, recipe.base_portions] : [household, 6, 9]).filter((v, i, a) => a.indexOf(v) === i);
  const target = portions ?? household;
  const factor = scaleFactor(target, recipe.base_portions);
  const toddler = members.find((m) => m.kind === 'child');
  const saltNote = toddler ? toddlerSaltNote(recipe.salt_per_portion_g, toddler.portion_weight) : null;
  const prep = recipe.steps.filter((s) => s.phase === 'prep_8pm');
  const finish = recipe.steps.filter((s) => s.phase === 'finish');
  // The times: prep ahead (done in Today's hour the day before) shown apart when the recipe has any.
  const split = prep.length > 0;
  const settings = recipe.steps.filter((s) => s.machine && s.settings);
  const missingPhotos = recipe.steps.filter((s) => s.id && !s.image_path).length;
  // Step photos are drawn in the style of the main photo, so a recipe without one gets it first (as in Today's hour).
  const needHero = !recipe.hero_image_path;
  const iconsToMake = missingIcons(recipe, data.icons).length;
  // The main photo is only needed for step photos (they copy its style).
  const addCount = missingPhotos + iconsToMake + (needHero && missingPhotos > 0 ? 1 : 0);
  const addLabel = missingPhotos > 0 ? 'Add step photos ✨' : 'Add ingredient pictures ✨';
  const PHASE_ORDER: Record<string, number> = { prep_8pm: 0, finish: 1, reheat: 2 };
  const ordered = [...recipe.steps].sort((a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9) || a.position - b.position);
  const panelSteps = ordered.filter((st) => st.id && (photoPanel === 'add' ? !st.image_path : st.image_source === 'generated'));
  function openPanel(mode: 'add' | 'redo') {
    setHints(Object.fromEntries(recipe!.steps.filter((st) => st.id && st.photo_hint).map((st) => [st.id!, st.photo_hint!])));
    setPhotoPanel(mode);
  }
  const makeDay = make ? new Date(`${make.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) : '';
  const tabLabel = (n: number) => (make && n === household ? `${makeDay}'s make · ${Math.round(n * 10) / 10}` : batchSnack && n === recipe.base_portions ? `Whole batch · ${n}` : n === household ? `Household · ${formatPortions(n)}` : n === 9 ? '9 · big batch' : `${n} portions`);

  return (
    <article className="grid gap-4 py-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link to="/recipes" className="text-sm font-semibold text-muted no-underline">← Recipes</Link>
        <div className="flex items-center gap-2">
          {photoBusy && <span role="status" className="grid w-28 gap-1 text-sm font-semibold text-muted">Making photo…<ProgressLine className="bg-line" bar="bg-accent" /></span>}
          <RecipeMenu items={[
            { label: 'New main photo ✨', onSelect: () => void newPhoto(), disabled: photoBusy },
            ...(missingPhotos + iconsToMake > 0
              ? [{ label: addLabel, onSelect: () => openPanel('add'), disabled: stepProgress !== null }] : []),
            ...(recipe.steps.some((s) => s.image_source === 'generated')
              ? [{ label: 'New step photos ✨', onSelect: () => openPanel('redo'), disabled: stepProgress !== null }] : []),
            { label: 'Edit recipe', onSelect: () => navigate(`/recipes/${recipe.id}/edit`) },
            { label: 'Rework with Claude ✨', onSelect: () => setReworking(true) },
            { label: 'Print', onSelect: () => window.print() },
          ]} />
          {finish.length > 0 && (
            <Link to={`/recipes/${recipe.id}/cook?portions=${target}${at ? `&${dayQuery(at)}` : ''}`} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink no-underline">Cook mode</Link>
          )}
        </div>
      </div>

      {recipe.versionNote && (
        <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-accent-soft px-4 py-3">
          <span className="font-semibold">Tonight's version: {recipe.versionNote}</span>
          <Link to={`/recipes/${recipe.id}`} className="text-sm font-semibold text-accent underline">See the saved recipe</Link>
        </p>
      )}
      {photoError && <ErrorBanner message={photoError} />}
      {tickError && <ErrorBanner message={tickError} />}
      {photoPanel && (
        <section aria-label={photoPanel === 'add' ? 'Add step photos' : 'New step photos'} className="grid gap-3 rounded-2xl bg-accent-soft px-4 py-3 print:hidden">
          <p className="m-0 font-semibold">
            {photoPanel === 'add' ? `${addSentence(panelSteps.length, iconsToMake, needHero)}? About ${photoCost(addCount)}.`
              : `Remake ${panelSteps.length} step photo${panelSteps.length === 1 ? '' : 's'}? About ${photoCost(panelSteps.length)}.`}
          </p>
          {panelSteps.length > 0 && <p className="m-0 text-sm text-muted">Optional: say in one sentence what each photo should show. Leave it blank to let the recipe decide.</p>}
          <div className="grid gap-2">
            {panelSteps.map((st) => (
              <label key={st.id} className="grid gap-1 text-sm font-semibold">
                Step {ordered.indexOf(st) + 1}: {st.title}
                <input type="text" maxLength={200} placeholder="e.g. Chickpeas bubbling in a creamy tomato sauce"
                  value={hints[st.id!] ?? ''} onChange={(e) => setHints((h) => ({ ...h, [st.id!]: e.target.value }))}
                  className="rounded-lg border border-line bg-surface px-3 py-2 font-normal" />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPhotoPanel(null)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
            <button type="button" onClick={() => {
              const mode = photoPanel; setPhotoPanel(null); setPhotoError(null);
              if (mode === 'add') void addStepPhotos(hints); else void newStepPhotos(hints);
            }} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Make photos</button>
          </div>
        </section>
      )}
      <ReworkRecipe recipeId={recipe.id} title={recipe.title} householdId={householdId!} asking={reworking} onClose={closeRework} onReworked={reload} />
      <HeroImage key={recipe.hero_image_path ?? 'none'} recipe={recipe} width={PHOTO_LARGE} className="aspect-[2/1] w-full rounded-2xl print:aspect-[3/1]" />
      <header>
        <h1 className="mt-1 text-3xl font-bold leading-tight sm:text-4xl">{recipe.title}</h1>
        {recipe.subtitle && <p className="text-muted">{recipe.subtitle}</p>}
        {params.get('lunch') && <UseForLunch householdId={householdId!} recipeId={recipe.id} date={params.get('lunch')!} />}
        {originalHost && (
          <a href={recipe.source_url!} target="_blank" rel="noreferrer" className="mr-3 mt-1 inline-block text-sm font-semibold text-accent">
            Original recipe ({originalHost})
          </a>
        )}
        {recipe.cookidoo_url && recipe.cookidoo_status !== 'none' && (
          <a href={recipe.cookidoo_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-accent">
            {recipe.cookidoo_status === 'outdated' ? 'In Cookidoo (update pending)' : 'In Cookidoo'}
          </a>
        )}
        {recipe.rating === 'down' && (
          <p className="mt-1 text-sm font-semibold text-warn">
            <span>Not for us</span> · <button type="button" onClick={() => void undoNotForUs()} className="font-semibold underline">Undo</button>
          </p>
        )}
        {stepProgress && <p className="mt-1 text-sm font-semibold text-accent">Making {stepProgress.what ?? 'step photos'}… {stepProgress.done} of {stepProgress.total}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recipe.equipment.filter((e) => KNOWN_MACHINES.has(e)).map((e) => (
            <span key={e} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{machineLabel(e as Machine)}</span>
          ))}
          {recipe.prep_minutes > 0 && <span className="rounded-full bg-evening-soft px-2.5 py-0.5 text-xs font-semibold text-evening">Make-ahead</span>}
          <button type="button" role="switch" aria-checked={recipe.reheats_well} aria-label="Reheats well" onClick={() => void flipReheats()}
            title="Tap to change. Dinners that reheat well also make the next day's lunch."
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${recipe.reheats_well ? 'bg-teal-soft text-teal' : 'border border-dashed border-line text-muted'}`}>
            {recipe.reheats_well ? '✓ Reheats well' : "Doesn't reheat"}
          </button>
          {recipe.kind !== 'snack' && (
            <button type="button" role="switch" aria-checked={!!recipe.snack_ok} aria-label="Can be a snack"
              onClick={() => (recipe.snack_ok ? void saveSnack({ snack_ok: false, snack_portions: recipe.snack_portions ?? null, keeps_days: recipe.keeps_days ?? null, toddler_ok: recipe.toddler_ok }) : setSnackOpen(true))}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${recipe.snack_ok ? 'bg-accent-soft text-accent' : 'border border-dashed border-line text-muted'}`}>
              {recipe.snack_ok ? `✓ Snack${recipe.snack_portions ? ` · ${recipe.snack_portions} a batch` : ''}` : 'Can be a snack?'}
            </button>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${recipe.toddler_ok ? 'bg-accent-soft text-accent' : 'bg-yolk-soft text-yolk'}`}>
            {recipe.toddler_ok ? 'Toddler OK' : 'Toddler note'}
          </span>
          {recipe.tags.map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{t}</span>)}
        </div>
        {snackOpen && <SnackDetails recipe={recipe} onCancel={() => setSnackOpen(false)} onSave={(o) => void saveSnack({ snack_ok: true, ...o })} />}
        <AddToAdhoc householdId={householdId!} recipeId={recipe.id} portions={target} />
      </header>

      {split ? (
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-evening-soft p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.prep_minutes} min</dd><dt className="text-xs text-muted">Prep ahead</dt></div>
          <div className="rounded-2xl border border-line bg-surface p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.finish_minutes} min</dd><dt className="text-xs text-muted">On the day</dt></div>
          <div className="rounded-2xl border border-line bg-surface p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.hands_off_minutes} min</dd><dt className="text-xs text-muted">of that, hands-off</dt></div>
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-line bg-surface p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.prep_minutes + recipe.finish_minutes} min</dd><dt className="text-xs text-muted">Start to finish</dt></div>
          <div className="rounded-2xl border border-line bg-surface p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.hands_off_minutes} min</dd><dt className="text-xs text-muted">of that, hands-off</dt></div>
        </dl>
      )}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] md:gap-8">
        <div>
          <h2 className="text-xl font-bold">Ingredients</h2>
          <div role="tablist" aria-label="Portions" className="mt-2 flex w-max max-w-full flex-wrap gap-1 rounded-xl bg-surface-2 p-1 print:hidden">
            {presets.map((n) => (
              <button key={n} type="button" role="tab" aria-selected={target === n} onClick={() => setPortions(n)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${target === n ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
                {tabLabel(n)}
              </button>
            ))}
          </div>
          {/* Any number in between: − and + step by whole portions from whatever is shown. */}
          <div className="mt-2 flex items-center gap-2 print:hidden">
            <button type="button" aria-label="Fewer portions" disabled={target <= 1} onClick={() => setPortions(Math.max(1, Math.ceil(target) - 1))}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-lg font-bold disabled:opacity-40">−</button>
            <span role="status" aria-label="Portions" className="min-w-[96px] text-center text-sm font-semibold">
              {Number.isInteger(target) ? `${target} portion${target === 1 ? '' : 's'}` : `${formatPortions(target)} portions`}
            </span>
            <button type="button" aria-label="More portions" disabled={target >= MAX_PORTIONS} onClick={() => setPortions(Math.min(MAX_PORTIONS, Math.floor(target) + 1))}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-lg font-bold disabled:opacity-40">+</button>
          </div>
          <p className="mt-2 hidden text-sm print:block">Quantities for {formatPortions(target)} portions.</p>
          {groupIngredients(recipe.ingredients).map((g) => (
            <div key={g.group}>
              <h3 className="mb-1 mt-4 text-xs font-bold uppercase tracking-[0.06em] text-muted">{g.group}</h3>
              <ul>
                {g.items.map((item, i) => (
                  <li key={item.id ?? i} className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2 border-b border-line py-1.5 md:py-2">
                    <span className="font-bold tabular-nums">{formatQty(item.qty === null ? null : item.qty * factor, item.unit, item.qty_approx)}</span>
                    <span><span>{item.name}</span>{item.note && <span className="text-[12.5px] text-muted"> · {item.note}</span>}{recipe.versionNote && (item as { changed?: boolean }).changed && <span className="ml-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold">changed</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {recipe.equipment.length > 0 && (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-1 text-base font-bold">You'll need</h2>
              {recipe.equipment.map((e) => (KNOWN_MACHINES.has(e) ? machineLabel(e as Machine) : e)).join(' · ')}
            </div>
          )}
          {(recipe.toddler_note || saltNote) && (
            <div className="mt-4 rounded-2xl bg-yolk-soft p-4">
              <h2 className="mb-1 text-base font-bold">Toddler note</h2>
              {recipe.toddler_note && <p className="m-0">{recipe.toddler_note}</p>}
              {saltNote && <p className="m-0 mt-1">{saltNote}</p>}
            </div>
          )}
        </div>

        <div>
          {missingPhotos + iconsToMake > 0 && !photoPanel && !stepProgress && !photoBusy && (
            <button type="button" onClick={() => openPanel('add')} className="mb-3 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold print:hidden">
              {addLabel} ({addCount} photo{addCount === 1 ? '' : 's'}, about {photoCost(addCount)})
            </button>
          )}
          <Steps steps={[...prep, ...finish]} label="Method" markAhead batch={parseBatch(recipe.batch)} />
          {settings.length > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-2 text-base font-bold">Machine settings</h2>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {settings.map((s, i) => (
                    <tr key={s.id ?? i} className="border-t border-line align-top">
                      <td className="whitespace-nowrap py-1.5 pr-3 font-bold">{machineLabel(s.machine!)}</td>
                      <td className="py-1.5">{s.title}: {withFahrenheit(s.settings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {recipe.reheat && (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-1 text-base font-bold">Reheating for the office</h2>
              <p className="m-0">{recipe.reheat}</p>
            </div>
          )}
          <NutritionTable recipe={recipe} adultShare={Number(members.find((m) => m.kind === 'adult')?.portion_weight) || 1.25} />
        </div>
      </div>
    </article>
  );
}

const NUTRITION_ROWS: { key: keyof Nutrition; label: string; unit: string; sub?: boolean }[] = [
  { key: 'kcal', label: 'Calories', unit: ' kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'sat_fat_g', label: 'of which saturates', unit: 'g', sub: true },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'sugars_g', label: 'of which sugars', unit: 'g', sub: true },
  { key: 'free_sugars_g', label: 'of which free sugars', unit: 'g', sub: true },
  { key: 'fibre_g', label: 'Fibre', unit: 'g' },
  { key: 'salt_g', label: 'Salt', unit: 'g' },
  { key: 'veg_portions', label: 'Veg portions', unit: '' },
  { key: 'fruit_portions', label: 'Fruit portions', unit: '' },
];
/** Whole numbers from 10 up, one decimal below (7.5g, 1.2g salt). */
const amount = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

/** The recipe's nutrition at the bottom of the page: per serving and an adult's share, plus one snack for a recipe
 *  that can be a snack; a snack recipe's estimate is already per snack. */
function NutritionTable({ recipe, adultShare }: { recipe: RecipeDetail; adultShare: number }) {
  const n = parseNutrition(recipe.nutrition);
  const cols: { label: string; share: number }[] = recipe.kind === 'snack' ? [{ label: 'Per snack', share: 1 }] : [
    { label: 'Per serving', share: 1 }, { label: 'Each adult', share: adultShare },
    ...(recipe.snack_ok ? [{ label: 'One snack', share: snackFactor(recipe) }] : []),
  ];
  return (
    <section aria-label="Nutrition" className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-1 text-base font-bold">Nutrition</h2>
      {!n ? <p className="m-0 text-muted">No estimate yet.</p> : (
        <>
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1 pr-3 font-semibold"><span className="sr-only">Nutrient</span></th>
                {cols.map((c) => <th key={c.label} scope="col" className="py-1 pl-3 text-right font-semibold">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {NUTRITION_ROWS.filter((r) => typeof n[r.key] === 'number').map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <th scope="row" className={`py-1.5 pr-3 text-left ${r.sub ? 'pl-3 font-normal text-muted' : 'font-semibold'}`}>{r.label}</th>
                  {cols.map((c) => <td key={c.label} className="py-1.5 pl-3 text-right">{amount((n[r.key] as number) * c.share)}{r.unit}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 mt-2 text-xs text-muted">Claude's estimate from the ingredients.</p>
        </>
      )}
    </section>
  );
}

/** How a recipe works as a snack: snacks from one batch, days it keeps from the day it's made, and OK for the toddler. */
function SnackDetails({ recipe, onSave, onCancel }: { recipe: { snack_portions?: number | null; keeps_days?: number | null; toddler_ok: boolean; base_portions: number };
  onSave: (o: { snack_portions: number; keeps_days: number; toddler_ok: boolean }) => void; onCancel: () => void }) {
  const [count, setCount] = useState(String(recipe.snack_portions ?? Math.round(recipe.base_portions)));
  const [keeps, setKeeps] = useState(String(recipe.keeps_days ?? 3));
  const [toddler, setToddler] = useState(recipe.toddler_ok);
  const [problem, setProblem] = useState<string | null>(null);
  const box = 'w-20 rounded-lg border border-line bg-bg px-2 py-1 text-right';
  function save() {
    const n = Number(count), k = Number(keeps);
    if (!Number.isInteger(n) || n < 1 || n > 100) { setProblem('Snacks from one batch: a whole number from 1 to 100.'); return; }
    if (!Number.isInteger(k) || k < 1 || k > 7) { setProblem('Keeps for: 1 to 7 days.'); return; }
    onSave({ snack_portions: n, keeps_days: k, toddler_ok: toddler });
  }
  return (
    <div role="group" aria-label="As a snack" className="mt-3 grid gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
      <label className="flex items-center justify-between gap-2">Snacks from one batch
        <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className={box} /></label>
      <label className="flex items-center justify-between gap-2">Keeps for (days)
        <input inputMode="numeric" value={keeps} onChange={(e) => setKeeps(e.target.value)} className={box} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={toddler} onChange={(e) => setToddler(e.target.checked)} /> OK for the toddler</label>
      <p className="m-0 text-xs text-muted">One snack's numbers are this recipe's for one of those: e.g. a 4-serving tray cut into 8 squares makes each square half a serving.</p>
      {problem && <p role="alert" className="m-0 font-semibold text-warn">{problem}</p>}
      <span className="flex gap-2">
        <button type="button" onClick={save} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">Save snack details</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Cancel</button>
      </span>
    </div>
  );
}

/** The snack make this recipe is cooked for: today's, else the next one planned (this week or next); null if none. */
async function plannedMake(householdId: string, recipeId: string) {
  try {
    const { thisWeek, nextWeek, london } = weekStarts();
    const [weeks, settings, recipes] = await Promise.all([
      Promise.all([thisWeek, nextWeek].map((ws) => repo.getWeek(householdId, ws))), repo.getSettings(householdId), repo.listRecipes(householdId)]);
    return nextMake(weeks.flatMap((w) => weekMakes(w, settings, recipes)), recipeId, london.date);
  } catch {
    return null;
  }
}
