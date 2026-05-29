import { useState, useEffect, useMemo, useRef } from 'react';
import T from '../theme/tokens.js';
import { restFetch } from '../lib/db.js';

// Floating chat widget between staff and the project's client(s).
// Same shape as the widget on the /client portal so both sides see
// one shared thread. Polling-based (4s) rather than realtime to keep
// the implementation small — upgrade to Supabase Realtime later if
// the message rate grows.
//
// Mounted at the project level (ProjectView) so it's reachable from
// every tab inside a project, not just the Client view.
export default function ProjectChatWidget({ project, clientName }) {
  const PAPER = '#FFFFFF', INK = '#0F52BA', RULE = '#CDD7EB', FADED = '#7791C5', GOLD = '#F0B849';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(() => {
    try { return localStorage.getItem(`es_chat_staff_last_seen_${project?.id}`) || ''; } catch (e) { return ''; }
  });
  const scrollerRef = useRef(null);

  const currentUserId = useMemo(() => {
    try {
      const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const session = sbKey ? JSON.parse(localStorage.getItem(sbKey)) : null;
      return session?.user?.id || null;
    } catch (e) { return null; }
  }, []);

  // Poll messages while visible.
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    const fetchChat = async () => {
      try {
        const rows = await restFetch(`/client_messages?project_id=eq.${project.id}&order=created_at.asc&limit=300`);
        if (!cancelled) setMessages(rows || []);
      } catch (e) { /* swallow */ }
    };
    fetchChat();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') fetchChat(); }, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [project?.id]);

  // Auto-scroll on new messages while open.
  useEffect(() => {
    if (open && scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, open]);

  // Mark read on open.
  useEffect(() => {
    if (open && messages.length > 0) {
      const newest = messages[messages.length - 1]?.created_at || '';
      if (newest) {
        setLastSeenAt(newest);
        try { localStorage.setItem(`es_chat_staff_last_seen_${project?.id}`, newest); } catch (e) {}
      }
    }
  }, [open, messages, project?.id]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !project?.id || !currentUserId) return;
    setPosting(true);
    try {
      const inserted = await restFetch('/client_messages', {
        method: 'POST',
        body: { project_id: project.id, user_id: currentUserId, body },
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) setMessages((prev) => [...prev, row]);
      setDraft('');
    } catch (e) { alert(`Couldn't send: ${e.message || e}`); }
    finally { setPosting(false); }
  };

  if (!project?.id) return null;

  const unread = messages.filter((m) => m.user_id !== currentUserId && (!lastSeenAt || m.created_at > lastSeenAt)).length;

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}>
      {open ? (
        <div style={{ width: 380, height: 540, maxHeight: 'calc(100vh - 40px)', background: PAPER, border: `1px solid ${RULE}`, borderRadius: 10, boxShadow: '0 16px 40px rgba(15,82,186,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>Chat</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 2 }}>{clientName || project.client || 'Client'}</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: FADED, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
          </div>
          <div ref={scrollerRef} style={{ flex: 1, overflow: 'auto', padding: '14px 16px', background: PAPER, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <div style={{ fontSize: 12, color: FADED, padding: '14px 0', lineHeight: 1.55 }}>No messages yet. Say hi to the client.</div>
            ) : messages.map((m) => {
              const isMine = m.user_id === currentUserId;
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
              placeholder={`Message ${clientName || project.client || 'the client'}…`}
              rows={1}
              style={{ flex: 1, padding: '8px 10px', background: PAPER, border: `1px solid ${RULE}`, borderRadius: 6, color: INK, fontSize: 13, fontFamily: T.sans, outline: 'none', resize: 'none', lineHeight: 1.4, maxHeight: 100, boxSizing: 'border-box' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = INK)}
              onBlur={(e) => (e.currentTarget.style.borderColor = RULE)}
            />
            <button onClick={send} disabled={!draft.trim() || posting} style={{ padding: '8px 14px', background: INK, color: PAPER, border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: draft.trim() && !posting ? 'pointer' : 'default', opacity: draft.trim() && !posting ? 1 : 0.4, fontFamily: T.sans }}>
              {posting ? '…' : 'Send'}
            </button>
          </div>
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
          Chat with {clientName || project.client || 'client'}
          {unread > 0 && (
            <span style={{ marginLeft: 4, minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: GOLD, color: INK, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 0 }}>{unread}</span>
          )}
        </button>
      )}
    </div>
  );
}
