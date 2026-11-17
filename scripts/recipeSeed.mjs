// Recipe seed helpers for the scripts. The checks and row builders live in supabase/functions/_shared/recipeSeed.ts
// (shared with the Ask Claude connector); Node 24 loads the .ts directly.
export { contentRows, recipeRow, seedFromDetail, validateRecipeSeed } from '../supabase/functions/_shared/recipeSeed.ts';
