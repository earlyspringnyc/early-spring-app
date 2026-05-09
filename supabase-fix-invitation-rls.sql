-- Fix invitation RLS — auth.users isn't readable by authenticated role,
-- so the existing policies (which join auth.users) raise:
--   PostgREST 403: permission denied for table users
-- Replace with auth.jwt() ->> 'email' which is always available to the
-- authenticated role from the JWT itself.

drop policy if exists "invitation_select" on invitations;
drop policy if exists "invitation_update" on invitations;

create policy "invitation_select" on invitations for select using (
  email = (auth.jwt() ->> 'email')
  or org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);

create policy "invitation_update" on invitations for update using (
  email = (auth.jwt() ->> 'email')
  or org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin')
);
