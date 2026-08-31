-- =================================================================
-- Migration: proper manual ordering for notes.
-- Bulk-imported notes previously all shared the same created_at
-- timestamp (Postgres assigns "now()" once per INSERT statement, not
-- once per row), so sorting by created_at made bulk-imported notes
-- appear in a scrambled order. This adds a real display_order column
-- instead, which also enables reordering in the admin panel.
-- Run in Supabase -> SQL Editor.
-- =================================================================

alter table notes add column if not exists display_order int;

with numbered as (
  select id, subject_id, class_level,
         row_number() over (partition by subject_id, class_level order by created_at, id) as rn
  from notes
  where display_order is null
)
update notes n
set display_order = numbered.rn
from numbered
where n.id = numbered.id;
