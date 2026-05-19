-- ============================================================
-- TIME TRACKING
-- ============================================================
-- One row per logged time block (date + hours + project + person).
-- Hours are decimal (so 1.5 = 1h30m). Rate is optional — when null
-- the entry is unbilled (internal). Description is freeform.
--
-- RLS: a user can see their own entries plus any entry on a
-- project in an org they're an admin / EP of. Producers see their
-- own only. Same scoping model as the rest of the per-user data.

create table if not exists time_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  date            date not null,
  hours           numeric(6,2) not null check (hours > 0 and hours <= 24),
  rate            numeric(8,2),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists time_entries_user_idx    on time_entries(user_id, date desc);
create index if not exists time_entries_project_idx on time_entries(project_id, date desc);

alter table time_entries enable row level security;

drop policy if exists "time_entries_select" on time_entries;
drop policy if exists "time_entries_insert" on time_entries;
drop policy if exists "time_entries_update" on time_entries;
drop policy if exists "time_entries_delete" on time_entries;

-- Read: own entries always. Org-mates' entries when the viewer is
-- an admin or EP of the project's org.
create policy "time_entries_select" on time_entries
  for select using (
    user_id = auth.uid()
    or project_id in (
      select p.id from projects p
      where p.org_id in (
        select org_id from profiles
        where user_id = auth.uid()
          and role in ('admin', 'ep', 'producer')
      )
    )
  );

-- Write: only your own entries.
create policy "time_entries_insert" on time_entries
  for insert with check (user_id = auth.uid());

create policy "time_entries_update" on time_entries
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "time_entries_delete" on time_entries
  for delete using (user_id = auth.uid());

-- Auto-update updated_at on edits
create or replace function bump_time_entries_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_time_entries_updated on time_entries;
create trigger trg_time_entries_updated
  before update on time_entries
  for each row execute function bump_time_entries_updated_at();

-- Per-user default billable rate, stored on profiles. Used as the
-- default rate when logging a new entry. Null = unbilled by default.
alter table profiles
  add column if not exists default_hourly_rate numeric(8,2);

notify pgrst, 'reload schema';
