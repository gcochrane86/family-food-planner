-- How far Claude has got with a Sainsbury's fill, so the Shop tab can show a progress bar.
-- {"stage": "starting" | "emptying" | "adding", "done": 12, "total": 34, "item": "chicken thighs"}
alter table public.basket_runs add column progress jsonb;
