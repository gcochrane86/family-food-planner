-- Ad-hoc plan and shop (19 Nov 2026): a few meals and hand-added items for a quick trip to the shops, with their own
-- ticks, kept apart from the weekly plan so nothing that reads weeks picks them up.
-- See docs/superpowers/specs/2026-11-19-adhoc-plan-design.md.

create table public.adhoc_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  meal text not null check (meal in ('lunch', 'dinner')),
  portions numeric(5, 2) not null check (portions > 0),
  created_at timestamptz not null default now()
);

create table public.adhoc_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.adhoc_ticks (
  household_id uuid not null references public.households (id) on delete cascade,
  item_key text not null,
  ticked boolean not null default false,
  primary key (household_id, item_key)
);

do $$
declare t text;
begin
  foreach t in array array['adhoc_meals', 'adhoc_items', 'adhoc_ticks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "household access" on public.%I for all to authenticated
         using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;
