import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  onAuthStateChange,
  getOrCreateProfiles,
  getLastActiveOrg,
  setLastActiveOrg,
  getGoogleAccessToken,
} from '../lib/db.js';

const MAX_PROFILE_RETRIES = 3;
const PROFILE_RETRY_DELAY = 1000;

async function getOrCreateProfilesWithRetry(user) {
  for (let attempt = 1; attempt <= MAX_PROFILE_RETRIES; attempt++) {
    try {
      const profiles = await getOrCreateProfiles(user);
      if (profiles?.length && profiles[0].org_id) {
        console.log('[auth] Profiles loaded on attempt', attempt, '- orgs:', profiles.map(p => p.org_id));
        return profiles;
      }
      console.warn('[auth] Profile attempt', attempt, 'returned:', profiles);
    } catch (e) {
      console.error('[auth] Profile attempt', attempt, 'error:', e);
    }
    if (attempt < MAX_PROFILE_RETRIES) {
      await new Promise(r => setTimeout(r, PROFILE_RETRY_DELAY * attempt));
    }
  }
  console.error('[auth] All profile creation attempts failed for user:', user.id);
  return [];
}

export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [accessToken, setAccessTokenRaw] = useState(()=>{try{return localStorage.getItem("es_google_token")||null}catch(e){return null}});
  const setAccessToken=(t)=>{setAccessTokenRaw(t);try{if(t)localStorage.setItem("es_google_token",t);else localStorage.removeItem("es_google_token")}catch(e){}};
  const [loading, setLoading] = useState(true);

  // Derive current profile from profiles + currentOrgId
  const currentProfile = useMemo(() => {
    if (!profiles.length) return null;
    return profiles.find(p => p.org_id === currentOrgId) || profiles[0];
  }, [profiles, currentOrgId]);

  // Derive organizations list
  const organizations = useMemo(() => {
    return profiles.map(p => p.organizations).filter(Boolean);
  }, [profiles]);

  // Initialize profiles and pick the active org
  const initProfiles = useCallback(async (authUser) => {
    const allProfiles = await getOrCreateProfilesWithRetry(authUser);
    setProfiles(allProfiles);

    if (allProfiles.length) {
      // Try to restore last active org
      const lastOrg = await getLastActiveOrg(authUser.id);
      const validOrg = allProfiles.find(p => p.org_id === lastOrg);
      const orgId = validOrg ? validOrg.org_id : allProfiles[0].org_id;
      setCurrentOrgId(orgId);
    }

    return allProfiles;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // Fallback to localStorage
      try {
        const s = localStorage.getItem("es_user");
        if (s) {
          const u = JSON.parse(s);
          if (u && u.role && u.email) setUser(u);
        }
      } catch (e) {}
      setLoading(false);
      return;
    }

    // Check existing session with timeout
    const timeout = setTimeout(() => {
      console.warn('[auth] Session check timed out after 5s');
      setLoading(false);
    }, 5000);

    getSession().then(async (session) => {
      if (session?.user) {
        console.log('[auth] Existing session found for:', session.user.email);
        setUser(session.user);
        setAccessToken(session.provider_token || null);
        const allProfiles = await initProfiles(session.user);
        if (!allProfiles?.length) {
          console.error('[auth] Could not load/create profiles for existing session');
        }
      } else {
        console.log('[auth] No existing session');
      }
      clearTimeout(timeout);
      setLoading(false);
    }).catch(e => {
      console.error('[auth] Session error:', e);
      clearTimeout(timeout);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      console.log('[auth] Auth state change:', event);
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        setAccessToken(session.provider_token || null);
        const allProfiles = await initProfiles(session.user);
        if (!allProfiles?.length) {
          console.error('[auth] Could not create profiles after sign-in');
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfiles([]);
        setCurrentOrgId(null);
        setAccessToken(null);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setAccessToken(session.provider_token || null);
      }
    });

    return () => subscription.unsubscribe();
  }, [initProfiles]);

  const login = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    console.log('[auth] Initiating Google sign-in');
    await signInWithGoogle();
  }, []);

  const loginWithEmail = useCallback(async (email, password) => {
    if (!isSupabaseConfigured()) return { error: 'Not configured' };
    const result = await signInWithEmail(email, password);
    return result;
  }, []);

  const signUp = useCallback(async (email, password, fullName, orgName) => {
    if (!isSupabaseConfigured()) return { error: 'Not configured' };
    const result = await signUpWithEmail(email, password, fullName, orgName);
    return result;
  }, []);

  const logout = useCallback(async () => {
    if (isSupabaseConfigured()) {
      await signOut();
    }
    setUser(null);
    setProfiles([]);
    setCurrentOrgId(null);
    setAccessToken(null);
    localStorage.removeItem("es_user");
  }, []);

  // For dev mode / localStorage fallback
  const setDevUser = useCallback((u) => {
    setUser(u);
    setProfiles([{ ...u, org_id: 'local', organizations: { id: 'local', name: 'Local' } }]);
    setCurrentOrgId('local');
    try { localStorage.setItem("es_user", JSON.stringify(u)); } catch (e) {}
  }, []);

  // Switch active organization
  const switchOrg = useCallback(async (orgId) => {
    setCurrentOrgId(orgId);
    if (user?.id) {
      await setLastActiveOrg(user.id, orgId);
    }
  }, [user]);

  // Refresh Google token
  const refreshToken = useCallback(async () => {
    const token = await getGoogleAccessToken();
    if(token){setAccessToken(token);return token}
    try{const stored=localStorage.getItem("es_google_token");if(stored)return stored}catch(e){}
    return null;
  }, []);

  // Normalize user object so it always has name, email, role
  const normalizedUser = currentProfile ? currentProfile : user ? {
    ...user,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '',
    email: user.email || '',
    role: 'admin',
    avatar_url: user.user_metadata?.avatar_url || '',
    org_id: 'local',
  } : null;

  return {
    user: normalizedUser,
    rawUser: user,
    profile: currentProfile,       // backward-compatible: active org's profile
    profiles,                      // all org memberships
    currentOrgId,                  // active org id
    switchOrg,                     // function to switch orgs
    organizations,                 // convenience: array of org objects
    accessToken,
    loading,
    login,
    loginWithEmail,
    signUp,
    logout,
    setDevUser,
    refreshToken,
    isSupabase: isSupabaseConfigured(),
  };
}
