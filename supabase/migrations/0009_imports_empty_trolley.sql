-- Recipes added from a website link, and "Empty and refill" for the Sainsbury's trolley.

-- A fill that should empty the trolley first (the household changed the menu or ingredients).
alter table public.basket_runs add column empty_first boolean not null default false;

-- Recipes converted from a web page keep where they came from.
alter table public.recipes drop constraint recipes_source_check;
alter table public.recipes add constraint recipes_source_check
  check (source in ('hellofresh', 'own_doc', 'claude', 'cookidoo', 'web'));
alter table public.recipes add column source_url text;

-- A link the household pasted on the Recipes tab. A scheduled Claude task on the owner's Mac claims it
-- ('importing'), converts the page for the household's portions and equipment, then marks it done or failed.
create table public.recipe_imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  url text not null check (url ~* '^https?://[^\s]+$' and char_length(url) <= 2000),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'requested' check (status in ('requested', 'importing', 'done', 'failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  recipe_id uuid references public.recipes (id) on delete set null,
  summary text
);
alter table public.recipe_imports enable row level security;
create policy "household access" on public.recipe_imports
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
