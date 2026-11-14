-- Prep ahead in Today's hour (14 Nov 2026), replacing the 8pm prep. Each day's hour has the essential tasks (tonight's
-- dinner) and, recommended but optional, the prep for tomorrow's dinner. See
-- docs/superpowers/specs/2026-11-14-prep-ahead-in-the-hour-design.md.

-- On the dinner the prep is for: 'ahead' (its optional prep is done in the hour the evening before; the default),
-- 'on_the_day' (skipped: done in its own day's hour; any must-do prep was still done the evening before) or 'missed'
-- ("I didn't get to it": nothing was done the evening before, so all of it is done on the day).
alter table public.meal_slots add column prep_ahead text not null default 'ahead'
  check (prep_ahead in ('ahead', 'on_the_day', 'missed'));

-- The choice belongs to that day's recipe: when the recipe changes, or the meal is no longer cooked, it goes back to
-- the default, whoever made the change (the app, the connector, a day swap or a roast). A new dinner on its own day
-- (or a past one) had no hour the evening before, so its prep is 'missed': all of it is done in that day's hour.
create function public.prep_ahead_follows_recipe() returns trigger language plpgsql as $$
begin
  if new.recipe_id is distinct from old.recipe_id or new.mode is distinct from 'cook' then
    new.prep_ahead := case when new.mode = 'cook' and new.date <= (now() at time zone 'Europe/London')::date then 'missed' else 'ahead' end;
  end if;
  return new;
end $$;
create trigger prep_ahead_follows_recipe before update on public.meal_slots
  for each row execute function public.prep_ahead_follows_recipe();

-- A prep step that can't wait until the day's own hour (a long marinade, an overnight soak): always done the evening
-- before, never optional. Set by Claude for each recipe; only meaningful on prep_8pm steps.
alter table public.recipe_steps add column needs_night_before boolean not null default false;

-- As in 0010, plus the flag: a step sent with it keeps what's sent; otherwise it keeps the flag of the old step with
-- the same phase and title (like its photo), else false.
create or replace function public.replace_recipe_contents(p_recipe_id uuid, p_ingredients jsonb, p_steps jsonb) returns int
language plpgsql set search_path = public as $$
declare
  photos jsonb;
  kept int;
begin
  select coalesce(jsonb_agg(jsonb_build_object('phase', phase, 'title', title, 'image_path', image_path, 'image_source', image_source,
      'photo_hint', photo_hint, 'needs_night_before', needs_night_before)), '[]')
    into photos from public.recipe_steps where recipe_id = p_recipe_id
      and (image_path is not null or photo_hint is not null or needs_night_before);

  delete from public.recipe_ingredients where recipe_id = p_recipe_id;
  delete from public.recipe_steps where recipe_id = p_recipe_id;

  insert into public.recipe_ingredients (recipe_id, position, group_name, name, qty, unit, note, qty_approx)
  select p_recipe_id, (e->>'position')::int, e->>'group_name', e->>'name', (e->>'qty')::numeric,
         coalesce(e->>'unit', ''), e->>'note', coalesce((e->>'qty_approx')::boolean, false)
  from jsonb_array_elements(p_ingredients) e;

  insert into public.recipe_steps (recipe_id, phase, position, at_minute, title, body, machine, settings, timer_minutes, image_path, image_source, photo_hint, needs_night_before)
  select p_recipe_id, e->>'phase', (e->>'position')::int, (e->>'at_minute')::int, e->>'title', e->>'body',
         e->>'machine', e->>'settings', (e->>'timer_minutes')::int,
         coalesce(e->>'image_path', p->>'image_path'), coalesce(e->>'image_source', p->>'image_source'), coalesce(e->>'photo_hint', p->>'photo_hint'),
         coalesce((e->>'needs_night_before')::boolean, (p->>'needs_night_before')::boolean, false)
  from jsonb_array_elements(p_steps) e
  left join lateral (select p from jsonb_array_elements(photos) p
    where p->>'phase' = e->>'phase' and p->>'title' = e->>'title' limit 1) kept_photo on true;

  select count(*) into kept from public.recipe_steps where recipe_id = p_recipe_id and image_path is not null;
  return kept;
end $$;

revoke execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) to authenticated, service_role;
