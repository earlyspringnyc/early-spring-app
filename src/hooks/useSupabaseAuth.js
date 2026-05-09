import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

// Per-attempt timeout — if supabase-js's auth client is in a hung state,
// the SELECT inside getOrCreateProfiles can hang forever and the retry
// loop never fires. Race it against a deadline.
function withProfileTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`getOrCreateProfiles timed out after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// Retry profile fetch up to MAX_PROFILE_RETRIES times, then trigger a
// hard recovery (clear sb-* state and reload). A signed-in user without
// a profile is a broken state — we'd rather kick them back to the login
// screen than leave them trapped on the loading spinner.
const MAX_PROFILE_RETRIES = 4;
async function getOrCreateProfilesWithRetry(user, onRetry, onGiveUp) {
  for (let attempt = 1; attempt <= MAX_PROFILE_RETRIES; attempt++) {
    try {
      const profiles = await withProfileTimeout(getOrCreateProfiles(user), 10000);
      if (profiles?.length && profiles[0].org_id) {
        console.log('[auth] Profiles loaded on attempt', attempt, '- orgs:', profiles.map(p => p.org_id));
        return profiles;
      }
      console.warn('[auth] Profile attempt', attempt, 'returned:', profiles);
    } catch (e) {
      console.error('[auth] Profile attempt', attempt, 'error:', e?.message || e);
    }
    if (onRetry) onRetry(attempt);
    if (attempt < MAX_PROFILE_RETRIES) {
      const delay = Math.min(8000, 1000 * Math.pow(1.5, attempt - 1));
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.error('[auth] All profile attempts failed — forcing sign-out');
  if (onGiveUp) onGiveUp();
  return [];
}

export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [accessToken, setAccessTokenRaw] = useState(()=>{try{return localStorage.getItem("es_google_token")||null}catch(e){return null}});
  const setAccessToken=(t)=>{setAccessTokenRaw(t);try{if(t)localStorage.setItem("es_google_token",t);else localStorage.removeItem("es_google_token")}catch(e){}};
  const [loading, setLoading] = useState(true);
  // Forward ref so getOrCreateProfilesWithRetry's onGiveUp can call
  // forceSignOutAndReload (defined further down in this hook).
  const forceSignOutAndReloadRef = useRef(null);

  // Derive current profile from profiles + currentOrgId
  const currentProfile = useMemo(() => {
    if (!profiles.length) return null;
    return profiles.find(p => p.org_id === currentOrgId) || profiles[0];
  }, [profiles, currentOrgId]);

  // Derive organizations list
  const organizations = useMemo(() => {
    return profiles.map(p => p.organizations).filter(Boolean);
  }, [profiles]);

  // Initialize profiles and pick the active org. If all retries fail, the
  // supabase-js client is most likely in a hung state — clear sb-* and
  // reload, which puts the user back on the login screen with a clean
  // session instead of trapping them on the loading spinner forever.
  const initProfiles = useCallback(async (authUser) => {
    const allProfiles = await getOrCreateProfilesWithRetry(
      authUser,
      null,
      () => forceSignOutAndReloadRef.current?.('profile load failed after retries — likely stuck supabase-js client')
    );
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

  // Nuke all Supabase auth state and bounce to login. Used when a stale
  // session token causes the profile fetch to hang indefinitely.
  const forceSignOutAndReload = useCallback((reason) => {
    console.warn('[auth] Forcing sign-out:', reason);
    try {
      Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
      Object.keys(sessionStorage).filter(k => k.startsWith('sb-')).forEach(k => sessionStorage.removeItem(k));
      document.cookie.split(';').forEach(c => {
        const name = c.split('=')[0].trim();
        if (name.startsWith('sb-')) document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      });
    } catch (e) {}
    if (typeof window !== 'undefined') window.location.href = '/';
  }, []);
  // Make the recovery available to getOrCreateProfilesWithRetry (declared
  // above the hook). Stored in a ref because the function is defined later.
  forceSignOutAndReloadRef.current = forceSignOutAndReload;

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

    // Race the session check against a longer-than-before timeout. The
    // timeout no longer drops us into a fake "local" mode — it just stops
    // showing the boot loader so the user can see the login screen if they
    // weren't signed in. Profiles continue loading in the background.
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('[auth] Session check slow (>15s) — showing UI; profile load continues in background');
        setLoading(false);
      }
    }, 15000);

    getSession().then(async (session) => {
      resolved = true;
      clearTimeout(timeout);
      if (session?.user) {
        console.log('[auth] Existing session found for:', session.user.email);
        setUser(session.user);
        setAccessToken(session.provider_token || null);
        // Don't await — render the loading screen while profiles load, but
        // never let the timeout fall through into a broken signed-in state.
        initProfiles(session.user).catch(e => console.error('[auth] initProfiles error:', e));
      } else {
        console.log('[auth] No existing session');
      }
      setLoading(false);
    }).catch(e => {
      resolved = true;
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

  // Normalize user object so it always has name, email, role.
  // CRITICAL: If a Supabase user is signed in but profiles haven't loaded
  // yet, we return null org_id (NOT 'local'). 'local' is the legacy
  // localStorage-only mode and writing project data with that org_id means
  // it never reaches Supabase. The app should treat a null org_id as
  // "still loading" and not let users create/edit projects until profiles
  // arrive.
  const normalizedUser = currentProfile ? currentProfile : user ? {
    ...user,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '',
    email: user.email || '',
    role: 'admin',
    avatar_url: user.user_metadata?.avatar_url || '',
    org_id: null,
    _profilePending: true,
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
    forceSignOutAndReload,         // self-heal hook for stuck auth states
    isSupabase: isSupabaseConfigured(),
  };
}
