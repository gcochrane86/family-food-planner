// Input for the week CLI's save and failed commands: JSON on stdin, so Claude's text never goes through a shell
// command line.
import { parse, text } from './basketInput';
import type { SeedRecipe } from './importInput';
// @ts-expect-error plain JS helper
import { validateRecipeSeed } from './recipeSeed.mjs';

export interface WeekPlan {
  summary: string;
  dinners: { date: string; recipe: string; reason: string }[]; // recipe: a slug, existing or new
  newRecipes: SeedRecipe[];
}

const need = (v: string | null, what: string) => v ?? (() => { throw new Error(`"${what}" is required`); })();

function datesOf(weekStart: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Claude's plan: a summary, a dinner for some or all nights, and up to `adventure` new recipes. */
export function parseWeekPlan(input: string, week: { weekStart: string; days: number; adventure: number }): WeekPlan {
  const o = parse(input);
  const summary = need(text(o.summary, 600), 'summary');
  if (!Array.isArray(o.dinners) || !o.dinners.length) throw new Error('"dinners" must be a list with at least one dinner');
  const dates = datesOf(week.weekStart, week.days);
  const seen = new Set<string>();
  const dinners = o.dinners.map((d: Record<string, unknown>) => {
    const date = need(text(d?.date, 10), 'dinners[].date');
    if (!dates.includes(date)) throw new Error(`${date} is not in the week (${dates[0]} to ${dates[dates.length - 1]})`);
    if (seen.has(date)) throw new Error(`two dinners on ${date}`);
    seen.add(date);
    return { date, recipe: need(text(d.recipe, 100), 'dinners[].recipe'), reason: need(text(d.reason, 200), 'dinners[].reason') };
  });
  const raw = o.new_recipes ?? [];
  if (!Array.isArray(raw)) throw new Error('"new_recipes" must be a list');
  if (raw.length > week.adventure) throw new Error(`at most ${week.adventure} new recipe${week.adventure === 1 ? '' : 's'} a week (Settings → adventure)`);
  const newRecipes = raw.map((r) => ({ ...(r as Record<string, unknown>), source: 'claude' }) as SeedRecipe);
  if (newRecipes.length) {
    const problems: string[] = validateRecipeSeed({ recipes: newRecipes });
    if (problems.length) throw new Error(`A new recipe has problems:\n- ${problems.join('\n- ')}`);
  }
  return { summary, dinners, newRecipes };
}

/** A plan that couldn't be made, and why (shown in the app). */
export function parseWeekFailed(input: string): { request: string; summary: string } {
  const o = parse(input);
  return { request: need(text(o.request, 100), 'request'), summary: need(text(o.summary, 300), 'summary') };
}
