import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import { DEFAULT_BREAKFASTS, HOME_LUNCHES } from '../../lib/mealPhotos';
import type { MealSlot, PlanWeek, Recipe } from '../../lib/types';
import { buildPlannerInput } from '../../../supabase/functions/_shared/planInput.ts';
import {
  alternatives as plannerAlternatives, applyGuests, applyLeftovers, applyOut, applySwap,
  type PlannerInput, type ProposedSlot,
} from '../../../supabase/functions/_shared/planner.ts';
import { londonParts, nextMonday } from '../../../supabase/functions/_shared/schedule.ts';
import { useAsync } from '../settings/useAsync';

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** This week's and next week's Mondays, by London date. */
export function weekStarts(now = new Date()) {
  const { date, weekday } = londonParts(now);
  return { thisWeek: addDays(date, 1 - weekday), nextWeek: nextMonday(date), london: londonParts(now) };
}

const toProposed = (s: MealSlot): ProposedSlot => ({
  date: s.date, slot: s.slot, recipeId: s.recipe_id, mode: s.mode, portions: s.portions, guests: s.guests,
  locked: s.locked, reason: s.reason, sourceDate: s.source_date,
});

/** Applies the planner's version of each slot onto the saved slots and returns only those that changed. */
function merge(slots: MealSlot[], plan: ProposedSlot[]): { next: MealSlot[]; changed: MealSlot[] } {
  const changed: MealSlot[] = [];
  const next = slots.map((s) => {
    const p = plan.find((x) => x.date === s.date && x.slot === s.slot);
    if (!p) return s;
    const updated: MealSlot = {
      ...s, recipe_id: p.recipeId, mode: p.mode, portions: p.portions, guests: p.guests, locked: p.locked, reason: p.reason, source_date: p.sourceDate,
    };
    const differs = (['recipe_id', 'mode', 'portions', 'guests', 'locked', 'reason', 'source_date'] as const).some((k) => updated[k] !== s[k]);
    if (differs) changed.push(updated);
    return updated;
  });
  return { next, changed };
}

