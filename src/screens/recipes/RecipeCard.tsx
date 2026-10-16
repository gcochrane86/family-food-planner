import { PHOTO_LARGE } from '../../lib/photoSizes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { householdPortions } from '../../lib/household';
import { formatQty, groupIngredients, machineLabel, scaleFactor, toddlerSaltNote } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import { makeStepPhotos } from '../../lib/stepPhotos';
import type { Machine, RecipeStep } from '../../lib/types';
import { formatPortions } from '../settings/Household';
import { useAsync } from '../settings/useAsync';
import HeroImage from './HeroImage';
import MachineBadge, { StepText } from './MachineBadge';
import RecipeMenu from './RecipeMenu';
import ReworkRecipe from './ReworkRecipe';
import { switchClasses, usePrepAhead } from '../../lib/prepAhead';

/** The original page's host for a web recipe, or null when there's no usable http(s) link. */
function linkHost(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try { return new URL(url).host || null; } catch { return null; }
}

const SOURCE = { own_doc: 'Your recipe', hellofresh: 'HelloFresh, converted', claude: 'New · written by Claude', cookidoo: 'From your Cookidoo', web: 'From the web, converted' } as const;
const KNOWN_MACHINES = new Set(['tm7', 'apo', 'hy24', 'meater', 'hob', 'oven', 'kettle']);

/** A rough cost for n AI photos: about 3p each with Google's image model. */
export function photoCost(n: number): string {
  const pence = n * 3;
  return pence < 100 ? `${pence}p` : `£${(pence / 100).toFixed(2)}`;
}

