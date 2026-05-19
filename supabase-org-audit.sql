-- ============================================================
-- STEP 1 — AUDIT: list every org this user belongs to, and how
-- much real content sits inside each one. Read-only. Run this
-- in the Supabase SQL editor and paste the result back so we
-- can pick which org to keep.
-- ============================================================

with me as (
  select id as user_id
  from auth.users
  where email = 'kamil@earlyspring.nyc'
  limit 1
)
select
  o.id                              as org_id,
  o.name                            as org_name,
  o.created_at                      as org_created_at,
  p.role                            as my_role,
  p.created_at                      as profile_created_at,
  (select count(*) from projects   where org_id = o.id) as project_count,
  (select count(*) from vendors    where org_id = o.id) as vendor_count,
  (select count(*) from invitations where org_id = o.id) as invitation_count,
  (select count(*) from project_shares where org_id = o.id) as share_count,
  (select count(*) from project_tombstones where org_id = o.id) as tombstone_count,
  (select count(*) from profiles where org_id = o.id) as member_count
from profiles p
join organizations o on o.id = p.org_id
where p.user_id = (select user_id from me)
order by o.created_at asc;
