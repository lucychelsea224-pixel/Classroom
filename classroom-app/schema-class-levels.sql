-- =================================================================
-- Migration: multi-class-level support (Primary 1-5, and JSS1-SS3
-- later). This is a real structural change — read the comments.
--
-- Key design decision: subjects stay as simple text slugs shared
-- across levels (e.g. "mathematics"), same as before. What changes
-- is that notes/questions/progress/etc now also carry a class_level
-- column, and premium unlock is now PER (user, class_level) instead
-- of one global flag — so paying for Primary 5 doesn't unlock
-- Primary 3, and vice versa.
--
-- Existing data is preserved: everything that already exists gets
-- tagged as 'primary-5' (Common Entrance), since that's the only
-- level that existed before this migration. Nothing is deleted.
-- =================================================================

-- ---- 1. The class levels themselves ----
create table if not exists class_levels (
  id text primary key,          -- 'primary-1' .. 'primary-5', later 'jss-1' etc.
  name text not null,           -- 'Primary 1', 'Common Entrance (Primary 5)'
  display_order int not null,
  is_active boolean not null default true  -- whether students can select/use this level yet
);

insert into class_levels (id, name, display_order, is_active) values
  ('primary-1', 'Primary 1', 1, true),
  ('primary-2', 'Primary 2', 2, true),
  ('primary-3', 'Primary 3', 3, true),
  ('primary-4', 'Primary 4', 4, true),
  ('primary-5', 'Common Entrance (Primary 5)', 5, true)
on conflict (id) do nothing;

-- ---- 2. Which subjects exist for which level (editable later from
--         the admin panel — this is just the starting default: the
--         same 8 subjects for every level, since you said you'll
--         refine per-level subjects later) ----
create table if not exists class_level_subjects (
  class_level_id text references class_levels(id) on delete cascade,
  subject_id text not null,
  name text not null,
  icon text not null,
  display_order int not null,
  primary key (class_level_id, subject_id)
);

insert into class_level_subjects (class_level_id, subject_id, name, icon, display_order)
select cl.id, s.subject_id, s.name, s.icon, s.display_order
from class_levels cl
cross join (values
  ('civic-ed',               'Civic Education',        '⚖️', 1),
  ('english',                'English',                 '📖', 2),
  ('ict',                    'ICT',                     '🌐', 3),
  ('mathematics',            'Mathematics',              '🧮', 4),
  ('science',                'Science',                  '🧠', 5),
  ('social-studies',         'Social Studies',           '🏠', 6),
  ('verbal-reasoning',       'Verbal Reasoning',         '🗣️', 7),
  ('quantitative-reasoning', 'Quantitative Reasoning',   '🔢', 8)
) as s(subject_id, name, icon, display_order)
on conflict (class_level_id, subject_id) do nothing;

alter table class_levels enable row level security;
alter table class_level_subjects enable row level security;

drop policy if exists "Anyone can view class levels" on class_levels;
create policy "Anyone can view class levels" on class_levels for select using (true);

drop policy if exists "Admin can manage class levels" on class_levels;
create policy "Admin can manage class levels" on class_levels for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Anyone can view class level subjects" on class_level_subjects;
create policy "Anyone can view class level subjects" on class_level_subjects for select using (true);

drop policy if exists "Admin can manage class level subjects" on class_level_subjects;
create policy "Admin can manage class level subjects" on class_level_subjects for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- ---- 3. Tag existing content tables with class_level ----
alter table notes add column if not exists class_level text not null default 'primary-5';
alter table questions add column if not exists class_level text not null default 'primary-5';
alter table study_plans add column if not exists class_level text not null default 'primary-5';
alter table quiz_attempts add column if not exists class_level text not null default 'primary-5';

-- progress's primary key was (user_id, subject_id) — the same subject
-- slug can now exist at multiple levels, so class_level joins the key.
alter table progress add column if not exists class_level text not null default 'primary-5';
alter table progress drop constraint if exists progress_pkey;
alter table progress add primary key (user_id, subject_id, class_level);

-- study_plans' primary key was just user_id — a student can now have
-- one active plan per class level.
alter table study_plans drop constraint if exists study_plans_pkey;
alter table study_plans add primary key (user_id, class_level);

create index if not exists notes_class_level_idx on notes (class_level, subject_id);
create index if not exists questions_class_level_idx on questions (class_level, subject_id);

-- ---- 4. Per-level enrollment + per-level premium status ----
-- Replaces the old single global profiles.is_premium flag. A student
-- can be enrolled in multiple levels (e.g. one account, two children,
-- or progressing year to year) and premium is tracked separately for each.
create table if not exists user_enrollments (
  user_id uuid references auth.users(id) on delete cascade,
  class_level_id text references class_levels(id) on delete cascade,
  is_premium boolean not null default false,
  premium_unlocked_at timestamptz,
  enrolled_at timestamptz default now(),
  primary key (user_id, class_level_id)
);

alter table user_enrollments enable row level security;

drop policy if exists "Users can view own enrollments" on user_enrollments;
create policy "Users can view own enrollments" on user_enrollments for select using (auth.uid() = user_id);

drop policy if exists "Users can create own enrollments" on user_enrollments;
create policy "Users can create own enrollments" on user_enrollments for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own enrollments" on user_enrollments;
create policy "Users can update own enrollments" on user_enrollments for update using (auth.uid() = user_id);

-- Migrate existing premium students into the new table BEFORE we stop
-- using the old flag, so nobody who already paid loses their unlock.
insert into user_enrollments (user_id, class_level_id, is_premium, premium_unlocked_at)
select id, 'primary-5', is_premium, premium_unlocked_at
from profiles
where is_premium = true
on conflict (user_id, class_level_id) do nothing;

-- Every existing user is enrolled in primary-5 by default (that's the
-- only level that existed before). New users get enrolled wherever
-- they pick at signup instead.
insert into user_enrollments (user_id, class_level_id, is_premium)
select id, 'primary-5', coalesce(is_premium, false)
from profiles
on conflict (user_id, class_level_id) do nothing;

-- ---- 5. Track which level a user is currently viewing ----
alter table profiles add column if not exists active_class_level text not null default 'primary-5';

-- ---- 6. Payments and activation codes now need to know which level
--         they unlock ----
alter table payments add column if not exists class_level text not null default 'primary-5';
alter table activation_codes add column if not exists class_level text not null default 'primary-5';

-- ---- 7. redeem_code() updated to unlock the specific level a code
--         is for, instead of a single global flag ----
create or replace function redeem_code(code_input text)
returns json
language plpgsql
security definer
as $$
declare
  found_code activation_codes%rowtype;
begin
  select * into found_code from activation_codes where code = upper(trim(code_input));

  if not found then
    return json_build_object('success', false, 'message', 'That code isn''t valid.');
  end if;

  if found_code.is_used then
    return json_build_object('success', false, 'message', 'That code has already been used.');
  end if;

  update activation_codes
    set is_used = true, used_by = auth.uid(), used_at = now()
    where code = found_code.code;

  insert into user_enrollments (user_id, class_level_id, is_premium, premium_unlocked_at)
  values (auth.uid(), found_code.class_level, true, now())
  on conflict (user_id, class_level_id)
    do update set is_premium = true, premium_unlocked_at = now();

  return json_build_object('success', true, 'message', 'Unlocked! All premium topics for this class are now available.');
end;
$$;