function Steps({ steps, label, minutes, timeline, markAhead }: {
  steps: RecipeStep[]; label: string; minutes?: number; timeline?: boolean; markAhead?: boolean;
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
                  {markAhead && s.phase === 'prep_8pm' && <small className="mr-2 rounded-full bg-evening-soft px-2 py-0.5 text-[11px] font-semibold text-evening">Can be done ahead</small>}
                  {timeline && s.at_minute !== null && <small className="font-mono text-[11px] font-medium text-muted">at {s.at_minute} min</small>}
                </div>
              </div>
              {s.machine && <div><MachineBadge machine={s.machine} settings={s.settings} /></div>}
              <p className="m-0 text-[15.5px] leading-relaxed md:text-[17px]"><StepText text={s.body} /></p>
            </div>
            {s.image_path && (
              <img src={repo.heroUrl(s.image_path, PHOTO_LARGE)} alt={`Step ${i + 1}: ${s.title}`} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function RecipeCard() {
  const navigate = useNavigate();
  const [reworking, setReworking] = useState(false);
  const closeRework = useCallback(() => setReworking(false), []);
  const { id = '' } = useParams();
  const { householdId } = useAuth();
  const { data, setData, error, loading, reload } = useAsync(async () => {
    const [recipe, members] = await Promise.all([repo.getRecipe(id), repo.listMembers(householdId!)]);
    return { recipe, members };
  }, [id, householdId]);
  const [portions, setPortions] = useState<number | null>(null);
  const [prepAhead, setPrepAhead] = usePrepAhead();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [stepProgress, setStepProgress] = useState<{ done: number; total: number } | null>(null);
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

  const household = householdPortions(members) || recipe.base_portions;
  const presets = [household, 6, 9].filter((v, i, a) => a.indexOf(v) === i);
  const target = portions ?? household;
  const factor = scaleFactor(target, recipe.base_portions);
  const toddler = members.find((m) => m.kind === 'child');
  const saltNote = toddler ? toddlerSaltNote(recipe.salt_per_portion_g, toddler.portion_weight) : null;
  const prep = recipe.steps.filter((s) => s.phase === 'prep_8pm');
  const finish = recipe.steps.filter((s) => s.phase === 'finish');
  const split = prepAhead && prep.length > 0;
  const settings = recipe.steps.filter((s) => s.machine && s.settings);
  const missingPhotos = recipe.steps.filter((s) => s.id && !s.image_path).length;
  const PHASE_ORDER: Record<string, number> = { prep_8pm: 0, finish: 1, reheat: 2 };
  const ordered = [...recipe.steps].sort((a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9) || a.position - b.position);
  const panelSteps = ordered.filter((st) => st.id && (photoPanel === 'add' ? !st.image_path : st.image_source === 'generated'));
  function openPanel(mode: 'add' | 'redo') {
    setHints(Object.fromEntries(recipe!.steps.filter((st) => st.id && st.photo_hint).map((st) => [st.id!, st.photo_hint!])));
    setPhotoPanel(mode);
  }
  const tabLabel = (n: number) => (n === household ? `Household · ${formatPortions(n)}` : n === 9 ? '9 · big batch' : `${n} portions`);

  return (
    <article className="grid gap-4 py-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link to="/recipes" className="text-sm font-semibold text-muted no-underline">← Recipes</Link>
        <div className="flex items-center gap-2">
          {photoBusy && <span className="text-sm font-semibold text-muted">Making photo…</span>}
          <RecipeMenu items={[
            { label: 'New main photo ✨', onSelect: () => void newPhoto(), disabled: photoBusy },
            ...(missingPhotos > 0
              ? [{ label: 'Add step photos ✨', onSelect: () => openPanel('add'), disabled: stepProgress !== null }] : []),
            ...(recipe.steps.some((s) => s.image_source === 'generated')
              ? [{ label: 'New step photos ✨', onSelect: () => openPanel('redo'), disabled: stepProgress !== null }] : []),
            { label: 'Edit recipe', onSelect: () => navigate(`/recipes/${recipe.id}/edit`) },
            { label: 'Rework with Claude ✨', onSelect: () => setReworking(true) },
            { label: 'Print', onSelect: () => window.print() },
          ]} />
          {finish.length > 0 && (
            <Link to={`/recipes/${recipe.id}/cook`} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink no-underline">Cook mode</Link>
          )}
        </div>
      </div>

      {photoError && <ErrorBanner message={photoError} />}
      {photoPanel && (
        <section aria-label={photoPanel === 'add' ? 'Add step photos' : 'New step photos'} className="grid gap-3 rounded-2xl bg-accent-soft px-4 py-3 print:hidden">
          <p className="m-0 font-semibold">
            {photoPanel === 'add' ? 'Make' : 'Remake'} {panelSteps.length} step photo{panelSteps.length === 1 ? '' : 's'}? About {photoCost(panelSteps.length)}.
          </p>
          <p className="m-0 text-sm text-muted">Optional: say in one sentence what each photo should show. Leave it blank to let the recipe decide.</p>
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
              if (mode === 'add') { started.current = recipe.id; runStepPhotos(recipe, true, hints); } else void newStepPhotos(hints);
            }} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Make photos</button>
          </div>
        </section>
      )}
      <ReworkRecipe recipeId={recipe.id} householdId={householdId!} asking={reworking} onClose={closeRework} />
      <HeroImage key={recipe.hero_image_path ?? 'none'} recipe={recipe} width={PHOTO_LARGE} className="aspect-[2/1] w-full rounded-2xl print:aspect-[3/1]" />
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{SOURCE[recipe.source]}{recipe.status === 'draft' ? ' · draft until you rate it' : ''}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight sm:text-4xl">{recipe.title}</h1>
        {recipe.subtitle && <p className="text-muted">{recipe.subtitle}</p>}
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
        {stepProgress && <p className="mt-1 text-sm font-semibold text-accent">Making step photos… {stepProgress.done} of {stepProgress.total}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recipe.equipment.filter((e) => KNOWN_MACHINES.has(e)).map((e) => (
            <span key={e} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{machineLabel(e as Machine)}</span>
          ))}
          {recipe.prep_minutes > 0 && <span className="rounded-full bg-evening-soft px-2.5 py-0.5 text-xs font-semibold text-evening">Make-ahead</span>}
          {recipe.reheats_well && <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-semibold text-teal">Reheats well</span>}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${recipe.toddler_ok ? 'bg-accent-soft text-accent' : 'bg-yolk-soft text-yolk'}`}>
            {recipe.toddler_ok ? 'Toddler OK' : 'Toddler note'}
          </span>
          {recipe.tags.map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{t}</span>)}
        </div>
      </header>

      {split ? (
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-evening-soft p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.prep_minutes} min</dd><dt className="text-xs text-muted">The night before</dt></div>
          <div className="rounded-2xl border border-line bg-surface p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.finish_minutes} min</dd><dt className="text-xs text-muted">On the night</dt></div>
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
          <p className="mt-2 hidden text-sm print:block">Quantities for {formatPortions(target)} portions.</p>
          {groupIngredients(recipe.ingredients).map((g) => (
            <div key={g.group}>
              <h3 className="mb-1 mt-4 text-xs font-bold uppercase tracking-[0.06em] text-muted">{g.group}</h3>
              <ul>
                {g.items.map((item, i) => (
                  <li key={item.id ?? i} className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2 border-b border-line py-1.5 md:py-2">
                    <span className="font-bold tabular-nums">{formatQty(item.qty === null ? null : item.qty * factor, item.unit, item.qty_approx)}</span>
                    <span><span>{item.name}</span>{item.note && <span className="text-[12.5px] text-muted"> · {item.note}</span>}</span>
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
          {prep.length > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-evening-soft px-4 py-3 print:hidden">
              <span className="text-sm">
                <b className="block">Prep ahead</b>
                <span className="text-muted">Split out what you can do the night before ({recipe.prep_minutes} min)</span>
              </span>
              <button type="button" role="switch" aria-checked={split} aria-label="Prep ahead" onClick={() => setPrepAhead(!split)} className={switchClasses(split)}>
                <span className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${split ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}
          {split ? (
            <>
              <Steps steps={prep} label="The night before" minutes={recipe.prep_minutes} />
              <Steps steps={finish} label="On the night" minutes={recipe.finish_minutes} timeline />
            </>
          ) : (
            <Steps steps={[...prep, ...finish]} label="Method" markAhead />
          )}
          {settings.length > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-2 text-base font-bold">Machine settings</h2>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {settings.map((s, i) => (
                    <tr key={s.id ?? i} className="border-t border-line align-top">
                      <td className="whitespace-nowrap py-1.5 pr-3 font-bold">{machineLabel(s.machine!)}</td>
                      <td className="py-1.5">{s.title}: {s.settings}</td>
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
        </div>
      </div>
    </article>
  );
}
