-- Prep brief data: per-meeting jsonb blob holding the user's
-- in-flight brief edits — picked case study slugs, their typed
-- asks, and the cached Claude-generated company news (with
-- timestamp so the UI can show "fetched 3 days ago — refresh?").
--
-- One column instead of four lets us add fields (loss-reason
-- notes, custom sections, etc.) without further migrations.
alter table meetings
  add column if not exists brief_data jsonb default '{}'::jsonb;
