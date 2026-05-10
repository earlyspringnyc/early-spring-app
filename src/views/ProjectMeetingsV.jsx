import { useState, useEffect, useCallback } from 'react';
import T from '../theme/tokens.js';
import {
  listMeetingsForProject, linkMeetingToProject, unlinkMeetingFromProject,
  listMeetings, effectiveClassification,
} from '../lib/meetings.js';

// Meetings linked to this project — auto-attached when an attendee on
// the meeting is a CRM contact who's linked to this project, plus any
// manual links from the meeting detail panel.
function ProjectMeetingsV({ project, user, accessToken }) {
  const userId = user?.user_id || user?.id;
  const [linked, setLinked] = useState([]);
  const [allMeetings, setAllMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [pickMeetingId, setPickMeetingId] = useState('');

  const reload = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const [l, all] = await Promise.all([
        listMeetingsForProject(project.id),
        listMeetings({ limit: 200 }),
      ]);
      setLinked(l);
      setAllMeetings(all);
    } finally { setLoading(false); }
  }, [project?.id]);

  useEffect(() => { reload(); }, [reload]);

  const linkedIds = new Set(linked.map(m => m.id));
  const linkable = allMeetings.filter(m => !linkedIds.has(m.id));

  const onLink = async () => {
    if (!pickMeetingId) return;
    setLinking(true);
    try {
      await linkMeetingToProject(userId, pickMeetingId, project.id);
      await reload();
      setPickMeetingId('');
    } catch (e) { alert('Link failed: ' + (e.message || 'unknown')); }
    finally { setLinking(false); }
  };

  const onUnlink = async (meetingId) => {
    try {
      await unlinkMeetingFromProject(meetingId, project.id);
      setLinked(prev => prev.filter(m => m.id !== meetingId));
    } catch (e) { alert('Unlink failed: ' + (e.message || 'unknown')); }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 8px 80px', fontFamily: T.sans }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink, marginBottom: 10 }}>
          {project?.name || 'Project'} · Meetings
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: T.ink, letterSpacing: '-0.012em' }}>
          Conversations on this project
        </h1>
        <div style={{ fontSize: 13, color: T.fadedInk, marginTop: 6 }}>
          {loading ? 'Loading…' : `${linked.length} meeting${linked.length === 1 ? '' : 's'} linked`}
          {' '}· auto-attached when an attendee is a project contact, or link manually below
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '14px 0', borderTop: `1px solid ${T.faintRule}`, borderBottom: `1px solid ${T.faintRule}` }}>
        <select value={pickMeetingId} onChange={e => setPickMeetingId(e.target.value)} style={{
          flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontFamily: T.sans,
          border: `1px solid ${T.faintRule}`, background: T.paper, color: T.ink, cursor: 'pointer', outline: 'none',
        }}>
          <option value="">Link a meeting…</option>
          {linkable.map(m => (
            <option key={m.id} value={m.id}>
              {m.title || 'Untitled'} — {m.occurred_at ? new Date(m.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
            </option>
          ))}
        </select>
        <button onClick={onLink} disabled={!pickMeetingId || linking} style={{
          padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: T.sans,
          background: T.ink, color: T.paper, border: 'none',
          cursor: (pickMeetingId && !linking) ? 'pointer' : 'default', opacity: (pickMeetingId && !linking) ? 1 : .4,
        }}>{linking ? 'Linking…' : 'Link'}</button>
      </div>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>Loading…</div>
        ) : linked.length === 0 ? (
          <div style={{ padding: 30, border: `1px dashed ${T.faintRule}`, borderRadius: 10, color: T.fadedInk, fontSize: 12, lineHeight: 1.6, textAlign: 'center' }}>
            No meetings linked to this project yet. They auto-link when a Fireflies meeting has an attendee email matching a contact who's already on this project. You can also pick one from the dropdown above.
          </div>
        ) : (
          <div>
            {linked.map(m => {
              const cls = effectiveClassification(m);
              return (
                <div key={m.id} style={{
                  padding: '14px 18px', border: `1px solid ${T.faintRule}`, borderRadius: 10, marginBottom: 8, background: T.paper,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, minWidth: 0 }}>
                      {m.title || 'Untitled'}
                    </div>
                    <div style={{ fontSize: 11, color: T.fadedInk, whiteSpace: 'nowrap' }}>
                      {m.occurred_at ? new Date(m.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      {m.duration_minutes ? ` · ${m.duration_minutes}m` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 4 }}>
                    {cls} · {m._match_type === 'manual' ? 'manually linked' : 'auto-linked via contact'}
                  </div>
                  {m.summary && (
                    <div style={{ fontSize: 12, color: T.ink70, marginTop: 10, lineHeight: 1.55 }}>
                      {m.summary.length > 280 ? m.summary.slice(0, 280) + '…' : m.summary}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {m.external_url && (
                      <a href={m.external_url} target="_blank" rel="noopener" style={{
                        fontSize: 11, fontWeight: 600, color: T.ink, textDecoration: 'none',
                        padding: '4px 10px', borderRadius: 999, border: `1px solid ${T.faintRule}`,
                      }}>Open in Fireflies ↗</a>
                    )}
                    <button onClick={() => onUnlink(m.id)} style={{
                      fontSize: 11, fontWeight: 600, color: T.fadedInk, fontFamily: T.sans,
                      padding: '4px 10px', borderRadius: 999, border: `1px solid ${T.faintRule}`,
                      background: 'transparent', cursor: 'pointer',
                    }}>Unlink</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectMeetingsV;
