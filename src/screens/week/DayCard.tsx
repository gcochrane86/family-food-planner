import { useState } from 'react';
import { Link } from 'react-router-dom';
import { routineRecipe } from '../../lib/mealPhotos';
import { lunchLeftover } from '../../lib/weekSummary';
import { repo } from '../../lib/repo';
import type { MealSlot, Recipe } from '../../lib/types';
import { formatPortions } from '../settings/Household';
import type { WeekState } from './useWeek';

const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const POOL = ['Overnight oats', 'Baked oats', 'Eggs & porridge'];
const SANDWICH = 'Chicken sandwich';

export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
}

/** A meal's photo, or a soft shaded box with its name while there isn't one yet. */
function Photo({ recipe, alt, className }: { recipe?: Recipe; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (recipe?.hero_image_path && !failed) {
    return <img src={repo.heroUrl(recipe.hero_image_path)} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`w-full object-cover ${className}`} />;
  }
  return <div className={`grid w-full place-items-center bg-gradient-to-br from-yolk-soft to-surface-2 p-3 text-center text-[13px] font-semibold text-muted ${className}`}>Photo of {alt}</div>;
}

function Label({ children, tone }: { children: string; tone: string }) {
  return <span className={`text-xs font-bold uppercase tracking-[0.08em] ${tone}`}>{children}</span>;
}

function Stepper({ label, value, less, more, onLess, onMore, disabled }: {
  label: string; value: string; less: string; more: string; onLess: () => void; onMore: () => void; disabled?: boolean;
}) {
  const b = 'grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-lg font-bold disabled:opacity-40';
  return (
    <span className="flex items-center gap-2.5" aria-label={label}>
      <button type="button" className={b} aria-label={less} disabled={disabled} onClick={onLess}>−</button>
      <b className="min-w-[2.5ch] text-center tabular-nums">{value}</b>
      <button type="button" className={b} aria-label={more} onClick={onMore}>+</button>
    </span>
  );
}

