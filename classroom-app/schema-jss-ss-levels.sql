-- =================================================================
-- Migration: activate JSS 1 - SS 3, with real subjects for each.
-- Adds the six secondary-school levels as selectable class levels
-- (same mechanism as Primary 1-5 in schema-class-levels.sql — run
-- that file first if you haven't already), and gives JSS and SS their
-- own proper Nigerian secondary-school subject lists — not the
-- Common Entrance subject set Primary 5 uses (Verbal/Quantitative
-- Reasoning don't belong in JSS/SS; Basic Science, Biology/Chemistry/
-- Physics etc. do).
--
-- Safe to re-run: replaces JSS/SS subjects with the list below every
-- time, so if you already ran an earlier version of this file (which
-- mistakenly reused the Primary subject list), running this again
-- corrects it.
--
-- After this runs, students can select JSS1-SS3 at signup and the
-- admin "Managing Class Level" sidebar will list them for adding
-- notes/questions. Content (notes, CBT questions) still needs to be
-- added per level — this migration only makes the levels + subjects
-- selectable, it doesn't create any study content.
-- =================================================================

insert into class_levels (id, name, display_order, is_active) values
  ('jss-1', 'JSS 1', 6, true),
  ('jss-2', 'JSS 2', 7, true),
  ('jss-3', 'JSS 3', 8, true),
  ('ss-1',  'SS 1',  9, true),
  ('ss-2',  'SS 2',  10, true),
  ('ss-3',  'SS 3',  11, true)
on conflict (id) do update set is_active = true;

-- Clear out whatever subjects JSS/SS currently have (covers both a
-- fresh run and correcting an earlier wrong version of this file)
-- before inserting the real list below.
delete from class_level_subjects where class_level_id in ('jss-1', 'jss-2', 'jss-3', 'ss-1', 'ss-2', 'ss-3');

-- JSS 1-3: same core subject list across all three years, matching
-- what's actually taught at Junior Secondary level in Nigeria.
insert into class_level_subjects (class_level_id, subject_id, name, icon, display_order)
select cl.id, s.subject_id, s.name, s.icon, s.display_order
from class_levels cl
cross join (values
  ('english',         'English Language',      '📖', 1),
  ('mathematics',     'Mathematics',            '🧮', 2),
  ('basic-science',   'Basic Science',          '🔬', 3),
  ('basic-tech',      'Basic Technology',       '🛠️', 4),
  ('social-studies',  'Social Studies',         '🏠', 5),
  ('civic-ed',        'Civic Education',        '⚖️', 6),
  ('business-studies','Business Studies',       '💼', 7),
  ('agric-science',   'Agricultural Science',   '🌾', 8),
  ('ict',             'ICT',                    '🌐', 9),
  ('french',          'French',                 '🇫🇷', 10)
) as s(subject_id, name, icon, display_order)
where cl.id in ('jss-1', 'jss-2', 'jss-3')
on conflict (class_level_id, subject_id) do nothing;

-- SS 1-3: core + commonly-taken science/commercial electives leading
-- to WAEC/NECO. Same subject list across all three years.
insert into class_level_subjects (class_level_id, subject_id, name, icon, display_order)
select cl.id, s.subject_id, s.name, s.icon, s.display_order
from class_levels cl
cross join (values
  ('english',       'English Language',      '📖', 1),
  ('mathematics',   'Mathematics',            '🧮', 2),
  ('civic-ed',      'Civic Education',        '⚖️', 3),
  ('biology',       'Biology',                '🧬', 4),
  ('chemistry',     'Chemistry',              '⚗️', 5),
  ('physics',       'Physics',                '🧲', 6),
  ('economics',     'Economics',              '📈', 7),
  ('government',    'Government',             '🏛️', 8),
  ('further-maths', 'Further Mathematics',    '➗', 9),
  ('ict',           'ICT',                    '🌐', 10)
) as s(subject_id, name, icon, display_order)
where cl.id in ('ss-1', 'ss-2', 'ss-3')
on conflict (class_level_id, subject_id) do nothing;
