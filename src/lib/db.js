import { supabase, isSupabaseConfigured } from './supabase.js';

// Raw PostgREST fetch — bypasses supabase-js's internal queue, which can
// hang indefinitely after sign-in in some browser/storage states despite
// our passthrough lock. The auth flow ends up in a deadlock where every
// supabase.from(...) call waits for an internal getSession() that never
// resolves. Going direct via fetch + the JWT we already have skips the
// queue entirely.
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function readStoredJWT() {
  try {
    if (!SUPA_URL) return null;
    const ref = SUPA_URL.match(/https?:\/\/([^.]+)\./)?.[1];
    if (!ref) return null;
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || parsed?.[0]?.access_token || null;
  } catch (e) { return null; }
}

export async function restFetch(path, opts = {}) {
  if (!SUPA_URL || !SUPA_ANON) throw new Error('Supabase env not configured');
  const jwt = opts.jwt || readStoredJWT() || SUPA_ANON;
  const headers = {
    'apikey': SUPA_ANON,
    'Authorization': `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'Prefer': opts.prefer || 'return=representation',
    ...(opts.headers || {}),
  };
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PostgREST ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ============================================================
// Auth
// ============================================================

export async function signInWithGoogle() {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/contacts.other.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
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

// Race a promise against a timeout. Used so a hung Supabase session call
// doesn't lock the UI indefinitely.
function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data: { session } } = await withTimeout(
      supabase.auth.getSession(),
      8000,
      'getSession'
    );
    return session;
  } catch (e) {
    console.warn('[db] getSession failed:', e.message || e);
    return null;
  }
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

// Returns ALL profiles for this user (one per org), creating any from
// pending invitations. Uses raw REST (restFetch) instead of supabase.from()
// because the auth lock can deadlock the supabase-js client right after
// SIGNED_IN, leaving the query queued forever with no HTTP request ever
// hitting the wire.
export async function getOrCreateProfiles(user) {
  if (!isSupabaseConfigured()) return [];

  const enc = encodeURIComponent;

  // 1. Fetch existing profiles
  let profiles = [];
  try {
    profiles = await restFetch(
      `/profiles?select=*,organizations(*)&user_id=eq.${enc(user.id)}&order=created_at.asc`
    ) || [];
  } catch (e) {
    console.error('[db] Profile lookup failed:', e.message || e);
  }

  const existingOrgIds = new Set(profiles.map(p => p.org_id));

  // 2. Pending invitations for this email
  let invitations = [];
  try {
    invitations = await restFetch(
      `/invitations?select=*&email=eq.${enc(user.email)}&accepted=eq.false`
    ) || [];
  } catch (e) {
    console.error('[db] Invitation lookup failed:', e.message || e);
  }

  // 3. Accept each invitation
  for (const invitation of invitations) {
    if (existingOrgIds.has(invitation.org_id)) {
      try {
        await restFetch(`/invitations?id=eq.${enc(invitation.id)}`, {
          method: 'PATCH', body: { accepted: true },
        });
      } catch (e) { console.error('[db] Mark invitation accepted failed:', e.message || e); }
      continue;
    }

    try {
      const inserted = await restFetch(`/profiles?select=*,organizations(*)`, {
        method: 'POST',
        body: {
          user_id: user.id,
          org_id: invitation.org_id,
          name: user.user_metadata?.full_name || user.email.split('@')[0],
          email: user.email,
          avatar_url: user.user_metadata?.avatar_url || '',
          role: invitation.role || 'producer',
        },
      });
      const newProfile = Array.isArray(inserted) ? inserted[0] : inserted;
      if (newProfile) {
        await restFetch(`/invitations?id=eq.${enc(invitation.id)}`, {
          method: 'PATCH', body: { accepted: true },
        });
        profiles.push(newProfile);
        existingOrgIds.add(invitation.org_id);
      }
    } catch (e) {
      console.error('[db] Profile creation via invitation failed:', e.message || e);
    }
  }

  // 4. No profiles at all → create a fresh org + admin profile
  if (profiles.length === 0) {
    const orgName = user.user_metadata?.org_name
      || (user.user_metadata?.full_name ? `${user.user_metadata.full_name}'s Team`
      : `${user.email.split('@')[0]}'s Team`);

    let org = null;
    try {
      const inserted = await restFetch(`/organizations?select=*`, {
        method: 'POST', body: { name: orgName },
      });
      org = Array.isArray(inserted) ? inserted[0] : inserted;
    } catch (e) {
      console.error('[db] Org creation failed:', e.message || e);
      return [];
    }
    if (!org) return [];

    try {
      const inserted = await restFetch(`/profiles?select=*,organizations(*)`, {
        method: 'POST',
        body: {
          user_id: user.id,
          org_id: org.id,
          name: user.user_metadata?.full_name || user.email.split('@')[0],
          email: user.email,
          avatar_url: user.user_metadata?.avatar_url || '',
          role: 'admin',
        },
      });
      const newProfile = Array.isArray(inserted) ? inserted[0] : inserted;
      if (newProfile) profiles.push(newProfile);
    } catch (e) {
      console.error('[db] Profile creation failed:', e.message || e);
      try { await restFetch(`/organizations?id=eq.${enc(org.id)}`, { method: 'DELETE' }); } catch (e2) {}
      return [];
    }
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
  // Role/permissions changes require the change_member_role RPC (admin-only).
  // Other field updates (name, avatar_url) go via direct UPDATE.
  const { role, permissions, ...rest } = updates || {};
  if (role !== undefined || permissions !== undefined) {
    const { error } = await supabase.rpc('change_member_role', {
      target_profile_id: profileId,
      new_role: role ?? null,
      new_permissions: permissions ?? null,
    });
    if (error) {
      console.error('[db] change_member_role failed:', error);
      throw error;
    }
  }
  if (Object.keys(rest).length) {
    const { error } = await supabase.from('profiles').update(rest).eq('id', profileId);
    if (error) { console.error('[db] updateTeamMember failed:', error); throw error; }
  }
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
  if (error) return { error: error.message };

  // Fetch org name and inviter name for the email
  let orgName = 'your team';
  let inviterName = '';
  try {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (org?.name) orgName = org.name;
    if (invitedBy) {
      const { data: inviter } = await supabase.from('profiles').select('name').eq('user_id', invitedBy).limit(1).maybeSingle();
      if (inviter?.name) inviterName = inviter.name;
    }
  } catch (e) {}

  // Send invite email via Edge Function. Failure is non-blocking (the
  // invitation row exists; another sign-in will pick it up), but we
  // surface it so the inviter knows to share the link manually.
  let emailFailed = false;
  try {
    const { error: invokeErr } = await supabase.functions.invoke('send-invite-email', {
      body: { email, orgName, inviterName, role },
    });
    if (invokeErr) { emailFailed = true; console.error('[db] Invite email failed:', invokeErr); }
  } catch (e) {
    emailFailed = true;
    console.error('[db] Invite email failed:', e);
  }

  return { error: null, emailFailed };
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
  // Stamp _serverUpdatedAt so the client can use it as an optimistic-lock
  // precondition on the next write (concurrent-edit detection).
  return (data || []).map(p => ({ ...(p.data || {}), id: p.id, _dbId: p.id, name: p.name, client: p.client, _serverUpdatedAt: p.updated_at }));
}

