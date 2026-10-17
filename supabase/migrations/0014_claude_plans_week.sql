-- "Plan with Claude" (Week tab): the household asks, a scheduled Claude task on the owner's Mac claims the request
-- ('planning'), plans the week from the household's specifications, and saves it with save_claude_week.
create table public.week_plan_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null, -- a Monday
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'requested' check (status in ('requested', 'planning', 'done', 'failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  summary text
);
-- One open request per week: a second tap (or Friday's own request) doesn't plan the week twice.
create unique index week_plan_requests_open on public.week_plan_requests (household_id, week_start)
  where status in ('requested', 'planning');
alter table public.week_plan_requests enable row level security;
create policy "household access" on public.week_plan_requests
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Who planned a week, and Claude's summary of why.
alter table public.plan_weeks add column planned_by text not null default 'planner' check (planned_by in ('planner', 'claude'));
alter table public.plan_weeks add column summary text;

-- Saves Claude's week for a claimed request, all or nothing: a new week, or in place of a draft. Never an approved one.
create function public.save_claude_week(p_request uuid, p_days int, p_slots jsonb, p_summary text) returns uuid
language plpgsql set search_path = public as $$
declare
  r public.week_plan_requests;
  w public.plan_weeks;
begin
  select * into r from public.week_plan_requests where id = p_request for update;
  if r.id is null or r.status <> 'planning' then raise exception 'not_planning'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots) as s(recipe_id uuid)
    where s.recipe_id is not null
      and not exists (select 1 from public.recipes x where x.id = s.recipe_id and x.household_id = r.household_id)
  ) then raise exception 'unknown_recipe'; end if;

  select * into w from public.plan_weeks where household_id = r.household_id and week_start = r.week_start for update;
  if w.id is not null and w.status = 'approved' then raise exception 'week_approved'; end if;
  if w.id is null then
    insert into public.plan_weeks (household_id, week_start, days, planned_by, summary)
      values (r.household_id, r.week_start, p_days, 'claude', p_summary) returning * into w;
  else
    delete from public.meal_slots where plan_week_id = w.id;
    delete from public.shopping_ticks where plan_week_id = w.id;
    update public.plan_weeks set days = p_days, planned_by = 'claude', summary = p_summary, proposed_at = now() where id = w.id;
  end if;

  insert into public.meal_slots (plan_week_id, date, slot, recipe_id, mode, portions, guests, locked, reason, source_date, batch)
    select w.id, s.date, s.slot, s.recipe_id, s.mode, s.portions, coalesce(s.guests, 0), coalesce(s.locked, false), s.reason, s.source_date, s.batch
    from jsonb_to_recordset(p_slots) as s(date date, slot text, recipe_id uuid, mode text, portions numeric, guests int,
      locked boolean, reason text, source_date date, batch text);

  update public.week_plan_requests set status = 'done', summary = p_summary, finished_at = now() where id = p_request;
  return w.id;
end $$;
-- Only the owner's Mac (the service key) saves Claude's weeks.
revoke execute on function public.save_claude_week(uuid, int, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_claude_week(uuid, int, jsonb, text) to service_role;
