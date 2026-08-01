import { useState, useEffect, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { restFetch } from '../lib/db.js';

// Bell icon for the Morgan header. Loads the most recent
// notifications via REST + subscribes to inserts via Supabase
// Realtime. New arrivals trigger a Web Audio chime (no audio file
// needed) and, if the tab is hidden + permission is granted, a
// browser desktop notification.
//
// RLS scopes the notifications table to user_id = auth.uid(), so the
// realtime filter `user_id=eq.<id>` is belt-and-suspenders. We still
// pass it so we don't get noise for other recipients.

const POLL_INTERVAL_MS = 60_000;  // fallback poll for browsers w/o realtime

function playChime() {
  // 0.4s "ping" — two-note arpeggio, soft attack. No file needed.
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tones = [
      { freq: 880, start: 0,     dur: 0.18 },  // A5
      { freq: 1320, start: 0.10, dur: 0.22 },  // E6
    ];
    tones.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch (e) { /* audio may be blocked; ignore */ }
}

function showBrowserNotification(title, body) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && !document.hidden) return;  // don't double-notify when tab is visible
  try {
    new Notification(title, { body, icon: '/favicon.ico', tag: 'morgan-notif' });
  } catch (e) {}
}

function timeAgo(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationBell({ user, onOpenProject }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);

  const userId = user?.user_id || user?.id || null;
  const unreadCount = items.filter(n => !n.read_at).length;

  const audioPrimed = useRef(false);
  const seenIdsRef = useRef(new Set());
  const bellRef = useRef(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await restFetch('/notifications?select=*&order=created_at.desc&limit=30');
      const list = Array.isArray(rows) ? rows : [];
      setItems(list);
      seenIdsRef.current = new Set(list.map(n => n.id));
    } catch (e) {
      console.warn('[notif] load failed:', e?.message || e);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription. Falls through to a slow poll if Realtime
  // isn't available (e.g., the publication wasn't added).
  useEffect(() => {
    if (!userId || !isSupabaseConfigured() || !supabase) return;
    const ch = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload?.new;
          if (!row || seenIdsRef.current.has(row.id)) return;
          seenIdsRef.current.add(row.id);
          setItems(prev => [row, ...prev].slice(0, 50));
          if (audioPrimed.current) playChime();
          showBrowserNotification(row.title, row.body || '');
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (e) {} };
  }, [userId]);

  // Fallback poll so we don't drift if Realtime drops the connection
  useEffect(() => {
    if (!userId) return;
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, load]);

  // Click-outside to close the dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setOpen(false);
    };
    setTimeout(() => window.addEventListener('click', handler), 0);
    return () => window.removeEventListener('click', handler);
  }, [open]);

  const handleBellClick = () => {
    audioPrimed.current = true;  // Web Audio requires a user gesture before playing
    setOpen(o => !o);
    // Ask for desktop notification permission once, opportunistically
    if (!permissionAsked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      setPermissionAsked(true);
      try { Notification.requestPermission(); } catch (e) {}
    }
  };

  const markRead = async (id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    try {
      await restFetch(`/notifications?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { read_at: new Date().toISOString() }, prefer: 'return=minimal',
      });
    } catch (e) { console.warn('[notif] mark read failed:', e?.message); }
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    try {
      await restFetch(`/notifications?user_id=eq.${userId}&read_at=is.null`, {
        method: 'PATCH', body: { read_at: now }, prefer: 'return=minimal',
      });
    } catch (e) { console.warn('[notif] mark all read failed:', e?.message); }
  };

  const handleClickItem = (n) => {
    markRead(n.id);
    if (n.project_id && onOpenProject) {
      onOpenProject(n.project_id);
      setOpen(false);
    }
  };

  if (!user) return null;

  return (
    <div ref={bellRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={handleBellClick}
        title="Notifications"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', color: T.dim, transition: 'color .12s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = T.cream}
        onMouseLeave={(e) => e.currentTarget.style.color = T.dim}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 8, background: '#F0B849', color: '#0F52BA',
            fontSize: 9, fontWeight: 800, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: T.sans, lineHeight: 1,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          // Bell now lives bottom-left, so the dropdown opens UP and to
          // the RIGHT of the icon. Was previously top-right with the
          // panel hanging down.
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
          width: 360, maxHeight: 480, overflow: 'auto',
          background: T.bg, border: `1px solid ${T.border}`,
          borderRadius: T.rS, boxShadow: T.shadow, zIndex: 9999,
          fontFamily: T.sans,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.10em', color: T.ink }}>
              Notifications
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.fadedInk, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, textDecoration: 'underline' }}>
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>
              No notifications yet.
            </div>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                onClick={() => handleClickItem(n)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 14px', background: n.read_at ? 'transparent' : T.surface,
                  border: 'none', borderBottom: `1px solid ${T.border}55`,
                  cursor: 'pointer', fontFamily: T.sans, color: T.ink,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = T.surfHov}
                onMouseLeave={(e) => e.currentTarget.style.background = n.read_at ? 'transparent' : T.surface}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {!n.read_at && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#F0B849', flexShrink: 0 }} />}
                  <div style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{n.title}</div>
                  <div style={{ fontSize: 10, color: T.fadedInk, whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</div>
                </div>
                {n.body && (
                  <div style={{ fontSize: 11, color: T.fadedInk, lineHeight: 1.4, paddingLeft: n.read_at ? 0 : 14 }}>
                    {n.body}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
