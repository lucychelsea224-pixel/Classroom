-- =================================================================
-- Schedules the daily encouragement email to run automatically every
-- morning, by having Postgres itself call the Edge Function on a
-- timer (no external scheduler needed).
--
-- BEFORE RUNNING THIS:
-- 1. Deploy the function:  supabase functions deploy send-daily-encouragement
-- 2. Pick a secret string (anything long and random) and set it as
--    an Edge Function secret:
--      supabase secrets set CRON_SECRET=your-random-secret-here
-- 3. Replace YOUR-PROJECT-REF below with your actual Supabase project
--    ref (the subdomain in your project URL), and replace
--    your-random-secret-here with the SAME secret you set in step 2.
-- =================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove any existing job with this name first, so re-running this
-- script updates the schedule instead of creating a duplicate.
select cron.unschedule('daily-encouragement-email')
where exists (select 1 from cron.job where jobname = 'daily-encouragement-email');

-- Runs every day at 06:00 UTC. Adjust the cron expression if you want
-- a different time — e.g. '0 5 * * *' runs at 06:00 WAT (Nigeria time,
-- UTC+1), since cron times here are in UTC.
select cron.schedule(
  'daily-encouragement-email',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-daily-encouragement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'your-random-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check the job is scheduled:
-- select * from cron.job;

-- To see run history / confirm it actually fired:
-- select * from cron.job_run_details order by start_time desc limit 10;
