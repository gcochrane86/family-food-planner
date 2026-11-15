-- Each person's snacks and meal partners (15 Nov 2026): who eats which snack, when, and from which make day. Makes
-- aren't stored: they're the eats grouped by make day and recipe, so everything is still made and bought as one family.
-- Meal partners (overnight oats → boiled eggs) live in settings.meal_partners; partners Claude proposes with a draft
-- wait in plan_weeks.new_partners until the week is approved.
-- See docs/superpowers/specs/2026-11-15-person-snacks-design.md.

create table public.snack_eats (
  id uuid primary key default gen_random_uuid(),
  plan_week_id uuid not null references public.plan_weeks (id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('snack_am', 'snack_pm')),
  member_id uuid not null references public.members (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  qty numeric(4, 2) not null check (qty > 0 and qty <= 6),
  make_date date not null,
  unique (plan_week_id, date, slot, member_id)
);
create index snack_eats_week on public.snack_eats (plan_week_id, date);
alter table public.snack_eats enable row level security;
create policy "household access" on public.snack_eats
  for all to authenticated
  using (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)))
  with check (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)));
grant select, insert, update, delete on public.snack_eats to authenticated, service_role;

alter table public.plan_weeks add column new_partners jsonb;

drop function public.save_claude_week(uuid, int, jsonb, text, jsonb, jsonb, int[]);
create function public.save_claude_week(p_request uuid, p_days int, p_slots jsonb, p_summary text, p_cooking jsonb default null,
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
    delete from public.snack_eats where plan_week_id = w.id;
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
    from jsonb_to_recordset(coalesce(p_eats, '[]')) as e(date date, slot text, member_id uuid, recipe_id uuid, qty numeric, make_date date);

  update public.week_plan_requests set status = 'done', summary = p_summary, finished_at = now() where id = p_request;
  return w.id;
end $$;
-- Only the service key (the connector and the Mac) saves Claude's weeks.
revoke execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb, jsonb, int[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_claude_week(uuid, int, jsonb, text, jsonb, jsonb, int[], jsonb, jsonb) to service_role;

-- Approving a week keeps the partners Claude proposed with it: per meal, each person's list replaces theirs.
create or replace function public.approve_week(p_week uuid) returns void
language plpgsql set search_path = public as $$
declare
  w public.plan_weeks;
begin
  update public.plan_weeks set status = 'approved', approved_at = coalesce(approved_at, now()) where id = p_week returning * into w;
  if w.new_partners is not null and jsonb_typeof(w.new_partners) = 'object' then
    update public.settings s set data = jsonb_set(s.data, '{meal_partners}',
      coalesce(s.data->'meal_partners', '{}'::jsonb) || coalesce((
        select jsonb_object_agg(k, coalesce(s.data->'meal_partners'->k, '{}'::jsonb) || v)
        from jsonb_each(w.new_partners) as e(k, v) where jsonb_typeof(v) = 'object'), '{}'::jsonb))
    where s.household_id = w.household_id;
    update public.plan_weeks set new_partners = null where id = p_week;
  end if;
  perform public.request_cookidoo_sync(p_week);
end $$;
revoke execute on function public.approve_week(uuid) from public, anon;
grant execute on function public.approve_week(uuid) to authenticated, service_role;
