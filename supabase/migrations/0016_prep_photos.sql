-- Chopping photos: one photo per ingredient and cut ("new potato|halved"), made once and reused by every recipe
-- that prepares it the same way (supabase/functions/_shared/prepCut.ts makes the key). Shown in Today's hour.
create table public.prep_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  label text not null check (char_length(label) between 1 and 200),
  path text not null,
  source text not null default 'generated' check (source in ('generated', 'own')),
  created_at timestamptz not null default now(),
  unique (household_id, key)
);
alter table public.prep_photos enable row level security;
create policy "household access" on public.prep_photos
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
