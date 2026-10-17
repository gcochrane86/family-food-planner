-- Phase 7: the pantry. Freezer portions, batch-and-freeze recipes, dinners' batch plans, and recorded orders.

-- Cooked things kept in the freezer (or fridge): batch pastes, sauces, shredded meat… One portion covers one dinner.
create table public.prepared_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  portions int not null check (portions >= 0),
  location text not null default 'freezer' check (location in ('freezer', 'fridge')),
  made_on date not null default current_date,
  use_by date,
  created_at timestamptz not null default now()
);
alter table public.prepared_items enable row level security;
create policy "household access" on public.prepared_items
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- A recipe's make-ahead part that freezes well: {name, group, steps[], makes, freezer_days}.
alter table public.recipes add column batch jsonb;

-- A dinner's batch plan: make a batch (buy extra), made (frozen after cooking), frozen (use a frozen portion, not
-- yet checked), frozen_ok (checked: it's in the freezer, portion taken).
alter table public.meal_slots add column batch text check (batch in ('make', 'made', 'frozen', 'frozen_ok'));

-- Sainsbury's orders already added to the pantry, so an order is never added twice.
create table public.pantry_orders (
  household_id uuid not null references public.households (id) on delete cascade,
  order_ref text not null check (char_length(order_ref) between 1 and 40),
  recorded_at timestamptz not null default now(),
  primary key (household_id, order_ref)
);
alter table public.pantry_orders enable row level security;
create policy "household access" on public.pantry_orders
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Same as 0010, and a recipe's batch is saved too.
create or replace function public.save_recipe(p_recipe_id uuid, p_fields jsonb, p_ingredients jsonb, p_steps jsonb) returns int
language plpgsql set search_path = public as $$
begin
  update public.recipes r set (title, subtitle, kind, component_role, base_portions, reheats_well, freezes_well, toddler_ok,
      toddler_note, protein, salt_per_portion_g, prep_minutes, finish_minutes, hands_off_minutes, tags, equipment, reheat, batch)
    = (select x.title, x.subtitle, x.kind, x.component_role, x.base_portions, x.reheats_well, x.freezes_well, x.toddler_ok,
        x.toddler_note, x.protein, x.salt_per_portion_g, x.prep_minutes, x.finish_minutes, x.hands_off_minutes, x.tags, x.equipment, x.reheat, x.batch
       from jsonb_populate_record(r, p_fields) x)
  where r.id = p_recipe_id;
  if not found then raise exception 'recipe_not_found'; end if;
  return public.replace_recipe_contents(p_recipe_id, p_ingredients, p_steps);
end $$;
revoke execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
