import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { Machine, Phase, RecipeDetail, RecipeIngredient, RecipeStep } from '../../lib/types';
import { useAsync } from '../settings/useAsync';

const PHASES: { value: Phase; label: string }[] = [
  { value: 'prep_8pm', label: 'Night before' }, { value: 'finish', label: 'On the night' }, { value: 'reheat', label: 'Reheat' },
];
const MACHINES: { value: Machine; label: string }[] = [
  { value: 'tm7', label: 'TM7' }, { value: 'apo', label: 'Anova oven' }, { value: 'hy24', label: 'HY air-fryer' },
  { value: 'meater', label: 'MEATER' }, { value: 'hob', label: 'Hob' }, { value: 'oven', label: 'Oven' }, { value: 'kettle', label: 'Kettle' },
];
const ORDER: Record<Phase, number> = { prep_8pm: 0, finish: 1, reheat: 2 };

// Amounts are edited as text so a half-typed "0." isn't lost; they become numbers on save.
type IngredientRow = Omit<RecipeIngredient, 'qty'> & { qty: string; key: number };
type StepRow = RecipeStep & { key: number };
let nextKey = 1;

const input = 'w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-base';
const label = 'grid gap-1 text-[13px] font-semibold text-muted';
const small = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-sm font-semibold disabled:opacity-40';

