-- Phase 1 foundation: households, members, preferences, kitchen, house rules, staples.
-- Every row belongs to a household; row-level security limits access to that household's users.

-- Households and who belongs to them ---------------------------------------

-- 10 characters from 31 unambiguous ones (no 0/O, 1/I/L): about 8 × 10^14 codes.
-- Only fully random bytes of the UUIDs are used (bytes 6 and 8 carry version bits).
create function public.new_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  code text := '';
  i int;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11] loop
    code := code || substr(alphabet, get_byte(b, i) % 31 + 1, 1);
  end loop;
  return code;
end $$;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default public.new_invite_code(),
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

-- A staple (have / low / out) is tracked once per ingredient.
create unique index pantry_items_one_staple on public.pantry_items (household_id, ingredient_id) where staple_status is not null;

-- Wrong invite codes, so guessing can be limited. Only the join function reads or writes this.
create table public.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index join_attempts_user_at on public.join_attempts (user_id, at);

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
  -- One household per person; switching is done by joining another one.
  if exists (select 1 from public.household_users where user_id = auth.uid()) then raise exception 'already_member'; end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Our household')) returning id into hid;
  insert into public.household_users (household_id, user_id) values (hid, auth.uid());
  insert into public.settings (household_id) values (hid);
  return hid;
end $$;

-- Returns the household ID, or null for a wrong code (no exception, so the failed attempt is kept).
-- After 5 wrong codes in an hour, refuses every attempt for that user until the hour has passed.
-- Joining leaves any previous household, and deletes it if nobody else is in it.
create function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  previous uuid[];
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if (select count(*) from public.join_attempts where user_id = uid and at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_attempts';
  end if;
  select id into hid from public.households where invite_code = upper(trim(p_code));
  if hid is null then
    insert into public.join_attempts (user_id) values (uid);
    return null;
  end if;
  select coalesce(array_agg(household_id), '{}') into previous from public.household_users where user_id = uid and household_id <> hid;
  delete from public.household_users where user_id = uid and household_id <> hid;
  delete from public.households h where h.id = any (previous)
    and not exists (select 1 from public.household_users u where u.household_id = h.id);
  insert into public.household_users (household_id, user_id) values (hid, uid) on conflict do nothing;
  return hid;
end $$;

alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;
revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function public.create_household(text), public.join_household(text), public.is_member(uuid) from public, anon;
grant execute on function public.create_household(text), public.join_household(text), public.is_member(uuid) to authenticated;
