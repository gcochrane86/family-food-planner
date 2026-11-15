-- Plan with Claude (15 Nov 2026): the week's choices are made on one screen and saved with the plan request, and the
-- week remembers its own office days and longer prep days. See docs/superpowers/specs/2026-11-15-plan-choices-design.md.

-- The screen's choices: office days by adult, nights off, cooking minutes by date, prep days, the weeknight limit,
-- new recipes and things to use up. Null when the request didn't come from the screen.
alter table public.week_plan_requests add column choices jsonb;

-- The week's own office days ({ member id: [weekdays] }) and prep days (weekdays, 0 = Monday). Null: the usual week.
alter table public.plan_weeks add column office_days jsonb;
alter table public.plan_weeks add column prep_days int[];

-- As in 0020, plus the week's office and prep days (a replan sets them again, so a replan without them clears them).
drop function public.save_claude_week(uuid, int, jsonb, text, jsonb);
create function public.save_claude_week(p_request uuid, p_days int, p_slots jsonb, p_summary text, p_cooking jsonb default null,
  p_office jsonb default null, p_prep int[] default null) returns uuid
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
  if w.id is not null and not r.replace then raise exception 'week_exists'; end if;
  if w.id is null then
    insert into public.plan_weeks (household_id, week_start, days, planned_by, summary, cooking_minutes, office_days, prep_days)
      values (r.household_id, r.week_start, p_days, 'claude', p_summary, p_cooking, p_office, p_prep) returning * into w;
  else
    delete from public.meal_slots where plan_week_id = w.id;
    delete from public.shopping_ticks where plan_week_id = w.id;
    update public.plan_weeks set days = p_days, planned_by = 'claude', summary = p_summary, cooking_minutes = p_cooking,
      office_days = p_office, prep_days = p_prep, proposed_at = now() where id = w.id;
  end if;

  insert into public.meal_slots (plan_week_id, date, slot, recipe_id, mode, portions, guests, locked, reason, source_date, batch)
    select w.id, s.date, s.slot, s.recipe_id, s.mode, s.portions, coalesce(s.guests, 0), coalesce(s.locked, false), s.reason, s.source_date, s.batch
    from jsonb_to_recordset(p_slots) as s(date date, slot text, recipe_id uuid, mode text, portions numeric, guests int,
      locked boolean, reason text, source_date date, batch text);

  update public.week_plan_requests set status = 'done', summary = p_summary, finished_at = now() where id = p_request;
  return w.id;
end $$;
-- Only the service key (the connector and the Mac) saves Claude's weeks.
revoke execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb, jsonb, int[]) from public, anon, authenticated;
grant execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb, jsonb, int[]) to service_role;
