import { supabase, isSupabaseConfigured } from './supabase.js';

// ============================================================
// Auth
// ============================================================

export async function signInWithGoogle() {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/contacts.other.readonly',
      redirectTo: window.location.origin,
    },
  });
  return { data, error };
}

export async function signOut() {
  if (!isSupabaseConfigured()) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured()) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}

// ============================================================
// Profile & Organization (on first sign-in)
// ============================================================

export async function getOrCreateProfile(user) {
  if (!isSupabaseConfigured()) return null;

  // Check if profile exists
  let { data: profile } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
    .single();

  if (profile) return profile;

  // Check if there's an invitation for this email
  const { data: invitation } = await supabase
    .from('invitations')
    .select('*')
    .eq('email', user.email)
    .eq('accepted', false)
    .single();

  if (invitation) {
    // Accept invitation — join existing org
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        user_id: user.id,
        org_id: invitation.org_id,
        name: user.user_metadata?.full_name || user.email.split('@')[0],
        email: user.email,
        avatar_url: user.user_metadata?.avatar_url || '',
        role: invitation.role || 'producer',
      })
      .select('*, organizations(*)')
      .single();

    // Mark invitation as accepted
    await supabase
      .from('invitations')
      .update({ accepted: true })
      .eq('id', invitation.id);

    return newProfile;
  }

  // No invitation — create new org and profile
  const orgName = user.user_metadata?.full_name
    ? `${user.user_metadata.full_name}'s Team`
    : `${user.email.split('@')[0]}'s Team`;

  const { data: org } = await supabase
    .from('organizations')
    .insert({ name: orgName })
    .select()
    .single();

  if (!org) return null;

  const { data: newProfile } = await supabase
    .from('profiles')
    .insert({
      user_id: user.id,
      org_id: org.id,
      name: user.user_metadata?.full_name || user.email.split('@')[0],
      email: user.email,
      avatar_url: user.user_metadata?.avatar_url || '',
      role: 'admin',
    })
    .select('*, organizations(*)')
    .single();

  return newProfile;
}

// ============================================================
// Team Management
// ============================================================

export async function getTeamMembers(orgId) {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at');
  return data || [];
}

export async function updateTeamMember(profileId, updates) {
  if (!isSupabaseConfigured()) return;
  await supabase
    .from('profiles')
    .update(updates)
    .eq('id', profileId);
}

export async function removeTeamMember(profileId) {
  if (!isSupabaseConfigured()) return;
  await supabase
    .from('profiles')
    .delete()
    .eq('id', profileId);
}

export async function inviteTeamMember(orgId, email, role, invitedBy) {
  if (!isSupabaseConfigured()) return;
  await supabase
    .from('invitations')
    .insert({ org_id: orgId, email, role, invited_by: invitedBy });
}

// ============================================================
// Projects
// ============================================================

export async function getProjects(orgId) {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  return (data || []).map(p => ({ ...p.data, id: p.id, _dbId: p.id, name: p.name, client: p.client }));
}

export async function createProject(orgId, projectData) {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      name: projectData.name,
      client: projectData.client,
      data: projectData,
    })
    .select()
    .single();
  if (data) return { ...data.data, id: data.id, _dbId: data.id };
  return null;
}

export async function updateProject(projectId, projectData) {
  if (!isSupabaseConfigured()) return;
  await supabase
    .from('projects')
    .update({
      name: projectData.name,
      client: projectData.client,
      data: projectData,
    })
    .eq('id', projectId);
}

export async function deleteProject(projectId) {
  if (!isSupabaseConfigured()) return;
  await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);
}

// ============================================================
// File Storage
// ============================================================

export async function uploadFile(orgId, projectId, file) {
  if (!isSupabaseConfigured()) return null;
  const path = `${orgId}/${projectId}/${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage
    .from('files')
    .upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage
    .from('files')
    .getPublicUrl(path);
  return urlData?.publicUrl || null;
}

export async function deleteFile(filePath) {
  if (!isSupabaseConfigured()) return;
  await supabase.storage
    .from('files')
    .remove([filePath]);
}

// ============================================================
// Google Access Token (from Supabase session)
// ============================================================

export async function getGoogleAccessToken() {
  if (!isSupabaseConfigured()) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.provider_token || null;
}
