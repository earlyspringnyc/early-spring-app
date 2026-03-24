-- Multi-Organization Support Migration
-- Run this in Supabase SQL Editor AFTER the initial schema is in place.
-- Safe to run on existing data — all changes are additive.

-- ============================================================
-- 1. Allow users to belong to multiple organizations
-- ============================================================

-- Remove the single-org constraint (profiles.user_id was UNIQUE)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;

-- Prevent duplicate memberships in the same org
ALTER TABLE profiles ADD CONSTRAINT profiles_user_org_unique UNIQUE (user_id, org_id);

-- ============================================================
-- 2. User preferences (remembers last active org across sessions)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  last_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
  ON user_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
