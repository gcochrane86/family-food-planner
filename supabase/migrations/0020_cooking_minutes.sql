-- Today's cooking (14 Nov 2026): each day is its steps, aiming for that day's cooking time. The times per day of the
-- week live in settings (cooking_minutes); a week can have its own for some days, set when Claude plans it from the
-- household's note ("Wednesday I've got 2 hours"). See docs/superpowers/specs/2026-11-14-day-cooking-design.md.

-- The week's own times, by date: { "YYYY-MM-DD": minutes }, only for days that differ. Null when there are none.
alter table public.plan_weeks add column cooking_minutes jsonb;

-- As in 0014, plus the week's own times (a replan sets them again, so a replan without them clears them).
drop function public.save_claude_week(uuid, int, jsonb, text);
create function public.save_claude_week(p_request uuid, p_days int, p_slots jsonb, p_summary text, p_cooking jsonb default null) returns uuid
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
    insert into public.plan_weeks (household_id, week_start, days, planned_by, summary, cooking_minutes)
      values (r.household_id, r.week_start, p_days, 'claude', p_summary, p_cooking) returning * into w;
  else
    delete from public.meal_slots where plan_week_id = w.id;
    delete from public.shopping_ticks where plan_week_id = w.id;
    update public.plan_weeks set days = p_days, planned_by = 'claude', summary = p_summary, cooking_minutes = p_cooking,
      proposed_at = now() where id = w.id;
  end if;

  insert into public.meal_slots (plan_week_id, date, slot, recipe_id, mode, portions, guests, locked, reason, source_date, batch)
    select w.id, s.date, s.slot, s.recipe_id, s.mode, s.portions, coalesce(s.guests, 0), coalesce(s.locked, false), s.reason, s.source_date, s.batch
    from jsonb_to_recordset(p_slots) as s(date date, slot text, recipe_id uuid, mode text, portions numeric, guests int,
      locked boolean, reason text, source_date date, batch text);

  update public.week_plan_requests set status = 'done', summary = p_summary, finished_at = now() where id = p_request;
  return w.id;
end $$;
-- Only the service key (the connector and the Mac) saves Claude's weeks.
revoke execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb) to service_role;
