-- Per-person macros (15 Nov 2026): each member's daily targets, set in Settings → Household:
-- { kcal?, protein_g?, fat_g?, sat_fat_g?, carbs_g?, sugars_g?, fibre_g?, salt_g? }. Null: no targets.
-- See docs/superpowers/specs/2026-11-15-person-macros-design.md.
alter table public.members add column targets jsonb;
