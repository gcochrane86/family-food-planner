-- Button-driven basket fills: a scheduled Claude task on the owner's Mac claims a request by marking it
-- 'filling' (so two checks never fill the same basket), then marks it done or failed.
alter table public.basket_runs drop constraint basket_runs_status_check;
alter table public.basket_runs add constraint basket_runs_status_check
  check (status in ('requested', 'filling', 'done', 'failed'));
alter table public.basket_runs add column started_at timestamptz;
