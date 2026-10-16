-- Friday 7pm menu proposal. The scheduler (pg_cron, UTC) fires hourly 17:00–20:00 on Fridays; the
-- propose-week function only acts when it is 19:xx in London, which covers summer and winter time.
-- The shared secret lives in Supabase Vault as 'cron_secret' (created separately, never committed),
-- and must match the function secret CRON_SECRET.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('propose-week') where exists (select 1 from cron.job where jobname = 'propose-week');

select cron.schedule(
  'propose-week',
  '0 17-20 * * 5',
  $$
  select net.http_post(
    url := 'https://vzlfijeummlflmauevui.supabase.co/functions/v1/propose-week',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
