-- =================================================================
-- Migration: push notification reminders.
-- Stores each device's Web Push subscription, and schedules a daily
-- call to the send-reminders Edge Function (which does the actual
-- sending) via pg_cron + pg_net — both are Supabase-managed Postgres
-- extensions, no external cron service needed.
--
-- IMPORTANT — manual steps this migration can't do for you:
--   1. Generate a VAPID key pair yourself (never share/paste a
--      private key into a chat or commit it to a repo):
--        npx web-push generate-vapid-keys
--   2. Set them as Edge Function secrets:
--        supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@educlassroom.com.ng
--   3. Deploy the function: supabase functions deploy send-reminders
--   4. Below, replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with
--      your actual project ref and service role key (Project Settings
--      → API in the Supabase dashboard), then run the cron.schedule
--      block at the bottom.
-- =================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "Users can manage own push subscriptions" on push_subscriptions;
create policy "Users can manage own push subscriptions" on push_subscriptions for all using (auth.uid() = user_id);

-- The send-reminders function runs with the service role key (bypasses
-- RLS entirely, by design — it's a trusted backend job, not a student
-- session), so no special read policy is needed for it here.

-- =================================================================
-- Schedule the daily reminder job. EDIT THE TWO PLACEHOLDERS BELOW,
-- then run just this block (the rest of the file is safe to run as-is
-- and only needs running once).
-- =================================================================
select cron.schedule(
  'daily-study-reminders',
  '0 16 * * *', -- 16:00 UTC = 5:00 PM WAT (Nigeria) — edit if you want a different time
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To change the schedule later, run:
--   select cron.unschedule('daily-study-reminders');
-- then re-run the cron.schedule block above with a new time.
