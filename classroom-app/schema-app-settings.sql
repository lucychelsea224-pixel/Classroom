-- =================================================================
-- Migration: app_settings — small key/value table for app-wide config
-- that the admin should be able to change without touching code or
-- redeploying anything (Edge Function secrets require the CLI + a
-- redeploy; this table can be edited straight from the Admin panel).
--
-- First use: which Gemini model the ask-ai chatbot calls. Google
-- renames/retires Gemini models periodically (this has already
-- happened multiple times), so instead of hardcoding the model name
-- in the Edge Function, the function now reads it from here first.
-- =================================================================

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Seed the current chatbot model. Safe to re-run: won't overwrite an
-- existing value.
insert into app_settings (key, value) values
  ('gemini_model', 'gemini-2.5-flash-lite')
on conflict (key) do nothing;

alter table app_settings enable row level security;

-- The ask-ai Edge Function calls this using the student's own session
-- (anon key + user JWT, same pattern as the rest of the app), so it
-- needs read access — the value itself (a model name) isn't sensitive.
drop policy if exists "Anyone can view app settings" on app_settings;
create policy "Anyone can view app settings" on app_settings for select using (true);

drop policy if exists "Admin can manage app settings" on app_settings;
create policy "Admin can manage app settings" on app_settings for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
