-- Enforce per-project access for staff (defer to Manage Access settings)
-- Run once in the Supabase SQL editor (Project → SQL → New query).
--
-- BEFORE: any staff member could read every project in their org — the
-- SELECT policy gated on org only, so the project_members rows set in
-- Settings → Members → Manage access were never enforced for visibility.
--
-- AFTER: admins / EPs still see every project in their org. Everyone else
-- (producer, creative, finance, accounts, production, agent, viewer) sees
-- only the projects they have a project_members row for — i.e. exactly what
-- Manage Access grants them. Clients are unchanged (see project_select_client).
--
-- This is read enforcement; project_update is handled in
-- supabase-project-member-write.sql. Because getProjects() runs as the
-- signed-in user, the app picks this up automatically — no client change.
--
-- NOTE on producers: per the app's model (PROJECT_BYPASS_ROLES = admin, ep)
-- producers are NOT org-wide and need explicit memberships. If you'd rather
-- producers always see every project, add 'producer' to the role list below.

drop policy if exists "project_select_staff" on public.projects;
create policy "project_select_staff" on public.projects for select using (
  org_id in (
    select org_id from public.profiles
    where user_id = auth.uid() and role in ('admin', 'ep')
  )
  or id in (
    select project_id from public.project_members
    where user_id = auth.uid()
  )
);
