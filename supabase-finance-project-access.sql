-- ============================================================
-- AUTO-SYNC: finance/accounts roles ↔ awarded/wrapped projects
-- ============================================================
-- Rule: anyone with role='finance' or 'accounts' in an org should
-- automatically have project_members access to every project in
-- that org whose stage is 'awarded' or 'wrapped'. No CRM here —
-- that's gated separately via profiles.org_permissions.
--
-- Two triggers keep this in sync without manual intervention:
--   1. projects_finance_access — when a project's stage changes
--      (or a new project is inserted), grant/revoke access for all
--      finance/accounts members of that org.
--   2. profiles_finance_access — when a profile is created or its
--      role changes to/from finance/accounts, grant/revoke their
--      access to every currently-active project in the org.
--
-- Both are idempotent — re-running won't duplicate, and they skip
-- profile rows with user_id is null (pre-acceptance invites).
--
-- This file is the one-time setup. After it's applied, stage flips
-- in the UI auto-propagate. To onboard another finance teammate,
-- just create their profile with role='finance' — they'll inherit
-- access to all awarded/wrapped projects automatically.

create or replace function sync_finance_project_access()
returns trigger language plpgsql as $$
declare
  v_new_stage text;
  v_old_stage text;
  v_is_active boolean;
  v_was_active boolean;
begin
  v_new_stage := new.data->>'stage';
  v_old_stage := case when tg_op = 'UPDATE' then old.data->>'stage' else null end;
  v_is_active := v_new_stage in ('awarded', 'wrapped');
  v_was_active := tg_op = 'UPDATE' and v_old_stage in ('awarded', 'wrapped');

  -- Active now, wasn't before (insert into active OR transition in)
  if v_is_active and not v_was_active then
    insert into project_members (project_id, user_id, sections)
    select new.id, p.user_id, null
    from profiles p
    where p.org_id = new.org_id
      and p.role in ('finance', 'accounts')
      and p.user_id is not null
      and not exists (
        select 1 from project_members pm
        where pm.project_id = new.id and pm.user_id = p.user_id
      );
  end if;

  -- Was active, isn't anymore
  if v_was_active and not v_is_active then
    delete from project_members pm
    using profiles p
    where pm.project_id = new.id
      and pm.user_id = p.user_id
      and p.org_id = new.org_id
      and p.role in ('finance', 'accounts');
  end if;

  return new;
end $$;

drop trigger if exists projects_finance_access on projects;
create trigger projects_finance_access
  after insert or update of data on projects
  for each row
  execute function sync_finance_project_access();


create or replace function sync_finance_profile_access()
returns trigger language plpgsql as $$
declare
  v_now_finance boolean;
  v_was_finance boolean;
begin
  v_now_finance := new.role in ('finance', 'accounts');
  v_was_finance := tg_op = 'UPDATE' and old.role in ('finance', 'accounts');

  if new.user_id is null then return new; end if;

  -- Became finance/accounts: grant access to all awarded/wrapped
  -- projects in this org.
  if v_now_finance and not v_was_finance then
    insert into project_members (project_id, user_id, sections)
    select pr.id, new.user_id, null
    from projects pr
    where pr.org_id = new.org_id
      and pr.data->>'stage' in ('awarded', 'wrapped')
      and not exists (
        select 1 from project_members pm
        where pm.project_id = pr.id and pm.user_id = new.user_id
      );
  end if;

  -- No longer finance/accounts: revoke from all auto-granted (active
  -- stage) projects in this org. Doesn't touch project_members rows
  -- on projects in pitching/lost/archived (they were never auto-
  -- granted, must have been manual).
  if v_was_finance and not v_now_finance then
    delete from project_members pm
    using projects pr
    where pm.project_id = pr.id
      and pm.user_id = new.user_id
      and pr.org_id = new.org_id
      and pr.data->>'stage' in ('awarded', 'wrapped');
  end if;

  return new;
end $$;

drop trigger if exists profiles_finance_access on profiles;
create trigger profiles_finance_access
  after insert or update of role on profiles
  for each row
  execute function sync_finance_profile_access();
