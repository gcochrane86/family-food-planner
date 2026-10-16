import { useCallback, useMemo, useState } from 'react';
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

  /** Saves straight away, and puts things back if the save fails. */
  const commit = useCallback(async (next: MealSlot[], changed: MealSlot[]) => {
    if (!current) return;
    const before = current.slots;
    setCurrent(next);
    setSaveError(null);
    try {
      await repo.saveSlots(changed);
    } catch {
      setCurrent(before);
      setSaveError("Couldn't save that change. Check your connection and try again.");
    }
  }, [current, setCurrent]);

  const change = useCallback((fn: (plan: ProposedSlot[]) => ProposedSlot[]) => {
    if (!current) return;
    const { next, changed } = merge(current.slots, fn(current.slots.map(toProposed)));
    void commit(next, changed);
  }, [current, commit]);

  const dinner = (date: string) => current?.slots.find((s) => s.date === date && s.slot === 'dinner');

  return {
    loading, error, reload, saveError, starts, shown, setWhich, weekStart, recipes, input,
    week: current?.week ?? null,
    slots: current?.slots ?? [],
    officeDays: input?.officeDays ?? [],
    alternatives: (date: string) => (current && input ? plannerAlternatives(current.slots.map(toProposed), date, input) : []),
    swap: (date: string, recipeId: string) => input && change((p) => applySwap(p, date, recipeId, input)),
    out: (date: string) => change((p) => applyOut(p, date)),
    leftovers: (date: string) => change((p) => applyLeftovers(p, date)),
    guests: (date: string, n: number) => input && change((p) => applyGuests(p, date, Math.max(0, n), input)),
    keep: (date: string) => {
      const d = dinner(date);
      if (d && !d.locked) void commit(current!.slots.map((s) => (s === d ? { ...s, locked: true } : s)), [{ ...d, locked: true }]);
    },
    breakfast: (date: string, choice: string) => {
      const b = current?.slots.find((s) => s.date === date && s.slot === 'breakfast');
      if (!b) return;
      const updated = { ...b, routine_choice: b.routine_choice === choice ? null : choice };
      void commit(current!.slots.map((s) => (s === b ? updated : s)), [updated]);
    },
    async approve() {
      if (!current?.week) return;
      setSaveError(null);
      try {
        await repo.approveWeek(current.week.id);
        setCurrent(current.slots, { ...current.week, status: 'approved', approved_at: current.week.approved_at ?? new Date().toISOString() });
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
