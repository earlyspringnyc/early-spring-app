import { useState, useCallback, useEffect, useRef } from 'react';
import { getStoredUsers } from '../utils/storage.js';

export function useGoogleAuth() {
  // Holds the resolver for an in-flight requestCalendarAccess() so the
  // token-client callback can hand the new token back to the awaiter.
  const pendingResolveRef = useRef(null);
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem("es_user");
      if (s) {
        const u = JSON.parse(s);
        if (u && u.role && u.email) return u;
        localStorage.removeItem("es_user");
      }
    } catch (e) { localStorage.removeItem("es_user"); }
    return null;
  });
  const [accessToken, setAccessToken] = useState(() => {
    try { return localStorage.getItem("es_google_token") || null; } catch (e) { return null; }
  });
  const [tokenClient, setTokenClient] = useState(null);

  // Save user to localStorage
  useEffect(() => {
    try {
      if (user) localStorage.setItem("es_user", JSON.stringify(user));
      else localStorage.removeItem("es_user");
    } catch (e) {}
  }, [user]);

  // Save token
  useEffect(() => {
    try {
      if (accessToken) localStorage.setItem("es_google_token", accessToken);
      else localStorage.removeItem("es_google_token");
    } catch (e) {}
  }, [accessToken]);

  // Initialize token client for Calendar/Gmail scopes
  const initTokenClient = useCallback((clientId) => {
    if (!window.google?.accounts?.oauth2) return;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/contacts.other.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
      callback: (response) => {
        const token = response?.access_token || null;
        if (token) setAccessToken(token);
        const resolve = pendingResolveRef.current;
        pendingResolveRef.current = null;
        if (resolve) resolve(token);
      },
      error_callback: () => {
        const resolve = pendingResolveRef.current;
        pendingResolveRef.current = null;
        if (resolve) resolve(null);
      },
    });
    setTokenClient(client);
  }, []);

  // Google Sign-In with ID token (for authentication)
  const signIn = useCallback((clientId, onSuccess) => {
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        // Decode the JWT credential
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        const email = payload.email;
        const name = payload.name || payload.given_name || email.split('@')[0];
        const avatar = payload.picture || '';

        // Check if user is in the team
        const team = getStoredUsers();
        const teamMember = team.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (teamMember) {
          const u = { ...teamMember, name: name, avatar: avatar, googleId: payload.sub };
          setUser(u);
          if (onSuccess) onSuccess(u);
        } else {
          // Not in team — reject or create as viewer
          if (onSuccess) onSuccess(null, 'Not authorized. Ask an admin to add ' + email + ' to the team.');
        }
      },
    });
    window.google.accounts.id.prompt();
  }, []);

  // Render the Google Sign-In button
  const renderButton = useCallback((elementId, clientId) => {
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        const email = payload.email;
        const name = payload.name || payload.given_name || email.split('@')[0];
        const avatar = payload.picture || '';
        const team = getStoredUsers();
        const teamMember = team.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (teamMember) {
          setUser({ ...teamMember, name, avatar, googleId: payload.sub });
        }
      },
    });
    window.google.accounts.id.renderButton(
      document.getElementById(elementId),
      { theme: 'filled_black', size: 'large', width: '100%', text: 'continue_with' }
    );
  }, []);

  // Request Calendar/Gmail access token. Returns a Promise that resolves
  // with the new access token (or null if denied / not initialized) so
  // callers can `await` the result and use the token immediately.
  const requestCalendarAccess = useCallback(() => {
    return new Promise((resolve) => {
      if (!tokenClient) { resolve(null); return; }
      // If a previous request is still pending, resolve it with null so we
      // never strand a caller.
      const prev = pendingResolveRef.current;
      pendingResolveRef.current = resolve;
      if (prev) prev(null);
      try { tokenClient.requestAccessToken(); }
      catch (e) {
        pendingResolveRef.current = null;
        resolve(null);
      }
    });
  }, [tokenClient]);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem("es_user");
    localStorage.removeItem("es_google_token");
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  return { user, setUser, accessToken, signIn, renderButton, initTokenClient, requestCalendarAccess, logout };
}
