// Input for the recipes CLI's add and failed commands: JSON on stdin, so text from recipe web pages never goes
// through a shell command line.
import { parse, text } from './basketInput';
// @ts-expect-error plain JS helper
import { validateRecipeSeed } from './recipeSeed.mjs';

// A recipe in the seed file format (docs/playbooks/recipe-import.md), checked by validateRecipeSeed.
export type SeedRecipe = { slug: string; title: string; source: string; [k: string]: unknown };

/** A converted recipe and the one-line summary the app shows. The recipe must pass the seed rules. */
export function parseImport(input: string): { recipe: SeedRecipe; summary: string } {
  const o = parse(input);
  const summary = text(o.summary, 300) ?? (() => { throw new Error('"summary" is required'); })();
  if (!o.recipe || typeof o.recipe !== 'object' || Array.isArray(o.recipe)) throw new Error('"recipe" must be a recipe object');
  const recipe = { ...(o.recipe as Record<string, unknown>), source: 'web' } as SeedRecipe;
  const problems: string[] = validateRecipeSeed({ recipes: [recipe] });
  if (problems.length) throw new Error(`The recipe has problems:\n- ${problems.join('\n- ')}`);
  return { recipe, summary };
}

/** An import that couldn't be done, and why (shown in the app). */
export function parseImportFailed(input: string): { import: string; summary: string } {
  const o = parse(input);
  const id = text(o.import, 100) ?? (() => { throw new Error('"import" is required'); })();
  const summary = text(o.summary, 300) ?? (() => { throw new Error('"summary" is required'); })();
  return { import: id, summary };
}
