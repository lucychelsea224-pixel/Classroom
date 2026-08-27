-- =================================================================
-- Migration: optional explanation video per note.
-- Lets the admin attach a YouTube video URL to any note; students see
-- an embedded player when they open that note. Purely optional —
-- notes with no video_url just show no video box, exactly as before.
-- =================================================================

alter table notes add column if not exists video_url text;
