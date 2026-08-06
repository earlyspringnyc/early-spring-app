-- Diagnostic for "user created a project, nobody else can see it".
-- Read-only — nothing here modifies data. Run in the Supabase SQL editor
-- and read the results top to bottom.
--
-- Replace the two emails below before running.

\set creator_email 'amanda@bycounterpart.com'
\set viewer_email  'kamil@earlyspring.nyc'

-- 1. Do both users resolve to the SAME org? getProjects() filters on
--    org_id, so two profiles in different orgs never see each other's
--    work no matter what the RLS policies say.
select p.user_id, u.email, p.org_id, o.name as org_name, p.role, p.created_at
from public.profiles p
join auth.users u on u.id = p.user_id
left join public.organizations o on o.id = p.org_id
where u.email in ('amanda@bycounterpart.com', 'kamil@earlyspring.nyc')
order by u.email, p.created_at;
-- EXPECT: one row each, same org_id. Multiple rows for one user means
-- that user has profiles in several orgs and may be signed into the
-- wrong one. Different org_ids is the whole answer on its own.

-- 2. Did the project actually land in the database? If this returns
--    nothing, the row was never written — the creator is looking at a
--    browser-local copy flagged "Not synced", and no read policy on
--    earth will show it to anyone else.
select id, org_id, name, client, created_at, updated_at
from public.projects
order by created_at desc
limit 10;

-- 3. Who can see a given project? Fill in the id from step 2.
--    Non-admin/ep roles need a project_members row.
-- select pm.project_id, u.email, pm.sections, pm.added_by, pm.created_at
-- from public.project_members pm
-- join auth.users u on u.id = pm.user_id
-- where pm.project_id = '<PROJECT_ID_FROM_STEP_2>';
-- EXPECT: at least the creator. Zero rows means the client-side
-- auto-add in db.js createProject() was rejected — see step 4.

-- 4. Can a non-admin even INSERT into project_members? createProject()
--    wraps that insert in a try/catch that only console.warns, so a
--    denial here is invisible in the app.
select polname, polcmd,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy
where polrelid = 'public.project_members'::regclass
order by polcmd, polname;

-- 5. The projects policies themselves, to confirm which migrations are
--    actually applied. project_select_staff and project_update should
--    both reference project_members.
select polname, polcmd,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy
where polrelid = 'public.projects'::regclass
order by polcmd, polname;

-- 6. Is the INSERT policy on projects the thing rejecting the write?
--    Look for a WITH CHECK expression above restricted to roles the
--    creator doesn't hold.

-- 7. Index check — an unindexed project_members/profiles makes every
--    policy evaluation a sequential scan, which is the likeliest cause
--    of the login timeouts. Run supabase-project-access-indexes.sql if
--    these come back empty.
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('project_members', 'profiles', 'projects')
order by tablename, indexname;

-- 8. Statement timeout for the app's role. If writes are timing out,
--    this is the ceiling they're hitting.
select rolname, rolconfig
from pg_roles
where rolname in ('authenticated', 'anon');
