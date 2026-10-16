// Input for the cookidoo CLI's record and finish commands: JSON on stdin, so text from Cookidoo pages never
// goes through a shell command line.
import { parse, parseFinish, text } from './basketInput';

export interface RecordRecipe { recipeId: string; url: string; portions: number }
export interface RecordDay { date: string; recipeId: string | null }

export function parseRecordRecipe(input: string): RecordRecipe {
  const o = parse(input);
  const recipeId = text(o.recipeId, 100) ?? (() => { throw new Error('"recipeId" is required'); })();
  const url = text(o.url, 1000) ?? '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* checked below */ }
  if (!url.startsWith('https://') || !(host === 'cookidoo.co.uk' || host.endsWith('.cookidoo.co.uk'))) throw new Error('"url" must be a cookidoo.co.uk link');
  const portions = typeof o.portions === 'number' && o.portions > 0 && o.portions <= 50 ? o.portions : null;
  if (portions === null) throw new Error('"portions" must be a number above 0');
  return { recipeId, url, portions };
}

export function parseRecordDay(input: string): RecordDay {
  const o = parse(input);
  const date = text(o.date, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('"date" must be YYYY-MM-DD');
  return { date, recipeId: o.recipeId === null ? null : text(o.recipeId, 100) ?? (() => { throw new Error('"recipeId" must be an id or null'); })() };
}

export const parseCookidooFinish = parseFinish;
