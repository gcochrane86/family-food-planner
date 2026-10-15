-- Phase 1 foundation: households, members, preferences, kitchen, house rules, staples.
-- Every row belongs to a household; row-level security limits access to that household's users.

-- Households and who belongs to them ---------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.household_users (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- True when the signed-in user belongs to the household. Security definer avoids
-- policies on household_users referring to themselves.
create function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_users where household_id = hid and user_id = auth.uid());
$$;

-- Household data -------------------------------------------------------------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('adult', 'child')),
  birthdate date,
  portion_weight numeric(3, 2) not null check (portion_weight between 0.1 and 3),
  unique (household_id, name)
);

-- weekday: 0 = Monday … 6 = Sunday
create table public.member_week_pattern (
  member_id uuid not null references public.members (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  office boolean not null default false,
  primary key (member_id, weekday)
);

create table public.settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

create table public.house_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('substitute', 'prefer', 'avoid')),
  match text not null,
  replacement text,
  note text,
  unique (household_id, kind, match)
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null,
  name text not null,
  capabilities jsonb not null default '{}'::jsonb,
  unique (household_id, code)
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  category text,
  default_unit text not null default 'each' check (default_unit in ('g', 'ml', 'each')),
  is_staple boolean not null default false,
  unique (household_id, name)
);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  staple_status text check (staple_status in ('have', 'low', 'out')),
  qty numeric,
  unit text,
  location text not null default 'cupboard' check (location in ('fridge', 'freezer', 'cupboard'))
);

-- Row-level security ---------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_users enable row level security;
alter table public.members enable row level security;
alter table public.member_week_pattern enable row level security;
alter table public.settings enable row level security;
alter table public.house_rules enable row level security;
alter table public.equipment enable row level security;
alter table public.ingredients enable row level security;
alter table public.pantry_items enable row level security;

create policy "members read their households" on public.households
  for select to authenticated using (public.is_member(id));
create policy "members rename their households" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

-- Membership rows are only created through create_household / join_household.
create policy "users see their memberships" on public.household_users
  for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['members', 'settings', 'house_rules', 'equipment', 'ingredients', 'pantry_items'] loop
    execute format(
      'create policy "household access" on public.%I for all to authenticated
         using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
  end loop;
end $$;

create policy "household access" on public.member_week_pattern
  for all to authenticated
  using (exists (select 1 from public.members m where m.id = member_id and public.is_member(m.household_id)))
  with check (exists (select 1 from public.members m where m.id = member_id and public.is_member(m.household_id)));

-- Creating and joining a household -------------------------------------------

create function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Our household')) returning id into hid;
  insert into public.household_users (household_id, user_id) values (hid, auth.uid());
  insert into public.settings (household_id) values (hid);
  return hid;
end $$;

create function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select id into hid from public.households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'invalid_code'; end if;
  insert into public.household_users (household_id, user_id) values (hid, auth.uid()) on conflict do nothing;
  return hid;
end $$;

revoke execute on function public.create_household(text), public.join_household(text), public.is_member(uuid) from public, anon;
grant execute on function public.create_household(text), public.join_household(text), public.is_member(uuid) to authenticated;
