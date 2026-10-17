-- Roast builder: the parts of a roast (a main or a side, with each step's timing back from serving and the kit it
-- needs), and a dinner planned as a roast (main, sides, people, serve time).
alter table public.recipes add column roast jsonb;
alter table public.meal_slots add column roast jsonb;

-- Same as 0011, and a recipe's roast description is saved too.
create or replace function public.save_recipe(p_recipe_id uuid, p_fields jsonb, p_ingredients jsonb, p_steps jsonb) returns int
language plpgsql set search_path = public as $$
begin
  update public.recipes r set (title, subtitle, kind, component_role, base_portions, reheats_well, freezes_well, toddler_ok,
      toddler_note, protein, salt_per_portion_g, prep_minutes, finish_minutes, hands_off_minutes, tags, equipment, reheat, batch, roast)
    = (select x.title, x.subtitle, x.kind, x.component_role, x.base_portions, x.reheats_well, x.freezes_well, x.toddler_ok,
        x.toddler_note, x.protein, x.salt_per_portion_g, x.prep_minutes, x.finish_minutes, x.hands_off_minutes, x.tags, x.equipment, x.reheat, x.batch, x.roast
       from jsonb_populate_record(r, p_fields) x)
  where r.id = p_recipe_id;
  if not found then raise exception 'recipe_not_found'; end if;
  return public.replace_recipe_contents(p_recipe_id, p_ingredients, p_steps);
end $$;
revoke execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
