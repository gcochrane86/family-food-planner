import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
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
    return { thisWeek, nextWeek, recipes, members, pattern, settings, recent };
  }, [hid, starts]);

  const shown: 'this' | 'next' = which ?? (data?.nextWeek.week || !data?.thisWeek.week ? 'next' : 'this');
  const current = data ? (shown === 'next' ? data.nextWeek : data.thisWeek) : null;
  const weekStart = shown === 'next' ? starts.nextWeek : starts.thisWeek;
  const recipes = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data]);

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
  const commit = useCallback((next: MealSlot[], changed: MealSlot[], before: MealSlot[]) => {
    if (!changed.length) return;
    latest.current = next;
    setCurrent(next);
    // An earlier failure message stays up (it says a change was undone) until the screen is reloaded.
    queue.current = queue.current.then(() => repo.saveSlots(changed)).catch(() => {
      const restored = latest.current.map((s) => (changed.some((c) => sameSlot(c, s)) ? before.find((b) => sameSlot(b, s)) ?? s : s));
      latest.current = restored;
      setCurrent(restored);
      setSaveError("Couldn't save that change. Check your connection and try again.");
    });
  }, [setCurrent]);

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
    if (!target || !updated) return;
    commit(base.map((s) => (s === target ? updated : s)), [updated], base);
  }, [commit]);

  return {
    loading, error, reload, saveError, starts, shown, setWhich, weekStart, recipes, input,
    week: current?.week ?? null,
    slots: current?.slots ?? [],
    officeDays: input?.officeDays ?? [],
    alternatives: (date: string) => (current && input ? plannerAlternatives(current.slots.map(toProposed), date, input) : []),
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
    breakfast: (date: string, choice: string) =>
      update(date, 'breakfast', (b) => ({ ...b, routine_choice: b.routine_choice === choice ? null : choice })),
    async approve() {
      if (!current?.week) return;
      setSaveError(null);
      try {
        await repo.approveWeek(current.week.id);
        setCurrent(latest.current, { ...current.week, status: 'approved', approved_at: current.week.approved_at ?? new Date().toISOString() });
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
