-- ============================================================
-- 1) contact_type — kind of relationship, distinct from status
--    (which is the funnel stage: prospect / pitching / active / past).
--    Values used by the UI:
--      'brand'    — client, brand-side
--      'agency'   — client or partner, agency-side
--      'vendor'   — production co, post, color, music, etc.
--      'agent'    — talent / director rep
--      'press'    — journalist / editor
--      'internal' — your own team
--    Null is allowed and means "unspecified".
-- ============================================================
alter table contacts add column if not exists contact_type text;
create index if not exists contacts_user_type_idx on contacts(user_id, contact_type);

-- ============================================================
-- 2) project_notes — append-only feed of notes attached to a project,
--    each carrying an optional source (so meeting-derived notes can
--    be told apart from hand-written ones, and we can link back).
-- ============================================================
create table if not exists project_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,

  content text not null,
  source text not null default 'manual',  -- 'manual' | 'meeting'
  source_meeting_id uuid references meetings(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_notes_project_idx on project_notes(project_id, created_at desc);
create index if not exists project_notes_meeting_idx on project_notes(source_meeting_id);

alter table project_notes enable row level security;

drop policy if exists "project_notes_select" on project_notes;
drop policy if exists "project_notes_insert" on project_notes;
drop policy if exists "project_notes_update" on project_notes;
drop policy if exists "project_notes_delete" on project_notes;
create policy "project_notes_select" on project_notes for select using (user_id = auth.uid());
create policy "project_notes_insert" on project_notes for insert with check (user_id = auth.uid());
create policy "project_notes_update" on project_notes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "project_notes_delete" on project_notes for delete using (user_id = auth.uid());

create or replace function set_project_notes_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists project_notes_updated_at on project_notes;
create trigger project_notes_updated_at before update on project_notes
  for each row execute function set_project_notes_updated_at();
