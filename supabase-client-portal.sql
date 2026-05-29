-- ============================================================
-- Client Portal: per-project client login + contributions
--
-- A "client" is a Supabase auth user who can sign in at /client
-- with email + password and see ONLY the project(s) they've been
-- explicitly invited to. They cannot see other org projects even
-- if they happen to share an org_id via profiles.
--
-- Tables added:
--   project_clients         link auth.users <-> projects (the gate)
--   client_notes            free-text notes/feedback authored by clients
--   client_asset_links      Dropbox / Drive / etc. share URLs
--   client_task_status      per-task client check-off overlay
--
-- RLS philosophy:
--   - project_clients is the single source of truth for client access
--   - Staff (profile.role != 'client') keep their org-wide visibility
--   - Clients can ONLY see/touch rows tied to a project they're linked to
-- ============================================================

-- ── project_clients: the access gate ─────────────────────────
create table if not exists project_clients (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz default now(),
  last_seen_at timestamptz,
  unique(project_id, user_id)
);
create index if not exists project_clients_user_idx on project_clients(user_id);
create index if not exists project_clients_project_idx on project_clients(project_id);

-- ── client_notes: feedback + notes left by client ────────────
create table if not exists client_notes (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create index if not exists client_notes_project_idx on client_notes(project_id);

-- ── client_asset_links: client-supplied Drive/Dropbox links ─
create table if not exists client_asset_links (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  url text not null,
  provider text,  -- 'drive' | 'dropbox' | 'other'
  added_at timestamptz default now()
);
create index if not exists client_asset_links_project_idx on client_asset_links(project_id);

-- ── client_task_status: per-task client check-off overlay ──
-- task_id is the string id from projects.data->timeline (mkTask uid)
create table if not exists client_task_status (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  task_id text not null,
  done boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now(),
  unique(project_id, task_id)
);
create index if not exists client_task_status_project_idx on client_task_status(project_id);

-- ── Enable RLS on all new tables ─────────────────────────────
alter table project_clients enable row level security;
alter table client_notes enable row level security;
alter table client_asset_links enable row level security;
alter table client_task_status enable row level security;

-- ── Drop any prior policies so re-running is idempotent ──────
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('project_clients','client_notes','client_asset_links','client_task_status')
  loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ── Helper: is the current user a client of a given project? ─
-- Lets RLS policies stay terse and the intent stays readable.
create or replace function public.is_project_client(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from project_clients
    where project_id = p_project_id
      and user_id = auth.uid()
  );
$$;
grant execute on function public.is_project_client(uuid) to authenticated;

-- ============================================================
-- project_clients policies
-- ============================================================

-- Staff (org member, NOT a client) can see + manage links for
-- projects they have access to (via the existing project RLS).
create policy "project_clients_select_staff" on project_clients for select using (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role != 'client'
    )
  )
);
create policy "project_clients_insert_staff" on project_clients for insert with check (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role in ('admin','producer','ep')
    )
  )
);
create policy "project_clients_delete_staff" on project_clients for delete using (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role in ('admin','producer','ep')
    )
  )
);

-- A client can see ONLY their own link rows (to know which project
-- they're attached to). Cannot insert / delete / modify.
create policy "project_clients_select_self" on project_clients for select using (
  user_id = auth.uid()
);

-- ============================================================
-- Tighten projects.select so clients DON'T see all org projects
-- via the existing org-wide policy.
-- ============================================================
-- The base policy created in supabase-schema.sql allowed any org
-- member to see all org projects. A profile with role='client'
-- (created when we provision a client login) would inherit that.
-- We replace it: staff still see org-wide, clients see only their
-- linked projects via project_clients.
drop policy if exists "project_select" on projects;
create policy "project_select_staff" on projects for select using (
  org_id in (
    select org_id from profiles
    where user_id = auth.uid() and role != 'client'
  )
);
create policy "project_select_client" on projects for select using (
  id in (
    select project_id from project_clients
    where user_id = auth.uid()
  )
);

-- ============================================================
-- client_notes policies
-- ============================================================

-- Clients can read + insert their own notes against linked projects
create policy "client_notes_select_client" on client_notes for select using (
  is_project_client(project_id)
);
create policy "client_notes_insert_client" on client_notes for insert with check (
  is_project_client(project_id) and user_id = auth.uid()
);
create policy "client_notes_delete_self" on client_notes for delete using (
  user_id = auth.uid()
);

-- Staff can read all client notes for their org's projects
create policy "client_notes_select_staff" on client_notes for select using (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role != 'client'
    )
  )
);

-- ============================================================
-- client_asset_links policies
-- ============================================================

create policy "client_asset_links_select_client" on client_asset_links for select using (
  is_project_client(project_id)
);
create policy "client_asset_links_insert_client" on client_asset_links for insert with check (
  is_project_client(project_id) and user_id = auth.uid()
);
create policy "client_asset_links_delete_self" on client_asset_links for delete using (
  user_id = auth.uid()
);

create policy "client_asset_links_select_staff" on client_asset_links for select using (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role != 'client'
    )
  )
);
create policy "client_asset_links_delete_staff" on client_asset_links for delete using (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role in ('admin','producer','ep')
    )
  )
);

-- ============================================================
-- client_task_status policies
-- ============================================================
-- Clients toggle done/undone on tasks belonging to their project.
-- Staff can read and clear overrides.

create policy "client_task_status_select_client" on client_task_status for select using (
  is_project_client(project_id)
);
create policy "client_task_status_upsert_client" on client_task_status for insert with check (
  is_project_client(project_id) and updated_by = auth.uid()
);
create policy "client_task_status_update_client" on client_task_status for update using (
  is_project_client(project_id)
) with check (
  is_project_client(project_id) and updated_by = auth.uid()
);

create policy "client_task_status_select_staff" on client_task_status for select using (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role != 'client'
    )
  )
);
create policy "client_task_status_delete_staff" on client_task_status for delete using (
  project_id in (
    select id from projects
    where org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role in ('admin','producer','ep')
    )
  )
);
