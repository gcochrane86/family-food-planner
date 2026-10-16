// Input for the recipes CLI's add and failed commands: JSON on stdin, so text from recipe web pages never goes
// through a shell command line.
import { parse, text } from './basketInput';
// @ts-expect-error plain JS helper
import { validateRecipeSeed } from './recipeSeed.mjs';

// A recipe in the seed file format (docs/playbooks/recipe-import.md), checked by validateRecipeSeed.
export type SeedRecipe = { slug: string; title: string; source: string; [k: string]: unknown };

function parseRecipe(input: string, source?: string): { recipe: SeedRecipe; summary: string } {
  const o = parse(input);
  const summary = text(o.summary, 300) ?? (() => { throw new Error('"summary" is required'); })();
  if (!o.recipe || typeof o.recipe !== 'object' || Array.isArray(o.recipe)) throw new Error('"recipe" must be a recipe object');
  const recipe = { ...(o.recipe as Record<string, unknown>), ...(source ? { source } : {}) } as SeedRecipe;
  const problems: string[] = validateRecipeSeed({ recipes: [recipe] });
  if (problems.length) throw new Error(`The recipe has problems:\n- ${problems.join('\n- ')}`);
  return { recipe, summary };
}

/** A converted recipe and the one-line summary the app shows. The recipe must pass the seed rules. */
export const parseImport = (input: string) => parseRecipe(input, 'web');

/** A reworked recipe (the whole recipe, as `show` printed it, changed) and a one-line summary of what changed. */
export const parseRework = (input: string) => parseRecipe(input);

/** A rework that couldn't be done, and why. */
export function parseReworkFailed(input: string): { rework: string; summary: string } {
  const o = parse(input);
  const id = text(o.rework, 100) ?? (() => { throw new Error('"rework" is required'); })();
  const summary = text(o.summary, 300) ?? (() => { throw new Error('"summary" is required'); })();
  return { rework: id, summary };
}

/** An import that couldn't be done, and why (shown in the app). */
export function parseImportFailed(input: string): { import: string; summary: string } {
  const o = parse(input);
  const id = text(o.import, 100) ?? (() => { throw new Error('"import" is required'); })();
  const summary = text(o.summary, 300) ?? (() => { throw new Error('"summary" is required'); })();
  return { import: id, summary };
}
