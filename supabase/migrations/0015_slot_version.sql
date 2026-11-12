-- Tonight's version (Ask Claude: changes you approve). A day's meal can carry its own version of the recipe: the
-- full ingredients and steps for that day, a one-line note and which parts changed. The saved recipe is untouched.
-- Cleared whenever that day's recipe changes or it stops being cooked (supabase/functions/_shared/slotMerge.ts).
alter table public.meal_slots add column version jsonb;

-- Tonight's version belongs to that day's recipe: when the recipe changes, or the meal is no longer cooked, the
-- database drops it, whoever made the change (the app, the connector, a day swap or a roast). The app itself never
-- writes this column; only the Ask Claude connector does.
create function public.slot_version_follows_recipe() returns trigger language plpgsql as $$
begin
  if new.version is not null and (new.recipe_id is distinct from old.recipe_id or new.mode in ('out', 'reheat', 'leftovers')) then
    new.version := null;
  end if;
  return new;
end $$;
create trigger slot_version_follows_recipe before update on public.meal_slots
  for each row execute function public.slot_version_follows_recipe();
