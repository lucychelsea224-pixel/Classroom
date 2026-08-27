-- =================================================================
-- Migration: comprehension passages.
-- Lets English (or any subject) questions be grouped under a shared
-- reading passage — the passage is written once, shown once, and any
-- number of questions can reference it. Fixes content that was
-- getting jumbled together (passage text and question text mixed
-- into one wall of text) by giving the passage its own place to live.
-- =================================================================

create table if not exists comprehension_passages (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,
  class_level text not null,
  title text not null,
  body text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table comprehension_passages enable row level security;

drop policy if exists "Anyone can view passages" on comprehension_passages;
create policy "Anyone can view passages" on comprehension_passages for select using (true);

drop policy if exists "Admin can manage passages" on comprehension_passages;
create policy "Admin can manage passages" on comprehension_passages for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

alter table questions add column if not exists passage_id uuid references comprehension_passages(id) on delete set null;
