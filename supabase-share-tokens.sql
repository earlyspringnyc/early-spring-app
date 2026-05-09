-- Run once in Supabase SQL Editor.
-- Creates project_shares table to back the new server-side share-token system.

create table if not exists project_shares (
  token text primary key,
  project_id uuid not null references projects(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

alter table project_shares enable row level security;

-- Anyone can read by token from /api/share via service role; restrict normal
-- client SELECT to org members so admins/producers can list/revoke.
drop policy if exists "Org members can view shares" on project_shares;
create policy "Org members can view shares"
  on project_shares for select
  using (
    project_id in (
      select id from projects where org_id in (
        select org_id from profiles where user_id = auth.uid()
      )
    )
  );

create index if not exists project_shares_project_idx on project_shares(project_id);
create index if not exists project_shares_active_idx on project_shares(token) where revoked_at is null;

-- Optional: cleanup of long-expired tokens. Safe to skip; tokens are also
-- checked at request time. Uncomment to enable a 1-month grace window:
-- create or replace function cleanup_expired_shares() returns void
-- language sql security definer as $$
--   delete from project_shares
--   where (revoked_at is not null and revoked_at < now() - interval '30 days')
--      or (expires_at is not null and expires_at < now() - interval '30 days');
-- $$;
