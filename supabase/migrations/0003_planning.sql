-- Phase 3: weekly plans, their meal slots, shopping ticks, and each recipe's main protein.

alter table public.recipes add column protein text
  check (protein in ('chicken', 'fish', 'red_meat', 'veggie', 'egg', 'other'));

create table public.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null, -- a Monday
  days smallint not null default 7 check (days in (5, 7)),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  proposed_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (household_id, week_start)
);

create table public.meal_slots (
  id uuid primary key default gen_random_uuid(),
  plan_week_id uuid not null references public.plan_weeks (id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid references public.recipes (id) on delete set null,
  mode text not null check (mode in ('cook', 'reheat', 'leftovers', 'out', 'routine', 'packed')),
  portions numeric(5, 2),
  guests int not null default 0 check (guests >= 0),
  locked boolean not null default false,
  reason text,
  source_date date,             -- for a reheat: the dinner it comes from
  routine_choice text,          -- breakfast pool choice you tapped, e.g. 'Porridge'
  cooked_at timestamptz,
  portions_verdict text check (portions_verdict in ('not_enough', 'right', 'leftovers')),
  unique (plan_week_id, date, slot)
);
create index meal_slots_week on public.meal_slots (plan_week_id, date);

create table public.shopping_ticks (
  id uuid primary key default gen_random_uuid(),
  plan_week_id uuid not null references public.plan_weeks (id) on delete cascade,
  delivery text not null check (delivery in ('sun', 'tue')),
  item_key text not null,
  ticked boolean not null default true,
  unique (plan_week_id, delivery, item_key)
);

alter table public.plan_weeks enable row level security;
alter table public.meal_slots enable row level security;
alter table public.shopping_ticks enable row level security;

create policy "household access" on public.plan_weeks
  for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "household access" on public.meal_slots
  for all to authenticated
  using (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)))
  with check (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)));

create policy "household access" on public.shopping_ticks
  for all to authenticated
  using (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)))
  with check (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)));

-- Approving is safe to repeat: the first approval time is kept. Runs as the caller (RLS applies).
create function public.approve_week(p_week uuid) returns void
language sql set search_path = public as $$
  update public.plan_weeks set status = 'approved', approved_at = coalesce(approved_at, now()) where id = p_week;
$$;
revoke execute on function public.approve_week(uuid) from public, anon;
grant execute on function public.approve_week(uuid) to authenticated, service_role;
