import { buildVersion, parseVersion, type SlotVersion, type VersionInput } from '../../supabase/functions/_shared/slotVersion.ts';
import type { RecipeDetail } from './types';

export interface StepChange { phase: string; title: string; body?: string; timer?: number | null; at?: number | null; remove?: boolean }

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Changes one step of a day's dinner for that day only, as its tonight's version (the saved recipe is untouched).
 *  Starts from the day's current version when it's for this recipe (Claude's changes are kept), else the recipe. */
export function changeStepForDay(recipe: RecipeDetail, current: unknown, change: StepChange): { version: SlotVersion } | { error: string } {
  const v = parseVersion(current);
  const base = v && v.based_on === recipe.id ? v : null;
  const steps = base ? base.steps : recipe.steps;
  const ingredients = base ? base.ingredients : recipe.ingredients;
  const target = steps.find((s) => s.phase === change.phase && key(s.title) === key(change.title));
  if (!target) return { error: `"${change.title}" isn't in this dinner's recipe for that day.` };

  const nextSteps = steps.filter((s) => !(change.remove && s === target)).map((s) => ({
    phase: s.phase, title: s.title, body: s === target && change.body !== undefined ? change.body : s.body,
    machine: s.machine, settings: s.settings,
    timer_minutes: s === target && change.timer !== undefined ? change.timer : s.timer_minutes,
    at_minute: s === target && change.at !== undefined ? change.at : s.at_minute,
    needs_night_before: s.needs_night_before ?? false,
  }));
  const line = `${change.remove ? 'Removed' : 'Changed'} for this day: ${target.title}`;
  const input: VersionInput = {
    note: base ? `${base.note}; ${line}` : line,
    ingredients: ingredients.map((i) => ({ group_name: i.group_name, name: i.name, qty: i.qty, unit: i.unit, note: i.note })),
    // What the day's version already left out of the saved recipe stays out.
    removed_ingredients: recipe.ingredients.filter((i) => !ingredients.some((x) => key(x.name) === key(i.name))).map((i) => i.name),
    steps: nextSteps,
    removed_steps: recipe.steps.filter((s) => !nextSteps.some((x) => key(x.title) === key(s.title))).map((s) => s.title),
  };
  return buildVersion(recipe as never, input);
}
