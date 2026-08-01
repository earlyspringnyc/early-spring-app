import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import T from '../theme/tokens.js';
import { f0 } from '../utils/format.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { ci, ct, calcProject } from '../utils/calc.js';
import { buildPhaseColorMap, phaseColor } from '../utils/workbackPhases.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganIsotype } from '../components/brand/MorganLogo.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { restFetch, signInWithEmail, signOut, getSession, onAuthStateChange, downloadFileData, publicFileUrl } from '../lib/db.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Strict Early Spring spec: paper #FFFFFF + ink #0F52BA + accent
// yellow #F0B849 + TWK Lausanne. No off-canvas colors.
const PAPER = '#FFFFFF';
const INK = '#0F52BA';
const RULE = '#CDD7EB';
const FADED = '#7791C5';
const GOLD = '#F0B849';

const STATUS_LABELS = { done: 'Done', progress: 'In progress', todo: 'To do', roadblocked: 'Blocked' };

const Kicker = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: INK }}>
    {children}
  </div>
);

// PortalCard — paper-on-canvas card with a kicker label up top. Used
// as the primary section primitive in the dashboard layout.
const PortalCard = ({ kicker, title, action, accent, span, padding, children }) => (
  <div style={{
    gridColumn: span === 'full' ? '1 / -1' : 'auto',
    background: PAPER,
    border: `1px solid ${RULE}`,
    borderTop: accent ? `3px solid ${INK}` : `1px solid ${RULE}`,
    borderRadius: 8,
    padding: padding || 'clamp(20px,2.5vw,32px)',
    boxShadow: '0 1px 0 rgba(15,82,186,.04)',
    display: 'flex', flexDirection: 'column', gap: 16,
    minWidth: 0,
  }}>
    {(kicker || action) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        {kicker && <Kicker>{kicker}</Kicker>}
        {action}
      </div>
    )}
    {title && (
      <h2 style={{ fontSize: 'clamp(20px,2.4vw,28px)', fontWeight: 800, letterSpacing: '-0.018em', lineHeight: 1.1, margin: 0, color: INK }}>
        {title}
      </h2>
    )}
    {children}
  </div>
);

