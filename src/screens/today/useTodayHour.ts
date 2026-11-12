import { londonParts } from '../../../supabase/functions/_shared/schedule.ts';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import { planHour, type HourInput } from '../../lib/todayHour';
import type { MealSlot, Recipe, RecipeDetail } from '../../lib/types';
import { homeLunchChoice } from '../../lib/weekSummary';
import { useAsync } from '../settings/useAsync';
import { addDays } from '../week/useWeek';

/** The Monday of the week a date is in. */
const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const hasSteps = (r: RecipeDetail | null) => !!r?.steps.some((s) => s.phase === 'finish');

/** Builds today's hour from yesterday's, today's and tomorrow's slots (tomorrow may be in next week's plan). */
export function useTodayHour(now = new Date()) {
  const { householdId } = useAuth();
  const hid = householdId!;
  const today = londonParts(now).date;
  return useAsync(async () => {
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const weeks = [...new Set([yesterday, today, tomorrow].map(mondayOf))];
    const [settings, recipes, ...loaded] = await Promise.all([repo.getSettings(hid), repo.listRecipes(hid), ...weeks.map((w) => repo.getWeek(hid, w))]);
    const slots: MealSlot[] = loaded.flatMap((w) => w.slots);
    const find = (date: string, kind: MealSlot['slot']) => slots.find((s) => s.date === date && s.slot === kind);
    const byId = new Map(recipes.map((r: Recipe) => [r.id, r]));
    const cache = new Map<string, Promise<RecipeDetail | null>>();
    const detail = (id: string | null | undefined) => {
      if (!id) return Promise.resolve(null);
      if (!cache.has(id)) cache.set(id, repo.getRecipe(id).catch(() => null));
      return cache.get(id)!;
    };
    const cooked = (s: MealSlot | undefined) => (s?.mode === 'cook' && s.recipe_id ? s : undefined);

    const tonightSlot = cooked(find(today, 'dinner'));
    const tonightRecipe = await detail(tonightSlot?.recipe_id);
    const tonight = tonightSlot && tonightRecipe ? { recipe: tonightRecipe, portions: tonightSlot.portions ?? tonightRecipe.base_portions } : null;

    const anyTomorrow = slots.some((s) => s.date === tomorrow);
    let next: HourInput['tomorrow'] = null;
    if (anyTomorrow) {
      const dSlot = cooked(find(tomorrow, 'dinner'));
      const dRecipe = await detail(dSlot?.recipe_id);
      const dinner = dSlot && dRecipe ? { recipe: dRecipe, portions: dSlot.portions ?? dRecipe.base_portions } : null;

      // Tomorrow's lunch: tonight's leftovers (picked, or packed/reheated from tonight), else a lunch recipe to make.
      const l = find(tomorrow, 'lunch');
      let lunch: NonNullable<HourInput['tomorrow']>['lunch'] = null;
      const leftovers = !!tonight && (l?.mode === 'routine'
        ? homeLunchChoice(l.routine_choice, !!byId.get(tonight.recipe.id)?.reheats_well) === 'Leftovers'
        : (l?.mode === 'packed' || l?.mode === 'reheat') && l.source_date === today);
      if (leftovers) lunch = { kind: 'leftovers', title: tonight!.recipe.title };
      else if (l?.recipe_id && l.mode !== 'reheat') {
        const r = await detail(l.recipe_id);
        if (hasSteps(r)) lunch = { kind: 'make', title: r!.title, recipe: r! };
      }

      // Tomorrow's breakfast, only when it's one made the night before.
      const b = find(tomorrow, 'breakfast');
      const name = b?.routine_choice ?? b?.reason ?? null;
      const ahead = (settings.breakfast_ahead ?? []).find((x) => name && (name === x || name.startsWith(`${x} (`)));
      let breakfast: NonNullable<HourInput['tomorrow']>['breakfast'] = null;
      if (ahead) {
        const match = recipes.find((r: Recipe) => r.title.toLowerCase() === ahead.toLowerCase());
        const r = await detail(match?.id);
        breakfast = hasSteps(r) ? { title: ahead, recipe: r! } : { title: ahead };
      }
      next = { dinner, lunch, breakfast };
    }

    const input: HourInput = {
      date: today,
      start: settings.hour_start ?? '17:30',
      minutes: settings.hour_minutes ?? 60,
      tm7Bowls: settings.tm7_bowls ?? 1,
      tm7Machines: settings.tm7_machines ?? 1,
      tonight,
      yesterdayPlanned: !!cooked(find(yesterday, 'dinner')),
      tomorrow: next,
    };
    return { input, plan: planHour(input), tonightSlot: find(today, 'dinner') ?? null };
  }, [hid, today]);
}
