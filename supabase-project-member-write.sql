-- Let project members write to their projects
-- Run once in the Supabase SQL editor (Project → SQL → New query).
--
-- BUG this fixes: the projects UPDATE policy only allowed admin/producer.
-- That meant creatives, production, finance, etc. — even when they're
-- explicit members of a project — could NOT save any change to the
-- project, including creative uploads. Their files landed in Storage but
-- the creativeAssets metadata write was silently denied by RLS, so the
-- assets were invisible to everyone.
--
-- New rule: admin / producer / ep can update any project in their org
-- (unchanged), AND any user with a project_members row can update the
-- project(s) they belong to. Non-members still cannot.

drop policy if exists "project_update" on public.projects;
create policy "project_update" on public.projects for update using (
  org_id in (
    select org_id from public.profiles
    where user_id = auth.uid() and role in ('admin', 'producer', 'ep')
  )
  or id in (
    select project_id from public.project_members
    where user_id = auth.uid()
  )
);
