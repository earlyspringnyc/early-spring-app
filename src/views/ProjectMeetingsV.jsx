import { useState, useEffect, useMemo, useCallback } from 'react';
import T from '../theme/tokens.js';
import {
  listMeetingsForProject, linkMeetingToProject, unlinkMeetingFromProject,
  listMeetings, effectiveClassification,
} from '../lib/meetings.js';
import { listProjectNotes, addProjectNote, deleteProjectNote } from '../lib/projectNotes.js';
import { listContactsForProject, linkContactToProject, unlinkContactFromProject, listContacts } from '../lib/contacts.js';
import ScheduleProjectMeetingModal from '../components/ScheduleProjectMeetingModal.jsx';

function ProjectContactLinker({ allContacts, linkedContacts, contactSearch, setContactSearch, contactRole, setContactRole, onLink }) {
  const linkedIds = new Set(linkedContacts.map(lc => lc.contacts?.id).filter(Boolean));
  const q = contactSearch.trim().toLowerCase();
  const matches = q
    ? allContacts
        .filter(c => !linkedIds.has(c.id))
        .filter(c => {
          const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''}`.toLowerCase();
          return hay.includes(q);
        }).slice(0, 6)
    : [];
  const ROLES = [
    { id: 'point_of_contact', label: 'Point of contact' },
    { id: 'rfp_sender', label: 'RFP sender' },
    { id: 'champion', label: 'Champion' },
    { id: 'team_member', label: 'Team member' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={contactSearch}
          onChange={e => setContactSearch(e.target.value)}
          placeholder="Search contacts to link…"
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontFamily: T.sans,
            border: `1px solid ${T.faintRule}`, background: T.inkSoft2, color: T.ink, outline: 'none',
          }}
        />
        <select value={contactRole} onChange={e => setContactRole(e.target.value)} style={{
          padding: '8px 10px', borderRadius: 6, fontSize: 12, fontFamily: T.sans,
          border: `1px solid ${T.faintRule}`, background: T.paper, color: T.ink, cursor: 'pointer',
        }}>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      {q && matches.length > 0 && (
        <div style={{ marginTop: 6, border: `1px solid ${T.faintRule}`, borderRadius: 8, background: T.paper, overflow: 'hidden' }}>
          {matches.map(c => (
            <button key={c.id} onClick={() => onLink(c.id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 12px', background: 'transparent', border: 'none',
              borderBottom: `1px solid ${T.faintRule}`, cursor: 'pointer', fontFamily: T.sans,
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.inkSoft}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>
                {c.first_name} {c.last_name}
                {c.company && <span style={{ color: T.fadedInk, fontWeight: 400 }}> · {c.company}</span>}
              </div>
              {c.email && <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 2 }}>{c.email}</div>}
            </button>
          ))}
        </div>
      )}
      {q && matches.length === 0 && (
        <div style={{ marginTop: 6, padding: 10, fontSize: 11, color: T.fadedInk, fontStyle: 'italic' }}>No matches.</div>
      )}
    </div>
  );
}

// Meetings linked to this project — auto-attached when an attendee on
// the meeting is a CRM contact who's linked to this project, plus any
// manual links from the meeting detail panel.
function ProjectMeetingsV({ project, user, accessToken }) {
  const userId = user?.user_id || user?.id;
  const [linked, setLinked] = useState([]);
  const [allMeetings, setAllMeetings] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactRole, setContactRole] = useState('point_of_contact');
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [pickMeetingId, setPickMeetingId] = useState('');
  // Modal open state for the new project-scoped meeting scheduler.
  // The modal handles attendee suggestion + Google Calendar creation
  // entirely on its own; we just toggle visibility here.
  const [showScheduler, setShowScheduler] = useState(false);
  // Whether to include auto-linked meetings that don't seem to be
  // about this project (title doesn't mention project / client name).
  // These exist because the Fireflies cron auto-links by attendee
  // overlap — a shared contact triggers a link even if the meeting
  // was about something else. Hidden by default; user can opt in.
  const [showOffTopic, setShowOffTopic] = useState(false);

  const reload = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const [l, all, n, lc, ac] = await Promise.all([
        listMeetingsForProject(project.id),
        listMeetings({ limit: 200 }),
        listProjectNotes(project.id),
        listContactsForProject(project.id),
        listContacts({ limit: 2000 }),
      ]);
      setLinked(l);
      setAllMeetings(all);
      setNotes(n);
      setLinkedContacts(lc);
      setAllContacts(ac);
    } finally { setLoading(false); }
  }, [project?.id]);

  useEffect(() => { reload(); }, [reload]);

  const linkedIds = new Set(linked.map(m => m.id));
  const linkable = allMeetings.filter(m => !linkedIds.has(m.id));

  // Per-meeting metadata: is this meeting actually about this
  // project, and which CRM contact triggered the auto-link?
  //
  //   - manual links → always relevant.
  //   - auto-contact links → relevant only if the title/summary
  //     mentions the project name OR the client name. Otherwise
  //     it's a false positive (cross-project attendee overlap)
  //     and should be hidden by default.
  //
  // sharedAttendee names which CRM contact appears on both the
  // project and the meeting — surfaced in the badge so the user
  // can see WHY the meeting was linked.
  const projectContactIds = useMemo(
    () => new Set(linkedContacts.map(lc => lc.contacts?.id).filter(Boolean)),
    [linkedContacts]
  );
  const relevanceTerms = useMemo(() => {
    const terms = [];
    if (project?.name && project.name.length >= 3) terms.push(project.name.toLowerCase());
    if (project?.client && project.client.length >= 3) terms.push(project.client.toLowerCase());
    return terms;
  }, [project?.name, project?.client]);
  const annotated = useMemo(() => linked.map(m => {
    const haystack = `${m.title || ''} ${m.summary || ''}`.toLowerCase();
    const titleMatches = relevanceTerms.some(t => haystack.includes(t));
    const mcs = Array.isArray(m.meeting_contacts) ? m.meeting_contacts : [];
    const shared = mcs.find(mc => mc.contacts && projectContactIds.has(mc.contacts.id));
    const sharedAttendee = shared?.contacts
      ? `${shared.contacts.first_name || ''} ${shared.contacts.last_name || ''}`.trim() || shared.contacts.email
      : null;
    const isManual = m._match_type === 'manual';
    return {
      ...m,
      _titleMatches: titleMatches,
      _sharedAttendee: sharedAttendee,
      _isRelevant: isManual || titleMatches,
    };
  }), [linked, relevanceTerms, projectContactIds]);
  const relevantMeetings = annotated.filter(m => m._isRelevant);
  const offTopicMeetings = annotated.filter(m => !m._isRelevant);
  const visibleMeetings = showOffTopic ? annotated : relevantMeetings;

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

  const onLinkContact = async (contactId) => {
    if (!contactId) return;
    try {
      await linkContactToProject(userId, contactId, project.id, contactRole);
      const fresh = await listContactsForProject(project.id);
      setLinkedContacts(fresh);
      setContactSearch('');
    } catch (e) { alert('Link failed: ' + (e.message || 'unknown')); }
  };

  const onUnlinkContact = async (contactId, role) => {
    try {
      await unlinkContactFromProject(contactId, project.id, role);
      setLinkedContacts(prev => prev.filter(lc => !(lc.contacts?.id === contactId && lc.role === role)));
    } catch (e) { alert('Unlink failed: ' + (e.message || 'unknown')); }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 8px 80px', fontFamily: T.sans }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
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
        <button
          onClick={() => setShowScheduler(true)}
          disabled={!accessToken}
          title={accessToken ? 'Create a Google Calendar event with the project team' : 'Sign in with Google first'}
          style={{
            padding: '10px 18px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            fontFamily: T.sans, background: T.ink, color: T.paper, border: 'none',
            cursor: accessToken ? 'pointer' : 'not-allowed', opacity: accessToken ? 1 : 0.5,
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}
        >📅 Schedule meeting</button>
      </div>

      {showScheduler && (
        <ScheduleProjectMeetingModal
          project={project}
          accessToken={accessToken}
          userName={user?.name}
          onClose={() => setShowScheduler(false)}
          onScheduled={() => { /* Optional: refresh meetings list later when Calendar sync lands */ }}
        />
      )}

      {/* Linked contacts — who's on this project from your CRM */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>👥</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Contacts</span>
          <span style={{ fontSize: 10, color: T.fadedInk, fontWeight: 500 }}>· {linkedContacts.length} on this project</span>
        </div>

        {linkedContacts.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            {linkedContacts.map(lc => {
              if (!lc.contacts) return null;
              const c = lc.contacts;
              const ROLE_LABEL = { rfp_sender: 'RFP sender', champion: 'Champion', point_of_contact: 'Point of contact', team_member: 'Team member' };
              const initials = ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase();
              return (
                <div key={`${c.id}-${lc.role}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8, marginBottom: 4,
                  background: T.paper, border: `1px solid ${T.faintRule}`,
                }}>
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${T.faintRule}`, flexShrink: 0 }}/>
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: T.inkSoft,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: T.ink, border: `1px solid ${T.faintRule}`, flexShrink: 0,
                    }}>{initials || '?'}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(c.first_name || '') + ' ' + (c.last_name || '')}
                    </div>
                    <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ROLE_LABEL[lc.role] || lc.role}
                      {c.title || c.company ? ' · ' : ''}
                      {c.title}{c.title && c.company ? ' @ ' : ''}{c.company}
                    </div>
                  </div>
                  <button onClick={() => onUnlinkContact(c.id, lc.role)} title="Unlink" style={{
                    background: 'transparent', border: `1px solid ${T.faintRule}`, borderRadius: 999,
                    padding: '4px 10px', fontSize: 10, fontWeight: 600, color: T.fadedInk, cursor: 'pointer', fontFamily: T.sans,
                  }}>Unlink</button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 18, border: `1px dashed ${T.faintRule}`, borderRadius: 8, color: T.fadedInk, fontSize: 12, textAlign: 'center', lineHeight: 1.6, marginBottom: 14 }}>
            No contacts linked yet. Add them below or from a contact's detail drawer.
          </div>
        )}

        {/* Search to link */}
        <ProjectContactLinker
          allContacts={allContacts}
          linkedContacts={linkedContacts}
          contactSearch={contactSearch}
          setContactSearch={setContactSearch}
          contactRole={contactRole}
          setContactRole={setContactRole}
          onLink={onLinkContact}
        />
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
            {/* Off-topic banner — auto-linked meetings whose title
                doesn't mention this project / client. Cross-project
                attendee overlap usually causes these. */}
            {offTopicMeetings.length > 0 && (
              <div style={{
                marginBottom: 12, padding: '10px 14px', borderRadius: 8,
                background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ fontSize: 11, color: T.ink70, lineHeight: 1.5 }}>
                  <strong style={{ color: T.ink }}>{offTopicMeetings.length}</strong> auto-linked meeting{offTopicMeetings.length === 1 ? '' : 's'} hidden — the title doesn't mention <strong style={{ color: T.ink }}>{project?.name || 'this project'}</strong>{project?.client ? <> or <strong style={{ color: T.ink }}>{project.client}</strong></> : null}. Probably linked because a shared CRM contact attended.
                </div>
                <button
                  onClick={() => setShowOffTopic(s => !s)}
                  style={{
                    padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
                    cursor: 'pointer', fontFamily: T.sans,
                  }}
                >{showOffTopic ? 'Hide' : 'Show'}</button>
              </div>
            )}
            {visibleMeetings.map(m => {
              const cls = effectiveClassification(m);
              const isOffTopic = !m._isRelevant;
              return (
                <div key={m.id} style={{
                  padding: '14px 18px',
                  border: `1px solid ${isOffTopic ? T.alert + '33' : T.faintRule}`,
                  borderRadius: 10, marginBottom: 8,
                  background: isOffTopic ? T.alertSoft : T.paper,
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
                    {cls}
                    {' · '}
                    {m._match_type === 'manual'
                      ? 'manually linked'
                      : m._sharedAttendee
                        ? <span>auto-linked because <strong style={{ color: T.ink70 }}>{m._sharedAttendee}</strong> attended{isOffTopic ? ' — likely not about this project' : ''}</span>
                        : 'auto-linked via shared contact'}
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
