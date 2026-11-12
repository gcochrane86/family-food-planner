-- Step picture descriptions: thorough enough that the image model can't get the step wrong (every item, its cut and
-- state, which container each is in), so up to 600 characters instead of 200.
alter table public.recipe_steps drop constraint if exists recipe_steps_photo_hint_check;
alter table public.recipe_steps add constraint recipe_steps_photo_hint_check check (length(photo_hint) <= 600);
