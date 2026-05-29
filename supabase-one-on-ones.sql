-- ============================================================
-- 1-on-1 notes — log of internal meetings with team members
-- ============================================================
-- Two tables:
--   - one_on_one_members  : a "folder" = a teammate you regularly
--                            sync with (your agent, finance, etc).
--                            Per-user so each Morgan user has their
--                            own folder list.
--   - one_on_one_notes    : the actual notes, scoped to a folder.
--
-- This is distinct from the global meetings table (Fireflies
-- transcripts, classified internal/client/etc). 1:1 notes here
-- are user-authored, optional title + free-form body, scheduled
-- by date, with an "email recap" workflow that pings the team
-- member with the rendered note.

create table if not exists one_on_one_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  role_label  text,                  -- "Agent", "Finance", optional
  created_at  timestamptz not null default now()
);

-- Functional UNIQUE constraint via index (Postgres doesn't allow
-- function expressions inside an inline UNIQUE clause).
create unique index if not exists one_on_one_members_user_email_uniq
  on one_on_one_members(user_id, lower(email));

create index if not exists one_on_one_members_user_idx
  on one_on_one_members(user_id, created_at desc);

alter table one_on_one_members enable row level security;

drop policy if exists "ooo_members_select_own" on one_on_one_members;
create policy "ooo_members_select_own" on one_on_one_members
  for select using (user_id = auth.uid());

drop policy if exists "ooo_members_insert_own" on one_on_one_members;
create policy "ooo_members_insert_own" on one_on_one_members
  for insert with check (user_id = auth.uid());

drop policy if exists "ooo_members_update_own" on one_on_one_members;
create policy "ooo_members_update_own" on one_on_one_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ooo_members_delete_own" on one_on_one_members;
create policy "ooo_members_delete_own" on one_on_one_members
  for delete using (user_id = auth.uid());


create table if not exists one_on_one_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  member_id   uuid not null references one_on_one_members(id) on delete cascade,
  note_date   date not null default current_date,
  title       text,
  body        text not null default '',
  sent_at     timestamptz,           -- last time a recap email was sent
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists one_on_one_notes_member_idx
  on one_on_one_notes(member_id, note_date desc);
create index if not exists one_on_one_notes_user_idx
  on one_on_one_notes(user_id, note_date desc);

alter table one_on_one_notes enable row level security;

drop policy if exists "ooo_notes_select_own" on one_on_one_notes;
create policy "ooo_notes_select_own" on one_on_one_notes
  for select using (user_id = auth.uid());

drop policy if exists "ooo_notes_insert_own" on one_on_one_notes;
create policy "ooo_notes_insert_own" on one_on_one_notes
  for insert with check (user_id = auth.uid());

drop policy if exists "ooo_notes_update_own" on one_on_one_notes;
create policy "ooo_notes_update_own" on one_on_one_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ooo_notes_delete_own" on one_on_one_notes;
create policy "ooo_notes_delete_own" on one_on_one_notes
  for delete using (user_id = auth.uid());


-- ============================================================
-- Cross-table: a 1:1 note can spawn project_notes when Claude
-- organizes it by subject. Those project_notes carry the
-- `internal=true` flag so client portal queries can filter
-- them out.
-- ============================================================
alter table project_notes
  add column if not exists internal boolean not null default false;

alter table project_notes
  add column if not exists source_one_on_one_id uuid references one_on_one_notes(id) on delete set null;

create index if not exists project_notes_internal_idx on project_notes(project_id, internal);

-- The client portal already filters project_notes via its own
-- RLS policy or staff-only view. If it queries project_notes
-- directly, this is the safety net: a separate select policy
-- that only matches non-internal notes for non-authenticated
-- (anon) callers. Keeps staff RLS untouched.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='project_notes' and policyname='project_notes_anon_select'
  ) then
    execute 'drop policy "project_notes_anon_select" on project_notes';
  end if;
end $$;
create policy "project_notes_anon_select" on project_notes
  for select to anon
  using (internal = false);

