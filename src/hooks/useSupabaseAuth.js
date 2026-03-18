import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import {
  signInWithGoogle,
  signOut,
  getSession,
  onAuthStateChange,
  getOrCreateProfile,
  getGoogleAccessToken,
} from '../lib/db.js';

const MAX_PROFILE_RETRIES = 3;
const PROFILE_RETRY_DELAY = 1000;

async function getOrCreateProfileWithRetry(user) {
  for (let attempt = 1; attempt <= MAX_PROFILE_RETRIES; attempt++) {
    try {
      const p = await getOrCreateProfile(user);
      if (p && p.org_id) {
        console.log('[auth] Profile loaded on attempt', attempt, '- org:', p.org_id);
        return p;
      }
      console.warn('[auth] Profile attempt', attempt, 'returned:', p);
    } catch (e) {
      console.error('[auth] Profile attempt', attempt, 'error:', e);
    }
    if (attempt < MAX_PROFILE_RETRIES) {
      await new Promise(r => setTimeout(r, PROFILE_RETRY_DELAY * attempt));
    }
  }
  console.error('[auth] All profile creation attempts failed for user:', user.id);
  return null;
}

export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [accessToken, setAccessTokenRaw] = useState(()=>{try{return localStorage.getItem("es_google_token")||null}catch(e){return null}});
  const setAccessToken=(t)=>{setAccessTokenRaw(t);try{if(t)localStorage.setItem("es_google_token",t);else localStorage.removeItem("es_google_token")}catch(e){}};
  const [loading, setLoading] = useState(true);

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
        const p = await getOrCreateProfileWithRetry(session.user);
        if (p) {
          setProfile(p);
        } else {
          console.error('[auth] Could not load/create profile for existing session');
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
        const p = await getOrCreateProfileWithRetry(session.user);
        if (p) {
          setProfile(p);
        } else {
          console.error('[auth] Could not create profile after sign-in');
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setAccessToken(null);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setAccessToken(session.provider_token || null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    console.log('[auth] Initiating Google sign-in');
    await signInWithGoogle();
  }, []);

  const logout = useCallback(async () => {
    if (isSupabaseConfigured()) {
      await signOut();
    }
    setUser(null);
    setProfile(null);
    setAccessToken(null);
    localStorage.removeItem("es_user");
  }, []);

  // For dev mode / localStorage fallback
  const setDevUser = useCallback((u) => {
    setUser(u);
    setProfile({ ...u, org_id: 'local' });
    try { localStorage.setItem("es_user", JSON.stringify(u)); } catch (e) {}
  }, []);

  // Refresh Google token
  const refreshToken = useCallback(async () => {
    const token = await getGoogleAccessToken();
    if(token){setAccessToken(token);return token}
    // Fallback to stored token
    try{const stored=localStorage.getItem("es_google_token");if(stored)return stored}catch(e){}
    return null;
  }, []);

  // Normalize user object so it always has name, email, role
  const normalizedUser = profile ? profile : user ? {
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
    profile,
    accessToken,
    loading,
    login,
    logout,
    setDevUser,
    refreshToken,
    isSupabase: isSupabaseConfigured(),
  };
}
