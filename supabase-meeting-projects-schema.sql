-- meeting_projects junction. Mirrors meeting_contacts but for the
-- project side. Auto-populated when an attendee on a meeting is a
-- CRM contact who's linked to a project (match_type='auto-contact').
-- User can manually link/unlink from either the meeting detail or
-- the project's meetings tab.

create table if not exists meeting_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  match_type text not null default 'auto-contact', -- 'auto-contact' | 'manual'
  created_at timestamptz not null default now(),
  unique (meeting_id, project_id)
);

create index if not exists meeting_projects_meeting_idx on meeting_projects(meeting_id);
create index if not exists meeting_projects_project_idx on meeting_projects(project_id);

alter table meeting_projects enable row level security;

drop policy if exists "meeting_projects_select" on meeting_projects;
drop policy if exists "meeting_projects_insert" on meeting_projects;
drop policy if exists "meeting_projects_update" on meeting_projects;
drop policy if exists "meeting_projects_delete" on meeting_projects;
create policy "meeting_projects_select" on meeting_projects for select using (user_id = auth.uid());
create policy "meeting_projects_insert" on meeting_projects for insert with check (user_id = auth.uid());
create policy "meeting_projects_update" on meeting_projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meeting_projects_delete" on meeting_projects for delete using (user_id = auth.uid());
