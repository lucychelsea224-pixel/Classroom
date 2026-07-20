-- =================================================================
-- Migration: split each subject's question bank into numbered tests
-- (Test 1, Test 2, Test 3...) of ~30 questions each, so students
-- aren't handed 100 questions in one sitting.
-- Run this once in Supabase -> SQL Editor, AFTER your question
-- inserts have already run.
-- =================================================================

alter table questions add column if not exists test_number int not null default 1;

-- Assign existing questions into batches of 30, in the order they
-- were inserted, per subject. English's comprehension passages sit
-- at the start of that subject's insert order, so they land safely
-- inside Test 1 together rather than being split across tests.
with numbered as (
  select id, subject_id,
         row_number() over (partition by subject_id order by created_at, id) as rn
  from questions
)
update questions q
set test_number = ceil(numbered.rn / 30.0)::int
from numbered
where q.id = numbered.id;

-- Quick sanity check: see how many questions landed in each test per subject
-- select subject_id, test_number, count(*) from questions group by 1, 2 order by 1, 2;
