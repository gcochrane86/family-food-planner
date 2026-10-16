-- Phase 4: weekly breakfast/lunch basics, the Spar list, Sainsbury's product choices and basket runs.

create table public.weekly_basics (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  position int not null default 0,
  name text not null check (length(trim(name)) between 1 and 80),
  qty numeric,
  unit text not null default '',
  approx boolean not null default false,
  delivery text not null default 'sun' check (delivery in ('sun', 'tue', 'split')),
  unique (household_id, name, unit)
);

create table public.quick_shop_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  note text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- The Sainsbury's product chosen for a shopping-list item, reused in later weeks.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_key text not null, -- the shopping list's item key, e.g. "egg|"
  product_name text not null,
  product_url text,
  pack_size numeric,
  pack_unit text not null default '',
  price numeric,
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (household_id, item_key)
);

create table public.basket_runs (
  id uuid primary key default gen_random_uuid(),
  plan_week_id uuid not null references public.plan_weeks (id) on delete cascade,
  delivery text not null check (delivery in ('sun', 'tue')),
  status text not null default 'requested' check (status in ('requested', 'done', 'failed')),
  requested_at timestamptz not null default now(),
  finished_at timestamptz,
  summary text,
  unique (plan_week_id, delivery)
);

alter table public.weekly_basics enable row level security;
alter table public.quick_shop_items enable row level security;
alter table public.products enable row level security;
alter table public.basket_runs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['weekly_basics', 'quick_shop_items', 'products'] loop
    execute format(
      'create policy "household access" on public.%I for all to authenticated
         using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
  end loop;
end $$;

create policy "household access" on public.basket_runs
  for all to authenticated
  using (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)))
  with check (exists (select 1 from public.plan_weeks w where w.id = plan_week_id and public.is_member(w.household_id)));
