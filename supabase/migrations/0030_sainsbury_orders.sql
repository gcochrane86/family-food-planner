-- Sainsbury's orders as their emails describe them: confirmed at checkout, then picked (with any substitutions and
-- missing items). Claude reads the emails and records them, and the Shop tab shows them for the week.
-- No address or payment details are kept.
create table public.sainsbury_orders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  plan_week_id uuid references public.plan_weeks (id) on delete set null,
  order_number text not null,
  status text not null check (status in ('confirmed', 'picked', 'cancelled')),
  slot text,                 -- "Monday 23 November, 10am to 11am"
  delivery_date date,
  total numeric(8, 2),       -- estimated at checkout, paid once picked
  item_count integer,
  amend_until text,          -- "11pm Sunday, 22 November"
  items jsonb not null default '[]'::jsonb,          -- [{name, qty, price}]
  substitutions jsonb not null default '[]'::jsonb,  -- [{ordered, substitute, qty, price}]
  missing jsonb not null default '[]'::jsonb,        -- [{name}]
  updated_at timestamptz not null default now(),
  unique (household_id, order_number)
);
alter table public.sainsbury_orders enable row level security;
create policy "household access" on public.sainsbury_orders for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
