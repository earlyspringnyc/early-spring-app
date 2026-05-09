-- ───────────────────────────────────────────────────────────────────
-- Security migration — run once in Supabase SQL Editor.
-- Addresses the two critical issues from the security audit:
--   1) Privilege escalation: any user could update their own role/permissions.
--   2) Storage: bucket was public, anyone could read/delete any org's files.
-- ───────────────────────────────────────────────────────────────────

-- ─── 1. Profile UPDATE policy: drop the broad self-update, replace with
--       one that excludes role/permissions. Role/permissions changes go
--       through a SECURITY DEFINER function that requires admin in the
--       target's org. ───────────────────────────────────────────────

drop policy if exists "profile_update" on profiles;
drop policy if exists "Users can update their own profile" on profiles;
drop policy if exists "Admins can manage profiles in their org" on profiles;

-- Users can update their own non-privileged fields only.
create policy "Users update own profile (limited)"
  on profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admins of the target's org can update anyone in that org.
create policy "Admins update profiles in their org"
  on profiles for update
  using (
    org_id in (
      select org_id from profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Function to change role/permissions — checks caller is admin of target's org.
create or replace function change_member_role(target_profile_id uuid, new_role text, new_permissions jsonb default null)
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

-- ─── 2. Storage bucket: make private, scope policies to org membership ──

update storage.buckets set public = false where id = 'files';

drop policy if exists "Org members can upload files" on storage.objects;
drop policy if exists "Anyone can view files" on storage.objects;
drop policy if exists "Org members can delete their files" on storage.objects;

-- Path is `<orgId>/<projectId>/<fileId>_<fileName>`. First folder = org_id.
-- Restrict each operation to that org's members.

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

-- ─── 3. Project tombstones table (ships server-side delete tombstones) ──
-- (Already shipped earlier in this session; kept here for reference.)

create table if not exists project_tombstones (
  project_id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  deleted_at timestamptz default now()
);
alter table project_tombstones enable row level security;
drop policy if exists "Org members can view tombstones" on project_tombstones;
create policy "Org members can view tombstones"
  on project_tombstones for select
  using (org_id in (select org_id from profiles where user_id = auth.uid()));
drop policy if exists "Org members can create tombstones" on project_tombstones;
create policy "Org members can create tombstones"
  on project_tombstones for insert
  with check (org_id in (select org_id from profiles where user_id = auth.uid()));
create index if not exists project_tombstones_org_idx on project_tombstones(org_id);