// FileViewer — inline preview modal. Handles PDFs (via pdf.js) and
// images natively; everything else falls back to a download link.
// When projectId + user are passed in, also shows a per-asset comments
// panel so the client can leave feedback tied to this specific file.
function FileViewer({ file, onClose, projectId, user }) {
  const canvasRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Resolved file data — populated synchronously from file.fileData/url
  // or asynchronously by fetching file.storagePath from Supabase Storage.
  // Large file payloads get stripped from the project JSON by useProjects
  // (anything >~1MB lives in the `files` bucket), so the portal has to
  // fetch them on demand to preview.
  const [resolvedData, setResolvedData] = useState(null);

  useEffect(() => {
    if (!file) { setResolvedData(null); return; }
    if (file.fileData) { setResolvedData(file.fileData); return; }
    if (file.url) { setResolvedData(file.url); return; }
    if (file.storagePath) {
      // 'files' bucket is public-read — use the direct URL instead of
      // fetching the bytes. Browser handles caching + range requests.
      const url = publicFileUrl(file.storagePath);
      if (url) { setResolvedData(url); return; }
      // Fallback: pull bytes as base64 if the URL helper isn't configured
      setLoading(true);
      let cancelled = false;
      downloadFileData(file.storagePath)
        .then((d) => { if (!cancelled) setResolvedData(d || null); })
        .catch(() => { if (!cancelled) setResolvedData(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
    setResolvedData(null);
  }, [file]);

  // ── Per-asset comments (only when projectId + user are provided) ──
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const assetId = file?.id || null;

  useEffect(() => {
    if (!file || !projectId || !assetId) { setComments([]); return; }
    let cancelled = false;
    setNewComment('');
    restFetch(`/client_notes?project_id=eq.${projectId}&asset_id=eq.${encodeURIComponent(assetId)}&order=created_at.asc&limit=200`)
      .then((rows) => { if (!cancelled) setComments(rows || []); })
      .catch((e) => { console.warn('[portal] load asset comments failed', e?.message); if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [file, projectId, assetId]);

  const postAssetComment = async () => {
    const body = newComment.trim();
    if (!body || !projectId || !user?.id || !assetId) return;
    setPostingComment(true);
    try {
      const inserted = await restFetch('/client_notes', {
        method: 'POST',
        body: { project_id: projectId, user_id: user.id, body, asset_id: assetId },
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) setComments((prev) => [...prev, row]);
      setNewComment('');
    } catch (e) {
      alert(`Could not post: ${e.message || e}`);
    } finally {
      setPostingComment(false);
    }
  };

  const deleteAssetComment = async (id) => {
    if (!confirm('Delete this note?')) return;
    try {
      await restFetch(`/client_notes?id=eq.${id}`, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      alert(`Could not delete: ${e.message || e}`);
    }
  };
  const commentsEnabled = !!(projectId && user?.id && assetId);

  const data = resolvedData;
  const name = file?.name || file?.fileName || 'File';
  const fileName = file?.fileName || file?.name || 'file';
  const isPdf = useMemo(() => {
    if (!file) return false;
    if (/\.pdf$/i.test(fileName)) return true;
    if (typeof data === 'string' && data.startsWith('data:application/pdf')) return true;
    return false;
  }, [file, data, fileName]);
  const isImage = useMemo(() => {
    if (!file) return false;
    if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(fileName)) return true;
    if (typeof data === 'string' && /^data:image\//i.test(data)) return true;
    return false;
  }, [file, data, fileName]);

  // Close on Escape
  useEffect(() => {
    if (!file) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, onClose]);

  // Load the PDF document when the viewer opens with a PDF.
  useEffect(() => {
    if (!file || !isPdf || !data) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null); setPage(1);
        let arg;
        if (typeof data === 'string' && data.startsWith('data:')) {
          const raw = atob(data.split(',')[1]);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          arg = { data: arr };
        } else {
          arg = { url: data };
        }
        const doc = await pdfjsLib.getDocument(arg).promise;
        if (cancelled) return;
        setPdf(doc); setTotal(doc.numPages);
      } catch (e) {
        if (!cancelled) setError(e.message || 'PDF could not be loaded');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file, isPdf, data]);

  // Render the current page when pdf or page changes.
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pg = await pdf.getPage(page);
        if (cancelled) return;
        // Render at device-pixel-ratio for crisp text; cap the displayed
        // width so wide slides fit the modal.
        const containerWidth = canvasRef.current.parentElement.clientWidth || 800;
        const baseVp = pg.getViewport({ scale: 1 });
        const scale = Math.min(containerWidth / baseVp.width, 2.2);
        const vp = pg.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;
        await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      } catch (e) {
        if (!cancelled) setError(e.message || 'Page could not be rendered');
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, page]);

  if (!file) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,82,186,.32)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: commentsEnabled ? 1400 : 1100, maxHeight: '94vh',
        background: PAPER, border: `1px solid ${RULE}`, borderRadius: 10,
        boxShadow: '0 24px 80px rgba(15,82,186,.24)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>Preview</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {data && typeof data === 'string' && data.startsWith('data:') && (
              <a href={data} download={fileName} style={{ padding: '7px 14px', border: `1px solid ${RULE}`, borderRadius: 6, color: INK, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: T.sans }}>
                Download
              </a>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: FADED, fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Body — preview on the left, comments side panel on the right */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, overflow: 'auto', background: 'rgba(15,82,186,.03)', padding: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {!data && !error ? (
            <div style={{ color: FADED, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700, padding: 24 }}>
              {loading ? 'Loading…' : (file?.storagePath ? 'Fetching file…' : 'No file data available.')}
            </div>
          ) : isPdf ? (
            error ? (
              <div style={{ color: FADED, fontSize: 14 }}>{error}</div>
            ) : loading ? (
              <div style={{ color: FADED, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>Loading…</div>
            ) : (
              <canvas ref={canvasRef} style={{ boxShadow: '0 4px 24px rgba(15,82,186,.12)', background: '#FFF', maxWidth: '100%' }} />
            )
          ) : isImage ? (
            <img src={data} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', boxShadow: '0 4px 24px rgba(15,82,186,.12)' }} />
          ) : (
            <div style={{ color: FADED, fontSize: 14, textAlign: 'center', padding: 32 }}>
              No inline preview for this file type.
              {data && typeof data === 'string' && data.startsWith('data:') && (
                <div style={{ marginTop: 16 }}>
                  <a href={data} download={fileName} style={{ fontSize: 12, color: INK, textDecoration: 'underline', fontWeight: 600 }}>Download {fileName}</a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comments side panel — only when wired to a project + user */}
        {commentsEnabled && (
          <div style={{ width: 360, flexShrink: 0, borderLeft: `1px solid ${RULE}`, display: 'flex', flexDirection: 'column', background: PAPER }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${RULE}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>Notes &amp; Feedback</div>
              <div style={{ fontSize: 12, color: INK, marginTop: 4, fontWeight: 600 }}>{name}</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
              {comments.length === 0 ? (
                <div style={{ fontSize: 12, color: FADED, padding: '14px 0', lineHeight: 1.55 }}>No notes on this file yet. Leave the first one below.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${RULE}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                        {c.user_id === user.id ? 'You' : 'Client'}
                      </span>
                      <span style={{ fontSize: 10, color: FADED, fontFamily: T.mono }}>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 13, color: INK, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                    {c.user_id === user.id && (
                      <button onClick={() => deleteAssetComment(c.id)} style={{ marginTop: 4, background: 'transparent', border: 'none', color: FADED, fontSize: 10, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, padding: 0 }}>
                        Delete
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 18px' }}>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Leave feedback on this file…"
                rows={3}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postAssetComment(); }}
                style={{ width: '100%', padding: 10, background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4, color: INK, fontSize: 13, fontFamily: T.sans, outline: 'none', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = INK)}
                onBlur={(e) => (e.currentTarget.style.borderColor = RULE)}
              />
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: FADED }}>⌘↵ to post</span>
                <button onClick={postAssetComment} disabled={!newComment.trim() || postingComment} style={{ padding: '7px 16px', background: INK, color: PAPER, border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: newComment.trim() && !postingComment ? 'pointer' : 'default', opacity: newComment.trim() && !postingComment ? 1 : 0.4, fontFamily: T.sans }}>
                  {postingComment ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        )}

        </div> {/* end body flex */}

        {/* PDF page nav */}
        {isPdf && pdf && total > 1 && (
          <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 14px', border: `1px solid ${RULE}`, background: PAPER, borderRadius: 6, color: INK, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontFamily: T.sans }}>← Prev</button>
            <span style={{ fontSize: 12, color: INK, fontFamily: T.mono, fontWeight: 600 }}>Page {page} of {total}</span>
            <button onClick={() => setPage((p) => Math.min(total, p + 1))} disabled={page >= total} style={{ padding: '6px 14px', border: `1px solid ${RULE}`, background: PAPER, borderRadius: 6, color: INK, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: page >= total ? 'default' : 'pointer', opacity: page >= total ? 0.4 : 1, fontFamily: T.sans }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// PortalChat — floating chat widget bottom-right. Polls client_messages
// every 4 seconds while open. Closed-state shows a small button with an
// unread count.
function PortalChat({ projectId, user, clientName }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(() => {
    try { return localStorage.getItem(`es_chat_last_seen_${projectId}`) || ''; } catch (e) { return ''; }
  });
  const scrollerRef = useRef(null);

  // Initial load + polling. We only poll while the widget is visible
  // (avoids hammering Supabase when the tab is in the background).
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const fetchMessages = async () => {
      try {
        const rows = await restFetch(`/client_messages?project_id=eq.${projectId}&order=created_at.asc&limit=300`);
        if (!cancelled) setMessages(rows || []);
      } catch (e) { /* swallow — chat is best-effort */ }
    };
    fetchMessages();
    // 15s while visible — was 4s, throttled to keep Supabase free tier
    // happy. Bump back down once a paid plan is in place.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchMessages();
    }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectId]);

  // Auto-scroll to bottom when new messages arrive while open.
  useEffect(() => {
    if (open && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Mark messages read when the user opens the widget.
  useEffect(() => {
    if (open && messages.length > 0) {
      const newest = messages[messages.length - 1]?.created_at || '';
      if (newest) {
        setLastSeenAt(newest);
        try { localStorage.setItem(`es_chat_last_seen_${projectId}`, newest); } catch (e) {}
      }
    }
  }, [open, messages, projectId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !projectId || !user?.id) return;
    setPosting(true);
    try {
      const inserted = await restFetch('/client_messages', {
        method: 'POST',
        body: { project_id: projectId, user_id: user.id, body },
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) setMessages((prev) => [...prev, row]);
      setDraft('');
    } catch (e) {
      alert(`Couldn't send: ${e.message || e}`);
    } finally {
      setPosting(false);
    }
  };

  if (!projectId) return null;

  const unread = lastSeenAt
    ? messages.filter((m) => m.user_id !== user?.id && m.created_at > lastSeenAt).length
    : messages.filter((m) => m.user_id !== user?.id).length;

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}>
      {open ? (
        <div style={{ width: 360, height: 520, maxHeight: 'calc(100vh - 40px)', background: '#FFFFFF', border: `1px solid ${RULE}`, borderRadius: 10, boxShadow: '0 16px 40px rgba(15,82,186,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>Chat</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 2 }}>{clientName || 'Production team'}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: FADED, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
          </div>

          {/* Messages */}
          <div ref={scrollerRef} style={{ flex: 1, overflow: 'auto', padding: '14px 16px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <div style={{ fontSize: 12, color: FADED, padding: '14px 0', lineHeight: 1.55 }}>
                No messages yet. Say hi to the team — we'll get right back to you.
              </div>
            ) : (
              messages.map((m) => {
                const isMine = m.user_id === user?.id;
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%',
                      padding: '8px 12px',
                      borderRadius: 12,
                      background: isMine ? INK : 'rgba(15,82,186,.06)',
                      color: isMine ? '#FFFFFF' : INK,
                      fontSize: 13,
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>{m.body}</div>
                    <span style={{ fontSize: 9, color: FADED, marginTop: 4, fontFamily: T.mono, letterSpacing: '.04em' }}>
                      {isMine ? 'You' : 'Team'} · {new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Compose */}
          <div style={{ borderTop: `1px solid ${RULE}`, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message the team…"
              rows={1}
              style={{ flex: 1, padding: '8px 10px', background: '#FFFFFF', border: `1px solid ${RULE}`, borderRadius: 6, color: INK, fontSize: 13, fontFamily: T.sans, outline: 'none', resize: 'none', lineHeight: 1.4, maxHeight: 100, boxSizing: 'border-box' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = INK)}
              onBlur={(e) => (e.currentTarget.style.borderColor = RULE)}
            />
            <button onClick={send} disabled={!draft.trim() || posting} style={{ padding: '8px 14px', background: INK, color: '#FFFFFF', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: draft.trim() && !posting ? 'pointer' : 'default', opacity: draft.trim() && !posting ? 1 : 0.4, fontFamily: T.sans }}>
              {posting ? '…' : 'Send'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} style={{
          position: 'relative',
          padding: '12px 18px 12px 16px',
          background: INK, color: '#FFFFFF', border: 'none', borderRadius: 999,
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: T.sans,
          boxShadow: '0 8px 24px rgba(15,82,186,.30)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat with the team
          {unread > 0 && (
            <span style={{ marginLeft: 4, minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: GOLD, color: INK, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 0 }}>{unread}</span>
          )}
        </button>
      )}
    </div>
  );
}

// Tells whether a file/deck/asset can be previewed inline.
function canPreview(file) {
  const name = (file?.fileName || file?.name || '').toLowerCase();
  if (/\.(pdf|png|jpe?g|gif|webp|svg|bmp)$/i.test(name)) return true;
  const data = file?.fileData;
  if (typeof data === 'string' && (data.startsWith('data:application/pdf') || data.startsWith('data:image/'))) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Login form (shown when no Supabase session exists)
// ─────────────────────────────────────────────────────────────────────
function ClientLogin({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const { error } = await signInWithEmail(email.trim().toLowerCase(), password);
      if (error) setErr(typeof error === 'string' ? error : (error.message || 'Sign-in failed'));
      else onSignedIn();
    } catch (e) {
      setErr('Sign-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '14px 0 12px',
    border: 'none', borderBottom: `1px solid ${RULE}`,
    background: 'transparent',
    color: INK, fontSize: 15, fontFamily: T.sans, fontWeight: 400,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .18s ease',
  };

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: T.sans, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 1, background: RULE }} />
      <div style={{ padding: 'clamp(20px,3vw,40px) clamp(20px,3vw,56px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="https://earlyspring.nyc" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <ESWordmark height={14} color={INK} />
        </a>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: FADED }}>
          Client Portal
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(40px,8vw,96px) clamp(20px,3vw,56px)' }}>
        <div style={{ width: '100%', maxWidth: 460, display: 'grid', gap: 'clamp(28px,4vw,40px)' }}>
          <div>
            <Kicker>Sign in</Kicker>
            <h1 style={{ fontSize: 'clamp(32px,4.5vw,52px)', fontWeight: 800, letterSpacing: '-0.022em', lineHeight: 1.04, margin: '14px 0 0', color: INK }}>
              Welcome.
            </h1>
            <p style={{ fontSize: 14, color: FADED, lineHeight: 1.6, margin: '14px 0 0' }}>
              Use the email and password from your invitation. Need a new invite? Reply to the email or reach out to your producer.
            </p>
          </div>

          <form onSubmit={submit} style={{ display: 'grid', gap: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Email</label>
              <input
                type="email" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderBottomColor = INK)}
                onBlur={(e) => (e.currentTarget.style.borderBottomColor = RULE)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'} required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  style={{ ...inputStyle, paddingRight: 36 }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = INK)}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = RULE)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: 6, color: FADED, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = INK)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = FADED)}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M1 1l22 22" />
                      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {err && <div style={{ fontSize: 12, color: '#9A1A1A', fontWeight: 600 }}>{err}</div>}

            <button
              type="submit" disabled={loading}
              style={{
                padding: '14px 28px', background: INK, color: PAPER, border: 'none',
                fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                cursor: loading ? 'default' : 'pointer', fontFamily: T.sans,
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      <footer style={{ borderTop: `1px solid ${RULE}`, padding: '24px clamp(20px,3vw,56px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 11, color: FADED }}>Engineering Serendipity · Early Spring</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: FADED }}>
          <MorganIsotype size={14} color={FADED} strokeWidth={1.2} />
          <span style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>Morgan</span>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Branded paper-style Gantt (used inside the portal)
// ─────────────────────────────────────────────────────────────────────
function PortalGantt({ tasks, completedTaskIds }) {
  const dated = tasks.filter((t) => parseD(t.startDate));
  if (!dated.length) {
    return <div style={{ padding: 24, textAlign: 'center', color: FADED, fontSize: 13 }}>No dated tasks yet.</div>;
  }
  const allDates = [];
  dated.forEach((t) => {
    allDates.push(parseD(t.startDate));
    allDates.push(parseD(t.endDate) || parseD(t.startDate));
  });
  const minD = new Date(Math.min(...allDates));
  const maxD = new Date(Math.max(...allDates));
  minD.setDate(minD.getDate() - 3);
  maxD.setDate(maxD.getDate() + 3);
  const totalDays = Math.max(daysBetween(minD, maxD), 7);
  const weeks = [];
  let cur = new Date(minD);
  while (cur <= maxD) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7); }
  const todayLeft = ((daysBetween(minD, new Date()) / totalDays) * 100);

  return (
    <div style={{ border: `1px solid ${RULE}`, borderRadius: 4, overflow: 'hidden', background: PAPER }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${INK}`, padding: '10px 0', background: T.inkSoft3 }}>
        <div style={{ width: 200, flexShrink: 0, padding: '0 16px', fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>Task</div>
        <div style={{ flex: 1, position: 'relative', height: 18 }}>
          {weeks.map((w, i) => {
            const left = (daysBetween(minD, w) / totalDays) * 100;
            return (
              <span key={i} style={{ position: 'absolute', left: `${left}%`, fontSize: 10, color: FADED, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
                {fmtShort(w)}
              </span>
            );
          })}
        </div>
      </div>

      {dated.map((t) => {
        const start = parseD(t.startDate);
        const end = parseD(t.endDate) || start;
        const left = (daysBetween(minD, start) / totalDays) * 100;
        const width = Math.max(((daysBetween(start, end) + 1) / totalDays) * 100, 2);
        const isDone = t.status === 'done' || completedTaskIds.has(t.id);
        const isBlocked = t.status === 'roadblocked';
        const barColor = isDone ? INK : isBlocked ? '#9A1A1A' : T.ink70;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${RULE}`, position: 'relative' }}>
            <div style={{ width: 200, flexShrink: 0, padding: '0 16px', overflow: 'hidden' }}>
              <span style={{ fontSize: 13, color: INK, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.5 : 1 }}>
                {t.name}
              </span>
              {t.category && <span style={{ fontSize: 10, color: FADED, fontStyle: 'italic' }}>{t.category}</span>}
            </div>
            <div style={{ flex: 1, position: 'relative', height: 28 }}>
              <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 6, height: 16, borderRadius: 3, background: barColor, opacity: isDone ? 0.35 : 0.85 }} />
            </div>
          </div>
        );
      })}

      {todayLeft >= 0 && todayLeft <= 100 && (
        <div style={{ position: 'relative', marginTop: -((dated.length * 49) + 8), marginLeft: 200, height: dated.length * 49, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: `${todayLeft}%`, top: 0, bottom: 0, width: 1, background: '#F0B849' }} />
          <span style={{ position: 'absolute', left: `${todayLeft}%`, top: -6, transform: 'translateX(-50%)', fontSize: 9, fontWeight: 700, color: '#F0B849', letterSpacing: '.08em', textTransform: 'uppercase', background: PAPER, padding: '0 6px' }}>Today</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Drag-drop / click-to-upload zone. Used inside the Files section so
// the client can push files into the project's 'client-uploads' bucket.
// ─────────────────────────────────────────────────────────────────────
function ClientUploadZone({ onUpload, uploading, error, PAPER, INK, RULE, FADED, GOLD }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFiles = (fileList) => {
    if (!fileList || !fileList.length) return;
    // Upload sequentially so each gets its own notification fan-out
    Array.from(fileList).forEach((f) => onUpload(f));
  };

  return (
    <div
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFiles(e.dataTransfer.files); }}
      style={{
        padding: 'clamp(20px, 3vw, 32px)',
        border: `2px dashed ${dragOver ? INK : RULE}`,
        borderRadius: 4,
        background: dragOver ? `${INK}06` : PAPER,
        cursor: uploading ? 'wait' : 'pointer',
        transition: 'all .15s',
        textAlign: 'center',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>
        {uploading ? `Uploading ${uploading}…` : (dragOver ? 'Drop to upload' : 'Drop files here, or click to pick')}
      </div>
      <div style={{ fontSize: 11, color: FADED }}>
        Your producer at Early Spring will be notified.
      </div>
      {error && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: `${GOLD}1A`, color: '#7A1F1F', fontSize: 11, borderRadius: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Countdown card — days remaining to the event date.
// ─────────────────────────────────────────────────────────────────────
function CountdownCard({ eventDate, INK, PAPER, RULE, FADED, GOLD }) {
  const eventD = eventDate ? parseD(eventDate) : null;
  const days = eventD ? daysBetween(new Date(), eventD) : null;
  const isPast = days !== null && days < 0;
  const isToday = days === 0;
  return (
    <div style={{ background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4, padding: '22px 24px', position: 'relative' }}>
      <div style={{ height: 3, background: INK, marginLeft: -24, marginRight: -24, marginTop: -22, marginBottom: 16 }} />
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: INK, marginBottom: 14 }}>Countdown</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 56, fontWeight: 800, fontFamily: T.mono, letterSpacing: '-0.04em', lineHeight: 1, color: isPast ? FADED : (days !== null && days <= 7 ? '#7A1F1F' : INK) }}>
          {days !== null ? Math.abs(days) : '—'}
        </span>
        <span style={{ fontSize: 12, color: FADED, fontFamily: T.mono }}>
          {days === null ? 'no date set' : isToday ? 'today!' : isPast ? 'days ago' : 'days to go'}
        </span>
      </div>
      {eventDate && (
        <div style={{ fontSize: 11, color: FADED, marginTop: 10, fontFamily: T.mono }}>{eventDate}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Weather card — atmospheric gradient shifts based on time of day and
// conditions (matches the DashV weather widget on the staff side).
// The gradient slowly drifts to feel alive without being distracting.
// ─────────────────────────────────────────────────────────────────────
function WeatherCard({ weather, loading, INK, PAPER, RULE, FADED, GOLD }) {
  const codeLabel = (code) => {
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 48) return 'Foggy';
    if (code <= 55) return 'Drizzle';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Showers';
    if (code <= 99) return 'Thunderstorm';
    return 'Cloudy';
  };
  const atmosphere = getWeatherAtmosphere(weather?.code);
  const isShaded = !!weather;  // gradient backdrop is active → use light text
  const fg = isShaded ? '#FFFFFF' : INK;
  const fgSoft = isShaded ? 'rgba(255,255,255,.72)' : FADED;
  const fgFaint = isShaded ? 'rgba(255,255,255,.48)' : FADED;
  return (
    <div style={{
      borderRadius: 4,
      padding: '22px 24px',
      position: 'relative',
      overflow: 'hidden',
      background: weather ? atmosphere : PAPER,
      border: weather ? 'none' : `1px solid ${RULE}`,
      backgroundSize: '160% 160%',
      animation: weather ? 'es-weather-drift 22s ease-in-out infinite alternate' : undefined,
    }}>
      {/* Subtle film-grain noise so the gradient doesn't band */}
      {weather && (
        <div style={{
          position: 'absolute', inset: 0, opacity: .07, pointerEvents: 'none',
          background: "url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\"><filter id=\"n\"><feTurbulence baseFrequency=\".65\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"100%25\" height=\"100%25\" filter=\"url(%23n)\" opacity=\".5\"/></svg>')",
        }}/>
      )}
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: fg, marginBottom: 14, opacity: isShaded ? .85 : 1 }}>Weather</div>
        {loading && <div style={{ fontSize: 12, color: fgSoft }}>Loading forecast…</div>}
        {!loading && !weather && <div style={{ fontSize: 12, color: fgSoft }}>No forecast available.</div>}
        {!loading && weather && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 56, fontWeight: 800, fontFamily: T.mono, letterSpacing: '-0.04em', lineHeight: 1, color: fg, textShadow: isShaded ? '0 2px 14px rgba(0,0,0,.32)' : 'none' }}>
                {weather.isForecast ? `${weather.high}°` : `${weather.temp}°`}
              </span>
              <span style={{ fontSize: 12, color: fgSoft, fontFamily: T.mono }}>
                {weather.isForecast ? `high · ${weather.low}° low` : 'now'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: fgSoft, marginTop: 10, fontFamily: T.mono }}>
              {codeLabel(weather.code)} · {weather.city}
              {!weather.isForecast && ' (today)'}
            </div>
            {!weather.isForecast && weather.daysUntilForecastWindow > 0 && (
              <div style={{ fontSize: 10, color: '#FFFFFF', marginTop: 10, padding: '6px 10px', background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(4px)', borderRadius: 4, lineHeight: 1.4 }}>
                Switches to the event-day forecast in {weather.daysUntilForecastWindow} {weather.daysUntilForecastWindow === 1 ? 'day' : 'days'} (10 days before the event).
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Time-of-day + weather-code → atmospheric gradient. Same mapping
// the staff dashboard uses, lifted to a top-level helper so the
// client portal renders an identical sky.
function getWeatherAtmosphere(code) {
  if (code == null) return 'linear-gradient(160deg,#4a5a6a 0%,#607080 50%,#8a9aaa 100%)';
  const h = new Date().getHours();
  const isNight = h < 6 || h >= 20;
  const isDusk = h >= 17 && h < 20;
  const isDawn = h >= 5 && h < 8;
  const isRain = code >= 51 && code <= 82;
  const isStorm = code >= 95;
  const isSnow = code >= 71 && code <= 77;
  const isFog = code >= 45 && code <= 48;
  const isClear = code <= 1;
  const isCloudy = code >= 2 && code <= 3;
  if (isStorm) return 'linear-gradient(160deg,#1a1a2e 0%,#2d1b4e 30%,#4a2545 60%,#1a1a2e 100%)';
  if (isSnow) return 'linear-gradient(160deg,#e8eaf0 0%,#b8c4d8 40%,#8899b3 70%,#667799 100%)';
  if (isRain && isNight) return 'linear-gradient(160deg,#0d1117 0%,#1a2332 40%,#243447 70%,#1a2332 100%)';
  if (isRain) return 'linear-gradient(160deg,#3d4f5f 0%,#566e7f 30%,#4a6070 60%,#384858 100%)';
  if (isFog) return 'linear-gradient(160deg,#8895a0 0%,#a0aab5 40%,#8895a0 70%,#778590 100%)';
  if (isNight && isClear) return 'linear-gradient(160deg,#0a0e27 0%,#141834 40%,#1a1f45 60%,#0d1230 100%)';
  if (isNight) return 'linear-gradient(160deg,#111827 0%,#1a2234 40%,#1f2942 100%)';
  if (isDusk && isClear) return 'linear-gradient(160deg,#1a1a3e 0%,#4a2040 25%,#c4584a 50%,#e8a050 75%,#d4804a 100%)';
  if (isDusk) return 'linear-gradient(160deg,#2a2040 0%,#4a3050 30%,#8a5040 60%,#c07050 100%)';
  if (isDawn && isClear) return 'linear-gradient(160deg,#1a2040 0%,#3a4070 25%,#7a90b0 50%,#d4a070 75%,#e8c090 100%)';
  if (isDawn) return 'linear-gradient(160deg,#2a3050 0%,#4a5575 40%,#7a90a0 70%,#a0b0b8 100%)';
  if (isClear) return 'linear-gradient(160deg,#1e5090 0%,#3a80c0 30%,#60a0d8 60%,#80c0e8 100%)';
  if (isCloudy) return 'linear-gradient(160deg,#4a5a6a 0%,#607080 30%,#7a8a98 60%,#8a9aaa 100%)';
  return 'linear-gradient(160deg,#3a5068 0%,#507088 40%,#6888a0 100%)';
}

// ─────────────────────────────────────────────────────────────────────
// Portal dashboard (shown when signed in + linked to a project)
// ─────────────────────────────────────────────────────────────────────
function ClientPortalDashboard({ user, onSignOut }) {
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [err, setErr] = useState('');
  const [viewingFile, setViewingFile] = useState(null);
  // null = top-level card grid; otherwise the section key
  // ('estimate' | 'timeline' | 'decks' | 'creative' | 'files' | 'meetings' | 'links' | 'notes')
  const [activeSection, setActiveSection] = useState(null);

  // Staff app sets html/body/#root to overflow:hidden so its internal
  // scroll containers handle scrolling. ClientPortal uses normal document
  // flow — restore overflow:auto on mount, revert on unmount.
  useEffect(() => {
    const h = document.documentElement;
    const b = document.body;
    const r = document.getElementById('root');
    const prev = { h: h.style.overflow, b: b.style.overflow, hHeight: h.style.height, bHeight: b.style.height, rOverflow: r?.style.overflow, rHeight: r?.style.height };
    h.style.overflow = 'auto'; h.style.height = 'auto';
    b.style.overflow = 'auto'; b.style.height = 'auto';
    if (r) { r.style.overflow = 'auto'; r.style.height = 'auto'; }
    return () => {
      h.style.overflow = prev.h; h.style.height = prev.hHeight;
      b.style.overflow = prev.b; b.style.height = prev.bHeight;
      if (r) { r.style.overflow = prev.rOverflow; r.style.height = prev.rHeight; }
    };
  }, []);

  // Browser-history handling — the in-app drill-down between the
  // overview grid and a section detail should respond to the browser
  // back button instead of taking the client off the portal.
  //
  //   - On mount: anchor the overview as the current history entry
  //     and restore from ?section=… if the URL is deep-linked.
  //   - Going INTO a section: pushState so a back press pops back to
  //     the overview without leaving /client.
  //   - On popstate: read state.portalSection (or the URL fallback) and
  //     mirror it into React state.
  useEffect(() => {
    const KEYS = ['estimate','timeline','decks','creative','files','meetings','links','notes'];
    const readUrlSection = () => {
      try { return new URLSearchParams(window.location.search).get('section') || null; }
      catch (e) { return null; }
    };
    const initial = readUrlSection();
    const validInitial = initial && KEYS.includes(initial) ? initial : null;
    if (validInitial) setActiveSection(validInitial);
    // Anchor the current entry with a known state so back lands cleanly.
    window.history.replaceState({ portalSection: validInitial }, '', validInitial ? `/client?section=${validInitial}` : '/client');

    const onPop = (e) => {
      const stateSection = e.state?.portalSection ?? null;
      const urlSection = readUrlSection();
      const next = stateSection || (urlSection && KEYS.includes(urlSection) ? urlSection : null);
      setActiveSection(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goToSection = useCallback((key) => {
    setActiveSection(key);
    if (key) {
      window.history.pushState({ portalSection: key }, '', `/client?section=${key}`);
    } else {
      window.history.pushState({ portalSection: null }, '', '/client');
    }
  }, []);

  const backToOverview = useCallback(() => {
    // Prefer history.back so the user's history stack stays consistent
    // (the popstate listener will flip activeSection to null). If
    // there's nothing meaningful to go back to, fall back to a direct
    // state change.
    if (window.history.state?.portalSection) {
      window.history.back();
    } else {
      setActiveSection(null);
    }
  }, []);

  // Per-project client-authored data
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [assetLinks, setAssetLinks] = useState([]);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set());
  const [posting, setPosting] = useState(false);
  // Files the client themselves uploaded into the project. Lives in
  // the 'client-uploads' Storage bucket; metadata rows are in
  // client_file_uploads. A DB trigger fires staff notifications on
  // every insert, so the bell pings on Morgan immediately.
  const [clientUploads, setClientUploads] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(null);   // current upload progress label
  const [uploadError, setUploadError] = useState('');
  // The client's own approve/reject/comment per asset. Map keyed by
  // asset_id so the Files view can render the current state inline.
  const [decisions, setDecisions] = useState({});
  // Per-asset draft comment state so typing doesn't spam the server.
  const [commentDrafts, setCommentDrafts] = useState({});
  // Carousel modal: which shared section is currently being scrolled
  // through, and which asset within that section is on screen.
  const [carouselSectionId, setCarouselSectionId] = useState(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  // Fireflies-synced meetings linked to this project. Separate from
  // project.data.meetings (legacy) — RLS gates these to meetings
  // auto-classified as 'client' so internal/vendor meetings stay
  // hidden.
  const [dbMeetings, setDbMeetings] = useState([]);
  // Weather state for the event-day forecast card
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Load the project the user is linked to (RLS scopes to one).
  const reloadEverything = useCallback(async () => {
    setErr('');
    try {
      // 1) Find the project_clients link(s) for this user.
      //    With RLS the user only sees their own rows.
      const links = await restFetch('/project_clients?select=project_id,project:projects(id,name,client,data,org_id)&order=invited_at.desc');
      if (!links?.length) {
        setErr('No projects are shared with this account yet.');
        setProject(null);
        return;
      }
      // Pick the most-recently invited project. (Future: a switcher UI.)
      const link = links[0];
      const proj = link.project;
      if (!proj) {
        setErr('Project access could not be loaded.');
        return;
      }

      // 2) Fetch contributions in parallel — RLS makes these
      //    naturally scoped to the same project.
      const [n, a, ts, ups, mps, dec] = await Promise.all([
        restFetch(`/client_notes?project_id=eq.${proj.id}&order=created_at.desc&limit=200`),
        restFetch(`/client_asset_links?project_id=eq.${proj.id}&order=added_at.desc&limit=200`),
        restFetch(`/client_task_status?project_id=eq.${proj.id}&done=eq.true&limit=500`),
        restFetch(`/client_file_uploads?project_id=eq.${proj.id}&order=created_at.desc&limit=200`).catch(() => []),
        // Fireflies-synced meetings linked to this project, gated to
        // classification='client' by the meetings_client_select RLS
        // policy. Embedded join via PostgREST.
        restFetch(`/meeting_projects?select=meeting:meetings(id,title,occurred_at,duration_minutes,summary,action_items,attendees,external_url,classification)&project_id=eq.${proj.id}&limit=200`).catch(() => []),
        // This client's own decisions on shared assets
        restFetch(`/client_asset_decisions?project_id=eq.${proj.id}&user_id=eq.${user.id}&limit=500`).catch(() => []),
      ]);
      setProject(proj);
      setNotes(n || []);
      setAssetLinks(a || []);
      setCompletedTaskIds(new Set((ts || []).map((row) => row.task_id)));
      setClientUploads(ups || []);
      // Index decisions by asset_id for O(1) lookup in the Files render
      const decisionMap = {};
      (dec || []).forEach(d => { if (d?.asset_id) decisionMap[d.asset_id] = d; });
      setDecisions(decisionMap);
      // Flatten the join + drop any nulls (PostgREST returns null when
      // the joined row is filtered out by its own RLS).
      const meetings = (mps || []).map((r) => r?.meeting).filter(Boolean);
      setDbMeetings(meetings);

      // 3) Best-effort touch of last_seen_at so staff can see when
      //    the client last looked at their portal.
      restFetch(`/project_clients?project_id=eq.${proj.id}&user_id=eq.${user.id}`, {
        method: 'PATCH',
        body: { last_seen_at: new Date().toISOString() },
      }).catch(() => {});
    } catch (e) {
      console.error('[client-portal] load failed:', e);
      setErr(e.message || 'Could not load your portal.');
    }
  }, [user.id]);

  useEffect(() => {
    setLoading(true);
    reloadEverything().finally(() => setLoading(false));
  }, [reloadEverything]);

  // Heartbeat — keep last_seen_at fresh while the tab is open so the
  // staff side can show live presence. 60s cadence is enough to read as
  // "active now" on the staff dashboard's 90s window.
  useEffect(() => {
    if (!project?.id || !user?.id) return;
    const ping = () => {
      restFetch(`/project_clients?project_id=eq.${project.id}&user_id=eq.${user.id}`, {
        method: 'PATCH',
        body: { last_seen_at: new Date().toISOString() },
      }).catch(() => {});
    };
    // Heartbeat every 3min — was 60s. Staff presence polling reads
    // last_seen_at on a 90s cadence so 3min is still snappy enough.
    const interval = setInterval(ping, 180000);
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [project?.id, user?.id]);

  // Staff app stores cats/timeline/etc inside the `data` jsonb on the
  // projects row, but a few read paths flatten them to the top level.
  // Look in both spots so the portal works for either shape.
  const pickArr = (k) => {
    if (!project) return [];
    if (Array.isArray(project.data?.[k])) return project.data[k];
    if (Array.isArray(project[k])) return project[k];
    return [];
  };
  const pickField = (k) => project?.data?.[k] ?? project?.[k] ?? '';
  const cats = pickArr('cats');
  const timeline = pickArr('timeline');
  const ag = pickArr('ag');
  const creativeAssets = pickArr('creativeAssets');
  const clientFiles = pickArr('clientFiles');
  const meetings = pickArr('meetings');
  // The client portal only ever sees rows NOT marked internal-only. Filtering
  // at the source means every downstream consumer (shared check, rendered rows,
  // PDF/XLS downloads, the summary stat) excludes hidden rows automatically.
  const workback = pickArr('workbackSchedule').filter(r => r && !r.hiddenFromClient);
  const eventDate = pickField('eventDate');
  const feeP = Number(pickField('feeP')) || 0;

  // Compute the full estimate (incl. agency fee) the way the staff Client
  // tab does it — calcProject runs ci() on each item so cost+margin items
  // get their clientPrice derived rather than read as 0.
  const comp = useMemo(() => {
    if (!cats.length && !ag.length) return null;
    try { return calcProject({ cats, ag, feeP }); } catch (e) { console.warn('[portal] calcProject failed', e); return null; }
  }, [cats, ag, feeP]);
  const grandTotal = comp?.grandTotal || 0;
  const tasksDone = timeline.filter((t) => t.status === 'done' || completedTaskIds.has(t.id)).length;

  // Decks & presentations — sourced from both surfaces in the staff app:
  //   1. creativeAssets (Creative > Decks section)
  //   2. clientFiles tagged with category='deck' (the Files tab in the
  //      staff Client view auto-tags PPTX/Keynote uploads as 'deck').
  // We also catch deck-y filenames as a fallback so renames don't lose
  // the categorisation. Duplicates by id are dropped.
  const looksLikeDeck = (x) => {
    const name = `${x?.name || ''} ${x?.fileName || ''}`.toLowerCase();
    return /deck|pitch|presentation|keynote|\.pptx?$|\.key$/.test(name);
  };
  const deckFromAssets = creativeAssets.filter((a) => a && (a.section === 'decks' || looksLikeDeck(a)));
  const deckFromFiles = clientFiles.filter((f) => f && f.clientVisible !== false && (f.category === 'deck' || looksLikeDeck(f)));
  const seenDeckIds = new Set();
  const visibleDecks = [...deckFromAssets, ...deckFromFiles].filter((d) => {
    if (!d?.id) return true;
    if (seenDeckIds.has(d.id)) return false;
    seenDeckIds.add(d.id);
    return true;
  });
  const deckIdSet = new Set(visibleDecks.map((d) => d.id).filter(Boolean));

  // Other creative assets: only those explicitly approved / sent / flagged client-visible.
  const visibleAssets = creativeAssets.filter((a) => {
    if (!a) return false;
    if (deckIdSet.has(a.id)) return false;  // already shown as a deck
    return a.status === 'approved' || a.status === 'sent' || a.clientVisible;
  });

  // Section label resolution. The staff side has DEFAULT_SECTIONS plus
  // project.customCreativeSections. We mirror those here so client
  // cards carry the same label even when staff renamed a built-in.
  const DEFAULT_PORTAL_SECTION_LABELS = {
    'decks': 'Decks & Presentations',
    'graphic': 'Graphic Design',
    '3d': '3D & Environmental',
    'photo-video': 'Photo & Video',
    'documents': 'Documents',
    'wardrobe': 'Talent Wardrobe',
    'other': 'Other Files',
  };
  const sectionLabelFor = (sectionId) => {
    if (!sectionId) return 'Other Files';
    const overrides = pickArr('customCreativeSections') || [];
    const custom = overrides.find(s => s?.id === sectionId);
    if (custom?.label) return custom.label;
    return DEFAULT_PORTAL_SECTION_LABELS[sectionId] || sectionId;
  };

  // Group sent assets by their staff section so the client sees one
  // sub-card per section name. Two ways an asset shows up here:
  //   1. Card-level share (preferred) — staff flipped the entire
  //      section in project.sentSectionIds. ALL assets in that
  //      section appear, regardless of their individual status.
  //   2. Per-asset share (legacy) — staff set asset.status='sent'
  //      on individual items. Those items appear even if the
  //      section itself isn't shared.
  const sharedSectionIds = new Set(pickArr('sentSectionIds') || []);
  // Workback schedule is opt-in: it only appears in the portal once staff
  // flip 'workback' into sentSectionIds from the Production › Workback view.
  const workbackShared = sharedSectionIds.has('workback') && workback.length > 0;
  const workbackRows = useMemo(() => {
    const parse = (s) => { const p = String(s || '').split('/'); if (p.length !== 3) return null; const d = new Date(+p[2], p[0] - 1, p[1]); return isNaN(d) ? null : d; };
    const evt = parse(eventDate);
    const colorMap = buildPhaseColorMap(workback);
    const long = (x) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const short = (x) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return workback.map((r) => {
      const d = parse(r.date);
      const end = parse(r.endDate);
      let tday = '';
      if (d && evt) { const days = Math.round((evt - d) / 86400000); tday = days === 0 ? 'Event' : days > 0 ? `T-${days}d` : `T+${Math.abs(days)}d`; }
      const details = [r.annotation, r.intro, ...((r.items || []).map((b) => (b && b.trim() ? `• ${b.trim()}` : '')).filter(Boolean))].filter(Boolean);
      // Multi-day milestones read as a range. Year appears once, on the
      // end — "Sep 10 – Sep 11, 2026" rather than repeating it.
      return {
        id: r.id,
        dateFull: d
          ? (end && end > d ? `${short(d)} – ${long(end)}` : long(d))
          : (r.date || ''),
        phase: r.phase || '',
        pc: phaseColor(r.phase, colorMap),
        name: r.name || '',
        details,
        owner: r.owner || '',
        status: r.status || 'Not Started',
        tday,
      };
    });
  }, [workback, eventDate]);
  const downloadWorkback = useCallback(async (kind) => {
    try {
      const base = `${project?.name || 'workback'}-workback-schedule`;
      if (kind === 'pdf') {
        const { exportWorkbackPDF } = await import('../utils/pdfExport.js');
        await exportWorkbackPDF(project, workback, { filename: `${base}.pdf` });
      } else {
        const { exportWorkbackXLSX } = await import('../utils/workbackXlsx.js');
        exportWorkbackXLSX(project, workback, { filename: `${base}.xlsx` });
      }
    } catch (e) { console.error('[portal] workback download failed', e); }
  }, [project, workback]);
  const sentAssetsBySection = (() => {
    const out = new Map();
    creativeAssets.forEach(a => {
      if (!a) return;
      if (deckIdSet.has(a.id)) return;  // dedup with the Decks card
      const sid = a.section || 'other';
      const sectionShared = sharedSectionIds.has(sid);
      const assetShared = a.status === 'sent';
      if (!sectionShared && !assetShared) return;
      if (!out.has(sid)) out.set(sid, []);
      out.get(sid).push(a);
    });
    return out;
  })();
  // Files: client-visible by default, but exclude items we're already
  // surfacing in the Decks card.
  const visibleFiles = clientFiles.filter((f) => f && f.clientVisible !== false && !deckIdSet.has(f.id));

  // Meetings: surface only ones the client was actually in (flagged as
  // client meetings OR have a client contact in the attendees list).
  // Within that, prefer ones with summaries/notes so the client lands
  // on something useful.
  const clientEmailSet = useMemo(() => {
    const set = new Set();
    (pickArr('clientContacts') || []).forEach((c) => c?.email && set.add(c.email.toLowerCase()));
    return set;
  }, [project]);
  // Normalize Fireflies-synced rows into the legacy meeting shape so
  // they render through the same code path.
  const normalizedDbMeetings = useMemo(() => (dbMeetings || []).map((m) => {
    const d = m.occurred_at ? new Date(m.occurred_at) : null;
    return {
      id: `db-${m.id}`,
      title: m.title || 'Meeting',
      date: d ? d.toISOString().slice(0, 10) : '',
      time: d ? d.toTimeString().slice(0, 5) : '',
      summary: m.summary || '',
      notes: '',
      attendees: m.attendees || [],
      location: '',
      externalUrl: m.external_url || null,
      actionItems: m.action_items || [],
      // RLS already gated to client meetings linked to this project,
      // so we trust the row and skip the attendee email check.
      isClientMeeting: true,
      _source: 'db',
    };
  }), [dbMeetings]);

  const visibleMeetings = [...meetings, ...normalizedDbMeetings]
    .filter((m) => {
      if (!m) return false;
      if (!m.summary && !m.notes) return false;
      if (m.isClientMeeting) return true;
      const attendees = m.attendees || [];
      return attendees.some((a) => {
        const email = typeof a === 'string' ? a : (a?.email || '');
        return email && clientEmailSet.has(email.toLowerCase());
      });
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // ── Mutations ────────────────────────────────────────────────
  const submitNote = async () => {
    const body = newNote.trim();
    if (!body || !project) return;
    setPosting(true);
    try {
      await restFetch('/client_notes', { method: 'POST', body: { project_id: project.id, user_id: user.id, body } });
      setNewNote('');
      await reloadEverything();
    } catch (e) { alert(`Could not save note: ${e.message || e}`); }
    finally { setPosting(false); }
  };

  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    try {
      await restFetch(`/client_notes?id=eq.${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) { alert(`Could not delete note: ${e.message || e}`); }
  };

  const detectProvider = (url) => {
    const u = url.toLowerCase();
    if (u.includes('dropbox.com')) return 'dropbox';
    if (u.includes('drive.google.com') || u.includes('docs.google.com')) return 'drive';
    if (u.includes('figma.com')) return 'figma';
    return 'other';
  };

  const submitLink = async () => {
    const url = newLinkUrl.trim();
    if (!url || !project) return;
    if (!/^https?:\/\//i.test(url)) { alert('Paste a full URL (https://...)'); return; }
    setPosting(true);
    try {
      await restFetch('/client_asset_links', {
        method: 'POST',
        body: {
          project_id: project.id,
          user_id: user.id,
          url,
          label: newLinkLabel.trim() || null,
          provider: detectProvider(url),
        },
      });
      setNewLinkUrl('');
      setNewLinkLabel('');
      await reloadEverything();
    } catch (e) { alert(`Could not save link: ${e.message || e}`); }
    finally { setPosting(false); }
  };

  const deleteLink = async (id) => {
    if (!confirm('Remove this link?')) return;
    try {
      await restFetch(`/client_asset_links?id=eq.${id}`, { method: 'DELETE' });
      setAssetLinks((prev) => prev.filter((a) => a.id !== id));
    } catch (e) { alert(`Could not remove link: ${e.message || e}`); }
  };

  // ── Upload a file the client picked into the project's
  //    'client-uploads' Storage bucket, then insert metadata into
  //    client_file_uploads. The insert trigger fans out notifications
  //    to all staff on the project — no separate API call needed.
  const uploadClientFile = async (file) => {
    if (!file || !project || !user?.id) return;
    setUploadError('');
    setUploadingFile(file.name);
    try {
      const session = await getSession();
      if (!session?.access_token) throw new Error('Sign in again to upload.');
      // Path: <project_id>/<timestamp>-<filename>. Timestamp keeps
      // re-uploads with the same name from clobbering each other.
      const safeName = file.name.replace(/[^A-Za-z0-9._\-]/g, '_').slice(0, 120);
      const storagePath = `${project.id}/${Date.now()}-${safeName}`;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const up = await fetch(
        `${supabaseUrl}/storage/v1/object/client-uploads/${encodeURIComponent(storagePath)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': file.type || 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: file,
        }
      );
      if (!up.ok) {
        const t = await up.text();
        throw new Error(`Upload failed: ${t.slice(0, 140)}`);
      }
      // Metadata row — triggers the staff notification fan-out
      const inserted = await restFetch('/client_file_uploads?select=*', {
        method: 'POST',
        body: {
          project_id: project.id,
          user_id: user.id,
          storage_path: storagePath,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type || null,
        },
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) setClientUploads(prev => [row, ...prev]);
    } catch (e) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploadingFile(null);
    }
  };

  const deleteClientUpload = async (row) => {
    if (!confirm(`Remove "${row.file_name}"?`)) return;
    setClientUploads(prev => prev.filter(r => r.id !== row.id));
    try {
      await restFetch(`/client_file_uploads?id=eq.${row.id}`, { method: 'DELETE' });
      const session = await getSession();
      if (session?.access_token) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        await fetch(`${supabaseUrl}/storage/v1/object/client-uploads/${encodeURIComponent(row.storage_path)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      }
    } catch (e) { alert(`Could not remove file: ${e.message || e}`); }
  };

  const publicUploadUrl = (storagePath) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/client-uploads/${storagePath.split('/').map(encodeURIComponent).join('/')}`;
  };

  // Upsert an approve/reject/comment decision for an asset. The unique
  // index on (project_id, user_id, asset_id) makes PostgREST's
  // resolution=merge-duplicates upsert do the right thing.
  const upsertDecision = async (assetId, patch) => {
    if (!project || !user?.id) return;
    const prior = decisions[assetId];
    const next = { ...(prior || { project_id: project.id, user_id: user.id, asset_id: assetId }), ...patch };
    setDecisions(prev => ({ ...prev, [assetId]: { ...next, asset_id: assetId } }));
    try {
      await restFetch('/client_asset_decisions', {
        method: 'POST',
        body: next,
        prefer: 'return=minimal,resolution=merge-duplicates',
      });
    } catch (e) {
      console.error('[client-portal] save decision failed:', e?.message || e);
    }
  };

  // ── Weather fetch for the event-day forecast card. Open-Meteo,
  //    no API key. Reads eventDate + eventCity from project.data
  //    (the JSONB column) — top-level fields don't exist on the raw
  //    PostgREST row the portal loads.
  useEffect(() => {
    if (!project || weather || weatherLoading) return;
    const eventDate = project?.data?.eventDate ?? project?.eventDate;
    const eventCity = project?.data?.eventCity ?? project?.eventCity;
    const vendors = project?.data?.vendors ?? project?.vendors ?? [];
    if (!eventDate) return;
    setWeatherLoading(true);
    (async () => {
      try {
        const venueVendor = vendors.find(v => v.vendorType === 'venue');
        const city = venueVendor?.city || eventCity || '';
        let lat = 40.7128, lon = -74.006;  // NYC fallback
        if (city) {
          const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
          const gj = await g.json();
          if (gj.results?.[0]) { lat = gj.results[0].latitude; lon = gj.results[0].longitude; }
        }
        // Forecast for the event date when it's within 16 days; else current
        const eventISO = (eventDate || '').includes('/')
          ? (() => { const [m, d, y] = eventDate.split('/'); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; })()
          : eventDate;
        const today = new Date();
        const target = new Date(eventISO);
        const dayDiff = Math.floor((target - today) / 86400000);
        // Within 10 days of the event → forecast the actual event date.
        // Open-Meteo's daily forecast covers 16 days so we have headroom.
        // Earlier than that, show current conditions + a note that this
        // will switch to the event-day forecast at the 10-day mark.
        if (dayDiff >= 0 && dayDiff <= 10) {
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&start_date=${eventISO}&end_date=${eventISO}&temperature_unit=fahrenheit&timezone=auto`);
          const data = await res.json();
          if (data.daily?.weather_code?.length) {
            setWeather({
              high: Math.round(data.daily.temperature_2m_max[0]),
              low: Math.round(data.daily.temperature_2m_min[0]),
              code: data.daily.weather_code[0],
              city: city || 'event city',
              isForecast: true,
              daysUntilForecastWindow: 0,
            });
          }
        } else {
          // Outside the 10-day window — show today's conditions and
          // surface how many days until the event-day forecast kicks in.
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`);
          const data = await res.json();
          if (data.current) {
            setWeather({
              temp: Math.round(data.current.temperature_2m),
              code: data.current.weather_code,
              city: city || 'event city',
              isForecast: false,
              daysUntilForecastWindow: Math.max(0, dayDiff - 10),
            });
          }
        }
      } catch (e) { console.warn('[client-portal weather]', e); }
      finally { setWeatherLoading(false); }
    })();
  }, [project, weather, weatherLoading]);

  const toggleTaskDone = async (task) => {
    if (!project) return;
    const isCurrentlyDone = task.status === 'done' || completedTaskIds.has(task.id);
    const nextDone = !isCurrentlyDone;
    // Optimistic local update
    setCompletedTaskIds((prev) => {
      const n = new Set(prev);
      if (nextDone) n.add(task.id); else n.delete(task.id);
      return n;
    });
    try {
      // Upsert by (project_id, task_id) unique constraint
      await restFetch('/client_task_status?on_conflict=project_id,task_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          project_id: project.id,
          task_id: task.id,
          done: nextDone,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      // Revert on failure
      setCompletedTaskIds((prev) => {
        const n = new Set(prev);
        if (nextDone) n.delete(task.id); else n.add(task.id);
        return n;
      });
      alert(`Could not update task: ${e.message || e}`);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: PAPER, color: FADED, fontFamily: T.sans }}>
        <div style={{ textAlign: 'center' }}>
          <ESWordmark height={14} color={INK} />
          <div style={{ marginTop: 18, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700, color: FADED }}>Loading</div>
        </div>
      </div>
    );
  }

  if (err && !project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: PAPER, color: INK, fontFamily: T.sans }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '40px 24px' }}>
          <ESWordmark height={14} color={INK} />
          <div style={{ marginTop: 24, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, color: INK }}>{err}</div>
          <button onClick={onSignOut} style={{ marginTop: 24, padding: '10px 22px', background: 'transparent', color: INK, border: `1px solid ${INK}`, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Section catalogue — single source of truth for the summary grid
  // and the detail header. Each section has a short summary string
  // shown on its top-line card, a count, and a hint about content.
  const sections = [
    { key: 'estimate', label: 'Estimate', value: comp && grandTotal ? f0(grandTotal) : 'Pending', sub: cats.length ? `${cats.length} ${cats.length === 1 ? 'category' : 'categories'}` : 'Not yet published', empty: !comp || grandTotal === 0 },
    { key: 'timeline', label: 'Production Timeline', value: timeline.length ? `${tasksDone} / ${timeline.length}` : 'Pending', sub: timeline.length ? 'Tasks complete' : 'Not yet scheduled', empty: timeline.length === 0 },
    ...(workbackShared ? [{ key: 'workback', label: 'Workback Schedule', value: workback.length, sub: 'Key dates & milestones', empty: false }] : []),
    { key: 'decks', label: 'Decks & Presentations', value: visibleDecks.length || '—', sub: visibleDecks.length ? 'View pitch decks' : 'None shared', empty: visibleDecks.length === 0 },
    { key: 'creative', label: 'Creative & Design', value: sentAssetsBySection.size || '—', sub: sentAssetsBySection.size ? `${sentAssetsBySection.size} ${sentAssetsBySection.size === 1 ? 'card shared' : 'cards shared'}` : 'None shared', empty: sentAssetsBySection.size === 0 },
    { key: 'files', label: 'Files', value: (visibleFiles.length + clientUploads.length) || '—', sub: (visibleFiles.length + clientUploads.length) ? `${visibleFiles.length} shared · ${clientUploads.length} yours` : 'Upload or view files', empty: (visibleFiles.length + clientUploads.length) === 0 },
    { key: 'meetings', label: 'Meeting Recaps', value: visibleMeetings.length || '—', sub: visibleMeetings.length ? 'Latest discussion' : 'No recaps yet', empty: visibleMeetings.length === 0 },
    { key: 'links', label: 'Shared Asset Links', value: assetLinks.length || 'Drop in', sub: 'Drive / Dropbox / Figma', empty: false },
    { key: 'notes', label: 'Notes & Feedback', value: notes.length || 'Leave one', sub: 'Talk to the team', empty: false },
  ];

  const active = sections.find((s) => s.key === activeSection);

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: T.sans }}>
      <div style={{ height: 1, background: RULE }} />

      {/* Sticky nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        borderBottom: `1px solid ${RULE}`,
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24,
        padding: '14px clamp(20px,3vw,40px)',
      }}>
        <a href="https://earlyspring.nyc" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifySelf: 'start' }}>
          <ESWordmark height={14} color={INK} />
        </a>
        <div style={{ justifySelf: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: FADED }}>
          Lab · {project.client || 'Client'}
        </div>
        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, color: FADED }}>{user.email}</span>
          <button onClick={onSignOut} style={{ padding: '6px 14px', background: 'transparent', color: INK, border: `1px solid ${INK}`, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Hero / contextual header.
          On the grid: full hero with project name.
          In a detail view: compact header with Back button + section label. */}
      <header style={{ maxWidth: 1400, margin: '0 auto', padding: active
        ? '24px clamp(20px,3vw,40px) 0'
        : 'clamp(40px,5vw,72px) clamp(20px,3vw,40px) clamp(20px,3vw,32px)' }}>
        {active ? (
          <div>
            <button onClick={backToOverview} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: INK, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', padding: 0, fontFamily: T.sans }}>
              <span style={{ fontSize: 14 }}>←</span> Back to overview
            </button>
            <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
              <Kicker>{project.client || 'Client'}</Kicker>
              <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: '-0.024em', lineHeight: 1.05, margin: 0, color: INK }}>{active.label}</h1>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'clamp(14px,2vw,22px)' }}>
            {(() => {
              // Personalized greeting. Pulls a first name from auth
              // metadata (set when we provisioned the account), falls
              // back to the email's local part. Time-of-day swap keeps
              // it from reading as a stiff template.
              const meta = user?.user_metadata || {};
              const fullName = meta.full_name || meta.name || '';
              const firstName = (fullName.trim().split(/\s+/)[0]) || (user?.email ? user.email.split('@')[0] : '');
              const hour = new Date().getHours();
              const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
              return (
                <Kicker>{firstName ? `${greet}, ${firstName}` : 'Project Portal'}</Kicker>
              );
            })()}
            <h1 style={{ fontSize: 'clamp(32px,5vw,64px)', fontWeight: 800, letterSpacing: '-0.026em', lineHeight: 1.0, margin: 0, color: INK }}>
              {project.name}
            </h1>
            <div style={{ fontSize: 14, color: FADED, letterSpacing: '.04em', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <span>{project.client}</span>
              {eventDate && <span>Event · {eventDate}</span>}
              <span>Prepared by Early Spring</span>
            </div>
          </div>
        )}
      </header>

      {/* Main: summary grid (default) OR a single detail card */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(24px,3vw,40px) clamp(20px,3vw,40px) clamp(40px,5vw,72px)' }}>
        {/* Event-day strip — countdown + weather. Only on overview,
            only when there's an event date to count down to. */}
        {!active && (project?.data?.eventDate || project?.eventDate) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 16 }}>
            <CountdownCard eventDate={project?.data?.eventDate ?? project?.eventDate} INK={INK} PAPER={PAPER} RULE={RULE} FADED={FADED} GOLD={GOLD}/>
            <WeatherCard weather={weather} loading={weatherLoading} INK={INK} PAPER={PAPER} RULE={RULE} FADED={FADED} GOLD={GOLD}/>
          </div>
        )}
        {/* Top-line summary grid — only shown on the overview */}
        {!active && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
            {sections.map((s) => (
              <button key={s.key} onClick={() => goToSection(s.key)} style={{
                all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14,
                background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4, padding: '22px 22px 20px',
                transition: 'border-color .15s, box-shadow .15s, transform .15s',
                position: 'relative',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = INK; e.currentTarget.style.boxShadow = '0 6px 22px rgba(15,82,186,.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = RULE; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ height: 3, background: s.empty ? RULE : INK, marginLeft: -22, marginRight: -22, marginTop: -22 }} />
                <Kicker>{s.label}</Kicker>
                <div className="num" style={{ fontSize: 'clamp(26px,3vw,38px)', fontWeight: 800, letterSpacing: '-0.022em', color: INK, fontFamily: T.mono, lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: FADED, fontWeight: 600, letterSpacing: '.04em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{s.sub}</span>
                  <span style={{ color: INK, fontSize: 14 }}>→</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Detail view container — one card at a time */}
        {active && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>

      {/* Estimate detail */}
      {activeSection === 'estimate' && (
      <PortalCard kicker="Estimate" title={comp && grandTotal ? `${f0(grandTotal)}` : null} accent span="full">
        {!comp || grandTotal === 0 ? (
          <div style={{ color: FADED, fontSize: 14, lineHeight: 1.6 }}>
            The estimate hasn't been published yet. Your producer will share figures once they're ready.
          </div>
        ) : (
        <div style={{ display: 'grid', gap: 0, maxWidth: 960 }}>
          {cats.map((c, ciIdx) => {
            const priced = (c.items || []).map(ci).filter((it) => (it.clientPrice || 0) > 0);
            if (priced.length === 0) return null;
            const catTotal = priced.reduce((s, it) => s + it.clientPrice, 0);
            return (
              <div key={ciIdx} style={{ borderTop: `1px solid ${INK}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '18px 0 10px' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: INK }}>{c.name}</span>
                  <span className="num" style={{ fontSize: 16, fontFamily: T.mono, color: INK, fontWeight: 600 }}>{f0(catTotal)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {priced.map((it, ii, arr) => (
                    <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 14, color: FADED, lineHeight: 1.55, borderBottom: ii === arr.length - 1 ? 'none' : `1px solid ${RULE}`, gap: 16 }}>
                      <span style={{ flex: 1 }}>
                        {it.name}
                        {it.details ? <em style={{ marginLeft: 8, fontStyle: 'italic', opacity: 0.75 }}>{it.details}</em> : null}
                      </span>
                      <span className="num" style={{ fontFamily: T.mono, whiteSpace: 'nowrap' }}>{f0(it.clientPrice)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Agency line items + fee, if any. */}
          {(() => {
            const agPriced = ag.map(ci).filter((it) => (it.clientPrice || 0) > 0);
            const agFee = comp.agencyFee?.clientPrice || 0;
            if (agPriced.length === 0 && agFee === 0) return null;
            const agTotal = agPriced.reduce((s, it) => s + it.clientPrice, 0);
            return (
              <div style={{ borderTop: `1px solid ${INK}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '18px 0 10px' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: INK }}>Agency</span>
                  <span className="num" style={{ fontSize: 16, fontFamily: T.mono, color: INK, fontWeight: 600 }}>{f0(agTotal + agFee)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {agPriced.map((it, ii) => (
                    <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 14, color: FADED, lineHeight: 1.55, borderBottom: `1px solid ${RULE}`, gap: 16 }}>
                      <span style={{ flex: 1 }}>{it.name}</span>
                      <span className="num" style={{ fontFamily: T.mono, whiteSpace: 'nowrap' }}>{f0(it.clientPrice)}</span>
                    </div>
                  ))}
                  {agFee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontSize: 14, color: INK, fontWeight: 700, lineHeight: 1.55 }}>
                      <span>Agency Fee{feeP ? ` (${Math.round(feeP * 100)}%)` : ''}</span>
                      <span className="num" style={{ fontFamily: T.mono }}>{f0(agFee)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '22px 0 0', borderTop: `2px solid ${INK}`, marginTop: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: INK }}>Grand Total</span>
            <span className="num" style={{ fontSize: 24, fontFamily: T.mono, fontWeight: 800, color: INK }}>{f0(grandTotal)}</span>
          </div>
        </div>
        )}
      </PortalCard>
      )}

      {/* Production Timeline — full-width card with gantt + checkoff list */}
      {activeSection === 'timeline' && timeline.length === 0 && (
        <PortalCard kicker="Production Timeline" span="full">
          <div style={{ color: FADED, fontSize: 14, lineHeight: 1.6 }}>
            No tasks have been added to the production schedule yet. Check back once your producer has set the timeline.
          </div>
        </PortalCard>
      )}
      {activeSection === 'timeline' && timeline.length > 0 && (
        <PortalCard kicker="Production Timeline" span="full" accent>
          <div style={{ display: 'grid', gap: 20 }}>
            <PortalGantt tasks={timeline} completedTaskIds={completedTaskIds} />

            <div style={{ display: 'grid', gap: 0 }}>
              {timeline.map((t, i) => {
                const clientDone = completedTaskIds.has(t.id);
                const staffDone = t.status === 'done';
                const isDone = staffDone || clientDone;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: `1px solid ${RULE}`, fontSize: 14 }}>
                    <button
                      onClick={() => toggleTaskDone(t)}
                      title={isDone ? 'Mark not done' : 'Mark done'}
                      style={{
                        width: 22, height: 22, borderRadius: 4,
                        border: `1.5px solid ${isDone ? INK : RULE}`,
                        background: isDone ? INK : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      {isDone && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>}
                    </button>
                    <span style={{ color: INK, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.55 : 1 }}>
                      {t.name}
                      {t.category && <em style={{ marginLeft: 8, color: FADED, fontStyle: 'italic', fontWeight: 400 }}>{t.category}</em>}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: staffDone ? INK : t.status === 'roadblocked' ? '#9A1A1A' : FADED, minWidth: 96, textAlign: 'right' }}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                    <span className="num" style={{ fontSize: 12, color: FADED, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
                      {t.startDate && t.endDate ? `${t.startDate} — ${t.endDate}` : (t.startDate || t.endDate || '')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </PortalCard>
      )}

      {/* Workback Schedule detail */}
      {activeSection === 'workback' && (
        <PortalCard
          kicker="Workback Schedule"
          title={`${workbackRows.length} milestone${workbackRows.length === 1 ? '' : 's'}`}
          span="full"
          accent
          action={(
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => downloadWorkback('pdf')} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${RULE}`, background: '#fff', color: INK, cursor: 'pointer', fontFamily: T.sans }}>↓ PDF</button>
              <button onClick={() => downloadWorkback('xls')} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${RULE}`, background: '#fff', color: INK, cursor: 'pointer', fontFamily: T.sans }}>↓ XLS</button>
            </div>
          )}
        >
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontFamily: T.sans }}>
              <thead>
                <tr>
                  {['Date', 'Phase', 'Milestone', 'Owner', 'Status', 'T-Day'].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 3 ? (i === 5 ? 'right' : 'center') : 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: FADED, padding: '0 10px 10px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workbackRows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                    <td style={{ padding: '12px 10px', fontSize: 12, color: INK, fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top', fontFamily: T.mono }}>{r.dateFull}</td>
                    <td style={{ padding: '12px 10px', verticalAlign: 'top' }}>
                      {r.phase ? <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: r.pc.fg, background: r.pc.bg, whiteSpace: 'nowrap' }}>{r.phase}</span> : <span style={{ color: FADED }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 10px', fontSize: 13, color: INK, verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      {r.details.map((d, di) => (
                        <div key={di} style={{ fontSize: 12, color: FADED, marginTop: 3, lineHeight: 1.45 }}>{d}</div>
                      ))}
                    </td>
                    <td style={{ padding: '12px 10px', fontSize: 12, color: FADED, textAlign: 'center', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{r.owner || '—'}</td>
                    <td style={{ padding: '12px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: FADED, textAlign: 'center', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{r.status}</td>
                    <td className="num" style={{ padding: '12px 10px', fontSize: 12, color: FADED, textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', fontFamily: T.mono }}>{r.tday}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>
      )}

      {/* Decks & Presentations detail */}
      {activeSection === 'decks' && visibleDecks.length === 0 && (
        <PortalCard kicker="Decks & Presentations">
          <div style={{ color: FADED, fontSize: 14, lineHeight: 1.6 }}>No decks have been shared yet.</div>
        </PortalCard>
      )}
      {activeSection === 'decks' && visibleDecks.length > 0 && (
        <PortalCard kicker="Decks & Presentations" title={`${visibleDecks.length} ${visibleDecks.length === 1 ? 'deck' : 'decks'}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
            {visibleDecks.map((d) => {
              const linkUrl = d.linkUrl || (d.fileName && /^https?:/.test(d.fileName) ? d.fileName : null);
              const isImg = d.isImage || /\.(png|jpe?g|gif|webp|svg)$/i.test(d.fileName || '');
              const ext = (d.fileName || '').split('.').pop().toUpperCase();
              const previewable = canPreview(d);
              const onOpen = () => {
                if (linkUrl) { window.open(linkUrl, '_blank', 'noopener'); return; }
                if (previewable) { setViewingFile(d); return; }
                if (d.fileData) {
                  const a = document.createElement('a');
                  a.href = d.fileData; a.download = d.fileName || d.name || 'deck'; a.click();
                }
              };
              return (
                <button key={d.id} onClick={onOpen} style={{ all: 'unset', cursor: 'pointer', display: 'block', border: `1px solid ${RULE}`, borderRadius: 6, overflow: 'hidden', background: PAPER, transition: 'all .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = INK; e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,82,186,.10)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = RULE; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ aspectRatio: '16 / 10', background: 'rgba(15,82,186,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {isImg && d.fileData ? (
                      <img src={d.fileData} alt={d.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>
                        {linkUrl ? '↗ Link' : (ext || 'Deck')}
                      </span>
                    )}
                    {previewable && !isImg && (
                      <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 700, color: INK, background: PAPER, padding: '2px 6px', borderRadius: 3, letterSpacing: '.06em', textTransform: 'uppercase' }}>PDF</span>
                    )}
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, color: INK, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.fileName || 'Untitled deck'}</div>
                    <div style={{ fontSize: 10, color: FADED, marginTop: 4, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>
                      {linkUrl ? 'Open in new tab' : previewable ? 'Click to preview' : 'Click to download'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </PortalCard>
      )}

      {/* Creative & Design detail — one card per shared staff section.
          Click a card → opens the carousel viewer for that section's
          assets, where the client can navigate, approve, reject,
          comment, and download. */}
      {activeSection === 'creative' && sentAssetsBySection.size === 0 && (
        <PortalCard kicker="Creative & Design">
          <div style={{ color: FADED, fontSize: 14, lineHeight: 1.6 }}>Nothing shared yet. Early Spring will push cards here when they're ready for your review.</div>
        </PortalCard>
      )}
      {activeSection === 'creative' && sentAssetsBySection.size > 0 && (
        <PortalCard kicker="Creative & Design" title={`${sentAssetsBySection.size} ${sentAssetsBySection.size === 1 ? 'card' : 'cards'}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
            {Array.from(sentAssetsBySection.entries()).map(([sectionId, items]) => {
              const cover = items.find(it => it.isImage || /\.(png|jpe?g|gif|webp|svg)$/i.test(it.fileName || ''));
              const coverUrl = cover ? (cover.fileData || (cover.storagePath ? publicFileUrl(cover.storagePath) : null) || cover.driveLink) : null;
              const decidedCount = items.filter(it => decisions[it.id]?.decision).length;
              return (
                <button key={sectionId} onClick={() => { setCarouselSectionId(sectionId); setCarouselIdx(0); }} style={{ all: 'unset', cursor: 'pointer', display: 'block', border: `1px solid ${RULE}`, borderRadius: 6, overflow: 'hidden', background: PAPER, transition: 'all .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = INK; e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,82,186,.10)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = RULE; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <div style={{ aspectRatio: '4 / 3', background: 'rgba(15,82,186,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {coverUrl ? (
                      <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 28, color: FADED, opacity: .35 }}>—</span>
                    )}
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sectionLabelFor(sectionId)}</div>
                    <div style={{ fontSize: 11, color: FADED, marginTop: 4, fontFamily: T.mono }}>
                      {items.length} {items.length === 1 ? 'item' : 'items'}{decidedCount > 0 ? ` · ${decidedCount} reviewed` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </PortalCard>
      )}

      {/* Files detail */}
      {activeSection === 'files' && (
        <PortalCard kicker="Files" title={(visibleFiles.length + clientUploads.length) ? `${visibleFiles.length + clientUploads.length} ${(visibleFiles.length + clientUploads.length) === 1 ? 'file' : 'files'}` : null}>
          {/* Upload zone — always visible in this tab so the client can
              add files even when nothing has been shared yet */}
          <ClientUploadZone
            uploading={uploadingFile}
            error={uploadError}
            onUpload={uploadClientFile}
            PAPER={PAPER} INK={INK} RULE={RULE} FADED={FADED} GOLD={GOLD}
          />

          {/* Sent-assets section cards. One sub-card per staff section
              that has shared items. Each item gets approve / reject /
              comment controls that persist via client_asset_decisions. */}
          {sentAssetsBySection.size > 0 && (
            <div style={{ marginTop: 20, display: 'grid', gap: 16 }}>
              {Array.from(sentAssetsBySection.entries()).map(([sectionId, items]) => (
                <div key={sectionId} style={{ background: PAPER, border: `1px solid ${RULE}`, borderRadius: 6, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: INK, letterSpacing: '.08em', textTransform: 'uppercase' }}>{sectionLabelFor(sectionId)}</div>
                    <div style={{ fontSize: 10, color: FADED, fontFamily: T.mono }}>{items.length} {items.length === 1 ? 'item' : 'items'}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 0 }}>
                    {items.map((a, idx) => {
                      const d = decisions[a.id] || {};
                      const isApproved = d.decision === 'approved';
                      const isRejected = d.decision === 'rejected';
                      const draftKey = a.id;
                      const draft = commentDrafts[draftKey] !== undefined ? commentDrafts[draftKey] : (d.comment || '');
                      const fileUrl = a.fileData || (a.storagePath ? publicFileUrl(a.storagePath) : null) || a.driveLink;
                      return (
                        <div key={a.id} style={{ padding: '14px 0', borderTop: idx === 0 ? 'none' : `1px solid ${RULE}` }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'start' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: INK, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || a.fileName || 'Untitled'}</div>
                              {a.fileName && a.name && a.fileName !== a.name && <div style={{ fontSize: 10, color: FADED, fontFamily: T.mono, marginTop: 2 }}>{a.fileName}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '5px 12px', border: `1px solid ${RULE}`, borderRadius: 4, background: PAPER, color: INK, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: T.sans }}>View</a>}
                              <button onClick={() => upsertDecision(a.id, { decision: isApproved ? null : 'approved' })} title={isApproved ? 'Approved' : 'Approve'} style={{ width: 30, height: 28, padding: 0, border: `1px solid ${isApproved ? '#1F7A4F' : RULE}`, borderRadius: 4, background: isApproved ? '#1F7A4F' : PAPER, color: isApproved ? '#fff' : '#1F7A4F', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, lineHeight: 1 }}>✓</button>
                              <button onClick={() => upsertDecision(a.id, { decision: isRejected ? null : 'rejected' })} title={isRejected ? 'Rejected' : 'Reject'} style={{ width: 30, height: 28, padding: 0, border: `1px solid ${isRejected ? '#7A1F1F' : RULE}`, borderRadius: 4, background: isRejected ? '#7A1F1F' : PAPER, color: isRejected ? '#fff' : '#7A1F1F', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, lineHeight: 1 }}>×</button>
                            </div>
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <textarea value={draft} onChange={(e) => setCommentDrafts(prev => ({ ...prev, [draftKey]: e.target.value }))} onBlur={() => { if ((draft || '') !== (d.comment || '')) upsertDecision(a.id, { comment: draft }); }} placeholder="Comment or feedback (optional)" rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 4, border: `1px solid ${RULE}`, background: PAPER, color: INK, fontSize: 12, fontFamily: T.sans, outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
                          </div>
                          {(isApproved || isRejected) && <div style={{ fontSize: 10, color: isApproved ? '#1F7A4F' : '#7A1F1F', fontWeight: 600, marginTop: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>{isApproved ? '✓ You approved this' : '× You rejected this'}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {visibleFiles.length === 0 && clientUploads.length === 0 && sentAssetsBySection.size === 0 ? (
            <div style={{ color: FADED, fontSize: 14, lineHeight: 1.6, marginTop: 18 }}>No files yet. Drop something in above, or wait for Early Spring to share assets here.</div>
          ) : (
            <div style={{ display: 'grid', gap: 0, marginTop: 18 }}>
              {/* Client's own uploads first — they're the freshest */}
              {clientUploads.map((u, idx) => (
                <div key={u.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14, alignItems: 'center', padding: '12px 0', borderTop: idx === 0 ? 'none' : `1px solid ${RULE}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '.10em', textTransform: 'uppercase', minWidth: 56 }}>You sent</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: INK, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.file_name}</div>
                    <div style={{ fontSize: 10, color: FADED, fontFamily: T.mono, marginTop: 2 }}>{u.file_size ? `${(u.file_size / 1024).toFixed(1)} KB · ` : ''}{new Date(u.created_at).toLocaleDateString()}</div>
                  </div>
                  <a href={publicUploadUrl(u.storage_path)} target="_blank" rel="noopener noreferrer" style={{ padding: '5px 12px', border: `1px solid ${RULE}`, borderRadius: 4, background: PAPER, color: INK, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: T.sans }}>Open</a>
                  <button onClick={() => deleteClientUpload(u)} title="Remove" style={{ padding: '5px 10px', border: 'none', background: 'transparent', color: FADED, fontSize: 14, cursor: 'pointer', fontFamily: T.sans, lineHeight: 1 }}>×</button>
                </div>
              ))}
              {/* Then the files staff shared */}
              {visibleFiles.map((f, idx) => {
                const previewable = canPreview(f);
                const open = () => {
                  if (previewable) { setViewingFile(f); return; }
                  if (f.fileData) { const el = document.createElement('a'); el.href = f.fileData; el.download = f.fileName || f.name || 'file'; el.click(); return; }
                  if (f.storagePath) { const url = publicFileUrl(f.storagePath); if (url) { window.open(url, '_blank', 'noopener'); return; } }
                  if (f.driveLink) window.open(f.driveLink, '_blank', 'noopener');
                };
                return (
                  <div key={f.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'center', padding: '12px 0', borderTop: (idx === 0 && clientUploads.length === 0) ? 'none' : `1px solid ${RULE}` }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase', minWidth: 56 }}>{f.category || 'File'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: INK, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || f.fileName || 'Untitled'}</div>
                      {f.fileName && f.name && f.fileName !== f.name && <div style={{ fontSize: 10, color: FADED, fontFamily: T.mono, marginTop: 2 }}>{f.fileName}</div>}
                    </div>
                    <button onClick={open} style={{ padding: '5px 12px', border: `1px solid ${RULE}`, borderRadius: 4, background: PAPER, color: INK, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>
                      {previewable ? 'View' : f.driveLink ? 'Open' : 'Download'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </PortalCard>
      )}

      {/* Meeting Recaps detail */}
      {activeSection === 'meetings' && visibleMeetings.length === 0 && (
        <PortalCard kicker="Meeting Recaps">
          <div style={{ color: FADED, fontSize: 14, lineHeight: 1.6 }}>No recaps yet.</div>
        </PortalCard>
      )}
      {activeSection === 'meetings' && visibleMeetings.length > 0 && (
        <PortalCard kicker="Meeting Recaps" title={`${visibleMeetings.length} ${visibleMeetings.length === 1 ? 'recap' : 'recaps'}`}>
          <div style={{ display: 'grid', gap: 0 }}>
            {visibleMeetings.map((m, i) => (
              <div key={m.id || i} style={{ padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${RULE}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{m.title}</span>
                  <span style={{ fontSize: 11, color: FADED, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{m.date}{m.time ? ` · ${m.time}` : ''}</span>
                </div>
                {m.location && <div style={{ fontSize: 11, color: FADED, marginTop: 4 }}>{m.location}</div>}
                {(m.summary || m.notes) && (
                  <div style={{ fontSize: 13, color: INK, marginTop: 8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{m.summary || m.notes}</div>
                )}
              </div>
            ))}
          </div>
        </PortalCard>
      )}

      {/* Shared Asset Links detail */}
      {activeSection === 'links' && (
      <PortalCard kicker="Shared Asset Links" title="Drop a folder">
        <div style={{ display: 'grid', gap: 16 }}>
          <p style={{ fontSize: 13, color: FADED, lineHeight: 1.55, margin: 0 }}>
            Paste a Dropbox, Google Drive, or Figma link instead of uploading each file. We'll pick it up on our end.
          </p>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Label (optional)</label>
                <input
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  placeholder="e.g. Brand assets"
                  style={{ width: '100%', padding: '10px 0 8px', border: 'none', borderBottom: `1px solid ${RULE}`, background: 'transparent', color: INK, fontSize: 13, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>URL</label>
                <input
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  onKeyDown={(e) => e.key === 'Enter' && submitLink()}
                  style={{ width: '100%', padding: '10px 0 8px', border: 'none', borderBottom: `1px solid ${RULE}`, background: 'transparent', color: INK, fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>
            <div>
              <button
                onClick={submitLink} disabled={!newLinkUrl.trim() || posting}
                style={{ padding: '9px 20px', background: INK, color: PAPER, border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: newLinkUrl.trim() && !posting ? 'pointer' : 'default', opacity: newLinkUrl.trim() && !posting ? 1 : 0.4, fontFamily: T.sans }}
              >
                Add link
              </button>
            </div>
          </div>

          {assetLinks.length === 0 ? (
            <div style={{ fontSize: 12, color: FADED }}>No links added yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 0 }}>
              {assetLinks.map((a, idx) => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: idx === 0 ? `1px solid ${RULE}` : `1px solid ${RULE}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase', minWidth: 56 }}>{a.provider || 'link'}</span>
                  <div style={{ minWidth: 0 }}>
                    {a.label && <div style={{ fontSize: 13, color: INK, fontWeight: 600 }}>{a.label}</div>}
                    <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: FADED, textDecoration: 'underline', wordBreak: 'break-all' }}>{a.url}</a>
                  </div>
                  <span style={{ fontSize: 11, color: FADED, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
                    {new Date(a.added_at).toLocaleDateString()}
                  </span>
                  {a.user_id === user.id && (
                    <button onClick={() => deleteLink(a.id)} style={{ background: 'transparent', border: 'none', color: FADED, fontSize: 11, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PortalCard>
      )}

      {/* Notes & Feedback detail */}
      {activeSection === 'notes' && (
      <PortalCard kicker="Notes &amp; Feedback" title="Tell us what you think">
        <div style={{ display: 'grid', gap: 12 }}>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Share thoughts, feedback, or questions…"
            rows={4}
            style={{ width: '100%', padding: 14, background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4, color: INK, fontSize: 13, fontFamily: T.sans, outline: 'none', resize: 'vertical', lineHeight: 1.55, boxSizing: 'border-box' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = INK)}
            onBlur={(e) => (e.currentTarget.style.borderColor = RULE)}
          />
          <div>
            <button
              onClick={submitNote} disabled={!newNote.trim() || posting}
              style={{ padding: '9px 20px', background: INK, color: PAPER, border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: newNote.trim() && !posting ? 'pointer' : 'default', opacity: newNote.trim() && !posting ? 1 : 0.4, fontFamily: T.sans }}
            >
              Post note
            </button>
          </div>

          {notes.length === 0 ? (
            <div style={{ fontSize: 12, color: FADED }}>No notes yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 0, marginTop: 4 }}>
              {notes.map((n, idx) => (
                <div key={n.id} style={{ padding: '12px 0', borderTop: idx === 0 ? `1px solid ${RULE}` : `1px solid ${RULE}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      {n.user_id === user.id ? 'You' : 'Client'}
                    </span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10, color: FADED, fontFamily: T.mono }}>{new Date(n.created_at).toLocaleString()}</span>
                      {n.user_id === user.id && (
                        <button onClick={() => deleteNote(n.id)} style={{ background: 'transparent', border: 'none', color: FADED, fontSize: 10, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: INK, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PortalCard>
      )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${RULE}`, padding: 'clamp(24px,3vw,40px) clamp(20px,3vw,40px)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 24, alignItems: 'end' }}>
          <div>
            <ESWordmark height={14} color={INK} />
            <div style={{ fontSize: 12, color: FADED, marginTop: 14, maxWidth: '40ch', lineHeight: 1.6 }}>
              Engineering Serendipity · 385 Van Brunt St, Floor 2, Brooklyn NY 11231
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: FADED, justifySelf: 'end' }}>
            <MorganIsotype size={16} color={FADED} strokeWidth={1.2} />
            <span style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>Prepared in Morgan</span>
          </div>
        </div>
      </footer>

      {/* PDF / image viewer modal — projectId + user enable the
          per-asset comments side panel inside the viewer. */}
      <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} projectId={project?.id} user={user} />
      {carouselSectionId && (
        <SectionCarousel
          sectionLabel={sectionLabelFor(carouselSectionId)}
          items={sentAssetsBySection.get(carouselSectionId) || []}
          startIdx={carouselIdx}
          decisions={decisions}
          commentDrafts={commentDrafts}
          setCommentDrafts={setCommentDrafts}
          upsertDecision={upsertDecision}
          onClose={() => { setCarouselSectionId(null); setCarouselIdx(0); }}
        />
      )}

      {/* Live chat with the production team */}
      <PortalChat projectId={project?.id} user={user} clientName={project?.client} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: FADED, marginBottom: 10 }}>{label}</div>
      <div className="num" style={{ fontSize: 'clamp(28px,3.4vw,48px)', fontWeight: 800, letterSpacing: '-0.022em', lineHeight: 1.04, color: INK, fontFamily: T.mono }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Top-level: routes between login and dashboard based on session
// ─────────────────────────────────────────────────────────────────────
export default function ClientPortal() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      setUser(session?.user || null);
      setAuthReady(true);
    })();
    const { data: sub } = onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => {
      cancelled = true;
      try { sub?.subscription?.unsubscribe?.(); } catch (e) {}
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    try { await signOut(); } catch (e) {}
    setUser(null);
  }, []);

  if (!isSupabaseConfigured()) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: PAPER, color: INK, fontFamily: T.sans, padding: 24, textAlign: 'center' }}>
        Supabase is not configured. Contact your administrator.
      </div>
    );
  }

  if (!authReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: PAPER, color: FADED, fontFamily: T.sans }}>
        <ESWordmark height={14} color={INK} />
      </div>
    );
  }

  if (!user) return <ClientLogin onSignedIn={() => { /* onAuthStateChange will set user */ }} />;

  return <ClientPortalDashboard user={user} onSignOut={handleSignOut} />;
}

// ─────────────────────────────────────────────────────────────────────
// SectionCarousel — full-screen lightbox shown when a client clicks a
// shared section card. Carousel of one image at a time with prev/next
// arrows + keyboard nav. Side panel shows the current item's
// approve/reject/comment controls + download. Decisions persist via
// upsertDecision (same hook as the inline Files list).
// ─────────────────────────────────────────────────────────────────────
function SectionCarousel({ sectionLabel, items, startIdx, decisions, commentDrafts, setCommentDrafts, upsertDecision, onClose }) {
  const PAPER = '#FFFFFF';
  const INK = '#0F52BA';
  const RULE = '#CDD7EB';
  const FADED = '#7791C5';
  const GOLD = '#F0B849';

  const [idx, setIdx] = useState(() => Math.max(0, Math.min(startIdx || 0, (items?.length || 1) - 1)));
  const safeIdx = Math.max(0, Math.min(idx, (items?.length || 1) - 1));
  const current = items?.[safeIdx];

  const go = (delta) => {
    if (!items?.length) return;
    setIdx((safeIdx + delta + items.length) % items.length);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [safeIdx, items?.length]);

  if (!current) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,82,186,.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: PAPER, padding: 32, borderRadius: 6, fontFamily: T.sans }}>Nothing in this section.</div>
      </div>
    );
  }

  const d = decisions[current.id] || {};
  const isApproved = d.decision === 'approved';
  const isRejected = d.decision === 'rejected';
  const draft = commentDrafts[current.id] !== undefined ? commentDrafts[current.id] : (d.comment || '');
  const fileUrl = current.fileData || (current.storagePath ? publicFileUrl(current.storagePath) : null) || current.driveLink;
  const isImg = current.isImage || /\.(png|jpe?g|gif|webp|svg)$/i.test(current.fileName || '');
  const isPdf = current.isPdf || /\.pdf$/i.test(current.fileName || '');

  return createPortal(
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, background: PAPER, display: 'flex', flexDirection: 'column', fontFamily: T.sans }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 24px', borderBottom: `1px solid ${RULE}`, gap: 16, flexShrink: 0 }}>
        <button onClick={onClose} title="Close (Esc)" style={{ background: 'none', border: 'none', fontSize: 20, color: FADED, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.10em', textTransform: 'uppercase' }}>Creative & Design</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sectionLabel}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, color: FADED, fontFamily: T.mono, background: 'rgba(15,82,186,.04)', padding: '3px 10px', borderRadius: 999 }}>{safeIdx + 1} / {items.length}</span>
          {fileUrl && <a href={fileUrl} download={current.fileName || current.name || 'file'} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 14px', border: `1px solid ${RULE}`, borderRadius: 4, background: PAPER, color: INK, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', textDecoration: 'none' }}>↓ Download</a>}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Image stage */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(15,82,186,.02)', overflow: 'auto' }}>
          {items.length > 1 && (
            <>
              <button onClick={() => go(-1)} title="Previous (←)" style={navArrowStyle('left', PAPER, INK, RULE)}>‹</button>
              <button onClick={() => go(1)} title="Next (→)" style={navArrowStyle('right', PAPER, INK, RULE)}>›</button>
            </>
          )}
          {isImg && fileUrl ? (
            <img src={fileUrl} alt={current.name || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} onError={(e) => { e.currentTarget.alt = 'Image failed to load — try Download in the header.'; }} />
          ) : isPdf && fileUrl ? (
            <iframe src={fileUrl} title={current.name || ''} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 4, background: PAPER }} />
          ) : fileUrl ? (
            <div style={{ textAlign: 'center', color: INK }}>
              <div style={{ fontSize: 48, color: FADED, opacity: .35, marginBottom: 12 }}>{(current.fileName || '').split('.').pop()?.toUpperCase() || 'FILE'}</div>
              <div style={{ fontSize: 13, marginBottom: 14 }}>No inline preview for this file type.</div>
              <a href={fileUrl} download={current.fileName || current.name || 'file'} target="_blank" rel="noopener noreferrer" style={{ padding: '10px 22px', background: INK, color: PAPER, fontSize: 12, fontWeight: 700, letterSpacing: '.04em', borderRadius: 4, textDecoration: 'none' }}>Download</a>
            </div>
          ) : (
            <div style={{ color: FADED, fontSize: 13 }}>Preview unavailable.</div>
          )}
        </div>

        {/* Side panel: title + decision + comments */}
        <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${RULE}`, background: PAPER, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.08em', textTransform: 'uppercase' }}>Item</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginTop: 4, lineHeight: 1.3, wordBreak: 'break-word' }}>{current.name || current.fileName || 'Untitled'}</div>
            {current.fileName && current.name && current.fileName !== current.name && <div style={{ fontSize: 10, color: FADED, marginTop: 4, fontFamily: T.mono, wordBreak: 'break-all' }}>{current.fileName}</div>}
          </div>

          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Your decision</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => upsertDecision(current.id, { decision: isApproved ? null : 'approved' })} style={{ flex: 1, padding: '10px 14px', border: `1px solid ${isApproved ? '#1F7A4F' : RULE}`, borderRadius: 4, background: isApproved ? '#1F7A4F' : PAPER, color: isApproved ? '#fff' : '#1F7A4F', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', cursor: 'pointer', fontFamily: T.sans }}>✓ Approve</button>
              <button onClick={() => upsertDecision(current.id, { decision: isRejected ? null : 'rejected' })} style={{ flex: 1, padding: '10px 14px', border: `1px solid ${isRejected ? '#7A1F1F' : RULE}`, borderRadius: 4, background: isRejected ? '#7A1F1F' : PAPER, color: isRejected ? '#fff' : '#7A1F1F', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', cursor: 'pointer', fontFamily: T.sans }}>× Reject</button>
            </div>
            {(isApproved || isRejected) && <div style={{ fontSize: 10, color: isApproved ? '#1F7A4F' : '#7A1F1F', fontWeight: 600, marginTop: 8, letterSpacing: '.04em', textTransform: 'uppercase' }}>{isApproved ? '✓ Approved' : '× Rejected'}</div>}
          </div>

          <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: FADED, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Comment</div>
            <textarea
              value={draft}
              onChange={e => setCommentDrafts(prev => ({ ...prev, [current.id]: e.target.value }))}
              onBlur={() => { if ((draft || '') !== (d.comment || '')) upsertDecision(current.id, { comment: draft }); }}
              placeholder="Any feedback for the team?"
              style={{ width: '100%', boxSizing: 'border-box', flex: 1, minHeight: 120, padding: '10px 12px', borderRadius: 4, border: `1px solid ${RULE}`, background: PAPER, color: INK, fontSize: 12, fontFamily: T.sans, outline: 'none', resize: 'vertical', lineHeight: 1.55 }}
            />
            <div style={{ fontSize: 10, color: FADED, marginTop: 6 }}>Saves automatically when you click outside the box.</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function navArrowStyle(side, PAPER, INK, RULE) {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    border: `1px solid ${RULE}`,
    background: 'rgba(255,255,255,.92)',
    color: INK,
    fontSize: 22,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: T.sans,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(15,82,186,.14)',
    zIndex: 5,
    userSelect: 'none',
    lineHeight: 1,
  };
}
