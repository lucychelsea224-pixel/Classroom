-- =================================================================
-- Migration: image support for questions (needed for authentic
-- Verbal/Quantitative Reasoning pattern & diagram questions).
-- Run in Supabase -> SQL Editor.
-- =================================================================

-- An optional image shown above the question itself (e.g. a shape
-- pattern, a diagram, a number grid)
alter table questions add column if not exists image_url text;

-- Optional images for the answer options themselves (e.g. "which of
-- these four shapes completes the pattern"). Parallel array to
-- `options` — same length, entries can be null for options that are
-- plain text. Example: ["https://.../a.png", null, null, "https://.../d.png"]
alter table questions add column if not exists option_images jsonb;

-- =================================================================
-- Storage bucket for question images. Public read (so images just
-- load like a normal <img> tag with no auth headers needed), but
-- only the admin can upload or delete.
-- =================================================================
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can view question images" on storage.objects;
create policy "Public can view question images"
  on storage.objects for select
  using (bucket_id = 'question-images');

drop policy if exists "Admin can upload question images" on storage.objects;
create policy "Admin can upload question images"
  on storage.objects for insert
  with check (
    bucket_id = 'question-images'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admin can delete question images" on storage.objects;
create policy "Admin can delete question images"
  on storage.objects for delete
  using (
    bucket_id = 'question-images'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
