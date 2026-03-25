import { supabase, isSupabaseConfigured } from './supabase.js';

// ============================================================
// Auth
// ============================================================

export async function signInWithGoogle() {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/contacts.other.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
      redirectTo: window.location.origin,
    },
  });
  return { data, error };
}

export async function signUpWithEmail(email, password, fullName, orgName) {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, org_name: orgName },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function signInWithEmail(email, password) {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
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

// Legacy single-profile wrapper (kept for backward compat)
export async function getOrCreateProfile(user) {
  const profiles = await getOrCreateProfiles(user);
  return profiles?.[0] || null;
}

// Returns ALL profiles for this user (one per org), creating any from pending invitations
export async function getOrCreateProfiles(user) {
  if (!isSupabaseConfigured()) return [];

  // 1. Fetch all existing profiles for this user
  const { data: existingProfiles, error: profileError } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at');

  if (profileError) {
    console.error('[db] Profile lookup failed:', profileError);
  }

  const profiles = existingProfiles || [];
  const existingOrgIds = new Set(profiles.map(p => p.org_id));

  // 2. Check for ALL pending invitations for this email
  const { data: invitations, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('email', user.email)
    .eq('accepted', false);

  if (invError) {
    console.error('[db] Invitation lookup failed:', invError);
  }

  // 3. Accept each invitation that doesn't duplicate an existing membership
  if (invitations?.length) {
    for (const invitation of invitations) {
      if (existingOrgIds.has(invitation.org_id)) {
        // Already a member — just mark accepted
        await supabase.from('invitations').update({ accepted: true }).eq('id', invitation.id);
        console.log('[db] Invitation to org', invitation.org_id, 'skipped (already member)');
        continue;
      }

      console.log('[db] Accepting invitation for', user.email, 'to org:', invitation.org_id);
      const { data: newProfile, error } = await supabase
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
        .maybeSingle();

      if (error) {
        console.error('[db] Profile creation via invitation failed:', error);
        continue;
      }

      if (newProfile) {
        await supabase.from('invitations').update({ accepted: true }).eq('id', invitation.id);
        profiles.push(newProfile);
        existingOrgIds.add(invitation.org_id);
        console.log('[db] Created profile via invitation:', newProfile.id);
      }
    }
  }

  // 4. If user has no profiles at all, create a new org + admin profile
  if (profiles.length === 0) {
    const orgName = user.user_metadata?.org_name
      || (user.user_metadata?.full_name ? `${user.user_metadata.full_name}'s Team`
      : `${user.email.split('@')[0]}'s Team`);

    console.log('[db] Creating new org:', orgName);
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName })
      .select()
      .maybeSingle();

    if (orgError || !org) {
      console.error('[db] Org creation failed:', orgError);
      return [];
    }

    const { data: newProfile, error: profError } = await supabase
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
      .maybeSingle();

    if (profError) {
      console.error('[db] Profile creation failed:', profError);
      await supabase.from('organizations').delete().eq('id', org.id);
      return [];
    }

    if (newProfile) profiles.push(newProfile);
    console.log('[db] Created profile:', newProfile?.id, 'org:', newProfile?.org_id);
  }

  return profiles;
}

// Fetch all profiles for a user (without creating anything)
export async function getUserProfiles(userId) {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('user_id', userId)
    .order('created_at');
  return data || [];
}

// ============================================================
// User Preferences (last active org)
// ============================================================

export async function getLastActiveOrg(userId) {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase
    .from('user_preferences')
    .select('last_org_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.last_org_id || null;
}

export async function setLastActiveOrg(userId, orgId) {
  if (!isSupabaseConfigured()) return;
  await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, last_org_id: orgId, updated_at: new Date().toISOString() });
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
  if (!isSupabaseConfigured()) return { error: 'Not configured' };

  // Guard: check if already a member of this org
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle();
  if (existing) return { error: 'Already a member of this organization' };

  // Guard: check if there's already a pending invitation
  const { data: pendingInv } = await supabase
    .from('invitations')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .eq('accepted', false)
    .maybeSingle();
  if (pendingInv) return { error: 'Invitation already pending' };

  const { error } = await supabase
    .from('invitations')
    .insert({ org_id: orgId, email, role, invited_by: invitedBy });
  return { error: error?.message || null };
}

