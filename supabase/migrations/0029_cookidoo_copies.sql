-- One Cookidoo Created Recipe per portion size, so a recipe cooked again at a size it's had before is reused as it is
-- rather than edited. {"4": {"url": "...", "hash": "..."}}. My Week remembers which size each day has.
alter table public.recipes add column cookidoo_copies jsonb not null default '{}'::jsonb;
alter table public.meal_slots add column cookidoo_portions integer;

-- What's in Cookidoo already becomes each recipe's first copy.
update public.recipes
  set cookidoo_copies = jsonb_build_object(ceil(cookidoo_portions)::int::text, jsonb_build_object('url', cookidoo_url, 'hash', cookidoo_hash))
  where cookidoo_url is not null and cookidoo_portions is not null and cookidoo_hash is not null;
update public.meal_slots s set cookidoo_portions = ceil(r.cookidoo_portions)::int
  from public.recipes r
  where s.cookidoo_recipe_id = r.id and r.cookidoo_portions is not null and r.cookidoo_own_url is null;