/** Edit a recipe by hand: its name, times, ingredients and steps (including which machine each step uses). */
export default function RecipeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => repo.getRecipe(id!), [id]);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setRecipe(data);
    setIngredients(data.ingredients.map((g) => ({ ...g, qty: g.qty === null ? '' : String(g.qty), key: nextKey++ })));
    setSteps([...data.steps].sort((a, b) => ORDER[a.phase] - ORDER[b.phase] || a.position - b.position).map((s) => ({ ...s, key: nextKey++ })));
  }, [data]);

  if (error) return <div className="py-6"><ErrorBanner message={error} onRetry={reload} /></div>;
  if (loading || !data || !recipe) return <p className="py-6 text-muted">Loading…</p>;

  const setField = <K extends keyof RecipeDetail>(k: K, v: RecipeDetail[K]) => setRecipe({ ...recipe, [k]: v });
  const setIngredient = (key: number, patch: Partial<IngredientRow>) => setIngredients((list) => list.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const setStep = (key: number, patch: Partial<StepRow>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) => setSteps((list) => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });

  async function save() {
    const kept = ingredients.filter((g) => g.name.trim());
    const qtys = kept.map((g) => (g.qty.trim() === '' ? null : Number(g.qty)));
    if (!recipe!.title.trim()) return setProblem('The recipe needs a title.');
    if (qtys.some((q) => q !== null && !(Number.isFinite(q) && q >= 0))) return setProblem('Amounts must be numbers (or left empty).');
    if (steps.some((s) => !s.title.trim() || !s.body.trim())) return setProblem('Every step needs a title and what to do.');
    setProblem(null);
    setSaving(true);
    try {
      await repo.saveRecipe(id!, {
        title: recipe!.title.trim(), subtitle: recipe!.subtitle?.trim() || null,
        prep_minutes: recipe!.prep_minutes, finish_minutes: recipe!.finish_minutes,
      }, kept.map(({ key: _k, ...g }, i) => ({ ...g, name: g.name.trim(), unit: g.unit.trim(), group_name: g.group_name?.trim() || null, note: g.note?.trim() || null, qty: qtys[i] })),
      steps.map(({ key: _k, ...s }) => ({ ...s, title: s.title.trim(), body: s.body.trim(), settings: s.settings?.trim() || null })));
      navigate(`/recipes/${id}`);
    } catch {
      setProblem("Couldn't save. Check your connection and try again; your changes are still here.");
      setSaving(false);
    }
  }

  const minutes = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  return (
    <section className="grid gap-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Edit recipe</h1>
        <span className="flex gap-2">
          <Link to={`/recipes/${id}`} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold no-underline">Cancel</Link>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Save</button>
        </span>
      </div>
      {problem && <p role="alert" className="m-0 rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">{problem}</p>}

      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
        <label className={label}>Title<input className={input} value={recipe.title} onChange={(e) => setField('title', e.target.value)} /></label>
        <label className={label}>Subtitle<input className={input} value={recipe.subtitle ?? ''} onChange={(e) => setField('subtitle', e.target.value)} /></label>
        <label className={label}>Night-before prep (min)<input className={input} inputMode="numeric" value={recipe.prep_minutes} onChange={(e) => setField('prep_minutes', minutes(e.target.value))} /></label>
        <label className={label}>Dinner time (min)<input className={input} inputMode="numeric" value={recipe.finish_minutes} onChange={(e) => setField('finish_minutes', minutes(e.target.value))} /></label>
      </div>

      <div className="grid gap-2">
        <h2 className="text-xl font-bold">Ingredients</h2>
        <p className="m-0 text-sm text-muted">Amounts are for {data.base_portions} portions.</p>
        {ingredients.map((g, i) => (
          <div key={g.key} role="group" aria-label={`Ingredient ${i + 1}`} className="grid grid-cols-[5rem_4rem_1fr_auto] items-end gap-2 rounded-xl border border-line bg-surface p-2.5 sm:grid-cols-[8rem_5rem_4rem_1fr_10rem_auto]">
            <label className={`${label} col-span-4 sm:col-span-1`}>Group<input className={input} value={g.group_name ?? ''} onChange={(e) => setIngredient(g.key, { group_name: e.target.value })} /></label>
            <label className={label}>Amount<input className={input} inputMode="decimal" value={g.qty} onChange={(e) => setIngredient(g.key, { qty: e.target.value })} /></label>
            <label className={label}>Unit<input className={input} value={g.unit} onChange={(e) => setIngredient(g.key, { unit: e.target.value })} /></label>
            <label className={label}>Name<input className={input} value={g.name} onChange={(e) => setIngredient(g.key, { name: e.target.value })} /></label>
            <label className={`${label} col-span-3 sm:col-span-1`}>Note<input className={input} value={g.note ?? ''} onChange={(e) => setIngredient(g.key, { note: e.target.value })} /></label>
            <button type="button" aria-label={`Remove ${g.name || 'ingredient'}`} onClick={() => setIngredients((list) => list.filter((x) => x.key !== g.key))} className={small}>×</button>
          </div>
        ))}
        <button type="button" className={`${small} justify-self-start`}
          onClick={() => setIngredients((list) => [...list, { key: nextKey++, position: list.length + 1, group_name: list.at(-1)?.group_name ?? null, name: '', qty: '', unit: '', note: null, qty_approx: false }])}>
          Add ingredient
        </button>
      </div>

      <div className="grid gap-2">
        <h2 className="text-xl font-bold">Steps</h2>
        <p className="m-0 text-sm text-muted">Put an ingredient in **double stars** to show it in bold.</p>
        {steps.map((s, i) => (
          <div key={s.key} role="group" aria-label={`Step: ${s.title}`} className="grid gap-2 rounded-xl border border-line bg-surface p-3">
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <label className={label}>When
                <select className={input} value={s.phase} onChange={(e) => setStep(s.key, { phase: e.target.value as Phase })}>
                  {PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label className={label}>Step title<input className={input} value={s.title} onChange={(e) => setStep(s.key, { title: e.target.value })} /></label>
            </div>
            <label className={label}>What to do<textarea className={`${input} min-h-20`} value={s.body} onChange={(e) => setStep(s.key, { body: e.target.value })} /></label>
            <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[10rem_1fr_7rem]">
              <label className={label}>Machine
                <select className={input} value={s.machine ?? ''} onChange={(e) => setStep(s.key, { machine: (e.target.value || null) as Machine | null })}>
                  <option value="">None</option>
                  {MACHINES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className={label}>Timer (min)<input className={input} inputMode="numeric" value={s.timer_minutes ?? ''}
                onChange={(e) => setStep(s.key, { timer_minutes: e.target.value.trim() ? minutes(e.target.value) || null : null })} /></label>
              <label className={`${label} col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1`}>Settings<input className={input} value={s.settings ?? ''} placeholder="e.g. 200°C · 20% steam · 15 min" onChange={(e) => setStep(s.key, { settings: e.target.value })} /></label>
            </div>
            <span className="flex gap-2">
              <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
              <button type="button" className={small} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>Move down</button>
              <button type="button" className={`${small} ml-auto`} onClick={() => setSteps((list) => list.filter((x) => x.key !== s.key))}>Remove step</button>
            </span>
          </div>
        ))}
        <button type="button" className={`${small} justify-self-start`}
          onClick={() => setSteps((list) => [...list, { key: nextKey++, phase: list.at(-1)?.phase ?? 'finish', position: 0, at_minute: null, title: '', body: '', machine: null, settings: null, timer_minutes: null, image_path: null, image_source: null }])}>
          Add step
        </button>
      </div>
    </section>
  );
}
