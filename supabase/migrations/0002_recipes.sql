-- Phase 2: recipes, their ingredients and steps, and a bucket for recipe photos.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  slug text not null,
  title text not null,
  subtitle text,
  kind text not null default 'meal' check (kind in ('meal', 'component')),
  component_role text check (component_role in ('sauce', 'protein', 'veg', 'carb', 'bread')),
  source text not null check (source in ('hellofresh', 'own_doc', 'claude')),
  base_portions numeric(4, 2) not null check (base_portions > 0),
  reheats_well boolean not null default false,
  freezes_well boolean not null default false,
  toddler_ok boolean not null default true,
  toddler_note text,
  salt_per_portion_g numeric(4, 2),
  prep_minutes int not null default 0,      -- 8pm the night before
  finish_minutes int not null default 0,    -- at dinner time
  hands_off_minutes int not null default 0, -- of the finish, how much is unattended
  tags text[] not null default '{}',
  equipment text[] not null default '{}',
  reheat text,
  hero_image_path text,
  hero_image_source text check (hero_image_source in ('generated', 'own')),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  unique (household_id, slug)
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position int not null,
  group_name text,
  name text not null,
  qty numeric,
  unit text not null default '',
  note text,
  qty_approx boolean not null default false -- "add until it looks right"; qty is the shopping estimate
);
create index recipe_ingredients_recipe on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  phase text not null check (phase in ('prep_8pm', 'finish', 'reheat')),
  position int not null,
  at_minute int,          -- when in the dinner finish this step starts
  title text not null,
  body text not null,     -- **ingredient** marks words to show in bold
  machine text check (machine in ('tm7', 'apo', 'hy24', 'meater', 'hob', 'oven', 'kettle')),
  settings text,          -- e.g. "12 min · Varoma · speed 2 · MC off"
  timer_minutes int,
  image_path text         -- your own photo of this step
);
create index recipe_steps_recipe on public.recipe_steps (recipe_id, phase, position);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

create policy "household access" on public.recipes
  for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "household access" on public.recipe_ingredients
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_member(r.household_id)))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_member(r.household_id)));

create policy "household access" on public.recipe_steps
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_member(r.household_id)))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_member(r.household_id)));

-- Recipe photos: anyone with the link can view them (they're food photos), but only a
-- household's members can add or change files, and only under "{household_id}/".
insert into storage.buckets (id, name, public) values ('recipe-images', 'recipe-images', true)
  on conflict (id) do update set public = true;

create policy "household members manage their recipe images" on storage.objects
  for all to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] in
    (select household_id::text from public.household_users where user_id = auth.uid()))
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] in
    (select household_id::text from public.household_users where user_id = auth.uid()));

-- Replaces a recipe's ingredients and steps in one go (all or nothing), keeping any step photos
-- whose phase and title still match. Runs as the caller, so household access rules apply.
create function public.replace_recipe_contents(p_recipe_id uuid, p_ingredients jsonb, p_steps jsonb) returns int
language plpgsql set search_path = public as $$
declare
  photos jsonb;
  kept int;
begin
  select coalesce(jsonb_agg(jsonb_build_object('phase', phase, 'title', title, 'image_path', image_path)), '[]')
    into photos from public.recipe_steps where recipe_id = p_recipe_id and image_path is not null;

  delete from public.recipe_ingredients where recipe_id = p_recipe_id;
  delete from public.recipe_steps where recipe_id = p_recipe_id;

  insert into public.recipe_ingredients (recipe_id, position, group_name, name, qty, unit, note, qty_approx)
  select p_recipe_id, (e->>'position')::int, e->>'group_name', e->>'name', (e->>'qty')::numeric,
         coalesce(e->>'unit', ''), e->>'note', coalesce((e->>'qty_approx')::boolean, false)
  from jsonb_array_elements(p_ingredients) e;

  insert into public.recipe_steps (recipe_id, phase, position, at_minute, title, body, machine, settings, timer_minutes, image_path)
  select p_recipe_id, e->>'phase', (e->>'position')::int, (e->>'at_minute')::int, e->>'title', e->>'body',
         e->>'machine', e->>'settings', (e->>'timer_minutes')::int,
         (select p->>'image_path' from jsonb_array_elements(photos) p
           where p->>'phase' = e->>'phase' and p->>'title' = e->>'title' limit 1)
  from jsonb_array_elements(p_steps) e;

  select count(*) into kept from public.recipe_steps where recipe_id = p_recipe_id and image_path is not null;
  return kept;
end $$;

revoke execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_recipe_contents(uuid, jsonb, jsonb) to authenticated, service_role;
