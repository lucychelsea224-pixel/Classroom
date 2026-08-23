-- =================================================================
-- Migration: Study Plan
-- One active plan per student. The actual day-by-day schedule isn't
-- stored row-by-row — it's generated on the fly from these settings
-- (start date, end date, which weekdays to study, which dates to
-- skip), so editing a plan doesn't require rewriting hundreds of rows.
-- Run in Supabase -> SQL Editor.
-- =================================================================

create table if not exists study_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  study_days jsonb not null default '[0,1,2,3,4,5,6]', -- 0 = Sunday ... 6 = Saturday
  excluded_dates jsonb not null default '[]',            -- array of "YYYY-MM-DD" strings
  overrides jsonb not null default '{}',                  -- { "YYYY-MM-DD": "subject-id" | "none" } manual picks that beat the automatic rotation
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- If you already ran an earlier version of this file without the
-- overrides column, this adds it safely without touching existing data.
alter table study_plans add column if not exists overrides jsonb not null default '{}';

alter table study_plans enable row level security;

create policy "Users can view own study plan"
  on study_plans for select using (auth.uid() = user_id);
create policy "Users can create own study plan"
  on study_plans for insert with check (auth.uid() = user_id);
create policy "Users can update own study plan"
  on study_plans for update using (auth.uid() = user_id);
create policy "Users can delete own study plan"
  on study_plans for delete using (auth.uid() = user_id);
