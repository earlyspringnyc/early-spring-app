import { useState, useEffect, useMemo, useCallback } from 'react';
import T from '../theme/tokens.js';
import { restFetch } from '../lib/db.js';

// History view for voice captures. Renders inside VoiceCaptureModal
// when the user toggles to the history tab. Loads the most recent 50
// captures via PostgREST (RLS scopes to auth.uid()).
//
// Each row shows: time-ago, status pill, kind, transcript preview.
// Tap to expand the row inline: full transcript + project name (if
// routed there) + delete action. Deletion only removes the
// voice_captures row — the filed user_note/project_note it produced
// stays put (those have their own lifecycle).

const STATUS_LABELS = {
  pending: 'Pending',
  filed: 'Filed',
  discarded: 'Discarded',
};

const KIND_LABELS = {
  reminder: 'Reminder',
  project_note: 'Project note',
  general_note: 'Note',
};

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

export default function VoiceCaptureHistory({ projects = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const projectName = useMemo(() => {
    const m = new Map();
    (projects || []).forEach(p => { if (p.id) m.set(p.id, { name: p.name, client: p.client }); });
    return m;
  }, [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const out = await restFetch('/voice_captures?select=*&order=created_at.desc&limit=50');
      setRows(Array.isArray(out) ? out : []);
    } catch (e) {
      setErrorMsg(e?.message || 'Could not load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteRow = async (id) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setExpandedId(null);
    try {
      await restFetch(`/voice_captures?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      console.error('[voice-history] delete failed:', e?.message || e);
      // Reload to restore truth if delete failed
      load();
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0', color: T.fadedInk, fontSize: 12 }}>
        <div style={{ fontSize: 22, color: T.ink, animation: 'pulse 1.4s ease-in-out infinite' }}>&#9676;</div>
        Loading…
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ fontSize: 13, color: T.alert, background: T.alertSoft, padding: '12px 14px', borderRadius: T.rS, lineHeight: 1.5 }}>
        {errorMsg}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 12px', color: T.fadedInk, fontSize: 13, lineHeight: 1.6 }}>
        No captures yet. Tap the mic to record your first thought.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => {
        const expanded = expandedId === r.id;
        const suggestion = r.suggestion || {};
        const kind = suggestion.kind || 'general_note';
        const dest = r.routed_to_table === 'project_notes' && suggestion.project_id
          ? projectName.get(suggestion.project_id)
          : null;
        const preview = (r.transcript || '').trim().slice(0, 120);

        return (
          <button
            key={r.id}
            onClick={() => setExpandedId(expanded ? null : r.id)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: T.rS,
              border: `1px solid ${expanded ? T.borderGlow : T.border}`,
              background: expanded ? T.surface : T.paper,
              cursor: 'pointer',
              fontFamily: T.sans,
              color: T.ink,
              transition: 'border-color .15s',
            }}
          >
            {/* Row 1: status + kind + time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <StatusPill status={r.status} />
              <span style={{ fontSize: 10, fontWeight: 600, color: T.fadedInk, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {KIND_LABELS[kind] || 'Note'}
                {dest ? ` → ${dest.name}` : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: T.fadedInk }}>{timeAgo(r.created_at)}</span>
            </div>

            {/* Row 2: transcript preview or full */}
            <div style={{
              fontSize: 13, lineHeight: 1.5, color: T.ink,
              ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
            }}>
              {expanded ? r.transcript : (preview + ((r.transcript || '').length > 120 ? '…' : ''))}
            </div>

            {/* Row 3 (expanded only): reasoning + delete */}
            {expanded && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                {suggestion.reasoning && (
                  <div style={{ fontSize: 11, color: T.fadedInk, fontStyle: 'italic', marginBottom: 10 }}>
                    Claude: {suggestion.reasoning}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteRow(r.id); }}
                    style={{
                      padding: '6px 12px', borderRadius: T.rS,
                      border: `1px solid ${T.alert}`, background: 'transparent',
                      color: T.alert, fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                      textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans,
                    }}
                  >Delete capture</button>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ status }) {
  const color = status === 'filed' ? T.ink : status === 'discarded' ? T.fadedInk : '#F0B849';
  const bg = status === 'filed' ? `${T.ink}14` : status === 'discarded' ? T.inkSoft3 : 'rgba(240,184,73,.18)';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: bg, color, textTransform: 'uppercase', letterSpacing: '.06em',
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