export function useWeek() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const starts = useMemo(() => weekStarts(), []);
  const [which, setWhich] = useState<'this' | 'next' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, setData, error, loading, reload } = useAsync(async () => {
    const [thisWeek, nextWeek, recipes, members, pattern, settings, recent] = await Promise.all([
      repo.getWeek(hid, starts.thisWeek), repo.getWeek(hid, starts.nextWeek), repo.listRecipes(hid), repo.listMembers(hid),
      repo.getWeekPattern(), repo.getSettings(hid), repo.recentDinnerIds(hid, starts.nextWeek),
    ]);
    const run = (w: typeof thisWeek) => (w.week && w.week.status !== 'draft' ? repo.getCookidooRun(w.week.id).catch(() => null) : Promise.resolve(null));
    const [thisCookidoo, nextCookidoo] = await Promise.all([run(thisWeek), run(nextWeek)]);
    return { thisWeek, nextWeek, recipes, members, pattern, settings, recent, thisCookidoo, nextCookidoo };
  }, [hid, starts]);

  const shown: 'this' | 'next' = which ?? (data?.nextWeek.week || !data?.thisWeek.week ? 'next' : 'this');
  const current = data ? (shown === 'next' ? data.nextWeek : data.thisWeek) : null;
  const weekStart = shown === 'next' ? starts.nextWeek : starts.thisWeek;
  const recipes = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data]);
  const mealOptions = useMemo(() => ({
    breakfast: data?.settings?.breakfasts?.length ? data.settings.breakfasts : DEFAULT_BREAKFASTS,
    lunch: data?.settings?.lunches?.length ? data.settings.lunches : HOME_LUNCHES,
  }), [data]);
  const [dismissedTick, setDismissedTick] = useState(0);

  /** Last night's dinner (tonight's after 8pm), from this week or next, if it still needs "How was it?". */
  const lastNight = useMemo(() => {
    if (!data) return null;
    const { date, hour } = starts.london;
    const target = hour >= 20 ? date : addDays(date, -1);
    for (const key of ['thisWeek', 'nextWeek'] as const) {
      const slot = data[key].slots.find((s) => s.date === target && s.slot === 'dinner');
      if (!slot) continue;
      const recipe = slot.recipe_id ? recipes.get(slot.recipe_id) : undefined;
      if (slot.mode !== 'cook' || !recipe || (slot.portions_verdict && recipe.rating)) return null;
      try { if (localStorage.getItem(`ffp.fb.${slot.id ?? target}`)) return null; } catch { /* no storage: just ask */ }
      return { key, slot, recipe };
    }
    return null;
  }, [data, starts, recipes, dismissedTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const input: PlannerInput | null = useMemo(() => {
    if (!data) return null;
    return buildPlannerInput({
      weekStart, householdId: hid, settings: data.settings as never, members: data.members, pattern: data.pattern,
      recipes: data.recipes.map((r: Recipe) => ({ ...r })), recentDinnerRecipeIds: data.recent,
    });
  }, [data, weekStart, hid]);

  const setCurrent = useCallback((slots: MealSlot[], week?: PlanWeek | null) => {
    setData((d) => {
      if (!d) return d;
      const key = shown === 'next' ? 'nextWeek' : 'thisWeek';
      return { ...d, [key]: { week: week === undefined ? d[key].week : week, slots } };
    });
  }, [setData, shown]);

  // The latest slots, updated as soon as a change is made, so two quick taps build on each other
  // instead of both starting from what was on screen at the last render.
  const latest = useRef<MealSlot[]>([]);
  const latestFor = useRef<string | null>(null);
  if (latestFor.current !== `${shown}:${current?.week?.id ?? ''}` || !latest.current.length) {
    latest.current = current?.slots ?? [];
    latestFor.current = `${shown}:${current?.week?.id ?? ''}`;
  }
  const queue = useRef<Promise<void>>(Promise.resolve());
  const sameSlot = (a: MealSlot, b: MealSlot) => a.date === b.date && a.slot === b.slot;

  /** Shows the change at once and saves it after any earlier saves, so they reach the database in order.
   *  If a save fails, only the slots it changed go back. */
  /** Shows the change at once and saves it after any earlier saves, so they reach the database in order.
   *  If a save fails, only the slots it changed go back, in the week they belong to (even after switching tabs).
   *  Resolves true when saved. */
  const commit = useCallback((next: MealSlot[], changed: MealSlot[], before: MealSlot[], key: 'thisWeek' | 'nextWeek' = shown === 'next' ? 'nextWeek' : 'thisWeek'): Promise<boolean> => {
    if (!changed.length) return Promise.resolve(true);
    const isShown = (key === 'nextWeek') === (shown === 'next');
    if (isShown) latest.current = next;
    setData((d) => d && { ...d, [key]: { ...d[key], slots: isShown ? next : d[key].slots.map((s: MealSlot) => changed.find((c) => sameSlot(c, s)) ?? s) } });
    const saved = queue.current.then(() => repo.saveSlots(changed)).then(() => true, () => {
      const undo = (slots: MealSlot[]) => slots.map((s) => (changed.some((c) => sameSlot(c, s)) ? before.find((b) => sameSlot(b, s)) ?? s : s));
      setData((d) => d && { ...d, [key]: { ...d[key], slots: undo(d[key].slots) } });
      if (latestFor.current?.startsWith(key === 'nextWeek' ? 'next:' : 'this:')) latest.current = undo(latest.current);
      // An earlier failure message stays up (it says a change was undone) until the screen is reloaded.
      setSaveError("Couldn't save that change. Check your connection and try again.");
      return false;
    });
    queue.current = saved.then(() => undefined);
    return saved;
  }, [setData, shown]);

  const change = useCallback((fn: (plan: ProposedSlot[]) => ProposedSlot[]) => {
    const base = latest.current;
    const { next, changed } = merge(base, fn(base.map(toProposed)));
    commit(next, changed, base);
  }, [commit]);

  /** Updates one slot by date and kind. */
  const update = useCallback((date: string, kind: MealSlot['slot'], edit: (s: MealSlot) => MealSlot | null) => {
    const base = latest.current;
    const target = base.find((s) => s.date === date && s.slot === kind);
    const updated = target ? edit(target) : null;
    if (!target || !updated) return Promise.resolve(true);
    return commit(base.map((s) => (s === target ? updated : s)), [updated], base);
  }, [commit]);

  return {
    loading, error, reload, saveError, starts, shown, setWhich, weekStart, recipes, input,
    week: current?.week ?? null,
    /** This week's Cookidoo sync (spec §10), or null before approval. */
    cookidoo: (shown === 'next' ? data?.nextCookidoo : data?.thisCookidoo) ?? null,
    slots: current?.slots ?? [],
    officeDays: input?.officeDays ?? [],
    alternatives: (date: string, n = 3) => (current && input ? plannerAlternatives(current.slots.map(toProposed), date, input, n) : []),
    swap: (date: string, recipeId: string) => input && change((p) => applySwap(p, date, recipeId, input)),
    out: (date: string) => change((p) => applyOut(p, date)),
    leftovers: (date: string) => change((p) => applyLeftovers(p, date)),
    /** Adds (+1) or removes (−1) a guest, counting from the latest state so quick taps all count. */
    guests: (date: string, delta: number) => {
      if (!input) return;
      const d = latest.current.find((s) => s.date === date && s.slot === 'dinner');
      if (d) change((p) => applyGuests(p, date, Math.max(0, d.guests + delta), input));
    },
    /** Changes dinner portions by ±0.5, never below 0.5, counting from the latest state. */
    portions: (date: string, delta: number) =>
      update(date, 'dinner', (d) => {
        const next = Math.max(0.5, (d.portions ?? 0) + delta);
        return next === d.portions ? null : { ...d, portions: next };
      }),
    keep: (date: string) => update(date, 'dinner', (d) => (d.locked ? null : { ...d, locked: true })),
    cooked: (date: string) => update(date, 'dinner', (d) => ({ ...d, cooked_at: new Date().toISOString() })),
    verdict: (date: string, v: NonNullable<MealSlot['portions_verdict']>) => update(date, 'dinner', (d) => ({ ...d, portions_verdict: v })),
    /** Records which lunch was picked when there's a choice (Leftovers or Chicken sandwich). */
    lunch: (date: string, choice: string) => update(date, 'lunch', (l) => (l.routine_choice === choice ? null : { ...l, routine_choice: choice })),
    breakfast: (date: string, choice: string) =>
      update(date, 'breakfast', (b) => ({ ...b, routine_choice: b.routine_choice === choice ? null : choice })),
    /** Your breakfast and home-lunch options (from household settings). */
    mealOptions,
    /** Adds a breakfast or lunch option, with its own small recipe (and a photo, about 3p, if asked). Resolves to a
     *  problem to show, or null. The option is kept even if only the photo fails. */
    async addMealOption(kind: 'breakfast' | 'lunch', name: string, photo: boolean): Promise<string | null> {
      if (!data) return null;
      const key = kind === 'breakfast' ? 'breakfasts' : 'lunches';
      const list = mealOptions[kind];
      if (list.some((n) => n.toLowerCase() === name.toLowerCase())) return `${name} is already one of your ${kind === 'breakfast' ? 'breakfasts' : 'lunches'}.`;
      let recipe: Recipe;
      try {
        recipe = await repo.addMealRecipe(hid, name, kind === 'breakfast' ? 'Breakfast' : 'Lunch');
        const settings = { ...data.settings, [key]: [...list, name] };
        await repo.saveSettings(hid, settings);
        setData((d) => d && { ...d, settings, recipes: d.recipes.some((r: Recipe) => r.id === recipe.id) ? d.recipes : [...d.recipes, recipe] });
      } catch {
        return "Couldn't add it. Check your connection and try again.";
      }
      if (!photo || recipe.hero_image_path) return null;
      try {
        const path = await repo.generateHero(recipe.id);
        setData((d) => d && { ...d, recipes: d.recipes.map((r: Recipe) => (r.id === recipe.id ? { ...r, hero_image_path: path, hero_image_source: 'generated' as const } : r)) });
        return null;
      } catch {
        return `Added ${name}, but its photo couldn't be made. Try Recipes → Make photos later.`;
      }
    },
    /** Takes an option off the list (its recipe stays in the library). Puts it back if the save fails. */
    async removeMealOption(kind: 'breakfast' | 'lunch', name: string) {
      if (!data) return;
      const key = kind === 'breakfast' ? 'breakfasts' : 'lunches';
      const before = data.settings;
      const settings = { ...before, [key]: mealOptions[kind].filter((n) => n !== name) };
      setData((d) => d && { ...d, settings });
      try { await repo.saveSettings(hid, settings); } catch { setData((d) => d && { ...d, settings: before }); setSaveError("Couldn't save that. Check your connection and try again."); }
    },
    lastNight,
    /** Saves the portions answer for last night's dinner, in whichever week it's in, and marks it cooked. */
    lastNightVerdict(v: NonNullable<MealSlot['portions_verdict']>): Promise<boolean> {
      if (!lastNight || !data) return Promise.resolve(false);
      const { key, slot } = lastNight;
      // Goes through the same save queue as every other change, built from the newest copy of that week.
      const base = (key === 'nextWeek') === (shown === 'next') ? latest.current : data[key].slots;
      const current = base.find((s) => s.date === slot.date && s.slot === 'dinner') ?? slot;
      const updated = { ...current, portions_verdict: v, cooked_at: current.cooked_at ?? new Date().toISOString() };
      return commit(base.map((s) => (s === current ? updated : s)), [updated], base, key);
    },
    /** Hides the "How was it?" card for that dinner on this device. */
    dismissLastNight() {
      if (!lastNight) return;
      try { localStorage.setItem(`ffp.fb.${lastNight.slot.id ?? lastNight.slot.date}`, '1'); } catch { /* fine */ }
      setDismissedTick((n) => n + 1);
    },
    /** Saves "Have it again?" for a recipe, showing it at once and putting it back if the save fails. */
    async rate(recipeId: string, rating: 'up' | 'down') {
      const set = (value: Recipe['rating']) =>
        setData((d) => d && { ...d, recipes: d.recipes.map((r: Recipe) => (r.id === recipeId ? { ...r, rating: value } : r)) });
      const before = data?.recipes.find((r: Recipe) => r.id === recipeId)?.rating ?? null;
      set(rating);
      try {
        await repo.rateRecipe(recipeId, rating);
        return true;
      } catch {
        set(before);
        setSaveError("Couldn't save that. Check your connection and try again.");
        return false;
      }
    },
    /** Asks Claude to sync this week to Cookidoo again after it couldn't. */
    async retryCookidoo() {
      if (!current?.week) return;
      setSaveError(null);
      try {
        await repo.requestCookidooSync(current.week.id);
        const key = shown === 'next' ? 'nextCookidoo' : 'thisCookidoo';
        setData((d) => d && { ...d, [key]: { ...(d[key] ?? { id: '', plan_week_id: current.week!.id, started_at: null, finished_at: null }), status: 'requested', requested_at: new Date().toISOString(), summary: null } });
      } catch {
        setSaveError("Couldn't ask Cookidoo to try again. Check your connection and try again.");
      }
    },
    async approve() {
      if (!current?.week) return;
      setSaveError(null);
      try {
        await repo.approveWeek(current.week.id);
        setCurrent(latest.current, { ...current.week, status: 'approved', approved_at: current.week.approved_at ?? new Date().toISOString() });
        const key = shown === 'next' ? 'nextCookidoo' : 'thisCookidoo';
        setData((d) => d && { ...d, [key]: { id: '', plan_week_id: current.week!.id, status: 'requested', requested_at: new Date().toISOString(), started_at: null, finished_at: null, summary: null } });
      } catch {
        setSaveError("Couldn't approve the week. Check your connection and try again.");
      }
    },
    async propose() {
      setSaveError(null);
      try {
        await repo.proposeNow(weekStart);
        await reload();
      } catch (e) {
        setSaveError(`Couldn't make a menu: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}
export type WeekState = ReturnType<typeof useWeek>;
