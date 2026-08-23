-- =================================================================
-- Run this once in Supabase → SQL Editor → New query
-- =================================================================

-- Notes, keyed by subject id (matches the ids used in the front end:
-- civic-ed, english, ict, mathematics, science, social-studies)
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,
  title text not null,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CBT questions
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,
  question text not null,
  options jsonb not null,       -- array of 4 strings, e.g. ["3","5","7","10"]
  correct_index int not null,   -- 0-based index into options
  explanation text,
  created_at timestamptz default now()
);

-- One row per signed-up user, used to tell the admin apart from students
-- and to store per-subject progress later on.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Per-subject progress for the dashboard rings
create table if not exists progress (
  user_id uuid references auth.users(id) on delete cascade,
  subject_id text not null,
  percent int default 0,
  updated_at timestamptz default now(),
  primary key (user_id, subject_id)
);

-- =================================================================
-- Row Level Security — locks the tables down so the anon key alone
-- can't be used to read/write things it shouldn't.
-- =================================================================
alter table notes enable row level security;
alter table questions enable row level security;
alter table profiles enable row level security;
alter table progress enable row level security;

-- Any signed-in user can read notes and questions
create policy "Authenticated users can read notes"
  on notes for select using (auth.role() = 'authenticated');

create policy "Authenticated users can read questions"
  on questions for select using (auth.role() = 'authenticated');

-- Only the admin (flagged in profiles) can write to notes/questions
create policy "Admin can insert notes"
  on notes for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
create policy "Admin can update notes"
  on notes for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
create policy "Admin can delete notes"
  on notes for delete using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Admin can insert questions"
  on questions for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
create policy "Admin can update questions"
  on questions for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
create policy "Admin can delete questions"
  on questions for delete using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- Users can see and update only their own profile row
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Users can see and update only their own progress rows
create policy "Users can view own progress"
  on progress for select using (auth.uid() = user_id);
create policy "Users can upsert own progress"
  on progress for insert with check (auth.uid() = user_id);
create policy "Users can update own progress"
  on progress for update using (auth.uid() = user_id);

-- =================================================================
-- After creating your admin user in Authentication → Add user,
-- run this once (replace the UUID with that user's id, found on
-- the same Authentication page) to flag them as admin:
--
-- insert into profiles (id, email, is_admin)
-- values ('paste-user-uuid-here', 'adekunleadeniji360@gmail.com', true);
-- =================================================================
