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

export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
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
    const timeout = setTimeout(() => setLoading(false), 5000);
    getSession().then(async (session) => {
      if (session?.user) {
        setUser(session.user);
        setAccessToken(session.provider_token || null);
        try {
          const p = await getOrCreateProfile(session.user);
          setProfile(p);
        } catch (e) { console.error('Profile error:', e); }
      }
      clearTimeout(timeout);
      setLoading(false);
    }).catch(e => {
      console.error('Session error:', e);
      clearTimeout(timeout);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        setAccessToken(session.provider_token || null);
        try {
          const p = await getOrCreateProfile(session.user);
          if (p) setProfile(p);
        } catch (e) { console.error('Profile creation error:', e); }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setAccessToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
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
    setAccessToken(token);
    return token;
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
