import { useState, useEffect, useCallback, useMemo } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import {
  listMembers, createMember, deleteMember,
  listNotes, createNote, updateNote, deleteNote,
  organizeNoteByProject, assignChunkToProject, markRecapSent,
  listMeetingsForMember, unlinkMeetingFromMember,
} from '../lib/oneOnOnes.js';

// 1-on-1 notes — folder per teammate (Louisa, Jennifer, etc.).
// Each folder holds free-form notes dated by meeting; notes can be
// organized by project via Claude and individual chunks assigned
// back to specific project_notes rows (with internal=true so
// client portals never see them).
export default function OneOnOnesView({ user, projects = [], accessToken, onBack }) {
  const userId = user?.user_id || user?.id;
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [activeMemberId, setActiveMemberId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [linkedMeetings, setLinkedMeetings] = useState([]); // [{ id (link id), source, meetings: {...} }]

  // Add-member modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');

  // Note editor — open for a new note or to edit existing
  const [editingNote, setEditingNote] = useState(null); // { id?, note_date, title, body }
  const [savingNote, setSavingNote] = useState(false);

  // Organize-with-Claude state, keyed by noteId
  const [organizingId, setOrganizingId] = useState(null);
  const [chunksByNote, setChunksByNote] = useState({});
  const [assignedChunkKeys, setAssignedChunkKeys] = useState(new Set());

  const reloadMembers = useCallback(async () => {
    if (!userId) return;
    setLoadingMembers(true);
    try {
      const rows = await listMembers(userId);
      setMembers(rows);
      if (!activeMemberId && rows.length) setActiveMemberId(rows[0].id);
    } catch (e) { console.error('[1:1] members load:', e); }
    finally { setLoadingMembers(false); }
  }, [userId, activeMemberId]);

  const reloadNotes = useCallback(async () => {
    if (!activeMemberId) { setNotes([]); setLinkedMeetings([]); return; }
    setLoadingNotes(true);
    try {
      const [n, lm] = await Promise.all([
        listNotes(activeMemberId),
        listMeetingsForMember(activeMemberId),
      ]);
      setNotes(n);
      setLinkedMeetings(lm);
    } catch (e) { console.error('[1:1] notes load:', e); }
    finally { setLoadingNotes(false); }
  }, [activeMemberId]);

  // Merged timeline: 1:1 notes + linked meetings, sorted newest first.
  // Each entry carries a `kind` field so the renderer can branch.
  const timeline = useMemo(() => {
    const items = [];
    notes.forEach((n) => items.push({ kind: 'note', id: n.id, date: n.note_date, payload: n }));
    linkedMeetings.forEach((lm) => {
      const m = lm.meetings; if (!m) return;
      items.push({ kind: 'meeting', id: `m-${m.id}`, date: m.occurred_at ? String(m.occurred_at).slice(0, 10) : '', payload: m, link: lm });
    });
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return items;
  }, [notes, linkedMeetings]);

  const handleUnlinkMeeting = async (link) => {
    if (!confirm('Unlink this meeting from the folder? The meeting itself stays in the Meetings library.')) return;
    try { await unlinkMeetingFromMember(activeMemberId, link.meetings.id); reloadNotes(); }
    catch (e) { alert(`Unlink failed: ${e.message || e}`); }
  };

  useEffect(() => { reloadMembers(); }, [reloadMembers]);
  useEffect(() => { reloadNotes(); }, [reloadNotes]);

  const activeMember = useMemo(() => members.find((m) => m.id === activeMemberId), [members, activeMemberId]);

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;
    try {
      const m = await createMember(userId, {
        name: newMemberName.trim(),
        email: newMemberEmail.trim(),
        role_label: newMemberRole.trim() || null,
      });
      setShowAddMember(false);
      setNewMemberName(''); setNewMemberEmail(''); setNewMemberRole('');
      setActiveMemberId(m.id);
      reloadMembers();
    } catch (e) { alert(`Could not add: ${e.message || e}`); }
  };

  const handleRemoveMember = async (m) => {
    if (!confirm(`Remove ${m.name}? All notes in this folder will be deleted.`)) return;
    try {
      await deleteMember(m.id);
      if (activeMemberId === m.id) setActiveMemberId(null);
      reloadMembers();
    } catch (e) { alert(`Could not remove: ${e.message || e}`); }
  };

  const startNewNote = () => {
    setEditingNote({ note_date: new Date().toISOString().slice(0, 10), title: '', body: '' });
  };

  const handleSaveNote = async () => {
    if (!editingNote || !activeMemberId) return;
    setSavingNote(true);
    try {
      if (editingNote.id) {
        await updateNote(editingNote.id, {
          note_date: editingNote.note_date,
          title: editingNote.title || null,
          body: editingNote.body || '',
        });
      } else {
        await createNote(userId, activeMemberId, editingNote);
      }
      setEditingNote(null);
      reloadNotes();
    } catch (e) { alert(`Save failed: ${e.message || e}`); }
    finally { setSavingNote(false); }
  };

  const handleDeleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    try { await deleteNote(id); reloadNotes(); }
    catch (e) { alert(`Delete failed: ${e.message || e}`); }
  };

  const handleOrganize = async (note) => {
    if (!projects.length) { alert('No projects in this org yet.'); return; }
    setOrganizingId(note.id);
    try {
      const { chunks } = await organizeNoteByProject(note.body, projects);
      setChunksByNote((m) => ({ ...m, [note.id]: chunks }));
    } catch (e) { alert(`Could not organize: ${e.message || e}`); }
    finally { setOrganizingId(null); }
  };

  const handleAssign = async (note, chunk, idx) => {
    if (!chunk.project_id) return;
    try {
      await assignChunkToProject(userId, chunk.project_id, note.id, chunk.snippet);
      setAssignedChunkKeys((s) => new Set(s).add(`${note.id}:${idx}`));
    } catch (e) { alert(`Assign failed: ${e.message || e}`); }
  };

  // Compose a Gmail draft with the note formatted as a recap.
  // Uses Gmail's native compose URL so the user can review and
  // hit Send themselves — no silent emails out of Morgan.
  const sendRecap = async (note) => {
    if (!activeMember?.email) return;
    const subject = `Recap — ${note.title || `1:1 ${note.note_date}`}`;
    const opener = `Hi ${activeMember.name.split(' ')[0] || 'team'},\n\nQuick recap from our ${note.note_date} sync:\n\n`;
    const closer = '\n\n—' + (user?.name ? `\n${user.name}` : '');
    const fullBody = opener + (note.body || '') + closer;
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(activeMember.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    try { await markRecapSent(note.id); reloadNotes(); } catch (e) {}
  };

  return (
    <div style={{ height: '100vh', background: T.bg, fontFamily: T.sans, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: `1px solid ${T.faintRule}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, padding: 0 }}>← Dashboard</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.cream, margin: 0, letterSpacing: '-0.02em' }}>1-on-1s</h1>
        </div>
        <ESWordmark height={14} color={T.cream} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <nav style={{ borderRight: `1px solid ${T.faintRule}`, padding: '20px 12px', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 12px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase' }}>Team</span>
            <button onClick={() => setShowAddMember(true)} title="Add team member" style={{ background: 'transparent', border: 'none', color: T.cyan, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>+</button>
          </div>
          {loadingMembers ? (
            <div style={{ padding: 12, fontSize: 11, color: T.dim }}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 12, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>
              No team folders yet. Click + to add one.
            </div>
          ) : members.map((m) => (
            <button key={m.id} onClick={() => setActiveMemberId(m.id)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: T.rS,
              background: activeMemberId === m.id ? T.inkSoft : 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: T.sans, marginBottom: 2,
              color: activeMemberId === m.id ? T.cream : T.dim,
            }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
                {m.role_label && <span style={{ fontSize: 10, color: T.dim, marginLeft: 6 }}>· {m.role_label}</span>}
              </span>
            </button>
          ))}
        </nav>

        {/* Main */}
        <main style={{ overflow: 'auto', padding: 'clamp(20px,3vw,36px)' }}>
          {!activeMember ? (
            <div style={{ color: T.dim, fontSize: 13 }}>Pick a teammate from the sidebar, or add one.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: T.cream, margin: 0 }}>{activeMember.name}</h2>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{activeMember.email}{activeMember.role_label ? ` · ${activeMember.role_label}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={startNewNote} style={primaryBtn(false)}>+ New note</button>
                  <button onClick={() => handleRemoveMember(activeMember)} style={secondaryBtn(true)}>Remove folder</button>
                </div>
              </div>

              {loadingNotes ? (
                <div style={{ fontSize: 12, color: T.dim }}>Loading…</div>
              ) : timeline.length === 0 ? (
                <div style={{ padding: 40, fontSize: 13, color: T.dim, border: `1px dashed ${T.border}`, borderRadius: T.r, textAlign: 'center' }}>
                  Nothing here yet. Click <strong>+ New note</strong>, or assign a synced meeting from the Meetings tab.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {timeline.map((item) => item.kind === 'meeting' ? (
                    (() => {
                      const m = item.payload;
                      const attendees = Array.isArray(m.attendees) ? m.attendees.map((a) => a?.name || a?.email).filter(Boolean) : [];
                      const actions = Array.isArray(m.action_items) ? m.action_items : [];
                      return (
                        <div key={item.id} style={{ padding: 18, borderRadius: T.r, background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.cyan}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.cyan, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                                {item.link?.source === 'auto-email' ? 'Synced · auto-linked' : 'Synced · manual'} · {fmtDate(item.date)}
                              </div>
                              {m.title && <div style={{ fontSize: 15, fontWeight: 700, color: T.cream, marginTop: 4 }}>{m.title}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {m.external_url && <a href={m.external_url} target="_blank" rel="noopener noreferrer" style={{ ...chipBtn(T.cyan), textDecoration: 'none', display: 'inline-block' }}>Open transcript</a>}
                              <button onClick={() => handleUnlinkMeeting(item.link)} style={chipBtn('#c53030')}>Unlink</button>
                            </div>
                          </div>
                          {attendees.length > 0 && <div style={{ fontSize: 11, color: T.dim, marginBottom: 8 }}>Attendees: {attendees.join(', ')}</div>}
                          {m.summary && <div style={{ fontSize: 13, color: T.cream, lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: actions.length ? 12 : 0 }}>{m.summary}</div>}
                          {actions.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>Action items</div>
                              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.cream, lineHeight: 1.5 }}>
                                {actions.map((a, i) => <li key={i}>{typeof a === 'string' ? a : (a.text || a.action || JSON.stringify(a))}</li>)}
                              </ul>
                            </div>
                          )}
                          {m.notes && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.faintRule}`, fontSize: 12, color: T.cream, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                              <span style={{ color: T.dim, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 6 }}>Your notes:</span>{m.notes}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    (() => { const n = item.payload; return (
                    <div key={n.id} style={{ padding: 18, borderRadius: T.r, background: T.surface, border: `1px solid ${T.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.06em', textTransform: 'uppercase' }}>{fmtDate(n.note_date)}</div>
                          {n.title && <div style={{ fontSize: 15, fontWeight: 700, color: T.cream, marginTop: 4 }}>{n.title}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setEditingNote({ ...n })} style={chipBtn()}>Edit</button>
                          <button onClick={() => sendRecap(n)} style={chipBtn(T.gold)}>Send recap</button>
                          <button onClick={() => handleDeleteNote(n.id)} style={chipBtn('#c53030')}>Delete</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: T.cream, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body || <em style={{ color: T.dim }}>(empty)</em>}</div>
                      {n.sent_at && <div style={{ fontSize: 10, color: T.dim, marginTop: 8 }}>Last recap sent {fmtDate(n.sent_at)}</div>}

                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.faintRule}` }}>
                        <button onClick={() => handleOrganize(n)} disabled={organizingId === n.id} style={chipBtn(T.cyan)}>
                          {organizingId === n.id ? 'Organizing…' : '✨ Organize by project with Claude'}
                        </button>
                        {chunksByNote[n.id] && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {chunksByNote[n.id].length === 0 ? (
                              <div style={{ fontSize: 11, color: T.dim, fontStyle: 'italic' }}>Claude didn't find any project-specific chunks.</div>
                            ) : chunksByNote[n.id].map((c, i) => {
                              const key = `${n.id}:${i}`;
                              const assigned = assignedChunkKeys.has(key);
                              return (
                                <div key={i} style={{ padding: 10, borderRadius: T.rS, background: T.bg, border: `1px solid ${T.border}` }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: c.project_id ? T.cyan : T.dim, textTransform: 'uppercase', letterSpacing: '.06em' }}>{c.project_name || 'General / unassigned'}</span>
                                    {c.project_id && (
                                      assigned ? <span style={{ fontSize: 10, color: T.pos, fontWeight: 700 }}>Assigned ✓</span>
                                      : <button onClick={() => handleAssign(n, c, i)} style={chipBtn(T.pos)}>Assign to project →</button>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 12, color: T.cream, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.snippet}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    ); })()
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Add member modal */}
      {showAddMember && (
        <div onClick={() => setShowAddMember(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(90vw, 440px)', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.cream }}>Add team member</h3>
            <Field label="Name"><input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} style={inp()} autoFocus/></Field>
            <Field label="Email"><input value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} placeholder="louisa@earlyspring.nyc" style={inp()}/></Field>
            <Field label="Role (optional)"><input value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)} placeholder="Agent" style={inp()}/></Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowAddMember(false)} style={secondaryBtn(false)}>Cancel</button>
              <button onClick={handleAddMember} disabled={!newMemberName.trim() || !newMemberEmail.trim()} style={primaryBtn(!newMemberName.trim() || !newMemberEmail.trim())}>Add folder</button>
            </div>
          </div>
        </div>
      )}

      {/* Note editor modal */}
      {editingNote && (
        <div onClick={() => setEditingNote(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw, 720px)', maxHeight: '85vh', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.cream }}>{editingNote.id ? 'Edit note' : 'New note'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
              <Field label="Date"><input type="date" value={editingNote.note_date} onChange={(e) => setEditingNote({ ...editingNote, note_date: e.target.value })} style={inp()}/></Field>
              <Field label="Title (optional)"><input value={editingNote.title || ''} onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })} placeholder="Weekly sync · planning · etc." style={inp()}/></Field>
            </div>
            <Field label="Notes">
              <textarea value={editingNote.body} onChange={(e) => setEditingNote({ ...editingNote, body: e.target.value })} rows={14} placeholder="Free-form. Talk about multiple projects? After saving, click Organize by project to split it up." style={{ ...inp(), resize: 'vertical', fontFamily: T.mono, fontSize: 13, lineHeight: 1.6 }}/>
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setEditingNote(null)} style={secondaryBtn(false)}>Cancel</button>
              <button onClick={handleSaveNote} disabled={savingNote} style={primaryBtn(savingNote)}>{savingNote ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch (e) { return s; }
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = () => ({ width: '100%', padding: '9px 12px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.surface, color: T.cream, fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' });
const primaryBtn = (disabled) => ({ padding: '9px 16px', background: T.ink, color: T.paper, border: 'none', borderRadius: T.rS, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: T.sans });
const secondaryBtn = (danger) => ({ padding: '9px 16px', background: 'transparent', color: danger ? '#c53030' : T.cream, border: `1px solid ${danger ? '#c53030' : T.border}`, borderRadius: T.rS, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans });
const chipBtn = (color) => ({ padding: '5px 10px', background: 'transparent', color: color || T.dim, border: `1px solid ${color || T.border}`, borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, letterSpacing: '.04em', textTransform: 'uppercase' });
