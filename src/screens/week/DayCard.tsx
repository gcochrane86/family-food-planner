import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MealSlot, Recipe } from '../../lib/types';
import { formatPortions } from '../settings/Household';
import { addDays, type WeekState } from './useWeek';

const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const POOL = ['Eggs', 'Porridge', 'Baked oats'];
const VERDICTS = [['not_enough', 'Not enough'], ['right', 'About right'], ['leftovers', 'Leftovers']] as const;
const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] font-semibold';

export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
}
const dayName = (date: string) => DAY[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];

const MODE_TAG: Record<MealSlot['mode'], [string, string]> = {
  cook: ['Cook', 'text-accent'], reheat: ['Reheat', 'text-teal'], packed: ['Packed', 'text-yolk'],
  routine: ['Routine', 'text-muted'], leftovers: ['Leftovers', 'text-muted'], out: ['Out', 'text-muted'],
};

function Label({ children, tone }: { children: string; tone: string }) {
  return <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] ${tone}`}><i className="h-2 w-2 rounded-[3px] bg-current" />{children}</span>;
}

export default function DayCard({ date, w }: { date: string; w: WeekState }) {
  const [swapping, setSwapping] = useState(false);
  const slot = (kind: MealSlot['slot'], d = date) => w.slots.find((s) => s.date === d && s.slot === kind);
  const breakfast = slot('breakfast');
  const lunch = slot('lunch');
  const dinner = slot('dinner');
  const recipe = (id: string | null | undefined): Recipe | undefined => (id ? w.recipes.get(id) : undefined);
  const dinnerRecipe = recipe(dinner?.recipe_id);
  const isMonday = dayName(date) === 'Monday';
  const tomorrow = slot('dinner', addDays(date, 1));
  const tomorrowRecipe = tomorrow?.mode === 'cook' ? recipe(tomorrow.recipe_id) : undefined;

  return (
    <section aria-label={dayLabel(date)} className="grid gap-2.5">
      <h2 className="text-xl font-bold">{dayLabel(date)}{w.officeDays.includes((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) && <span className="ml-2 rounded-full bg-yolk-soft px-2 py-0.5 align-middle text-xs font-semibold text-yolk">Office day</span>}</h2>

      {breakfast && (
        <div className="grid gap-2 rounded-2xl border border-line bg-surface p-3.5">
          <Label tone="text-yolk">Breakfast</Label>
          {isMonday ? (
            <p className="m-0 font-semibold">{breakfast.reason ?? 'Overnight oats'}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {POOL.map((p) => (
                <button key={p} type="button" aria-pressed={breakfast.routine_choice === p} onClick={() => w.breakfast(date, p)}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${breakfast.routine_choice === p ? 'border-yolk bg-yolk-soft text-yolk' : 'border-line bg-surface'}`}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {lunch && (
        <div className="grid gap-1 rounded-2xl border border-line bg-surface p-3.5">
          <div className="flex items-center justify-between"><Label tone="text-teal">Lunch</Label><span className={`text-xs font-bold ${MODE_TAG[lunch.mode][1]}`}>{MODE_TAG[lunch.mode][0]}</span></div>
          <p className="m-0 font-semibold">{lunch.reason ?? 'Home lunch'}</p>
        </div>
      )}

      {dinner && (
        <div className="grid gap-2 rounded-2xl border border-line bg-surface p-3.5">
          <div className="flex items-center justify-between"><Label tone="text-accent">Dinner</Label>{dinner.locked && <span className="text-xs font-semibold text-muted">✓ Kept</span>}</div>
          {dinner.mode === 'cook' && dinnerRecipe ? (
            <>
              <Link to={`/recipes/${dinnerRecipe.id}`} className="font-display text-lg font-semibold leading-tight no-underline">{dinnerRecipe.title}</Link>
              <p className="m-0 text-sm text-muted">
                {formatPortions(dinner.portions ?? 0)} portions{dinner.guests ? ` · ${dinner.guests} guest${dinner.guests === 1 ? '' : 's'}` : ''} · {dinnerRecipe.finish_minutes} min
              </p>
            </>
          ) : (
            <p className="m-0 font-display text-lg font-semibold">{dinner.mode === 'out' ? 'Out tonight' : 'Leftovers or freezer'}</p>
          )}
          {dinner.reason && !(dinner.mode === 'out' && dinner.reason === 'Out tonight') && (
            <p className="m-0 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[13px]">{dinner.reason}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {dinner.mode === 'cook' && !dinner.locked && <button type="button" className={btn} onClick={() => w.keep(date)}>Keep</button>}
            <button type="button" className={btn} onClick={() => setSwapping((s) => !s)}>{dinner.mode === 'cook' ? 'Swap' : 'Plan a dinner'}</button>
            {dinner.mode === 'cook' && <button type="button" className={btn} onClick={() => w.out(date)}>Out tonight</button>}
            {dinner.mode === 'cook' && <button type="button" className={btn} onClick={() => w.leftovers(date)}>Leftovers</button>}
            {dinner.mode === 'cook' && (
              <span className="flex items-center gap-1">
                <button type="button" className={btn} aria-label="Remove a guest" disabled={!dinner.guests} onClick={() => w.guests(date, -1)}>−</button>
                <span className="text-[13px] text-muted">Guests</span>
                <button type="button" className={btn} aria-label="Add a guest" onClick={() => w.guests(date, 1)}>+</button>
              </span>
            )}
          </div>

          {dinner.mode === 'cook' && !dinner.cooked_at && (
            <button type="button" className={`${btn} justify-self-start`} onClick={() => w.cooked(date)}>Mark cooked</button>
          )}
          {dinner.mode === 'cook' && dinner.cooked_at && !dinner.portions_verdict && (
            <div className="grid gap-1.5">
              <p className="m-0 text-sm font-semibold">How were the portions?</p>
              <div className="flex flex-wrap gap-1.5">
                {VERDICTS.map(([v, label]) => (
                  <button key={v} type="button" className={btn} onClick={() => w.verdict(date, v)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          {dinner.mode === 'cook' && dinner.cooked_at && dinner.portions_verdict && (
            <p className="m-0 text-sm font-semibold text-accent">
              ✓ Cooked · portions {VERDICTS.find(([v]) => v === dinner.portions_verdict)![1].toLowerCase()}
            </p>
          )}

          {swapping && (
            <div className="grid gap-1.5 rounded-xl bg-surface-2 p-2.5">
              {w.alternatives(date).map((a) => (
                <button key={a.recipeId} type="button" onClick={() => { w.swap(date, a.recipeId); setSwapping(false); }}
                  className="rounded-lg bg-surface px-3 py-2 text-left">
                  <span className="block font-semibold">Use {recipe(a.recipeId)?.title ?? 'this'}</span>
                  <span className="block text-[12.5px] text-muted">{a.reason}</span>
                </button>
              ))}
              <label className="grid gap-1 text-[13px] font-semibold">
                Choose any recipe
                <select id={`any-${date}`} className="rounded-lg border border-line bg-surface px-2 py-2" defaultValue=""
                  onChange={(e) => { if (e.target.value) { w.swap(date, e.target.value); setSwapping(false); } }}>
                  <option value="">Pick…</option>
                  {[...w.recipes.values()].filter((r) => r.kind === 'meal').sort((a, b) => a.title.localeCompare(b.title))
                    .map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      <div role="group" aria-label="8pm prep" className="grid gap-1 rounded-2xl bg-evening-soft p-3.5">
        <Label tone="text-evening">8pm prep</Label>
        {tomorrowRecipe && tomorrowRecipe.prep_minutes > 0 ? (
          <p className="m-0">
            For {dayName(tomorrow!.date)} · {tomorrowRecipe.prep_minutes} min:{' '}
            <Link to={`/recipes/${tomorrowRecipe.id}`} className="font-semibold">{tomorrowRecipe.title}</Link>
          </p>
        ) : tomorrow ? (
          <p className="m-0 text-muted">Nothing to prep tonight.</p>
        ) : (
          <p className="m-0 text-muted">Monday's prep shows once next week is planned.</p>
        )}
      </div>
    </section>
  );
}
