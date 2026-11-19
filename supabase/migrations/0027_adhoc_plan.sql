-- Ad-hoc plan and shop (19 Nov 2026): a few meals and hand-added items for a quick trip to the shops, with their own
-- ticks, kept apart from the weekly plan so nothing that reads weeks picks them up.
-- See docs/superpowers/specs/2026-11-19-adhoc-plan-design.md.

create table public.adhoc_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  meal text not null check (meal in ('lunch', 'dinner')),
  portions numeric(5, 2) not null check (portions > 0),
  created_at timestamptz not null default now()
);

create table public.adhoc_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.adhoc_ticks (
  household_id uuid not null references public.households (id) on delete cascade,
  item_key text not null,
  ticked boolean not null default false,
  primary key (household_id, item_key)
);

do $$
declare t text;
begin
  foreach t in array array['adhoc_meals', 'adhoc_items', 'adhoc_ticks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "household access" on public.%I for all to authenticated
         using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

-- Start fresh clears the ad-hoc plan too (as 0012, plus the three ad-hoc tables).
create or replace function public.start_fresh(p_household uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  entries jsonb;
  req uuid;
begin
  if not public.is_member(p_household) then raise exception 'not_a_member'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('date', s.date, 'title', r.title, 'url', coalesce(r.cookidoo_url, r.cookidoo_own_url)) order by s.date), '[]')
    into entries
    from public.meal_slots s
    join public.plan_weeks w on w.id = s.plan_week_id
    join public.recipes r on r.id = s.cookidoo_recipe_id
    where w.household_id = p_household and s.cookidoo_recipe_id is not null;
  insert into public.fresh_starts (household_id, my_week) values (p_household, entries) returning id into req;
  -- Slots, shopping ticks, basket and Cookidoo runs go with their weeks.
  delete from public.plan_weeks where household_id = p_household;
  delete from public.quick_shop_items where household_id = p_household;
  delete from public.adhoc_meals where household_id = p_household;
  delete from public.adhoc_items where household_id = p_household;
  delete from public.adhoc_ticks where household_id = p_household;
  return req;
end $$;
