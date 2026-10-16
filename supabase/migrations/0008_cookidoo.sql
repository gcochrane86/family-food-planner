-- Phase 6: approved menus go to Cookidoo (Created Recipes + My Week), done by a scheduled Claude task in the
-- owner's Chrome. Approving a week (or changing an approved week's dinners) leaves a request; the task claims it.

alter table public.recipes drop constraint recipes_source_check;
alter table public.recipes add constraint recipes_source_check
  check (source in ('hellofresh', 'own_doc', 'claude', 'cookidoo'));

alter table public.recipes
  add column cookidoo_status text not null default 'none' check (cookidoo_status in ('none', 'sent', 'outdated')),
  add column cookidoo_url text,
  add column cookidoo_portions numeric(5, 2);

-- What Claude put in Cookidoo's My Week for this day (null = nothing). Only these entries are ever moved or removed.
alter table public.meal_slots add column cookidoo_recipe_id uuid references public.recipes (id) on delete set null;

create table public.cookidoo_runs (
  id uuid primary key default gen_random_uuid(),
  plan_week_id uuid not null unique references public.plan_weeks (id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'filling', 'done', 'failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  summary text
);
alter table public.cookidoo_runs enable row level security;
create policy "household access" on public.cookidoo_runs
  for all to authenticated
  using (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)))
  with check (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)));

/** Asks for a Cookidoo sync of this week (one request per week; a sync already under way is left to finish). */
create function public.request_cookidoo_sync(p_week uuid) returns void
language sql set search_path = public as $$
  insert into public.cookidoo_runs (plan_week_id) values (p_week)
  on conflict (plan_week_id) do update
    set status = 'requested', requested_at = now(), started_at = null, finished_at = null, summary = null
    where public.cookidoo_runs.status <> 'filling';
$$;
revoke execute on function public.request_cookidoo_sync(uuid) from public, anon;
grant execute on function public.request_cookidoo_sync(uuid) to authenticated, service_role;

create or replace function public.approve_week(p_week uuid) returns void
language plpgsql set search_path = public as $$
begin
  update public.plan_weeks set status = 'approved', approved_at = coalesce(approved_at, now()) where id = p_week;
  perform public.request_cookidoo_sync(p_week);
end $$;
revoke execute on function public.approve_week(uuid) from public, anon;
grant execute on function public.approve_week(uuid) to authenticated, service_role;

-- A changed dinner in an approved week (swap, out tonight, portions) needs Cookidoo updating.
create function public.cookidoo_dinner_changed() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.slot = 'dinner'
     and (new.recipe_id is distinct from old.recipe_id or new.mode is distinct from old.mode or new.portions is distinct from old.portions)
     and exists (select 1 from public.plan_weeks w where w.id = new.plan_week_id and w.status = 'approved') then
    perform public.request_cookidoo_sync(new.plan_week_id);
  end if;
  return new;
end $$;
create trigger cookidoo_dinner_changed after update on public.meal_slots
  for each row execute function public.cookidoo_dinner_changed();

-- Editing a recipe that's in Cookidoo marks it outdated, so the next sync updates it. Photos don't count.
create function public.cookidoo_recipe_edited() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.recipes set cookidoo_status = 'outdated'
    where id = coalesce(new.recipe_id, old.recipe_id) and cookidoo_status = 'sent';
  return null;
end $$;
create trigger cookidoo_ingredients_edited after insert or update or delete on public.recipe_ingredients
  for each row execute function public.cookidoo_recipe_edited();
create trigger cookidoo_steps_edited
  after insert or delete or update of phase, position, at_minute, title, body, machine, settings, timer_minutes on public.recipe_steps
  for each row execute function public.cookidoo_recipe_edited();
