import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { restFetch, getSession } from '../lib/db.js';

// Personal sticky notes. RLS scopes everything to auth.uid() so we
// don't need to filter by user_id on the client. Uses restFetch (raw
// PostgREST) to stay immune to the supabase-js auth-lock deadlock that
// stalled the profile fetch earlier in this build.
//
// After a debounced autosave, we also ask Claude to look for a
// time-bound reminder ("check in on the dealers tuesday"). If found,
// the parsed date+action surface in the UI with a one-click
// "Add to Calendar" using the existing Google Calendar integration.
export function useUserNotes(userId, accessToken) {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState(() => new Set());
  // Per-note debounce so rapid typing doesn't fire a write per keystroke.
  const saveTimers = useRef(new Map());
  const analyzeTimers = useRef(new Map());

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

  const setAnalyzing = useCallback((id, on) => {
    setAnalyzingIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // Run reminder extraction. Cheap-but-strict prompt — model returns
  // JSON only, low temperature so it's predictable. We skip the call if
  // the content hasn't changed since the last analysis or is too short.
  const analyzeNote = useCallback(async (note) => {
    if (!note || !note.id) return;
    const content = (note.content || '').trim();
    if (content.length < 10) return;
    if (note.analyzed_content === content) return;

    setAnalyzing(note.id, true);
    try {
      const session = await getSession();
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const dow = today.toLocaleDateString('en-US', { weekday: 'long' });

      const system = `You extract time-bound reminders from short personal notes.
Return STRICT JSON ONLY (no prose, no code fences) with this exact shape:
{"hasReminder": boolean, "date": "YYYY-MM-DDTHH:MM:00" | "YYYY-MM-DD" | null, "action": string, "confidence": "high" | "medium" | "low"}

Rules:
- "hasReminder" is true only if the note contains a clear time-bound task or follow-up.
- Resolve relative dates ("tuesday", "next week", "tomorrow") to absolute dates. Today is ${todayStr} (${dow}). Prefer the next occurrence.
- If a time-of-day is present ("9am", "3:30pm"), include it. Otherwise return a date-only string.
- "action" is a short imperative phrase (3-8 words) describing what to do, written in normal sentence case.
- If the note is just an observation, brain-dump, or has no actionable date, return {"hasReminder": false, "date": null, "action": "", "confidence": "low"}.
- Do not fabricate dates. If the user mentions a day-of-week without context, pick the next future occurrence.`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          temperature: 0,
          system,
          messages: [{ role: 'user', content }],
        }),
      });

      if (!res.ok) {
        console.warn('[notes] analyze failed:', res.status);
        return;
      }

      const data = await res.json();
      const text = data?.content?.[0]?.text || '';
      let parsed = null;
      try {
        // Strip code fences just in case the model added them despite the rule
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.warn('[notes] analyze: could not parse JSON:', text);
        return;
      }

      const patch = { analyzed_content: content };
      if (parsed?.hasReminder && parsed.date) {
        // Normalize to ISO timestamptz — date-only becomes 09:00 local
        let iso = parsed.date;
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso = iso + 'T09:00:00';
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 24 * 3600 * 1000) {
          patch.reminder_date = d.toISOString();
          patch.reminder_action = (parsed.action || '').trim();
        }
      } else if (note.reminder_date && !note.calendar_event_id) {
        // Note edited and no longer has a reminder — clear stale one
        patch.reminder_date = null;
        patch.reminder_action = null;
      }

      // Persist + update local state
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...patch } : n));
      try {
        await restFetch(`/user_notes?id=eq.${encodeURIComponent(note.id)}`, {
          method: 'PATCH', body: patch, prefer: 'return=minimal',
        });
      } catch (e) { console.error('[notes] analyze save failed:', e.message || e); }
    } finally {
      setAnalyzing(note.id, false);
    }
  }, [setAnalyzing]);

  const addNote = useCallback(async (color = 'wash') => {
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

    // Save (debounced)
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

    // Re-analyze (longer debounce — only fires once typing settles)
    if ('content' in patch) {
      const aExisting = analyzeTimers.current.get(id);
      if (aExisting) clearTimeout(aExisting);
      const at = setTimeout(() => {
        analyzeTimers.current.delete(id);
        // Read latest state when the timer fires
        setNotes(prev => {
          const n = prev.find(x => x.id === id);
          if (n) analyzeNote(n);
          return prev;
        });
      }, 1500);
      analyzeTimers.current.set(id, at);
    }
  }, [analyzeNote]);

  const deleteNote = useCallback(async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (!isSupabaseConfigured()) return;
    try {
      await restFetch(`/user_notes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) { console.error('[notes] delete failed:', e.message || e); }
  }, []);

  const dismissReminder = useCallback(async (id) => {
    const patch = { reminder_date: null, reminder_action: null };
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
    try {
      await restFetch(`/user_notes?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: patch, prefer: 'return=minimal',
      });
    } catch (e) { console.error('[notes] dismiss failed:', e.message || e); }
  }, []);

  const addToCalendar = useCallback(async (note) => {
    if (!note?.reminder_date || !note?.reminder_action) return;
    if (!accessToken) {
      alert('Connect Google Calendar first (sign in with Google to grant calendar access).');
      return;
    }
    try {
      const { createCalendarEvent } = await import('../utils/google.js');
      const d = new Date(note.reminder_date);
      const mmddyyyy = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const result = await createCalendarEvent(accessToken, {
        title: note.reminder_action,
        date: mmddyyyy,
        time,
        duration: '30m',
        agenda: note.content,
        location: '',
        attendees: [],
      });
      const eventId = result?.id || result?.event?.id || 'created';
      const patch = { calendar_event_id: String(eventId) };
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...patch } : n));
      await restFetch(`/user_notes?id=eq.${encodeURIComponent(note.id)}`, {
        method: 'PATCH', body: patch, prefer: 'return=minimal',
      });
    } catch (e) {
      console.error('[notes] calendar add failed:', e.message || e);
      alert('Could not add to calendar: ' + (e.message || 'Unknown error'));
    }
  }, [accessToken]);

  // Flush pending debounced writes — call before the user navigates away
  // so an in-progress edit doesn't get lost.
  useEffect(() => {
    const flush = () => {
      saveTimers.current.forEach(t => clearTimeout(t));
      saveTimers.current.clear();
      analyzeTimers.current.forEach(t => clearTimeout(t));
      analyzeTimers.current.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return {
    notes, loaded, analyzingIds,
    addNote, updateNote, deleteNote,
    addToCalendar, dismissReminder,
    reload: load,
  };
}
