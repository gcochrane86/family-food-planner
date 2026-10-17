import { PHOTO_LARGE } from '../../lib/photoSizes';
import { Link } from 'react-router-dom';
import { routineRecipe } from '../../lib/mealPhotos';
import { parseBatch } from '../../lib/batch';
import { switchClasses } from '../../lib/prepAhead';
import { homeLunchChoice, leftoverLunchPortions, lunchLeftover } from '../../lib/weekSummary';
import type { MealSlot, Recipe } from '../../lib/types';
import { formatPortions } from '../settings/Household';
import type { WeekState } from './useWeek';
import MealPhoto from './MealPhoto';
import MealOptions, { type OptionGroup } from './MealOptions';

const LUNCH_GROUPS: OptionGroup[] = [
  { label: 'Sandwich', suffix: 'sandwich', addLabel: 'filling' },
  { label: 'Poke bowl', suffix: 'poke bowl', addLabel: 'poke bowl' },
];

const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
}

/** "Make 4× the curry paste and freeze 3", or "Use curry paste from the freezer (2 left)", for a dinner whose recipe
 *  has a part that batches and freezes well. */
function BatchSwitch({ date, recipe, plan, w }: { date: string; recipe: Recipe; plan: MealSlot['batch'] | null; w: WeekState }) {
  const b = parseBatch(recipe.batch);
  if (!b) return null;
  const name = b.name[0].toLowerCase() + b.name.slice(1);
  if (plan === 'made') return <p className="m-0 text-sm text-muted">✓ {b.makes - 1} portions of {name} went in the freezer.</p>;
  if (plan === 'frozen_ok') return <p className="m-0 text-sm text-muted">✓ {b.name} from the freezer (checked).</p>;
  const left = w.freezerFor(recipe.id, date);
  const useFrozen = plan === 'frozen' || left > 0;
  const label = useFrozen ? `Use ${name} from the freezer (${left} left)` : `Make ${b.makes}× the ${name} and freeze ${b.makes - 1}`;
  const on = useFrozen ? plan === 'frozen' : plan === 'make';
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm shadow-sm">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => void w.batch(date, on ? null : useFrozen ? 'frozen' : 'make')} className={switchClasses(on)}>
        <span className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
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

  const breakfastName = breakfast?.routine_choice ?? breakfast?.reason ?? w.mealOptions.breakfast[0];
  const breakfastOptions = w.mealOptions.breakfast.map((n) => ({ value: n, name: n, recipe: routineRecipe(n, w.recipes), removable: true }));
  // A home lunch (not packed, not a planned reheat) is picked from the lunch options, plus last night's leftovers.
  const lunchChoice = lunch?.mode === 'routine' && !lunch.recipe_id;
  const picked = homeLunchChoice(lunch?.routine_choice ?? null, !!lastNightRecipe, w.mealOptions.lunch[0]);
  const lunchOptions = [
    ...(lastNightRecipe ? [{ value: 'Leftovers', name: `Leftover ${lastNightRecipe.title}`, recipe: lastNightRecipe as Recipe | undefined, removable: false }] : []),
    ...w.mealOptions.lunch.map((n) => ({ value: n, name: n, recipe: routineRecipe(n, w.recipes), removable: true })),
  ];
  // How often each lunch is picked on the other days of this week, so a group card suggests variety.
  const lunchUsage: Record<string, number> = {};
  for (const s of w.slots) if (s.slot === 'lunch' && s.date !== date && s.routine_choice) lunchUsage[s.routine_choice] = (lunchUsage[s.routine_choice] ?? 0) + 1;
  const lunchExtra = dinner ? leftoverLunchPortions(dinner, w.slots, w.recipes) : 0;
  const nextDayName = DAY[new Date(`${date}T00:00:00Z`).getUTCDay() % 7];
  const card = 'overflow-hidden rounded-[20px] bg-surface shadow-sm';

  return (
    <section aria-label={dayLabel(date)} className="grid gap-5">
      <h2 className={hideTitle ? 'sr-only' : 'text-xl font-bold'}>{dayLabel(date)}</h2>

      {breakfast && (
        <div className="grid gap-2">
          <Label tone="text-yolk">Breakfast</Label>
          <MealOptions label="Breakfast" options={breakfastOptions} picked={breakfastName}
            onPick={(v) => w.breakfast(date, v)} onAdd={(n, photo) => w.addMealOption('breakfast', n, photo)} onRemove={(v) => w.removeMealOption('breakfast', v)} />
        </div>
      )}

      {lunch && (
        <div className="grid gap-2">
          <Label tone="text-lunch">{lunchChoice ? 'Lunch · pick one' : 'Lunch'}</Label>
          {lunchChoice ? (
            <MealOptions label="Lunch" groups={LUNCH_GROUPS} usage={lunchUsage} options={lunchOptions} picked={picked}
              onPick={(v) => w.lunch(date, v)} onAdd={(n, photo) => w.addMealOption('lunch', n, photo)} onRemove={(v) => w.removeMealOption('lunch', v)} />
          ) : (() => {
            const packed = lunch.mode === 'packed' && !lunch.recipe_id;
            const reheat = lunch.recipe_id ? recipe(lunch.recipe_id) : undefined;
            const name = packed ? 'Burrito bowl (packed)' : reheat ? (lunch.reason ?? `Leftover ${reheat.title}`) : w.mealOptions.lunch[0];
            const r = packed ? routineRecipe('Packed lunch', w.recipes) : reheat ?? routineRecipe(w.mealOptions.lunch[0], w.recipes);
            return (
              <div className={card}>
                <MealPhoto recipe={r} alt={name} className="aspect-[16/9]" />
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
              <MealPhoto recipe={dinnerRecipe} alt={dinnerRecipe.title} width={PHOTO_LARGE} className="aspect-[16/9]" />
              <span className="grid gap-0.5 px-4 py-2.5">
                <b className="font-display text-lg leading-tight">{dinnerRecipe.title}</b>
                <span className="text-sm text-muted">
                  {formatPortions(dinner.portions ?? 0)} portions{lunchExtra > 0 ? ` + ${formatPortions(lunchExtra)} for ${nextDayName}'s lunch` : ''}{dinner.guests ? ` · ${dinner.guests} guest${dinner.guests === 1 ? '' : 's'}` : ''} · {dinnerRecipe.finish_minutes} min
                </span>
              </span>
            </Link>
          ) : null}
          {dinner.mode === 'cook' && dinnerRecipe && <BatchSwitch date={date} recipe={dinnerRecipe} plan={dinner.batch ?? null} w={w} />}
          {dinner.mode === 'cook' && dinnerRecipe ? null : (
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
