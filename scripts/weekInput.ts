// Input for the week CLI's save and failed commands: JSON on stdin, so Claude's text never goes through a shell
// command line.
import { parse, text } from './basketInput';
import { parsePlan, type WeekPlan } from '../supabase/functions/_shared/weekPlan';

export type { WeekPlan };

const need = (v: string | null, what: string) => v ?? (() => { throw new Error(`"${what}" is required`); })();

/** Claude's plan from stdin: a summary, a dinner for some or all nights, and up to `adventure` new recipes. */
export function parseWeekPlan(input: string, week: { weekStart: string; days: number; adventure: number }): WeekPlan {
  return parsePlan(parse(input), week);
}

/** A plan that couldn't be made, and why (shown in the app). */
export function parseWeekFailed(input: string): { request: string; summary: string } {
  const o = parse(input);
  return { request: need(text(o.request, 100), 'request'), summary: need(text(o.summary, 300), 'summary') };
}
