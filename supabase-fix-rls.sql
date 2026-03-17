-- Fix RLS for new user signup flow
-- Drop existing policies that may conflict
DROP POLICY IF EXISTS "Users can view their own org" ON organizations;
DROP POLICY IF EXISTS "Users can update their own org" ON organizations;
DROP POLICY IF EXISTS "Anyone can create an org" ON organizations;
DROP POLICY IF EXISTS "Users can view profiles in their org" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can manage profiles in their org" ON profiles;
DROP POLICY IF EXISTS "New users can create their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view projects in their org" ON projects;
DROP POLICY IF EXISTS "Producers and admins can create projects" ON projects;
DROP POLICY IF EXISTS "Producers and admins can update projects" ON projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;

-- Organizations: anyone can create, members can view/update
CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "org_select" ON organizations FOR SELECT USING (
  id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (
  id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Profiles: users can create their own, view org members, update own
CREATE POLICY "profile_insert" ON profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "profile_select" ON profiles FOR SELECT USING (
  user_id = auth.uid() OR
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "profile_update" ON profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "profile_delete" ON profiles FOR DELETE USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  AND user_id != auth.uid()
);

-- Projects: org members can view, producers/admins can create/update, admins can delete
CREATE POLICY "project_select" ON projects FOR SELECT USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "project_insert" ON projects FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'producer'))
);
CREATE POLICY "project_update" ON projects FOR UPDATE USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'producer'))
);
CREATE POLICY "project_delete" ON projects FOR DELETE USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Vendors: same as projects
DROP POLICY IF EXISTS "Users can view vendors in their org" ON vendors;
DROP POLICY IF EXISTS "Producers and admins can manage vendors" ON vendors;
CREATE POLICY "vendor_select" ON vendors FOR SELECT USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "vendor_insert" ON vendors FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'producer'))
);
CREATE POLICY "vendor_update" ON vendors FOR UPDATE USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'producer'))
);
CREATE POLICY "vendor_delete" ON vendors FOR DELETE USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'producer'))
);

-- Invitations: admins manage, users can see their own
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
DROP POLICY IF EXISTS "Anyone can view their own invitation" ON invitations;
CREATE POLICY "invitation_select" ON invitations FOR SELECT USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  OR org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "invitation_insert" ON invitations FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "invitation_update" ON invitations FOR UPDATE USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  OR org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "invitation_delete" ON invitations FOR DELETE USING (
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);
