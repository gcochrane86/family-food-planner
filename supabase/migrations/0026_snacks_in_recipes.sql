-- Snacks in the Recipes tab (15 Nov 2026): any recipe can also be a snack (snack_ok, with how many snacks a batch
-- makes), quick snacks with no steps (quick), and who added each snack, so a replan keeps the household's own.
-- See docs/superpowers/specs/2026-11-15-snacks-in-recipes-design.md.

alter table public.recipes add column snack_ok boolean not null default false;
alter table public.recipes add column snack_portions int check (snack_portions between 1 and 100);
alter table public.recipes add column quick boolean not null default false;
alter table public.snack_eats add column added_by text not null default 'claude' check (added_by in ('claude', 'household'));

create or replace function public.save_claude_week(p_request uuid, p_days int, p_slots jsonb, p_summary text, p_cooking jsonb default null,
  p_office jsonb default null, p_prep int[] default null, p_eats jsonb default null, p_partners jsonb default null) returns uuid
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
  ) or exists (
    select 1 from jsonb_to_recordset(coalesce(p_eats, '[]')) as e(recipe_id uuid)
    where not exists (select 1 from public.recipes x where x.id = e.recipe_id and x.household_id = r.household_id)
  ) then raise exception 'unknown_recipe'; end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_eats, '[]')) as e(member_id uuid)
    where not exists (select 1 from public.members m where m.id = e.member_id and m.household_id = r.household_id)
  ) then raise exception 'unknown_member'; end if;

  select * into w from public.plan_weeks where household_id = r.household_id and week_start = r.week_start for update;
  if w.id is not null and w.status = 'approved' then raise exception 'week_approved'; end if;
  if w.id is not null and not r.replace then raise exception 'week_exists'; end if;
  if w.id is null then
    insert into public.plan_weeks (household_id, week_start, days, planned_by, summary, cooking_minutes, office_days, prep_days, new_partners)
      values (r.household_id, r.week_start, p_days, 'claude', p_summary, p_cooking, p_office, p_prep, p_partners) returning * into w;
  else
    delete from public.meal_slots where plan_week_id = w.id;
    -- The household's own snacks stay; Claude's go with the old plan.
    delete from public.snack_eats where plan_week_id = w.id and added_by <> 'household';
    delete from public.shopping_ticks where plan_week_id = w.id;
    update public.plan_weeks set days = p_days, planned_by = 'claude', summary = p_summary, cooking_minutes = p_cooking,
      office_days = p_office, prep_days = p_prep, new_partners = p_partners, proposed_at = now() where id = w.id;
  end if;

  insert into public.meal_slots (plan_week_id, date, slot, recipe_id, mode, portions, guests, locked, reason, source_date, batch)
    select w.id, s.date, s.slot, s.recipe_id, s.mode, s.portions, coalesce(s.guests, 0), coalesce(s.locked, false), s.reason, s.source_date, s.batch
    from jsonb_to_recordset(p_slots) as s(date date, slot text, recipe_id uuid, mode text, portions numeric, guests int,
      locked boolean, reason text, source_date date, batch text);
  insert into public.snack_eats (plan_week_id, date, slot, member_id, recipe_id, qty, make_date)
    select w.id, e.date, e.slot, e.member_id, e.recipe_id, e.qty, e.make_date
    from jsonb_to_recordset(coalesce(p_eats, '[]')) as e(date date, slot text, member_id uuid, recipe_id uuid, qty numeric, make_date date)
    -- A snack the household added for that person and time wins over Claude's.
    where not exists (select 1 from public.snack_eats h where h.plan_week_id = w.id and h.added_by = 'household'
      and h.date = e.date and h.slot = e.slot and h.member_id = e.member_id);

  update public.week_plan_requests set status = 'done', summary = p_summary, finished_at = now() where id = p_request;
  return w.id;
end $$;
-- Only the service key (the connector and the Mac) saves Claude's weeks.
revoke execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb, jsonb, int[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb, jsonb, int[], jsonb, jsonb) to service_role;

