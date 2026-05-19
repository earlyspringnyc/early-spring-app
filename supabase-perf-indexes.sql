-- Performance indexes consolidated from the Supabase AI Assistant's
-- recommendations. Apply in three phases so the unique constraints
-- don't trip over pre-existing duplicate rows.
--
-- Phase 1: pure-win single-column + composite indexes (run now)
-- Phase 2: duplicate audits (run, eyeball the row counts)
-- Phase 3: unique indexes (only if Phase 2 returned zero rows)

-- ─── PHASE 1 — apply all of this in one go ────────────────────────────

-- Junction tables: huge wins, used on every project/contact/meeting drawer load
CREATE INDEX IF NOT EXISTS meeting_contacts_contact_id_idx ON public.meeting_contacts (contact_id);
CREATE INDEX IF NOT EXISTS meeting_contacts_meeting_id_idx ON public.meeting_contacts (meeting_id);

CREATE INDEX IF NOT EXISTS contact_projects_project_id_idx ON public.contact_projects (project_id);
CREATE INDEX IF NOT EXISTS contact_projects_contact_id_idx ON public.contact_projects (contact_id);

CREATE INDEX IF NOT EXISTS meeting_projects_project_id_idx ON public.meeting_projects (project_id);
CREATE INDEX IF NOT EXISTS meeting_projects_meeting_id_idx ON public.meeting_projects (meeting_id);

-- Contacts ordering — feeds the default sort + follow-up engine
CREATE INDEX IF NOT EXISTS contacts_user_last_contacted_at_idx
  ON public.contacts (user_id, last_contacted_at DESC);

-- Trigram search on company for ILIKE matching (Hardwire client → CRM,
-- search box). Massive speedup for "%foo%" patterns.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS contacts_company_trgm_lower_gin_idx
  ON public.contacts USING gin (lower(company) gin_trgm_ops);

-- RLS-filter indexes on user-scoped tables
CREATE INDEX IF NOT EXISTS meetings_user_id_idx ON public.meetings (user_id);
CREATE INDEX IF NOT EXISTS prep_briefs_user_id_idx ON public.prep_briefs (user_id);
CREATE INDEX IF NOT EXISTS user_notes_user_id_created_at_idx
  ON public.user_notes (user_id, created_at DESC);

-- Projects: skip if your projects table is org-scoped (no user_id col).
-- Run the check below and only execute one of the two depending on what exists.

-- ─── PHASE 2 — run these and look at the row counts ───────────────────

-- Q1: existing duplicates in meeting_contacts (must be 0 rows to add unique)
select 'meeting_contacts' as table_name, meeting_id, contact_id, count(*)
from public.meeting_contacts
group by 1,2,3 having count(*) > 1;

-- Q2: existing duplicates in contact_projects by (project, contact)
select 'contact_projects' as table_name, project_id, contact_id, count(*)
from public.contact_projects
group by 1,2,3 having count(*) > 1;

-- Q3: existing duplicates in meeting_projects
select 'meeting_projects' as table_name, project_id, meeting_id, count(*)
from public.meeting_projects
group by 1,2,3 having count(*) > 1;

-- Q4: does projects.user_id exist? (returns one row if yes, zero if no)
select column_name from information_schema.columns
 where table_schema='public' and table_name='projects'
   and column_name in ('user_id','org_id');

-- ─── PHASE 3 — apply ONLY the lines that passed Phase 2 ───────────────

-- If Q1 returned zero rows:
CREATE UNIQUE INDEX IF NOT EXISTS meeting_contacts_meeting_contact_uniq
  ON public.meeting_contacts (meeting_id, contact_id);

-- If Q2 returned zero rows AND a contact only ever has ONE role per project:
CREATE UNIQUE INDEX IF NOT EXISTS contact_projects_project_contact_uniq
  ON public.contact_projects (project_id, contact_id);
-- ...OR if a contact can have MULTIPLE roles per project, use this instead:
-- CREATE UNIQUE INDEX IF NOT EXISTS contact_projects_project_contact_role_uniq
--   ON public.contact_projects (project_id, contact_id, role);

-- If Q3 returned zero rows:
CREATE UNIQUE INDEX IF NOT EXISTS meeting_projects_project_meeting_uniq
  ON public.meeting_projects (project_id, meeting_id);

-- If Q4 returned user_id:
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects (user_id);
-- If Q4 returned org_id instead:
-- CREATE INDEX IF NOT EXISTS projects_org_id_idx ON public.projects (org_id);
