import { useState, useEffect, useMemo, useRef } from 'react';
import T from '../theme/tokens.js';
import { restFetch } from '../lib/db.js';

// Global chat inbox — mounted at App level so a staff user can see and
// reply to any project's client conversation from any page in Morgan.
//
// Closed: pill button with total unread count across all conversations.
// Open: conversation list grouped by project, sorted by most-recent.
//   Click a conversation → focused thread view + compose. Back arrow
//   returns to the list.
//
// When the user is currently viewing a specific project, that project's
// conversation auto-opens the first time the widget is unfurled.
export default function GlobalChatWidget({ user, projects, activeProjectId }) {
  const PAPER = '#FFFFFF', INK = '#0F52BA', RULE = '#CDD7EB', FADED = '#7791C5', GOLD = '#F0B849';

  const [open, setOpen] = useState(false);
  const [allMessages, setAllMessages] = useState([]);
  const [openProjectId, setOpenProjectId] = useState(null);  // null = inbox list, otherwise = thread
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  // Track read receipts per-project in localStorage so unread counts
  // survive refreshes and feel close to native chat apps.
  const [lastSeenByProject, setLastSeenByProject] = useState(() => {
    try { return JSON.parse(localStorage.getItem('es_chat_inbox_last_seen') || '{}') || {}; }
    catch (e) { return {}; }
  });
  const scrollerRef = useRef(null);
  const userId = user?.user_id || user?.id || null;

  // Build a lookup from project_id → metadata so conversations can show
  // the project + client name in the list view.
  const projectMeta = useMemo(() => {
    const map = new Map();
    (projects || []).forEach((p) => {
      const id = p.id || p._dbId;
      if (id) map.set(id, { id, name: p.name || 'Untitled', client: p.client || '' });
    });
    return map;
  }, [projects]);

  // Poll all messages across every project the staff member has access
  // to (RLS scopes to their org). 4s cadence so a client reply lands in
  // the inbox quickly without hammering Supabase.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const rows = await restFetch('/client_messages?order=created_at.desc&limit=500');
        if (!cancelled) setAllMessages(rows || []);
      } catch (e) { /* swallow */ }
    };
    fetchAll();
    // 15s while visible — was 4s, throttled to keep Supabase quiet on
    // the free tier. Upgrade-and-tune later if real-time-feel matters.
    const interval = setInterval(() => { if (document.visibilityState === 'visible') fetchAll(); }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId]);

  // Group messages by project. Each conversation knows its latest
  // message, unread count (vs lastSeenByProject), and the project meta.
  const conversations = useMemo(() => {
    const byProject = new Map();
    allMessages.forEach((m) => {
      if (!m?.project_id) return;
      const arr = byProject.get(m.project_id) || [];
      arr.push(m);
      byProject.set(m.project_id, arr);
    });
    const out = [];
    byProject.forEach((msgs, projectId) => {
      // Messages came in desc, but for thread view we want asc.
      const asc = [...msgs].reverse();
      const latest = msgs[0];  // first in desc order = newest
      const seenAt = lastSeenByProject[projectId] || '';
      const unread = msgs.filter((m) => m.user_id !== userId && (!seenAt || m.created_at > seenAt)).length;
      const meta = projectMeta.get(projectId);
      out.push({ projectId, messages: asc, latest, unread, meta });
    });
    out.sort((a, b) => (b.latest?.created_at || '').localeCompare(a.latest?.created_at || ''));
    return out;
  }, [allMessages, lastSeenByProject, projectMeta, userId]);

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unread, 0), [conversations]);

  // When the widget is first opened on a project page, auto-focus that
  // project's thread (if it has any messages).
  useEffect(() => {
    if (!open || openProjectId) return;
    if (activeProjectId && conversations.some((c) => c.projectId === activeProjectId)) {
      setOpenProjectId(activeProjectId);
    }
  }, [open, openProjectId, activeProjectId, conversations]);

  // Mark thread read whenever it's in focus + new messages land.
  useEffect(() => {
    if (!openProjectId) return;
    const conv = conversations.find((c) => c.projectId === openProjectId);
    const newest = conv?.messages?.[conv.messages.length - 1]?.created_at;
    if (!newest) return;
    if ((lastSeenByProject[openProjectId] || '') >= newest) return;
    const next = { ...lastSeenByProject, [openProjectId]: newest };
    setLastSeenByProject(next);
    try { localStorage.setItem('es_chat_inbox_last_seen', JSON.stringify(next)); } catch (e) {}
  }, [openProjectId, conversations, lastSeenByProject]);

  // Scroll the thread to bottom when messages change or thread opens.
  useEffect(() => {
    if (openProjectId && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [openProjectId, conversations]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !openProjectId || !userId) return;
    setPosting(true);
    try {
      const inserted = await restFetch('/client_messages', {
        method: 'POST',
        body: { project_id: openProjectId, user_id: userId, body },
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) setAllMessages((prev) => [row, ...prev]);
      setDraft('');
    } catch (e) { alert(`Couldn't send: ${e.message || e}`); }
    finally { setPosting(false); }
  };

  if (!userId) return null;

  const activeConv = openProjectId ? conversations.find((c) => c.projectId === openProjectId) : null;
  const fmtRelative = (iso) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.round(ms / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m}m`;
    const h = Math.round(m / 60); if (h < 24) return `${h}h`;
    const d = Math.round(h / 24); return `${d}d`;
  };

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}>
      {open ? (
        <div style={{ width: 380, height: 560, maxHeight: 'calc(100vh - 40px)', background: PAPER, border: `1px solid ${RULE}`, borderRadius: 10, boxShadow: '0 16px 40px rgba(15,82,186,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {activeConv && (
                <button onClick={() => setOpenProjectId(null)} aria-label="Back to inbox" style={{ background: 'transparent', border: 'none', color: INK, fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>{activeConv ? 'Conversation' : 'Inbox'}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeConv ? (activeConv.meta?.client || activeConv.meta?.name || 'Client') : 'Client chats'}
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: FADED, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>

          {/* Body */}
          {!activeConv ? (
            // Inbox list
            <div style={{ flex: 1, overflow: 'auto' }}>
              {conversations.length === 0 ? (
                <div style={{ padding: '24px 16px', fontSize: 13, color: FADED, lineHeight: 1.55 }}>
                  No client conversations yet. Once a client messages you (or you message them), the thread will show here.
                </div>
              ) : conversations.map((c) => (
                <button key={c.projectId} onClick={() => setOpenProjectId(c.projectId)} style={{
                  width: '100%', display: 'flex', flexDirection: 'column', gap: 4,
                  background: 'transparent', border: 'none', borderBottom: `1px solid ${RULE}`,
                  padding: '12px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: T.sans,
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(15,82,186,.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {c.meta?.client || c.meta?.name || 'Unknown project'}
                    </span>
                    <span style={{ fontSize: 10, color: FADED, fontFamily: T.mono, flexShrink: 0 }}>{fmtRelative(c.latest?.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 12, color: FADED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1.4 }}>
                      <span style={{ color: c.latest?.user_id === userId ? FADED : INK, fontWeight: c.unread ? 600 : 400 }}>{c.latest?.user_id === userId ? 'You: ' : ''}{c.latest?.body}</span>
                    </span>
                    {c.unread > 0 && (
                      <span style={{ minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: GOLD, color: INK, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.unread}</span>
                    )}
                  </div>
                  {c.meta?.name && c.meta.client && c.meta.client !== c.meta.name && (
                    <div style={{ fontSize: 10, color: FADED, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700, marginTop: 2 }}>{c.meta.name}</div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            // Focused thread
            <>
              <div ref={scrollerRef} style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeConv.messages.length === 0 ? (
                  <div style={{ fontSize: 12, color: FADED, padding: '14px 0', lineHeight: 1.55 }}>No messages yet.</div>
                ) : activeConv.messages.map((m) => {
                  const isMine = m.user_id === userId;
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                        background: isMine ? INK : 'rgba(15,82,186,.06)',
                        color: isMine ? PAPER : INK,
                        fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>{m.body}</div>
                      <span style={{ fontSize: 9, color: FADED, marginTop: 4, fontFamily: T.mono, letterSpacing: '.04em' }}>
                        {isMine ? 'You' : 'Client'} · {new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ borderTop: `1px solid ${RULE}`, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={`Message ${activeConv.meta?.client || 'client'}…`}
                  rows={1}
                  style={{ flex: 1, padding: '8px 10px', background: PAPER, border: `1px solid ${RULE}`, borderRadius: 6, color: INK, fontSize: 13, fontFamily: T.sans, outline: 'none', resize: 'none', lineHeight: 1.4, maxHeight: 100, boxSizing: 'border-box' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = INK)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = RULE)}
                />
                <button onClick={send} disabled={!draft.trim() || posting} style={{ padding: '8px 14px', background: INK, color: PAPER, border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: draft.trim() && !posting ? 'pointer' : 'default', opacity: draft.trim() && !posting ? 1 : 0.4, fontFamily: T.sans }}>
                  {posting ? '…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <button onClick={() => setOpen(true)} style={{
          position: 'relative', padding: '12px 18px 12px 16px',
          background: INK, color: PAPER, border: 'none', borderRadius: 999,
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: T.sans,
          boxShadow: '0 8px 24px rgba(15,82,186,.30)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Client chats
          {totalUnread > 0 && (
            <span style={{ marginLeft: 4, minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: GOLD, color: INK, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 0 }}>{totalUnread}</span>
          )}
        </button>
      )}
    </div>
  );
}
