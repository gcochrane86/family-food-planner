-- "Start fresh" (Settings): clears the week plans and Spar list in one go, and leaves a request for the scheduled tasks
-- on the owner's Mac to empty the Sainsbury's trolley and remove the My Week entries Claude added in Cookidoo.
create table public.fresh_starts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  requested_at timestamptz not null default now(),
  -- Claude's My Week entries at the time: [{date, title, url}], so the Cookidoo task knows exactly what to remove.
  my_week jsonb not null default '[]'::jsonb,
  trolley_status text not null default 'requested' check (trolley_status in ('requested', 'done', 'failed')),
  cookidoo_status text not null default 'requested' check (cookidoo_status in ('requested', 'done', 'failed')),
  summary text
);
alter table public.fresh_starts enable row level security;
create policy "household access" on public.fresh_starts
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create function public.start_fresh(p_household uuid) returns uuid
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
  return req;
end $$;
revoke execute on function public.start_fresh(uuid) from public, anon;
grant execute on function public.start_fresh(uuid) to authenticated, service_role;
