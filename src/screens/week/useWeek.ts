import { weekEats, weekMakeDates } from '../../lib/weekEats';
import { placeEat } from '../../../supabase/functions/_shared/snackEats.ts';
import { isSnack, snackFactor } from '../../../supabase/functions/_shared/snackRules.ts';
import { deliveryFor } from '../../lib/shopping';
import { useCallback, useMemo, useRef, useState } from 'react';
import { dayMinutes } from '../../../supabase/functions/_shared/cookingTime.ts';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import { CANCELLED } from '../../lib/types';
import { DEFAULT_BREAKFASTS, HOME_LUNCHES } from '../../lib/mealPhotos';
import type { BasketRun, BatchPlan, Eat, MealSlot, Member, PlanWeek, PreparedItem, PrepAhead, Recipe } from '../../lib/types';
import { availablePortions, parseBatch } from '../../lib/batch';
import { buildPlannerInput } from '../../../supabase/functions/_shared/planInput.ts';
import {
  alternatives as plannerAlternatives, applyGuests, applyLeftovers, applyOut, applySwap,
  type PlannerInput, type ProposedSlot,
} from '../../../supabase/functions/_shared/planner.ts';
import { londonParts, nextMonday } from '../../../supabase/functions/_shared/schedule.ts';
import { mergePlan as merge, toProposed } from '../../../supabase/functions/_shared/slotMerge.ts';
import { useAsync } from '../settings/useAsync';
import { compareTargets, dayBalance, mealEstimates, nudge, parseNutrition, personDay, weekBalance, type DayBalance, type Macro, type TargetState, type WeekBalance } from '../../../supabase/functions/_shared/balance.ts';

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
    // The freezer, for batch suggestions (an empty freezer if it can't be read, so the week still shows).
    // Basket fills, for the week tile's Sainsbury's tick (none for a draft, or if they can't be read).
    const baskets = (w: typeof thisWeek) => (w.week && w.week.status !== 'draft' ? repo.getRuns(w.week.id).catch(() => [] as BasketRun[]) : Promise.resolve([] as BasketRun[]));
    // "Plan with Claude" requests (none if they can't be read, so the week still shows).
    const asked = (ws: string) => repo.getWeekPlanRequest(hid, ws).catch(() => null);
    const [thisCookidoo, nextCookidoo, freezer, thisBaskets, nextBaskets, thisRequest, nextRequest] = await Promise.all([
      run(thisWeek), run(nextWeek), repo.listPrepared(hid).catch(() => [] as PreparedItem[]), baskets(thisWeek), baskets(nextWeek),
      asked(starts.thisWeek), asked(starts.nextWeek)]);
    return { thisWeek, nextWeek, recipes, members, pattern, settings, recent, thisCookidoo, nextCookidoo, freezer, thisBaskets, nextBaskets, thisRequest, nextRequest };
  }, [hid, starts], { onReturn: true });

  const shown: 'this' | 'next' = which ?? (data?.nextWeek.week || !data?.thisWeek.week ? 'next' : 'this');
  const current = data ? (shown === 'next' ? data.nextWeek : data.thisWeek) : null;
  const weekStart = shown === 'next' ? starts.nextWeek : starts.thisWeek;
  const recipes = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data]);
  const routines = (data?.settings?.routine_nutrition ?? {}) as Record<string, unknown>;
  // The markers are judged for an adult's share of each meal (Settings → Household).
  const adultShare = Number((data?.members ?? []).find((m: Member) => m.kind === 'adult')?.portion_weight) || 1.25;
  const hasEstimates = useMemo(() => (data?.recipes ?? []).some((r) => parseNutrition(r.nutrition)), [data]);
  const mealOptions = useMemo(() => ({
    breakfast: data?.settings?.breakfasts?.length ? data.settings.breakfasts : DEFAULT_BREAKFASTS,
    lunch: data?.settings?.lunches?.length ? data.settings.lunches : HOME_LUNCHES,
  }), [data]);
  const [dismissedTick, setDismissedTick] = useState(0);
  // Each person's snacks and meal partners this week (stored snacks, and partners worked out from the plan).
  const eats = useMemo(() => (current ? weekEats(current, data?.settings, data?.recipes ?? [], (data?.members ?? []).map((m: Member) => m.id)) : []), [current, data]);
  const members = (data?.members ?? []) as Member[];
  const firstAdult = members.find((m) => m.kind === 'adult');

  /** Last night's dinner (tonight's after 8pm), from this week or next, if it still needs "How was it?". */
  const lastNight = useMemo(() => {
    if (!data) return null;
    const { date, hour } = starts.london;
    const target = hour >= 20 ? date : addDays(date, -1);
    for (const key of ['thisWeek', 'nextWeek'] as const) {
      const slot = data[key].slots.find((s) => s.date === target && s.slot === 'dinner');
      if (!slot) continue;
      const recipe = slot.recipe_id ? recipes.get(slot.recipe_id) : undefined;
      // Still to ask: portions, "have it again", or (after making a batch) whether it went in the freezer.
      if (slot.mode !== 'cook' || !recipe || (slot.portions_verdict && recipe.rating && slot.batch !== 'make')) return null;
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
      cookingMinutes: (shown === 'next' ? data.nextWeek : data.thisWeek)?.week?.cooking_minutes,
      // Plan with Claude: a week planned with its own office days keeps them.
      weekOffice: (shown === 'next' ? data.nextWeek : data.thisWeek)?.week?.office_days ?? null,
    });
  }, [data, weekStart, hid, shown]);

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
    /** The latest "Plan with Claude" request for the week shown. */
    planRequest: (shown === 'next' ? data?.nextRequest : data?.thisRequest) ?? null,
    /** This week's Cookidoo sync (spec §10), or null before approval. */
    cookidoo: (shown === 'next' ? data?.nextCookidoo : data?.thisCookidoo) ?? null,
    baskets: (shown === 'next' ? data?.nextBaskets : data?.thisBaskets) ?? [],
    shopsPerWeek: (data?.settings?.shops_per_week === 1 ? 1 : 2) as 1 | 2,
    /** A day's cooking time in minutes: the shown week's own time for it, else the day's setting (Settings → Usual week). */
    dayMinutes: (date: string) => dayMinutes(date, (data?.settings ?? {}) as { cooking_minutes?: unknown; hour_minutes?: unknown }, current?.week?.cooking_minutes),
    slots: current?.slots ?? [],
    /** A draft's dinners that Claude made up for this week while planning it, by date, to check before approving. */
    newDinners: current?.week?.status === 'draft'
      ? (current.slots ?? []).flatMap((s) => {
        const r = s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id ? recipes.get(s.recipe_id) : undefined;
        return r && r.planned_for === current.week!.week_start ? [{ date: s.date, recipe: r }] : [];
      })
      : [],
    officeDays: input?.officeDays ?? [],
    /** Daily balance: how a day measures up (null until any recipe has an estimate, so nothing shows before then). */
    balance: (date: string): DayBalance | null => (hasEstimates ? dayBalance(date, current?.slots ?? [], recipes, routines,
      { homeLunches: mealOptions.lunch, share: adultShare, eats: eats.filter((e) => e.member_id === firstAdult?.id) }) : null),
    /** Each person's snacks and meal partners on a day. */
    eatsOn: (date: string) => eats.filter((e) => e.date === date),
    /** The household's people. */
    members,
    memberName: (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone',
    /** Meal partners Claude proposed with this draft (kept when it's approved). */
    newPartners: current?.week?.status === 'draft' ? current.week.new_partners ?? null : null,
    /** Each meal's estimate per serving, by slot (empty until any recipe has an estimate). */
    meals: (date: string) => (hasEstimates ? mealEstimates(date, current?.slots ?? [], recipes, routines, { homeLunches: mealOptions.lunch }) : {}),
    adultShare,
    /** Each person's day against their own targets (empty until any recipe has an estimate). */
    people: (date: string): { id: string; name: string; totals: Partial<Record<Macro, number>>; unknown: Macro[]; states: Partial<Record<Macro, TargetState>>; targets: Partial<Record<Macro, number>> }[] =>
      (hasEstimates ? (data?.members ?? []).map((m: Member) => {
        const p = personDay(date, current?.slots ?? [], recipes, routines, m, { homeLunches: mealOptions.lunch, eats });
        return { id: m.id, name: m.name, ...p, targets: m.targets ?? {}, states: compareTargets(p.totals, m.targets, p.unknown) };
      }) : []),
    /** The week's oily fish, beans or lentils, and red meat (null until any recipe has an estimate). */
    weekBalance: (dates: string[]): WeekBalance | null => (hasEstimates ? weekBalance(dates, current?.slots ?? [], recipes, routines, { homeLunches: mealOptions.lunch, share: adultShare, eats }) : null),
    /** One fix for the first person whose day is under a target they've set, or null. */
    nudge(date: string): { memberId: string; name: string; macro: Macro; gap: number; recipe_id: string; title: string; slot: 'snack_am' | 'snack_pm' } | null {
      // Only for today and the days ahead.
      if (!hasEstimates || !current?.week || date < starts.london.date) return null;
      const snacks = (data?.recipes ?? []).filter((r) => isSnack(r));
      for (const m of members) {
        const p = personDay(date, current.slots, recipes, routines, m, { homeLunches: mealOptions.lunch, eats });
        const states = compareTargets(p.totals, m.targets, p.unknown);
        const fix = nudge({ kind: m.kind, totals: p.totals, targets: m.targets ?? {}, states }, eats.filter((e) => e.date === date && e.member_id === m.id), snacks);
        if (fix) return { memberId: m.id, name: m.name, ...fix };
      }
      return null;
    },
    /** Adds one person's snack on a day (a nudge's yes), made with the family's makes. */
    async addSnack(date: string, memberId: string, recipeId: string, slot: 'snack_am' | 'snack_pm'): Promise<boolean> {
      return (await this.addSnacks(date, [memberId], recipeId, slot, 1)) === null;
    },
    /** Snacks a day can have: snack recipes, recipes that can be snacks and quick snacks. */
    snackRecipes: (data?.recipes ?? []).filter((r) => isSnack(r)),
    /** Adds a snack for each of these people on a day (morning or afternoon), made with the family's makes or, for a
     *  quick snack, bought for the day. After that delivery's basket is filled, its items go on the Spar list. Returns
     *  what's wrong in words, or null once saved. */
    async addSnacks(date: string, memberIds: string[], recipeId: string, slot: 'snack_am' | 'snack_pm', qty: number): Promise<string | null> {
      const week = current?.week;
      const r = recipes.get(recipeId);
      if (!week || !r || !memberIds.length || !(qty > 0)) return 'Choose who, which snack and how many.';
      const child = members.find((m) => memberIds.includes(m.id) && m.kind === 'child');
      if (child && r.toddler_ok === false) return `${r.title} isn't marked OK for ${child.name}.`;
      const taken = memberIds.filter((id) => eats.some((e) => e.date === date && e.slot === slot && e.member_id === id));
      if (taken.length) return `${taken.map((id) => members.find((m) => m.id === id)?.name ?? 'Someone').join(' and ')} already ${taken.length === 1 ? 'has' : 'have'} a ${slot === 'snack_am' ? 'morning' : 'afternoon'} snack that day. Remove it first.`;
      setSaveError(null);
      const added: Eat[] = [];
      try {
        for (const id of memberIds) {
          const base = { date, slot, member_id: id, recipe_id: recipeId, qty };
          const eat = r.quick ? { ...base, make_date: date } : placeEat(base, [...eats, ...added], r.keeps_days ?? 1, weekMakeDates(week, data?.settings));
          added.push(await repo.addSnackEat(week.id, eat));
        }
      } catch {
        setSaveError("Couldn't add the snack. Try again.");
      }
      if (added.length) {
        setData((d) => {
          if (!d) return d;
          const key = shown === 'next' ? 'nextWeek' : 'thisWeek';
          return { ...d, [key]: { ...d[key], eats: [...(d[key].eats ?? []), ...added] } };
        });
        // Bought after the order went in: the Spar list instead of the basket.
        const buy = added[0].make_date;
        const delivery = deliveryFor(buy, week.week_start, data?.settings?.shops_per_week === 1 ? 1 : 2);
        const run = ((shown === 'next' ? data?.nextBaskets : data?.thisBaskets) ?? []).find((b) => b.delivery === delivery);
        if (week.status !== 'draft' && run?.status === 'done') {
          try {
            const detail = await repo.getRecipe(recipeId);
            const servings = added.reduce((t, e) => t + e.qty, 0) * snackFactor(r);
            const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
            for (const ing of detail?.ingredients ?? []) {
              const amount = ing.qty == null ? '' : `${Math.round(((ing.qty * servings) / (detail!.base_portions || 1)) * 10) / 10}${ing.unit ? ` ${ing.unit}` : ''} `;
              await repo.addQuick(hid, `${amount}${ing.name}`.slice(0, 80), `For ${day}'s snack`);
            }
          } catch { setSaveError("The snack's saved, but its things couldn't go on the Spar list. Add them yourself."); }
        }
      }
      return added.length === memberIds.length ? null : "Couldn't add the snack for everyone. Try again.";
    },
    /** Takes a snack off a day. */
    async removeSnack(id: string): Promise<boolean> {
      setSaveError(null);
      try {
        await repo.removeSnackEat(id);
        setData((d) => {
          if (!d) return d;
          const key = shown === 'next' ? 'nextWeek' : 'thisWeek';
          return { ...d, [key]: { ...d[key], eats: (d[key].eats ?? []).filter((e: Eat) => e.id !== id) } };
        });
        return true;
      } catch {
        setSaveError("Couldn't remove the snack. Try again.");
        return false;
      }
    },
    alternatives: (date: string, n = 3) => (current && input ? plannerAlternatives(current.slots.map(toProposed), date, input, n) : []),
    swap: (date: string, recipeId: string) => input && change((p) => applySwap(p, date, recipeId, input)),
    /** Trades two days' dinners (recipe, portions, guests, batch and roast plans), and keeps both where you put them. */
    swapDays(a: string, b: string): Promise<boolean> {
      const base = latest.current;
      const da = base.find((s) => s.date === a && s.slot === 'dinner');
      const db = base.find((s) => s.date === b && s.slot === 'dinner');
      if (!da || !db || a === b) return Promise.resolve(false);
      const move = (from: MealSlot, to: MealSlot): MealSlot => ({
        ...to, recipe_id: from.recipe_id, mode: from.mode, portions: from.portions, guests: from.guests, reason: from.reason,
        batch: from.batch ?? null, roast: from.roast ?? null, locked: true,
        // A different dinner here: its prep goes back to recommended (the database does the same).
        prep_ahead: from.recipe_id === to.recipe_id ? to.prep_ahead : 'ahead',
      });
      const na = move(db, da);
      const nb = move(da, db);
      return commit(base.map((s) => (s === da ? na : s === db ? nb : s)), [na, nb], base);
    },
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
    lunch: (date: string, choice: string) => update(date, 'lunch', (l) => {
      // A planned lunch (packed or reheated leftovers, or a recipe) becomes a home lunch picked from the options.
      if (l.mode !== 'routine' || l.recipe_id) return { ...l, mode: 'routine', recipe_id: null, source_date: null, reason: null, routine_choice: choice };
      return l.routine_choice === choice ? null : { ...l, routine_choice: choice };
    }),
    /** A lunch cooked from a recipe (shakshuka), at the household's portions; picking it again goes back to a home lunch. */
    lunchRecipe: (date: string, recipeId: string) => update(date, 'lunch', (l) => (l.mode === 'cook' && l.recipe_id === recipeId
      ? { ...l, mode: 'routine', recipe_id: null, portions: null }
      : { ...l, mode: 'cook', recipe_id: recipeId, portions: input?.householdPortions ?? adultShare * 2, source_date: null, routine_choice: null, reason: null })),
    breakfast: (date: string, choice: string) =>
      update(date, 'breakfast', (b) => ({ ...b, routine_choice: b.routine_choice === choice ? null : choice })),
    freezer: data?.freezer ?? [],
    /** Frozen portions of a recipe's batch not yet promised to another dinner (this one aside). */
    freezerFor(recipeId: string, date: string): number {
      if (!data) return 0;
      // The shown week's newest slots first, so they win over the copy loaded with the page.
      const others = [...latest.current, ...data.thisWeek.slots, ...data.nextWeek.slots]
        .filter((s, i, all) => all.findIndex((x) => x.date === s.date && x.slot === s.slot) === i)
        .filter((s) => !(s.date === date && s.slot === 'dinner'));
      return availablePortions(recipeId, data.freezer ?? [], others, starts.london.date);
    },
    /** Sets (or clears) a dinner's batch plan: make a batch, or use a frozen portion. */
    /** A day's dinner from either week (the day after Sunday is next week's Monday). */
    dinnerOn: (date: string): MealSlot | undefined =>
      [...(data?.thisWeek.slots ?? []), ...(data?.nextWeek.slots ?? [])].find((s) => s.date === date && s.slot === 'dinner'),
    /** A dinner's prep, done in the hour the evening before (ahead) or on its own day (Today's hour). Saved on its own,
     *  shown at once, and put back if the save fails. */
    async setPrepAhead(slot: MealSlot, value: PrepAhead): Promise<boolean> {
      if (!slot.id) return false;
      const set = (v: PrepAhead | undefined) => {
        const apply = (list: MealSlot[]) => list.map((s) => (s.id === slot.id ? { ...s, prep_ahead: v } : s));
        latest.current = apply(latest.current);
        setData((d) => d && { ...d, thisWeek: { ...d.thisWeek, slots: apply(d.thisWeek.slots) }, nextWeek: { ...d.nextWeek, slots: apply(d.nextWeek.slots) } });
      };
      const before = slot.prep_ahead;
      set(value);
      try { await repo.setPrepAhead(slot.id, value); return true; } catch { set(before); setSaveError("Couldn't save that change. Check your connection and try again."); return false; }
    },
    batch: (date: string, plan: Extract<BatchPlan, 'make' | 'frozen'> | null) =>
      update(date, 'dinner', (d) => ((d.batch ?? null) === plan ? null : { ...d, batch: plan })),
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
    /** After a batch night: records the answer first (made, or no batch after all), then adds the extra portions to
     *  the freezer. In that order a retry after a failed save can never add the batch twice. */
    async lastNightBatch(frozen: boolean): Promise<boolean> {
      if (!lastNight || !data) return false;
      const { key, slot, recipe } = lastNight;
      const b = parseBatch(recipe.batch);
      if (!b) return false;
      const base = (key === 'nextWeek') === (shown === 'next') ? latest.current : data[key].slots;
      const current = base.find((s) => s.date === slot.date && s.slot === 'dinner') ?? slot;
      const updated = { ...current, batch: frozen ? ('made' as const) : null };
      if (!(await commit(base.map((s) => (s === current ? updated : s)), [updated], base, key))) return false;
      if (!frozen) return true;
      const useBy = new Date(`${slot.date}T00:00:00Z`); useBy.setUTCDate(useBy.getUTCDate() + b.freezer_days);
      try {
        const item = await repo.addPrepared(hid, { recipe_id: recipe.id, name: b.name, portions: b.makes - 1, location: 'freezer', made_on: slot.date, use_by: useBy.toISOString().slice(0, 10) });
        setData((d) => d && { ...d, freezer: [...(d.freezer ?? []), item] });
      } catch {
        setSaveError(`Couldn't add the ${b.name.toLowerCase()} to the freezer. Add it on the Pantry tab.`);
      }
      return true;
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
    /** Approves the week (Cookidoo follows); true when it saved. */
    async approve(): Promise<boolean> {
      if (!current?.week) return false;
      setSaveError(null);
      try {
        await repo.approveWeek(current.week.id);
        setCurrent(latest.current, { ...current.week, status: 'approved', approved_at: current.week.approved_at ?? new Date().toISOString() });
        const key = shown === 'next' ? 'nextCookidoo' : 'thisCookidoo';
        setData((d) => d && { ...d, [key]: { id: '', plan_week_id: current.week!.id, status: 'requested', requested_at: new Date().toISOString(), started_at: null, finished_at: null, summary: null } });
        // Approving keeps the draft's proposed meal partners in settings: read them back, so they stay on the days.
        const fresh = await repo.getSettings(hid).catch(() => null);
        if (fresh) setData((d) => d && { ...d, settings: fresh });
        return true;
      } catch {
        setSaveError("Couldn't approve the week. Check your connection and try again.");
        return false;
      }
    },
    /** Looks again at an open request (quietly); once Claude has finished, the new week loads. */
    async checkRequest() {
      const key = shown === 'next' ? 'nextRequest' : 'thisRequest';
      const req = await repo.getWeekPlanRequest(hid, weekStart).catch(() => null);
      if (!req) return;
      if (req.status === 'done') await reload();
      else setData((d) => d && { ...d, [key]: req });
    },
    /** Asks Claude to fill a delivery's Sainsbury's trolley again (tops up only). */
    async resendBasket(delivery: 'sun' | 'tue') {
      if (!current?.week) return;
      setSaveError(null);
      try {
        const run = await repo.requestRun(current.week.id, delivery);
        const key = shown === 'next' ? 'nextBaskets' : 'thisBaskets';
        setData((d) => d && { ...d, [key]: [...d[key].filter((r: BasketRun) => r.delivery !== delivery), run] });
      } catch {
        setSaveError("Couldn't ask for Sainsbury's again. Check your connection and try again.");
      }
    },
    /** Makes the approved week a draft again. */
    async unapprove(): Promise<boolean> {
      if (!current?.week) return false;
      setSaveError(null);
      try {
        await repo.unapproveWeek(current.week.id);
        setCurrent(latest.current, { ...current.week, status: 'draft', approved_at: null });
        return true;
      } catch {
        setSaveError("Couldn't move the week back to draft. Check your connection and try again.");
        return false;
      }
    },
    /** Cancels the open "Plan with Claude" request. */
    async cancelPlan() {
      const key = shown === 'next' ? 'nextRequest' : 'thisRequest';
      const req = data?.[key];
      if (!req) return;
      setSaveError(null);
      try {
        await repo.cancelWeekPlan(req.id);
        setData((d) => d && { ...d, [key]: { ...req, status: 'failed', summary: CANCELLED } });
      } catch {
        setSaveError("Couldn't cancel. Check your connection and try again.");
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
