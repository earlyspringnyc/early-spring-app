-- Let clients see meeting recaps for projects they're linked to.
--
-- Existing RLS gated meetings + meeting_projects to user_id = auth.uid()
-- (the staff member who synced them). Clients aren't in that set, so
-- they get zero rows. We add a second SELECT policy on each that
-- grants read access through project_clients, but only for meetings
-- the auto-classifier flagged as 'client' (so internal/vendor
-- meetings linked to the same project don't leak).

-- ── meeting_projects: clients can read links for their projects ──
drop policy if exists "meeting_projects_client_select" on meeting_projects;
create policy "meeting_projects_client_select" on meeting_projects for select
  using (
    project_id in (
      select project_id from project_clients where user_id = auth.uid()
    )
  );

-- ── meetings: clients can read client-classified meetings linked
--    to a project they have access to ──
drop policy if exists "meetings_client_select" on meetings;
create policy "meetings_client_select" on meetings for select
  using (
    classification = 'client'
    and id in (
      select meeting_id from meeting_projects
      where project_id in (
        select project_id from project_clients where user_id = auth.uid()
      )
    )
  );
