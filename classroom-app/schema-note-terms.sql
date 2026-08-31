-- =================================================================
-- Migration: term-based topic organization.
-- Groups notes/topics under First Term, Second Term, Third Term —
-- students pick a term first, then see just that term's topics.
-- Existing notes default to 'first' so nothing disappears; use the
-- new bulk "Move to Term" tool in admin to sort already-imported
-- content into the right term.
-- =================================================================

alter table notes add column if not exists term text not null default 'first'
  check (term in ('first', 'second', 'third'));

create index if not exists notes_term_idx on notes (subject_id, class_level, term, display_order);