export async function createProject(orgId, projectData) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
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
    throw error;
  }
  if (!data) throw new Error('Insert returned no data');
  return { ...data.data, id: data.id, _dbId: data.id };
}

// Upsert a project that already has an id (used to recover unsynced
// local-only projects on next load).
export async function upsertProject(orgId, projectData) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('projects')
    .upsert({
      id: projectData.id,
      org_id: orgId,
      name: projectData.name || '',
      client: projectData.client || '',
      data: projectData,
    })
    .select()
    .single();
  if (error) {
    console.error('[db] Upsert project failed:', error);
    throw error;
  }
  if (!data) throw new Error('Upsert returned no data');
  return { ...data.data, id: data.id, _dbId: data.id };
}

// Optimistic concurrency control via the projects.updated_at trigger.
// If `expectedUpdatedAt` is provided, the UPDATE is gated on the row still
// having that timestamp; if a teammate saved in the meantime, count=0 and
// we throw a CONFLICT error so the caller can refetch and merge instead
// of overwriting their work.
export class ProjectConflictError extends Error {
  constructor(projectId, serverUpdatedAt) {
    super('Project was modified by another user');
    this.code = 'CONFLICT';
    this.projectId = projectId;
    this.serverUpdatedAt = serverUpdatedAt;
  }
}

