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
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[db] Profile lookup failed:', profileError);
  }

  if (profile) {
    console.log('[db] Found existing profile:', profile.id, 'org:', profile.org_id);
    return profile;
  }

  // Check if there's an invitation for this email
  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('email', user.email)
    .eq('accepted', false)
    .maybeSingle();

  if (invError) {
    console.error('[db] Invitation lookup failed:', invError);
  }

  if (invitation) {
    console.log('[db] Found invitation for', user.email, 'to org:', invitation.org_id);
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
      return null;
    }

    if (newProfile) {
      // Mark invitation as accepted
      await supabase.from('invitations').update({ accepted: true }).eq('id', invitation.id);
      console.log('[db] Created profile via invitation:', newProfile.id);
    }
    return newProfile;
  }

  // Create new org first, then profile
  const orgName = user.user_metadata?.full_name
    ? `${user.user_metadata.full_name}'s Team`
    : `${user.email.split('@')[0]}'s Team`;

  console.log('[db] Creating new org:', orgName);
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName })
    .select()
    .maybeSingle();

  if (orgError || !org) {
    console.error('[db] Org creation failed:', orgError);
    return null;
  }
  console.log('[db] Created org:', org.id);

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
    // Clean up the orphaned org
    await supabase.from('organizations').delete().eq('id', org.id);
    return null;
  }

  console.log('[db] Created profile:', newProfile?.id, 'org:', newProfile?.org_id);
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
    .from('Files')
    .upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage
    .from('Files')
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
    const { error } = await supabase.storage
      .from('Files')
      .upload(path, blob, { upsert: true, contentType: mime });
    if (error) { console.error('[storage] Upload failed:', error.message); return null; }

    console.log('[storage] Uploaded:', fileName, '→', path);
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
    const { data, error } = await supabase.storage
      .from('Files')
      .download(storagePath);
    if (error || !data) return null;
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(data);
    });
  } catch (e) {
    console.error('[storage] Download error:', e);
    return null;
  }
}

export async function deleteFile(filePath) {
  if (!isSupabaseConfigured()) return;
  await supabase.storage
    .from('Files')
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
