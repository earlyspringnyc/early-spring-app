-- Reminder extraction columns for user_notes. Lets the client cache the
-- last analyzed snapshot of `content` so we don't re-prompt the LLM on
-- every keystroke, and stores the parsed reminder + calendar link so a
-- created event can't get duplicated on subsequent edits.

alter table user_notes
  add column if not exists analyzed_content text,
  add column if not exists reminder_date timestamptz,
  add column if not exists reminder_action text,
  add column if not exists calendar_event_id text;
