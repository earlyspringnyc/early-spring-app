import { useState, useEffect, useCallback } from 'react';
import T from '../theme/tokens.js';
import {
  listMeetingsForProject, linkMeetingToProject, unlinkMeetingFromProject,
  listMeetings, effectiveClassification,
} from '../lib/meetings.js';
import { listProjectNotes, addProjectNote, deleteProjectNote } from '../lib/projectNotes.js';

// Meetings linked to this project — auto-attached when an attendee on
// the meeting is a CRM contact who's linked to this project, plus any
// manual links from the meeting detail panel.
function ProjectMeetingsV({ project, user, accessToken }) {
  const userId = user?.user_id || user?.id;
  const [linked, setLinked] = useState([]);
  const [allMeetings, setAllMeetings] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [pickMeetingId, setPickMeetingId] = useState('');

  const reload = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const [l, all, n] = await Promise.all([
        listMeetingsForProject(project.id),
        listMeetings({ limit: 200 }),
        listProjectNotes(project.id),
      ]);
      setLinked(l);
      setAllMeetings(all);
      setNotes(n);
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

  const onAddNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const created = await addProjectNote(userId, project.id, { content: text, source: 'manual' });
      if (created) setNotes(prev => [created, ...prev]);
      setNewNote('');
    } catch (e) { alert('Could not save note: ' + (e.message || 'unknown')); }
    finally { setSavingNote(false); }
  };

  const onDeleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      await deleteProjectNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) { alert('Could not delete: ' + (e.message || 'unknown')); }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 8px 80px', fontFamily: T.sans }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink, marginBottom: 10 }}>
          {project?.name || 'Project'} · Activity
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: T.ink, letterSpacing: '-0.012em' }}>
          Notes &amp; conversations
        </h1>
        <div style={{ fontSize: 13, color: T.fadedInk, marginTop: 6 }}>
          {loading ? 'Loading…' : `${notes.length} note${notes.length === 1 ? '' : 's'} · ${linked.length} meeting${linked.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Notes feed — auto-populated when you click "Save to notes" on a meeting, plus manual entries */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>📝</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Notes</span>
          <span style={{ fontSize: 10, color: T.fadedInk, fontWeight: 500 }}>· {notes.length} entr{notes.length === 1 ? 'y' : 'ies'}</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add a note — context, decisions, follow-ups…"
            style={{
              width: '100%', minHeight: 80, padding: 12, borderRadius: 8,
              border: `1px solid ${T.faintRule}`, background: T.inkSoft2,
              fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none', resize: 'vertical', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button onClick={onAddNote} disabled={savingNote || !newNote.trim()} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
              background: T.ink, color: T.paper, border: 'none',
              cursor: (savingNote || !newNote.trim()) ? 'default' : 'pointer',
              opacity: (savingNote || !newNote.trim()) ? .4 : 1,
            }}>{savingNote ? 'Saving…' : '+ Add note'}</button>
          </div>
        </div>

        {notes.length === 0 ? (
          <div style={{ padding: 18, border: `1px dashed ${T.faintRule}`, borderRadius: 8, color: T.fadedInk, fontSize: 12, textAlign: 'center', lineHeight: 1.6, marginBottom: 28 }}>
            No notes yet. Add one above, or open a meeting linked to this project and click <b>📥 Save to notes</b>.
          </div>
        ) : (
          <div style={{ marginBottom: 28 }}>
            {notes.map(n => {
              const isMeeting = n.source === 'meeting';
              return (
                <div key={n.id} style={{
                  padding: '14px 16px', borderRadius: 8, marginBottom: 6,
                  background: isMeeting ? T.inkSoft2 : T.paper,
                  border: `1px solid ${T.faintRule}`,
                  borderLeft: `3px solid ${isMeeting ? T.ink : T.ink40}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: T.ink70, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      {isMeeting ? '🎥 From meeting' : '✍️ Note'} · {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <button onClick={() => onDeleteNote(n.id)} title="Delete" style={{
                      background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer',
                      padding: 0, fontSize: 14, lineHeight: 1,
                    }}>×</button>
                  </div>
                  <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.content}</div>
                </div>
              );
            })}
          </div>
        )}
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
