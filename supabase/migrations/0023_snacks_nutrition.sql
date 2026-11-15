-- Daily balance and snack makes (15 Nov 2026): recipes of a new kind, snack, made in Today's cooking on prep days;
-- an estimate of each recipe's nutrition per portion; and a morning and an afternoon snack in each day's plan.
-- See docs/superpowers/specs/2026-11-15-balance-snacks-design.md.

-- The kind and slot checks are replaced whatever they were named.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.recipes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.recipes drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint where conrelid = 'public.meal_slots'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%slot%' loop
    execute format('alter table public.meal_slots drop constraint %I', c);
  end loop;
end $$;
alter table public.recipes add constraint recipes_kind_check check (kind in ('meal', 'component', 'snack'));
alter table public.meal_slots add constraint meal_slots_slot_check check (slot in ('breakfast', 'lunch', 'dinner', 'snack_am', 'snack_pm'));

-- Per adult portion: protein and fibre (g), veg and fruit (80g portions), and yes/no flags for healthy fat, oily fish,
-- beans or lentils, red meat and processed meat. Estimates, for spotting patterns.
alter table public.recipes add column nutrition jsonb;
-- A snack's keeping time in days, counted from the day it's made (day 0).
alter table public.recipes add column keeps_days int check (keeps_days between 1 and 7);
