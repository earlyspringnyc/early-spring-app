-- ═══════════════════════════════════════════════════════════════════
-- Morgan / Early Spring — single source of truth for the Supabase schema.
-- Run this in Supabase SQL Editor on a fresh project. Idempotent: safe
-- to re-run.
--
-- Supersedes the legacy multi-file split:
--   supabase-multi-org.sql       (multi-org membership)
--   supabase-fix-rls.sql         (RLS rewrite)
--   supabase-vendors.sql         (vendors table)
--   supabase-share-tokens.sql    (project_shares table)
--   supabase-security-migration.sql (storage + role escalation lockdown)
--   supabase-tombstones inline   (project_tombstones table)
-- Those files remain in the repo for reference but everything they did
-- is rolled into this one file.
-- ═══════════════════════════════════════════════════════════════════

-- ── Tables ────────────────────────────────────────────────────────

create table if not exists organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique,
  logo_url text,
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  role text default 'admin' check (role in ('admin', 'producer', 'viewer', 'client', 'creative', 'finance', 'accounts', 'production', 'ep')),
  permissions jsonb default '{"budget":true,"timeline":true,"vendors":true,"pnl":true,"docs":true,"ros":true,"client":true,"ai":true,"settings":true}',
  created_at timestamptz default now()
);

-- Multi-org membership: a user can have a profile in many orgs.
alter table profiles drop constraint if exists profiles_user_id_key;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'profiles'::regclass and conname = 'profiles_user_org_unique'
  ) then
    alter table profiles add constraint profiles_user_org_unique unique (user_id, org_id);
  end if;
end $$;

create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  client text,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists invitations (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  email text not null,
  role text default 'producer',
  invited_by uuid references profiles(id),
  accepted boolean default false,
  created_at timestamptz default now()
);

create table if not exists vendors (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  vendor_type text default 'other',
  w9_status text default 'pending' check (w9_status in ('pending', 'received', 'approved')),
  created_at timestamptz default now()
);

create table if not exists user_preferences (
  user_id uuid references auth.users(id) on delete cascade primary key,
  last_org_id uuid references organizations(id) on delete set null,
  updated_at timestamptz default now()
);

create table if not exists project_tombstones (
  project_id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  deleted_at timestamptz default now()
);

create table if not exists project_shares (
  token text primary key,
  project_id uuid not null references projects(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

-- ── Indexes ───────────────────────────────────────────────────────
create index if not exists project_tombstones_org_idx on project_tombstones(org_id);
create index if not exists project_shares_project_idx on project_shares(project_id);
create index if not exists project_shares_active_idx on project_shares(token) where revoked_at is null;

-- ── Row Level Security ───────────────────────────────────────────

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table projects enable row level security;
alter table invitations enable row level security;
alter table vendors enable row level security;
alter table user_preferences enable row level security;
alter table project_tombstones enable row level security;
alter table project_shares enable row level security;

-- Drop any legacy policies before re-creating clean ones.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('organizations','profiles','projects','invitations','vendors','user_preferences','project_tombstones','project_shares')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Organizations
create policy "org_insert" on organizations for insert with check (true);
create policy "org_select" on organizations for select using (
  id in (select org_id from profiles where user_id = auth.uid())
);
create policy "org_update" on organizations for update using (
  id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);

-- Profiles — users can read all profiles in their org and self-update,
-- admins can update anyone in their org. Role/permissions changes go
-- through change_member_role() RPC (defined below).
create policy "profile_insert" on profiles for insert with check (user_id = auth.uid());
create policy "profile_select" on profiles for select using (
  user_id = auth.uid() or
  org_id in (select org_id from profiles where user_id = auth.uid())
);
create policy "profile_update_self" on profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "profile_update_admin" on profiles for update using (
  org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);
create policy "profile_delete" on profiles for delete using (
  org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
  and user_id != auth.uid()
);

-- Projects
create policy "project_select" on projects for select using (
  org_id in (select org_id from profiles where user_id = auth.uid())
);
create policy "project_insert" on projects for insert with check (
  org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer'))
);
create policy "project_update" on projects for update using (
  org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer'))
);
create policy "project_delete" on projects for delete using (
  org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);

-- Vendors — same as projects (org members read, producers/admins write).
create policy "vendor_select" on vendors for select using (
  org_id in (select org_id from profiles where user_id = auth.uid())
);
create policy "vendor_insert" on vendors for insert with check (
  org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer'))
);
create policy "vendor_update" on vendors for update using (
  org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer'))
);
create policy "vendor_delete" on vendors for delete using (
  org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer'))
);

-- Invitations
create policy "invitation_select" on invitations for select using (
  email = (select email from auth.users where id = auth.uid())
  or org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);
create policy "invitation_insert" on invitations for insert with check (
  org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);
create policy "invitation_update" on invitations for update using (
  email = (select email from auth.users where id = auth.uid())
  or org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);
create policy "invitation_delete" on invitations for delete using (
  org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);

-- User preferences
create policy "user_prefs_all" on user_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Project tombstones
create policy "tombstone_select" on project_tombstones for select using (
  org_id in (select org_id from profiles where user_id = auth.uid())
);
create policy "tombstone_insert" on project_tombstones for insert with check (
  org_id in (select org_id from profiles where user_id = auth.uid())
);

-- Project shares — org members can list/revoke; the public lookup goes
-- through /api/share with the service role.
create policy "share_select" on project_shares for select using (
  project_id in (
    select id from projects where org_id in (
      select org_id from profiles where user_id = auth.uid()
    )
  )
);

-- ── Functions ────────────────────────────────────────────────────

-- updated_at trigger for projects (so updateProject's optimistic-lock
-- precondition works).
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- Privileged role-change RPC. Direct UPDATE of role/permissions is
-- blocked by RLS; this function checks the caller is admin of the
-- target's org and applies the change as the function owner.
create or replace function change_member_role(
  target_profile_id uuid,
  new_role text,
  new_permissions jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  caller_role text;
begin
  select org_id into target_org from profiles where id = target_profile_id;
  if target_org is null then raise exception 'Profile not found'; end if;

  select role into caller_role
  from profiles
  where user_id = auth.uid() and org_id = target_org
  limit 1;

  if caller_role is null or caller_role <> 'admin' then
    raise exception 'Only org admins can change roles';
  end if;

  update profiles
  set role = coalesce(new_role, role),
      permissions = coalesce(new_permissions, permissions)
  where id = target_profile_id;
end $$;

revoke execute on function change_member_role(uuid, text, jsonb) from public;
grant execute on function change_member_role(uuid, text, jsonb) to authenticated;

-- ── Storage ──────────────────────────────────────────────────────

-- Files bucket — private, scoped to org membership via path-based check.
-- Path convention: <orgId>/<projectId>/<fileId>_<fileName>
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do update set public = false;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'Org members can upload files',
        'Anyone can view files',
        'Org members can delete their files',
        'Org members can read their files',
        'Org members can upload to their org'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "Org members can read their files"
  on storage.objects for select
  using (
    bucket_id = 'files'
    and (storage.foldername(name))[1]::uuid in (
      select org_id from profiles where user_id = auth.uid()
    )
  );

create policy "Org members can upload to their org"
  on storage.objects for insert
  with check (
    bucket_id = 'files'
    and (storage.foldername(name))[1]::uuid in (
      select org_id from profiles where user_id = auth.uid()
    )
  );

create policy "Org members can delete their files"
  on storage.objects for delete
  using (
    bucket_id = 'files'
    and (storage.foldername(name))[1]::uuid in (
      select org_id from profiles where user_id = auth.uid()
    )
  );
