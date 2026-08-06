-- Indexes for the per-project access RLS policies.
-- Run once in the Supabase SQL editor (Project → SQL → New query).
--
-- WHY: supabase-project-select-by-membership.sql and
-- supabase-project-member-write.sql both added policies shaped like:
--
--   org_id in (select org_id from profiles
--              where user_id = auth.uid() and role in ('admin','ep'))
--   or id in (select project_id from project_members
--             where user_id = auth.uid())
--
-- Those subqueries run on EVERY projects read and EVERY projects write —
-- and a write happens on every autosave. supabase-perf-indexes.sql never
-- covered project_members or profiles, so both were sequential scans.
-- That gets slower as the team and the project list grow, which is what
-- pushes logins (projects load immediately after auth) and saves past
-- the statement timeout.
--
-- All of these are IF NOT EXISTS and safe to re-run.

-- Drives both halves of the membership check in the SELECT/UPDATE policies.
CREATE INDEX IF NOT EXISTS project_members_user_id_idx
  ON public.project_members (user_id);

-- Membership lookups by project (Manage Access panel, the finance
-- auto-grant trigger's `not exists` guard).
CREATE INDEX IF NOT EXISTS project_members_project_id_idx
  ON public.project_members (project_id);

-- The exact pair both policies and the trigger guards probe.
CREATE INDEX IF NOT EXISTS project_members_project_user_idx
  ON public.project_members (project_id, user_id);

-- Role lookup in the admin/ep bypass arm of every policy.
CREATE INDEX IF NOT EXISTS profiles_user_id_role_idx
  ON public.profiles (user_id, role);

-- getProjects() filters on org_id and orders by created_at.
CREATE INDEX IF NOT EXISTS projects_org_created_idx
  ON public.projects (org_id, created_at DESC);

-- Refresh planner stats so the new indexes get used immediately.
ANALYZE public.project_members;
ANALYZE public.profiles;
ANALYZE public.projects;
