-- Editing recipes: in the app (by hand), or by asking Claude on the owner's Mac to rework one.

-- A step keeps its photo when it's renamed in the editor: the app passes the step's photo along, and a passed
-- photo wins over one matched by phase + title.
create or replace function public.replace_recipe_contents(p_recipe_id uuid, p_ingredients jsonb, p_steps jsonb) returns int
language plpgsql set search_path = public as $$
declare
  photos jsonb;
  kept int;
begin
  select coalesce(jsonb_agg(jsonb_build_object('phase', phase, 'title', title, 'image_path', image_path, 'image_source', image_source, 'photo_hint', photo_hint)), '[]')
    into photos from public.recipe_steps where recipe_id = p_recipe_id and (image_path is not null or photo_hint is not null);

  delete from public.recipe_ingredients where recipe_id = p_recipe_id;
  delete from public.recipe_steps where recipe_id = p_recipe_id;

  insert into public.recipe_ingredients (recipe_id, position, group_name, name, qty, unit, note, qty_approx)
  select p_recipe_id, (e->>'position')::int, e->>'group_name', e->>'name', (e->>'qty')::numeric,
         coalesce(e->>'unit', ''), e->>'note', coalesce((e->>'qty_approx')::boolean, false)
  from jsonb_array_elements(p_ingredients) e;

  insert into public.recipe_steps (recipe_id, phase, position, at_minute, title, body, machine, settings, timer_minutes, image_path, image_source, photo_hint)
  select p_recipe_id, e->>'phase', (e->>'position')::int, (e->>'at_minute')::int, e->>'title', e->>'body',
         e->>'machine', e->>'settings', (e->>'timer_minutes')::int,
         coalesce(e->>'image_path', p->>'image_path'), coalesce(e->>'image_source', p->>'image_source'), coalesce(e->>'photo_hint', p->>'photo_hint')
  from jsonb_array_elements(p_steps) e
  left join lateral (select p from jsonb_array_elements(photos) p
    where p->>'phase' = e->>'phase' and p->>'title' = e->>'title' limit 1) kept_photo on true;

  select count(*) into kept from public.recipe_steps where recipe_id = p_recipe_id and image_path is not null;
  return kept;
end $$;

revoke execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) to authenticated, service_role;

-- "Rework with Claude": a request to rewrite a recipe (e.g. "use the Anova for the chicken"). A scheduled Claude task
-- claims it ('working'), rewrites the recipe, then marks it done or failed.
create table public.recipe_reworks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  request text not null check (char_length(btrim(request)) between 1 and 1000),
  status text not null default 'requested' check (status in ('requested', 'working', 'done', 'failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  summary text
);
alter table public.recipe_reworks enable row level security;
create policy "household access" on public.recipe_reworks
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Saves an edited recipe in one go: its fields (only the editable ones; slug, source, status and household never
-- change here) and its ingredients and steps. Either everything is saved or nothing is.
create function public.save_recipe(p_recipe_id uuid, p_fields jsonb, p_ingredients jsonb, p_steps jsonb) returns int
language plpgsql set search_path = public as $$
begin
  update public.recipes r set (title, subtitle, kind, component_role, base_portions, reheats_well, freezes_well, toddler_ok,
      toddler_note, protein, salt_per_portion_g, prep_minutes, finish_minutes, hands_off_minutes, tags, equipment, reheat)
    = (select x.title, x.subtitle, x.kind, x.component_role, x.base_portions, x.reheats_well, x.freezes_well, x.toddler_ok,
        x.toddler_note, x.protein, x.salt_per_portion_g, x.prep_minutes, x.finish_minutes, x.hands_off_minutes, x.tags, x.equipment, x.reheat
       from jsonb_populate_record(r, p_fields) x)
  where r.id = p_recipe_id;
  if not found then raise exception 'recipe_not_found'; end if;
  return public.replace_recipe_contents(p_recipe_id, p_ingredients, p_steps);
end $$;
revoke execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
