-- Voice captures — short voice memos a user records on mobile and lets
-- Claude classify into one of three destinations: a personal reminder,
-- a project note, or a general personal note.
--
-- Lifecycle: 'pending' (just transcribed, suggestion shown, awaiting
-- user confirm) → 'filed' (user accepted/edited the suggestion and we
-- wrote a row to user_notes or project_notes) → 'discarded' (user
-- threw it away). Filed captures remember where they were routed via
-- routed_to_table + routed_to_id so the modal history can deep-link
-- back to the destination.
--
-- transcript is the raw Gemini transcription. suggestion is the JSON
-- shape Claude returns: { kind, summary, body, reminder_date?,
-- project_id?, confidence }. Storing the suggestion (not just the
-- routed result) lets us audit Claude's accuracy over time and re-run
-- routing later without paying for another transcription.

create table if not exists voice_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  transcript text not null default '',
  suggestion jsonb,

  status text not null default 'pending',  -- 'pending' | 'filed' | 'discarded'
  routed_to_table text,                    -- 'user_notes' | 'project_notes'
  routed_to_id uuid,

  duration_ms int,                         -- length of the recording, for stats
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_captures_user_idx
  on voice_captures(user_id, created_at desc);
create index if not exists voice_captures_status_idx
  on voice_captures(user_id, status, created_at desc);

alter table voice_captures enable row level security;

drop policy if exists "voice_captures_select" on voice_captures;
drop policy if exists "voice_captures_insert" on voice_captures;
drop policy if exists "voice_captures_update" on voice_captures;
drop policy if exists "voice_captures_delete" on voice_captures;

create policy "voice_captures_select" on voice_captures for select
  using (user_id = auth.uid());

create policy "voice_captures_insert" on voice_captures for insert
  with check (user_id = auth.uid());

create policy "voice_captures_update" on voice_captures for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "voice_captures_delete" on voice_captures for delete
  using (user_id = auth.uid());

create or replace function set_voice_captures_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists voice_captures_updated_at on voice_captures;
create trigger voice_captures_updated_at
  before update on voice_captures
  for each row execute function set_voice_captures_updated_at();
