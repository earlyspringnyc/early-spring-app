-- Prep brief is contact-anchored, not meeting-anchored. The brief
-- holds the picked case study slugs, the user's typed asks, and
-- (eventually) cached company news. It belongs to a person/company
-- relationship — meetings come and go but the brief evolves with
-- the relationship.
--
-- The earlier meetings.brief_data column (added in
-- supabase-meeting-brief.sql) is left in place but unused. Safe to
-- drop later once we confirm no rows have data we want to migrate.
alter table contacts
  add column if not exists brief_data jsonb default '{}'::jsonb;
