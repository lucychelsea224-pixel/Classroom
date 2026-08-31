-- =================================================================
-- Migration: quiz attempt logging, for the "Weak Areas" feature.
-- Every time a student submits a test, each individual answer gets
-- logged here — not just the overall score. This lets us show which
-- *specific* questions/topics a student keeps missing, instead of
-- just an overall percentage.
-- Run in Supabase -> SQL Editor.
-- =================================================================

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  question_id uuid references questions(id) on delete cascade,
  subject_id text not null,
  test_number int,
  selected_index int,
  correct_index int not null,
  is_correct boolean not null,
  created_at timestamptz default now()
);

create index if not exists quiz_attempts_user_subject_idx on quiz_attempts (user_id, subject_id);
create index if not exists quiz_attempts_user_question_idx on quiz_attempts (user_id, question_id);

alter table quiz_attempts enable row level security;

drop policy if exists "Users can view own quiz attempts" on quiz_attempts;
create policy "Users can view own quiz attempts"
  on quiz_attempts for select using (auth.uid() = user_id);

drop policy if exists "Users can log own quiz attempts" on quiz_attempts;
create policy "Users can log own quiz attempts"
  on quiz_attempts for insert with check (auth.uid() = user_id);
