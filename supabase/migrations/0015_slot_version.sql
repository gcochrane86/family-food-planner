-- Tonight's version (Ask Claude: changes you approve). A day's meal can carry its own version of the recipe: the
-- full ingredients and steps for that day, a one-line note and which parts changed. The saved recipe is untouched.
-- Cleared whenever that day's recipe changes or it stops being cooked (supabase/functions/_shared/slotMerge.ts).
alter table public.meal_slots add column version jsonb;
