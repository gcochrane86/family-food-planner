-- Recipes Claude makes up while planning a week (to use up leftovers or add variety) say which week they were made
-- for, so the week can flag them for the household to check before approving. Null for every other recipe.
alter table public.recipes add column planned_for date;