export async function updateProject(projectId, projectData, opts = {}) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  let q = supabase
    .from('projects')
    .update({
      name: projectData.name || '',
      client: projectData.client || '',
      data: projectData,
    })
    .eq('id', projectId);
  if (opts.expectedUpdatedAt) q = q.eq('updated_at', opts.expectedUpdatedAt);
  // Return the new updated_at so callers can stash it for the next write.
  const { data, error } = await q.select('updated_at').maybeSingle();
  if (error) {
    console.error('[db] Update project failed:', error);
    if (error.message?.includes('too large') || error.code === '54000') {
      console.error('[db] Project data may be too large. Consider moving files to Google Drive.');
    }
    throw error;
  }
  // No row matched — either project deleted or precondition failed.
  if (!data && opts.expectedUpdatedAt) {
    // Look up current updated_at so the caller can show a sensible conflict.
    const { data: cur } = await supabase
      .from('projects').select('updated_at').eq('id', projectId).maybeSingle();
    throw new ProjectConflictError(projectId, cur?.updated_at);
  }
  return data?.updated_at;
}

export async function deleteProject(projectId, orgId) {
  if (!isSupabaseConfigured()) return;
  const { error, count } = await supabase
    .from('projects')
    .delete({ count: 'exact' })
    .eq('id', projectId);
  if (error) {
    console.error('[db] Delete project failed:', error);
    const msg = error.code === '42501' || /policy|permission/i.test(error.message || '')
      ? 'You don’t have permission to delete this project.'
      : 'Could not delete project. Try again.';
    import('./toast.js').then(({ toast }) => toast.error(msg));
    throw error;
  }
  if (count === 0) {
    // RLS allowed the call but no row was affected — likely policy denied
    // the row. Surface so the producer knows it didn't take effect.
    import('./toast.js').then(({ toast }) => toast.error('You don’t have permission to delete this project.'));
    return;
  }
  // Server-side tombstone — prevents another browser's stale cache from
  // resurrecting this project via the merge-on-load recovery pass.
  if (orgId && orgId !== 'local') {
    try {
      await supabase
        .from('project_tombstones')
        .upsert({ project_id: projectId, org_id: orgId }, { onConflict: 'project_id' });
    } catch (e) { console.warn('[db] Tombstone write failed (table may not exist yet):', e); }
  }
}

// Returns a Set of project_ids that have been deleted in this org.
export async function getTombstoneIds(orgId) {
  if (!isSupabaseConfigured() || !orgId || orgId === 'local') return new Set();
  try {
    const { data, error } = await supabase
      .from('project_tombstones')
      .select('project_id')
      .eq('org_id', orgId);
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) return new Set();
      console.warn('[db] Tombstone fetch failed:', error);
      return new Set();
    }
    return new Set((data || []).map(r => r.project_id));
  } catch (e) {
    console.warn('[db] Tombstone fetch threw:', e);
    return new Set();
  }
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
  if (error) {
    console.error('[db] Update vendor failed:', error);
    import('./toast.js').then(({ toast }) => toast.error('Could not save vendor. Will retry.'));
    throw error;
  }
}

export async function deleteVendorDb(vendorId) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
  if (error) {
    console.error('[db] Delete vendor failed:', error);
    import('./toast.js').then(({ toast }) => toast.error('Could not delete vendor.'));
    throw error;
  }
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
  // Signed URL — short-lived, scoped to the requester. Bucket is private
  // post-migration, so getPublicUrl no longer works for cross-user reads.
  const { data: urlData } = await supabase.storage
    .from('files')
    .createSignedUrl(path, 60 * 60); // 1 hour
  return urlData?.signedUrl || null;
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
