import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { householdPortions } from '../../lib/household';
import { formatQty, groupIngredients, machineLabel, pantryLabel, scaleFactor, toddlerSaltNote } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import { makeStepPhotos } from '../../lib/stepPhotos';
import type { Machine, RecipeStep } from '../../lib/types';
import { formatPortions } from '../settings/Household';
import { useAsync } from '../settings/useAsync';
import HeroImage from './HeroImage';
import MachineBadge, { StepText } from './MachineBadge';

const SOURCE = { own_doc: 'Your recipe', hellofresh: 'HelloFresh, converted', claude: 'New · written by Claude' } as const;
const KNOWN_MACHINES = new Set(['tm7', 'apo', 'hy24', 'meater', 'hob', 'oven', 'kettle']);

function Steps({ steps, label, pill, timeline, redo, redoing }: {
  steps: RecipeStep[]; label: string; pill: string; timeline?: boolean; redo: (s: RecipeStep) => void; redoing: string | null;
}) {
  if (!steps.length) return null;
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <section aria-labelledby={id} className="mt-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill}`}>{timeline ? 'Phase 2' : 'Phase 1'}</span>
        <h2 id={id} className="text-xl font-bold">{label}</h2>
      </div>
      <ol className="divide-y divide-line border-t border-line">
        {steps.map((s, i) => (
          <li key={s.id ?? i} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 py-3">
            <span className="font-display text-2xl font-bold leading-none text-muted">
              {i + 1}
              {timeline && s.at_minute !== null && <small className="mt-1 block font-mono text-[11px] font-medium">{s.at_minute} min</small>}
            </span>
            <div className="grid gap-1.5">
              <h3 className="text-base font-bold">{s.title}</h3>
              {s.machine && <div><MachineBadge machine={s.machine} settings={s.settings} /></div>}
              <p className="m-0"><StepText text={s.body} /></p>
              {s.image_path && <img src={repo.heroUrl(s.image_path)} alt={`Step ${i + 1}: ${s.title}`} loading="lazy" className="mt-1 max-h-60 rounded-xl object-cover" />}
              {s.image_path && s.image_source === 'generated' && (
                <button type="button" onClick={() => redo(s)} disabled={redoing !== null}
                  className="justify-self-start text-[13px] font-semibold text-muted underline disabled:opacity-60 print:hidden">
                  {redoing === s.id ? 'Making photo…' : 'Redo photo'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function RecipeCard() {
  const { id = '' } = useParams();
  const { householdId } = useAuth();
  const { data, setData, error, loading, reload } = useAsync(async () => {
    const [recipe, members, staples] = await Promise.all([repo.getRecipe(id), repo.listMembers(householdId!), repo.listStaples(householdId!)]);
    return { recipe, members, staples };
  }, [id, householdId]);
  const [portions, setPortions] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [stepProgress, setStepProgress] = useState<{ done: number; total: number } | null>(null);
  const [redoing, setRedoing] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const setStepPhoto = (stepId: string, path: string) => setData((d) => d && d.recipe ? {
    ...d, recipe: { ...d.recipe, steps: d.recipe.steps.map((s) => (s.id === stepId ? { ...s, image_path: path, image_source: 'generated' as const } : s)) },
  } : d);

  // A liked recipe gets a photo for every step: start, join or carry on that run whenever the recipe is open.
  const liked = data?.recipe?.rating === 'up' ? data.recipe : null;
  useEffect(() => {
    if (!liked || started.current === liked.id || !liked.steps.some((s) => s.id && !s.image_path)) return;
    started.current = liked.id;
    void makeStepPhotos(liked.id, liked.steps, (done, total, stepId, path) => {
      setStepProgress({ done, total });
      if (stepId && path) setStepPhoto(stepId, path);
    }).then((result) => {
      setStepProgress(null);
      if (result.error) setPhotoError(`Couldn't make step photos: ${result.error}`);
    });
  }, [liked]); // eslint-disable-line react-hooks/exhaustive-deps

  async function redo(step: RecipeStep) {
    if (!data?.recipe || !step.id) return;
    setRedoing(step.id);
    setPhotoError(null);
    try {
      setStepPhoto(step.id, await repo.generateStepPhoto(data.recipe.id, step.id, true));
    } catch (e) {
      setPhotoError(`Couldn't make a photo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRedoing(null);
    }
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
  const { recipe, members, staples } = data;
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
  const settings = recipe.steps.filter((s) => s.machine && s.settings);
  const tabLabel = (n: number) => (n === household ? `Household · ${formatPortions(n)}` : n === 9 ? '9 · big batch' : `${n} portions`);

  return (
    <article className="grid gap-4 py-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link to="/recipes" className="text-sm font-semibold text-muted no-underline">← Recipes</Link>
        <div className="flex gap-2">
          <button type="button" onClick={() => void newPhoto()} disabled={photoBusy}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
            {photoBusy ? 'Making photo…' : 'New photo ✨'}
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Print</button>
          {finish.length > 0 && (
            <Link to={`/recipes/${recipe.id}/cook`} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink no-underline">Cook mode</Link>
          )}
        </div>
      </div>

      {photoError && <ErrorBanner message={photoError} />}
      <HeroImage key={recipe.hero_image_path ?? 'none'} recipe={recipe} className="aspect-[2/1] w-full rounded-2xl print:aspect-[3/1]" />
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{SOURCE[recipe.source]}{recipe.status === 'draft' ? ' · draft until you rate it' : ''}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight sm:text-4xl">{recipe.title}</h1>
        {recipe.subtitle && <p className="text-muted">{recipe.subtitle}</p>}
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

      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-evening-soft p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.prep_minutes} min</dd><dt className="text-xs text-muted">8pm prep, night before</dt></div>
        <div className="rounded-2xl border border-line bg-surface p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.finish_minutes} min</dd><dt className="text-xs text-muted">Dinner finish</dt></div>
        <div className="rounded-2xl border border-line bg-surface p-3"><dd className="m-0 font-display text-2xl font-bold">{recipe.hands_off_minutes} min</dd><dt className="text-xs text-muted">of that, hands-off</dt></div>
      </dl>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
                {g.items.map((item, i) => {
                  const label = pantryLabel(item.name, staples);
                  return (
                    <li key={item.id ?? i} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-line py-1.5">
                      <span className="font-bold tabular-nums">{formatQty(item.qty === null ? null : item.qty * factor, item.unit, item.qty_approx)}</span>
                      <span><span>{item.name}</span>{item.note && <span className="text-[12.5px] text-muted"> · {item.note}</span>}</span>
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${label === 'In pantry' ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent'}`}>{label}</span>
                    </li>
                  );
                })}
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
          <Steps steps={prep} label="8pm prep, the night before" pill="bg-evening-soft text-evening" redo={(s) => void redo(s)} redoing={redoing} />
          <Steps steps={finish} label="Dinner-time finish" pill="bg-accent-soft text-accent" timeline redo={(s) => void redo(s)} redoing={redoing} />
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