export async function getPendingInvitations(orgId) {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase
    .from('invitations')
    .select('*')
    .eq('org_id', orgId)
    .eq('accepted', false)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function revokeInvitation(invitationId) {
  if (!isSupabaseConfigured()) return;
  await supabase.from('invitations').delete().eq('id', invitationId);
}

// ============================================================
// Projects
// ============================================================

export async function getProjects(orgId) {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[db] Get projects failed:', error);
    return [];
  }
  return (data || []).map(p => ({ ...(p.data || {}), id: p.id, _dbId: p.id, name: p.name, client: p.client }));
}

export async function createProject(orgId, projectData) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      name: projectData.name,
      client: projectData.client,
      data: projectData,
    })
    .select()
    .single();
  if (error) {
    console.error('[db] Create project failed:', error);
    return null;
  }
  if (data) return { ...data.data, id: data.id, _dbId: data.id };
  return null;
}

export async function updateProject(projectId, projectData) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase
    .from('projects')
    .update({
      name: projectData.name || '',
      client: projectData.client || '',
      data: projectData,
    })
    .eq('id', projectId);
  if (error) {
    console.error('[db] Update project failed:', error);
    // Surface the error so the user knows
    if (error.message?.includes('too large') || error.code === '54000') {
      console.error('[db] Project data may be too large. Consider moving files to Google Drive.');
    }
  }
}

export async function deleteProject(projectId) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);
  if (error) console.error('[db] Delete project failed:', error);
}

// ============================================================
// Shared Vendor Registry (org-level)
// ============================================================

export async function getVendors(orgId) {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('org_id', orgId)
    .order('name');
  if (error) { console.error('[db] Get vendors failed:', error); return []; }
  return data || [];
}

export async function createVendor(orgId, vendor) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      org_id: orgId,
      name: vendor.name,
      email: vendor.email || '',
      phone: vendor.phone || '',
      notes: vendor.notes || '',
      vendor_type: vendor.vendorType || 'other',
      w9_status: vendor.w9Status || 'pending',
    })
    .select()
    .maybeSingle();
  if (error) { console.error('[db] Create vendor failed:', error); return null; }
  // Map to app format
  return data ? { ...data, vendorType: data.vendor_type, w9Status: data.w9_status } : null;
}

export async function updateVendorDb(vendorId, updates) {
  if (!isSupabaseConfigured()) return;
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.vendorType !== undefined) dbUpdates.vendor_type = updates.vendorType;
  if (updates.w9Status !== undefined) dbUpdates.w9_status = updates.w9Status;
  const { error } = await supabase.from('vendors').update(dbUpdates).eq('id', vendorId);
  if (error) console.error('[db] Update vendor failed:', error);
}

export async function deleteVendorDb(vendorId) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
  if (error) console.error('[db] Delete vendor failed:', error);
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

// Upload base64 data URL to Supabase Storage (private bucket)
export async function uploadFileData(orgId, projectId, fileId, fileName, dataUrl) {
  if (!isSupabaseConfigured() || !dataUrl) return null;
  try {
    // Convert base64 data URL to blob
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const byteStr = atob(parts[1]);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    const blob = new Blob([ab], { type: mime });

    const path = `${orgId}/${projectId}/${fileId}_${fileName}`;
    console.log('[storage] Attempting upload:', path, `(${Math.round(blob.size/1024)}KB, ${mime})`);

    // Use direct REST API — get token from localStorage to avoid hanging auth calls
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    let token = null;
    try {
      // Find Supabase session in localStorage
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      for (const k of keys) {
        const raw = JSON.parse(localStorage.getItem(k));
        if (raw?.access_token) { token = raw.access_token; break; }
      }
    } catch (e) {}
    if (!token) { console.error('[storage] No auth token found'); return null; }

    const res = await fetch(`${supabaseUrl}/storage/v1/object/files/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token || anonKey}`,
        'apikey': anonKey,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
      body: blob,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[storage] Upload FAILED:', res.status, errText);
      return null;
    }

    console.log('[storage] SUCCESS:', fileName, '→', path);
    return { storagePath: path };
  } catch (e) {
    console.error('[storage] Upload error:', e);
    return null;
  }
}

// Download file from Supabase Storage as base64 data URL
export async function downloadFileData(storagePath) {
  if (!isSupabaseConfigured() || !storagePath) return null;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    let token = null;
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      for (const k of keys) {
        const raw = JSON.parse(localStorage.getItem(k));
        if (raw?.access_token) { token = raw.access_token; break; }
      }
    } catch (e) {}

    const res = await fetch(`${supabaseUrl}/storage/v1/object/files/${encodeURIComponent(storagePath)}`, {
      headers: {
        'Authorization': `Bearer ${token || anonKey}`,
        'apikey': anonKey,
      },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('[storage] Download error:', e);
    return null;
  }
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
