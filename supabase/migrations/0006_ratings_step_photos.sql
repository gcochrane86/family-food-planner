-- Phase 5: "Have it again?" ratings, and step photos made by AI for liked recipes.

alter table public.recipes
  add column rating text check (rating in ('up', 'down')),   -- null = not rated yet; 'down' keeps it out of menus
  add column rated_at timestamptz;

alter table public.recipe_steps
  add column image_source text check (image_source in ('own', 'generated'));
update public.recipe_steps set image_source = 'own' where image_path is not null;

-- Same as 0002, but a kept step photo keeps its source too.
create or replace function public.replace_recipe_contents(p_recipe_id uuid, p_ingredients jsonb, p_steps jsonb) returns int
language plpgsql set search_path = public as $$
declare
  photos jsonb;
  kept int;
begin
  select coalesce(jsonb_agg(jsonb_build_object('phase', phase, 'title', title, 'image_path', image_path, 'image_source', image_source)), '[]')
    into photos from public.recipe_steps where recipe_id = p_recipe_id and image_path is not null;

  delete from public.recipe_ingredients where recipe_id = p_recipe_id;
  delete from public.recipe_steps where recipe_id = p_recipe_id;

  insert into public.recipe_ingredients (recipe_id, position, group_name, name, qty, unit, note, qty_approx)
  select p_recipe_id, (e->>'position')::int, e->>'group_name', e->>'name', (e->>'qty')::numeric,
         coalesce(e->>'unit', ''), e->>'note', coalesce((e->>'qty_approx')::boolean, false)
  from jsonb_array_elements(p_ingredients) e;

  insert into public.recipe_steps (recipe_id, phase, position, at_minute, title, body, machine, settings, timer_minutes, image_path, image_source)
  select p_recipe_id, e->>'phase', (e->>'position')::int, (e->>'at_minute')::int, e->>'title', e->>'body',
         e->>'machine', e->>'settings', (e->>'timer_minutes')::int, p->>'image_path', p->>'image_source'
  from jsonb_array_elements(p_steps) e
  left join lateral (select p from jsonb_array_elements(photos) p
    where p->>'phase' = e->>'phase' and p->>'title' = e->>'title' limit 1) kept_photo on true;

  select count(*) into kept from public.recipe_steps where recipe_id = p_recipe_id and image_path is not null;
  return kept;
end $$;

revoke execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) to authenticated, service_role;