/** A day's meals as photos, with the occasional changes in "More options" (spec §6). */
export default function DayCard({ date, w, hideTitle = false, onSwap }: { date: string; w: WeekState; hideTitle?: boolean; onSwap?: () => void }) {
  const slot = (kind: MealSlot['slot'], d = date) => w.slots.find((s) => s.date === d && s.slot === kind);
  const recipe = (id: string | null | undefined): Recipe | undefined => (id ? w.recipes.get(id) : undefined);
  const breakfast = slot('breakfast');
  const lunch = slot('lunch');
  const dinner = slot('dinner');
  const dinnerRecipe = recipe(dinner?.recipe_id);
  const lastNightRecipe = lunchLeftover(date, w.slots, w.recipes);
  const swap = onSwap ?? (() => {});

  const breakfastName = breakfast?.routine_choice ?? breakfast?.reason ?? 'Eggs & porridge';
  const lunchChoice = !!lastNightRecipe;
  const picked = lunch?.routine_choice === SANDWICH ? SANDWICH : 'Leftovers';
  const card = 'overflow-hidden rounded-[20px] bg-surface shadow-sm';

  return (
    <section aria-label={dayLabel(date)} className="grid gap-5">
      <h2 className={hideTitle ? 'sr-only' : 'text-xl font-bold'}>{dayLabel(date)}</h2>

      {breakfast && (
        <div className="grid gap-2">
          <Label tone="text-yolk">Breakfast</Label>
          <div className={card}>
            <Photo recipe={routineRecipe(breakfastName, w.recipes)} alt={breakfastName} className="aspect-[16/9]" />
            <p className="m-0 px-4 py-2.5 font-display text-lg font-bold">{breakfastName}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POOL.map((p) => {
              const on = breakfastName === p;
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => { if (!on) w.breakfast(date, p); }}
                  className={`rounded-full border px-3 py-1 text-[13.5px] font-semibold ${on ? 'border-yolk text-ink' : 'border-line bg-surface text-muted'}`}>
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {lunch && (
        <div className="grid gap-2">
          <Label tone="text-teal">{lunchChoice ? 'Lunch · pick one' : 'Lunch'}</Label>
          {lunchChoice ? (
            <div className="grid grid-cols-2 gap-2.5">
              {[{ value: 'Leftovers', name: `Leftover ${lastNightRecipe!.title}`, r: lastNightRecipe }, { value: SANDWICH, name: SANDWICH, r: routineRecipe(SANDWICH, w.recipes) }].map((o) => {
                const on = picked === o.value;
                return (
                  <button key={o.value} type="button" aria-pressed={on} onClick={() => { if (!on) w.lunch(date, o.value); }}
                    className={`relative overflow-hidden rounded-[20px] border-[3px] bg-surface text-left shadow-sm ${on ? 'border-accent' : 'border-transparent'}`}>
                    <Photo recipe={o.r} alt={o.name} className="aspect-[4/3]" />
                    {on && <span aria-hidden className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-accent font-bold text-accent-ink">✓</span>}
                    <span className="block px-3 py-2 text-sm font-bold leading-snug">{o.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (() => {
            const packed = lunch.mode === 'packed' && !lunch.recipe_id;
            const reheat = lunch.recipe_id ? recipe(lunch.recipe_id) : undefined;
            const name = packed ? 'Burrito bowl (packed)' : reheat ? (lunch.reason ?? `Leftover ${reheat.title}`) : SANDWICH;
            const r = packed ? routineRecipe('Packed lunch', w.recipes) : reheat ?? routineRecipe(SANDWICH, w.recipes);
            return (
              <div className={card}>
                <Photo recipe={r} alt={name} className="aspect-[16/9]" />
                <p className="m-0 px-4 py-2.5 font-display text-lg font-bold">{name}</p>
              </div>
            );
          })()}
        </div>
      )}

      {dinner && (
        <div className="grid gap-2">
          <Label tone="text-accent">Dinner</Label>
          {dinner.mode === 'cook' && dinnerRecipe ? (
            <Link to={`/recipes/${dinnerRecipe.id}`} className={`${card} block text-ink no-underline`}>
              <Photo recipe={dinnerRecipe} alt={dinnerRecipe.title} className="aspect-[16/9]" />
              <span className="grid gap-0.5 px-4 py-2.5">
                <b className="font-display text-lg leading-tight">{dinnerRecipe.title}</b>
                <span className="text-sm text-muted">
                  {formatPortions(dinner.portions ?? 0)} portions{dinner.guests ? ` · ${dinner.guests} guest${dinner.guests === 1 ? '' : 's'}` : ''} · {dinnerRecipe.finish_minutes} min
                </span>
              </span>
            </Link>
          ) : (
            <div className={card}>
              <div className="grid aspect-[16/9] place-items-center bg-surface-2 font-display text-lg font-bold text-muted">{dinner.mode === 'out' ? 'Out tonight' : 'Leftovers night'}</div>
              {dinner.reason && <p className="m-0 px-4 py-2.5 text-sm text-muted">{dinner.reason}</p>}
            </div>
          )}
        </div>
      )}

      {dinner && (
        <section aria-label="More options" className={`${card} divide-y divide-line`}>
          <h3 className="px-4 pb-1 pt-3.5 text-base font-bold">More options</h3>
          <div className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
            <span>Out tonight<small className="block font-normal text-muted">No dinner to cook</small></span>
            {dinner.mode === 'cook'
              ? <button type="button" onClick={() => w.out(date)} className="rounded-xl border border-line bg-surface px-3.5 py-2 font-semibold">Out tonight</button>
              : <button type="button" onClick={swap} className="rounded-xl border border-line bg-surface px-3.5 py-2 font-semibold">Plan a dinner</button>}
          </div>
          {dinner.mode === 'cook' && (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
                <span>Friends over<small className="block font-normal text-muted">Adds portions for guests</small></span>
                <Stepper label="Guests" value={String(dinner.guests)} less="Remove a guest" more="Add a guest" disabled={!dinner.guests}
                  onLess={() => w.guests(date, -1)} onMore={() => w.guests(date, 1)} />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
                <span>Portions</span>
                <Stepper label="Portions" value={formatPortions(dinner.portions ?? 0)} less="Fewer portions" more="More portions" disabled={(dinner.portions ?? 0) <= 0.5}
                  onLess={() => w.portions(date, -0.5)} onMore={() => w.portions(date, 0.5)} />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
                <span>Swap dinner<small className="block font-normal text-muted">Swipe through other ideas</small></span>
                <button type="button" onClick={swap} className="rounded-xl border border-line bg-surface px-3.5 py-2 font-semibold">Swap</button>
              </div>
            </>
          )}
        </section>
      )}
    </section>
  );
}
