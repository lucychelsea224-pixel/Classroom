-- =================================================================
-- Migration: diagrams inside notes.
-- Lets a note carry up to 4 images (diagrams, graphs, setups) with
-- captions, stored as a JSON array: [{ "url": "...", "caption": "..." }].
-- Admins place a diagram at a specific point in the note text by
-- writing [diagram:1], [diagram:2] etc. — any diagram not referenced
-- that way is automatically shown at the end of the note, so nothing
-- uploaded ever silently disappears.
-- =================================================================

alter table notes add column if not exists diagram_images jsonb;
