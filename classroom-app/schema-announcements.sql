-- =================================================================
-- Migration: announcements log — a record of every mass email the
-- admin has sent, purely for your own reference (who sent what and
-- when). Run in Supabase -> SQL Editor.
-- =================================================================

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  message text not null,
  sent_by uuid references auth.users(id) on delete set null,
  recipient_count int not null default 0,
  created_at timestamptz default now()
);

alter table announcements enable row level security;

drop policy if exists "Admin can view announcements" on announcements;
create policy "Admin can view announcements"
  on announcements for select using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- Inserts happen via the send-announcement Edge Function using the
-- service role key, which bypasses RLS — no insert policy needed here.
