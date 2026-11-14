-- Recipe import in the Claude app (14 Nov 2026): a recipe's main-photo description, written by Claude when it adds the
-- recipe (what's on the plate and how, the colours and textures, garnish, the dish, what must not appear). The main
-- photo is made from it (supabase/functions/_shared/hero.ts), and Make photos reuses it.
alter table public.recipes add column hero_hint text check (char_length(hero_hint) <= 600);
