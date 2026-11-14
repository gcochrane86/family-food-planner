import { londonParts } from '../../../supabase/functions/_shared/schedule.ts';
import { applyVersion } from '../../../supabase/functions/_shared/slotVersion.ts';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import { planHour, type HourInput } from '../../lib/todayHour';
import type { MealSlot, Recipe, RecipeDetail } from '../../lib/types';
import { homeLunchChoice, leftoverLunchPortions } from '../../lib/weekSummary';
import { aheadRecipeId, homeLunchOn } from '../../lib/lunchAhead';
import { useAsync } from '../settings/useAsync';
import { addDays } from '../week/useWeek';
import { roastEveningSteps, type RoastPartRecipe } from '../../lib/roast';
import { parseRoastChoice, parseRoastPart, roastQuery } from '../../lib/roastModel';

/** The Monday of the week a date is in. */
const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
/** Today's date in London, known straight away (the screen keeps its place under it). */
export const todayInLondon = (now = new Date()) => londonParts(now).date;
const hasSteps = (r: RecipeDetail | null) => !!r?.steps.some((s) => s.phase === 'finish');

/** Builds today's hour from yesterday's, today's and tomorrow's slots (tomorrow may be in next week's plan). */
export function useTodayHour(now = new Date()) {
  const { householdId } = useAuth();
  const hid = householdId!;
  const today = todayInLondon(now);
  return useAsync(async () => {
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    // The past week too, to see whether a run of chicken-sandwich lunches is still covered by an earlier roast.
    const weeks = [...new Set([addDays(today, -7), yesterday, today, tomorrow].map(mondayOf))];
    const [settings, recipes, kit, prep, ...loaded] = await Promise.all([repo.getSettings(hid), repo.listRecipes(hid), repo.listEquipment(hid).catch(() => []), repo.listPrepPhotos(hid).catch(() => []), ...weeks.map((w) => repo.getWeek(hid, w))]);
    const slots: MealSlot[] = loaded.flatMap((w) => w.slots);
    const find = (date: string, kind: MealSlot['slot']) => slots.find((s) => s.date === date && s.slot === kind);
    const byId = new Map(recipes.map((r: Recipe) => [r.id, r]));
    const cache = new Map<string, Promise<RecipeDetail | null>>();
    const detail = (id: string | null | undefined) => {
      if (!id) return Promise.resolve(null);
      if (!cache.has(id)) cache.set(id, repo.getRecipe(id).catch(() => null));
      return cache.get(id)!;
    };
    // A day's meal is cooked as its tonight's version, when it has one.
    const forSlot = async (s: MealSlot | undefined) => {
      const r = await detail(s?.recipe_id);
      return r && s ? applyVersion(r, s.version) : r;
    };
    const cooked = (s: MealSlot | undefined) => (s?.mode === 'cook' && s.recipe_id ? s : undefined);

    const tonightSlot = cooked(find(today, 'dinner'));
    const tonightRecipe = await forSlot(tonightSlot);
    // Cooked for the household plus tomorrow's leftovers lunch, as the shopping list and Cookidoo count it.
    const portionsOf = (slot: MealSlot, r: RecipeDetail) => (slot.portions ?? r.base_portions) + leftoverLunchPortions(slot, slots, byId);
    const tonight = tonightSlot && tonightRecipe ? { recipe: tonightRecipe, portions: portionsOf(tonightSlot, tonightRecipe), prepAhead: tonightSlot.prep_ahead ?? 'ahead' } : null;

    const anyTomorrow = slots.some((s) => s.date === tomorrow);
    let next: HourInput['tomorrow'] = null;
    if (anyTomorrow) {
      // A roast keeps its own plan: the hour only shows its evening-before prep.
      const roastChoice = parseRoastChoice(find(tomorrow, 'dinner')?.roast);
      const dSlot = roastChoice ? undefined : cooked(find(tomorrow, 'dinner'));
      const dRecipe = await forSlot(dSlot);
      const dinner = dSlot && dRecipe ? { recipe: dRecipe, portions: portionsOf(dSlot, dRecipe), prepAhead: (dSlot.prep_ahead ?? 'ahead') === 'ahead' } : null;
      let roast: NonNullable<HourInput['tomorrow']>['roast'] = null;
      if (roastChoice) {
        const parts = new Map(recipes.filter((r: Recipe) => parseRoastPart(r.roast)).map((r: Recipe) => [r.slug, r as unknown as RoastPartRecipe]));
        const steps = roastEveningSteps(roastChoice, parts);
        if (steps.length) roast = { title: find(tomorrow, 'dinner')?.reason?.split(' · ')[0] ?? 'Roast', steps, link: `/recipes/roast/cook?${roastQuery(roastChoice)}` };
      }

      // Tomorrow's lunch: tonight's leftovers (picked, or packed/reheated from tonight), else a lunch recipe to make.
      const l = find(tomorrow, 'lunch');
      let lunch: NonNullable<HourInput['tomorrow']>['lunch'] = null;
      const leftovers = !!tonight && (l?.mode === 'routine'
        ? homeLunchChoice(l.routine_choice, !!byId.get(tonight.recipe.id)?.reheats_well) === 'Leftovers'
        : (l?.mode === 'packed' || l?.mode === 'reheat') && l.source_date === today);
      if (leftovers) lunch = { kind: 'leftovers', title: tonight!.recipe.title };
      else if (l?.recipe_id && l.mode !== 'reheat') {
        const r = await forSlot(l);
        if (hasSteps(r)) lunch = { kind: 'make', title: r!.title, recipe: r! };
      } else {
        // A home lunch made on the day, with a part done the evening before (the chicken sandwich's roast chicken).
        const home = homeLunchOn(tomorrow, slots, recipes, byId);
        const r = home ? await detail(home.id) : null;
        const ahead = !!r?.steps.some((x) => x.phase === 'prep_8pm');
        if (r && aheadRecipeId(tomorrow, slots, recipes, byId, (id) => ahead && id === r.id)) lunch = { kind: 'ahead', title: r.title, recipe: r };
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
      next = { dinner, lunch, breakfast, roast };
    }

    const input: HourInput = {
      date: today,
      start: settings.hour_start ?? '17:30',
      minutes: settings.hour_minutes ?? 60,
      tm7Bowls: settings.tm7_bowls ?? 1,
      tm7Machines: settings.tm7_machines ?? 1,
      prepPhotos: Object.fromEntries(prep.map((p) => [p.key, p.path])),
      kitPhotos: Object.fromEntries(kit.filter((e) => e.photo).map((e) => [e.code, { path: e.photo!, name: e.name }])),
      tonight,
      // Yesterday was planned, so its hour boxed what keeps of tonight's dinner (shown as a fridge box to check).
      yesterdayPlanned: slots.some((s) => s.date === yesterday),
      tomorrow: next,
    };
    return { input, plan: planHour(input), tonightSlot: find(today, 'dinner') ?? null, tomorrowSlot: find(tomorrow, 'dinner') ?? null };
  }, [hid, today], { onReturn: true });
}
