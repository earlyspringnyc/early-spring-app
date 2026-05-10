import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { restFetch } from '../lib/db.js';

// Personal sticky notes. RLS scopes everything to auth.uid() so we
// don't need to filter by user_id on the client. Uses restFetch (raw
// PostgREST) to stay immune to the supabase-js auth-lock deadlock that
// stalled the profile fetch earlier in this build.
export function useUserNotes(userId) {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Per-note debounce so rapid typing doesn't fire a write per keystroke.
  const saveTimers = useRef(new Map());

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !userId) { setLoaded(true); return; }
    try {
      const rows = await restFetch('/user_notes?select=*&order=sort_order.asc,created_at.asc');
      setNotes(rows || []);
    } catch (e) {
      console.error('[notes] load failed:', e.message || e);
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async (color = 'yellow') => {
    if (!isSupabaseConfigured() || !userId) return null;
    const sortOrder = notes.length > 0 ? Math.max(...notes.map(n => n.sort_order || 0)) + 1 : 0;
    try {
      const inserted = await restFetch('/user_notes?select=*', {
        method: 'POST',
        body: { user_id: userId, content: '', color, sort_order: sortOrder },
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) setNotes(prev => [...prev, row]);
      return row;
    } catch (e) {
      console.error('[notes] add failed:', e.message || e);
      return null;
    }
  }, [userId, notes]);

  const updateNote = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
    if (!isSupabaseConfigured()) return;
    const existing = saveTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      saveTimers.current.delete(id);
      try {
        await restFetch(`/user_notes?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', body: patch, prefer: 'return=minimal',
        });
      } catch (e) { console.error('[notes] save failed:', e.message || e); }
    }, 500);
    saveTimers.current.set(id, t);
  }, []);

  const deleteNote = useCallback(async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (!isSupabaseConfigured()) return;
    try {
      await restFetch(`/user_notes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) { console.error('[notes] delete failed:', e.message || e); }
  }, []);

  // Flush pending debounced writes — call before the user navigates away
  // so an in-progress edit doesn't get lost.
  useEffect(() => {
    const flush = () => {
      const timers = saveTimers.current;
      timers.forEach(t => clearTimeout(t));
      timers.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return { notes, loaded, addNote, updateNote, deleteNote, reload: load };
}
