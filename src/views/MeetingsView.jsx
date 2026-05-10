import { useState, useEffect, useCallback, useMemo } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { LogOutI } from '../components/icons/index.js';
import {
  listMeetings, getMeeting, updateMeeting,
  setUserClassification, effectiveClassification,
  listProjectsForMeeting, linkMeetingToProject, unlinkMeetingFromProject,
  linkContactToMeeting, unlinkContactFromMeeting,
} from '../lib/meetings.js';
import { listContacts } from '../lib/contacts.js';

const CLASS_OPTIONS = [
  { id: 'all',           label: 'All' },
  { id: 'client',        label: 'Client / Prospect' },
  { id: 'internal',      label: 'Internal' },
  { id: 'uncategorized', label: 'Uncategorized' },
];
const CLASS_LABEL = Object.fromEntries(CLASS_OPTIONS.map(o => [o.id, o.label]));

const selectStyle = {
  flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 11, fontFamily: T.sans,
  border: `1px solid ${T.faintRule}`, background: T.paper, color: T.ink, cursor: 'pointer', outline: 'none',
};
const miniLinkBtn = (enabled) => ({
  padding: '7px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
  background: T.ink, color: T.paper, border: 'none',
  cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : .4,
});

function classBadge(cls) {
  const map = {
    client:        { color: T.paper,    bg: T.ink,          border: T.ink },
    prospect:      { color: T.paper,    bg: T.ink,          border: T.ink },
    vendor:        { color: T.ink70,    bg: T.inkSoft2,     border: T.faintRule },
    internal:      { color: T.ink70,    bg: 'transparent',  border: T.faintRule },
    uncategorized: { color: T.fadedInk, bg: 'transparent',  border: T.faintRule },
  };
  const s = map[cls] || map.uncategorized;
  return { ...s, label: CLASS_LABEL[cls] || cls };
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const tgt = new Date(d); tgt.setHours(0,0,0,0);
  const diff = Math.round((today - tgt) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Yesterday · ${time}`;
  if (diff < 7) return `${diff}d ago · ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + time;
}

function MeetingRow({ m, onClick }) {
  const cls = effectiveClassification(m);
  const badge = classBadge(cls);
  const attendees = (m.attendees || []).filter(a => a?.email);
  const linkedContacts = (m.meeting_contacts || []).filter(mc => mc.contacts);
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '160px 1fr 1.4fr 90px 110px 24px',
      gap: 16, alignItems: 'center', padding: '14px 18px',
      borderBottom: `1px solid ${T.faintRule}`, cursor: 'pointer',
      transition: 'background .15s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = T.inkSoft}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ fontSize: 11, color: T.fadedInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {fmtTime(m.occurred_at)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.title || 'Untitled'}
        </div>
        {linkedContacts.length > 0 && (
          <div style={{ fontSize: 10, color: T.ink70, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {linkedContacts.slice(0, 2).map(mc => `${mc.contacts.first_name || ''} ${mc.contacts.last_name || ''}`.trim()).join(' · ')}
            {linkedContacts.length > 2 ? ` +${linkedContacts.length - 2}` : ''}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {attendees.slice(0, 3).map(a => a.name || a.email.split('@')[0]).join(', ')}
        {attendees.length > 3 ? ` +${attendees.length - 3}` : ''}
      </div>
      <div style={{ fontSize: 11, color: T.fadedInk, textAlign: 'right' }}>
        {m.duration_minutes ? `${m.duration_minutes}m` : '—'}
      </div>
      <div>
        <span style={{
          display: 'inline-block', padding: '2px 9px', borderRadius: 999,
          fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
          color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
        }}>{badge.label}</span>
      </div>
      <div style={{ fontSize: 11, color: T.fadedInk, textAlign: 'right' }}>›</div>
    </div>
  );
}

function MeetingDetail({ meeting, projects = [], contacts = [], userId, onClose, onReclassify, onSaveNotes, onLinksChanged }) {
  const [tab, setTab] = useState('summary');
  const [notesDraft, setNotesDraft] = useState(meeting?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [linkProjectId, setLinkProjectId] = useState('');
  const [linkContactId, setLinkContactId] = useState('');

  useEffect(() => { setNotesDraft(meeting?.notes || ''); }, [meeting?.id]);
  useEffect(() => {
    if (!meeting?.id) return;
    listProjectsForMeeting(meeting.id).then(setLinkedProjects).catch(() => {});
  }, [meeting?.id]);

  if (!meeting) return null;
  const cls = effectiveClassification(meeting);
  const linkedContacts = (meeting.meeting_contacts || []).filter(mc => mc.contacts);

  const linkableProjects = projects.filter(p => !linkedProjects.some(lp => lp.projects?.id === p.id));
  const linkedContactIds = new Set(linkedContacts.map(lc => lc.contact_id));
  const linkableContacts = contacts.filter(c => !linkedContactIds.has(c.id));

  const onLinkProject = async () => {
    if (!linkProjectId) return;
    try {
      await linkMeetingToProject(userId, meeting.id, linkProjectId);
      const next = await listProjectsForMeeting(meeting.id);
      setLinkedProjects(next);
      setLinkProjectId('');
      onLinksChanged?.();
    } catch (e) { alert('Link failed: ' + (e.message || 'unknown')); }
  };

  const onUnlinkProject = async (projectId) => {
    try {
      await unlinkMeetingFromProject(meeting.id, projectId);
      setLinkedProjects(prev => prev.filter(lp => lp.projects?.id !== projectId));
      onLinksChanged?.();
    } catch (e) { alert('Unlink failed: ' + (e.message || 'unknown')); }
  };

  const onLinkContact = async () => {
    if (!linkContactId) return;
    try {
      await linkContactToMeeting(userId, meeting.id, linkContactId);
      setLinkContactId('');
      onLinksChanged?.(); // parent re-fetches meetings so meeting_contacts updates
    } catch (e) { alert('Link failed: ' + (e.message || 'unknown')); }
  };

  const onUnlinkContact = async (contactId) => {
    try {
      await unlinkContactFromMeeting(meeting.id, contactId);
      onLinksChanged?.();
    } catch (e) { alert('Unlink failed: ' + (e.message || 'unknown')); }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try { await onSaveNotes(notesDraft); } finally { setSavingNotes(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 720, maxWidth: '95vw', height: '100vh', overflow: 'auto',
        background: T.paper, borderLeft: `1px solid ${T.faintRule}`,
        boxShadow: '-16px 0 48px rgba(15,82,186,.12)', fontFamily: T.sans,
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 18px', borderBottom: `1px solid ${T.faintRule}`, position: 'sticky', top: 0, background: T.paper, zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: T.fadedInk, marginBottom: 4 }}>{fmtTime(meeting.occurred_at)} · {meeting.duration_minutes || '?'}m</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: '-0.012em', wordBreak: 'break-word' }}>{meeting.title || 'Untitled'}</h2>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: 'pointer', width: 28, height: 28 }}>×</button>
          </div>

          {/* Classification toggle */}
          <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['client','internal','uncategorized'].map(c => {
              const active = cls === c;
              return <button key={c} onClick={() => onReclassify(c)} style={{
                padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em',
                background: active ? T.ink : 'transparent',
                color: active ? T.paper : T.ink70,
                border: `1px solid ${active ? T.ink : T.faintRule}`,
              }}>{CLASS_LABEL[c]}</button>;
            })}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0 28px', borderBottom: `1px solid ${T.faintRule}`, position: 'sticky', top: 130, background: T.paper, zIndex: 1 }}>
          {[
            { id: 'summary', label: 'Summary' },
            { id: 'transcript', label: 'Transcript' },
            { id: 'attendees', label: `Attendees · ${(meeting.attendees || []).length}` },
            { id: 'notes', label: 'My notes' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'transparent', border: 'none', padding: '12px 14px',
              font: 'inherit', fontSize: 12, fontWeight: 600, color: tab === t.id ? T.ink : T.fadedInk,
              cursor: 'pointer', borderBottom: `2px solid ${tab === t.id ? T.ink : 'transparent'}`,
              fontFamily: T.sans,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px 40px' }}>
          {tab === 'summary' && (
            <>
              {/* Linked contacts */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Linked contacts · {linkedContacts.length}
                </div>
                {linkedContacts.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {linkedContacts.map(mc => (
                      <span key={mc.contact_id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 999, fontSize: 11,
                        background: T.inkSoft, color: T.ink, border: `1px solid ${T.faintRule}`,
                      }}>
                        {mc.contacts.first_name} {mc.contacts.last_name}
                        {mc.contacts.company ? ` · ${mc.contacts.company}` : ''}
                        {mc.match_type === 'auto-email' && <span style={{ opacity: .55, fontSize: 9 }}>auto</span>}
                        <button onClick={() => onUnlinkContact(mc.contact_id)} title="Unlink" style={{
                          background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer',
                          padding: 0, fontSize: 12, lineHeight: 1,
                        }}>×</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: T.fadedInk, marginBottom: 8, fontStyle: 'italic' }}>No contacts linked.</div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={linkContactId} onChange={e => setLinkContactId(e.target.value)} style={selectStyle}>
                    <option value="">Link a contact…</option>
                    {linkableContacts.slice(0, 500).map(c => (
                      <option key={c.id} value={c.id}>
                        {(c.first_name || '') + ' ' + (c.last_name || '')}{c.company ? ` — ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                  <button onClick={onLinkContact} disabled={!linkContactId} style={miniLinkBtn(linkContactId)}>Link</button>
                </div>
              </div>

              {/* Linked projects */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Linked projects · {linkedProjects.length}
                </div>
                {linkedProjects.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {linkedProjects.map(lp => (
                      <span key={lp.projects?.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 999, fontSize: 11,
                        background: T.inkSoft, color: T.ink, border: `1px solid ${T.faintRule}`,
                      }}>
                        {lp.projects?.name || '(deleted)'}
                        {lp.match_type === 'auto-contact' && <span style={{ opacity: .55, fontSize: 9 }}>auto</span>}
                        <button onClick={() => onUnlinkProject(lp.projects?.id)} title="Unlink" style={{
                          background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer',
                          padding: 0, fontSize: 12, lineHeight: 1,
                        }}>×</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: T.fadedInk, marginBottom: 8, fontStyle: 'italic' }}>No projects linked.</div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={linkProjectId} onChange={e => setLinkProjectId(e.target.value)} style={selectStyle}>
                    <option value="">Link a project…</option>
                    {linkableProjects.map(p => <option key={p.id} value={p.id}>{p.name || '(unnamed)'}</option>)}
                  </select>
                  <button onClick={onLinkProject} disabled={!linkProjectId} style={miniLinkBtn(linkProjectId)}>Link</button>
                </div>
              </div>

              {meeting.summary ? (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>Fireflies summary</div>
                  <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{meeting.summary}</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: T.fadedInk, fontStyle: 'italic' }}>No summary from Fireflies.</div>
              )}

              {(meeting.action_items || []).length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>Action items</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {meeting.action_items.map((a, i) => (
                      <li key={i} style={{ fontSize: 13, color: T.ink, padding: '8px 0', borderBottom: `1px dashed ${T.faintRule}`, lineHeight: 1.5 }}>
                        <span style={{ color: T.ink70, marginRight: 8 }}>▢</span>{typeof a === 'string' ? a : JSON.stringify(a)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {meeting.external_url && (
                <div style={{ marginTop: 28 }}>
                  <a href={meeting.external_url} target="_blank" rel="noopener" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 11, fontWeight: 600, color: T.ink, textDecoration: 'none',
                    padding: '8px 14px', borderRadius: 999, border: `1px solid ${T.faintRule}`,
                  }}>Open transcript in Fireflies ↗</a>
                </div>
              )}
            </>
          )}

          {tab === 'transcript' && (
            <div>
              {meeting.transcript ? (
                <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: T.mono }}>{meeting.transcript}</div>
              ) : (
                <div style={{ padding: '24px 20px', borderRadius: 10, border: `1px dashed ${T.faintRule}`, color: T.fadedInk, fontSize: 12, lineHeight: 1.6 }}>
                  Full transcript text isn't stored in Morgan. Open the meeting in Fireflies for the searchable transcript + PDF download.
                  {meeting.external_url && (
                    <div style={{ marginTop: 12 }}>
                      <a href={meeting.external_url} target="_blank" rel="noopener" style={{ color: T.ink, fontWeight: 600 }}>Open in Fireflies →</a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'attendees' && (
            <div>
              {(meeting.attendees || []).map((a, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${T.faintRule}`, display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{a.name || a.email?.split('@')[0] || '—'}</div>
                    <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2 }}>{a.email || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'notes' && (
            <div>
              <div style={{ fontSize: 11, color: T.ink70, lineHeight: 1.5, marginBottom: 10 }}>Your private notes layered on top of the Fireflies summary. Markdown ok, plain text fine.</div>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                placeholder="What did you take away from this meeting?"
                style={{
                  width: '100%', minHeight: 200, padding: 14, borderRadius: 8,
                  border: `1px solid ${T.faintRule}`, background: T.inkSoft2,
                  fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none', resize: 'vertical',
                }}
              />
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={saveNotes} disabled={savingNotes} style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, fontFamily: T.sans,
                  background: T.ink, color: T.paper, opacity: savingNotes ? .5 : 1,
                }}>{savingNotes ? 'Saving…' : 'Save notes'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingsView({ user, onBack, onLogout, accessToken, projects = [] }) {
  const userId = user?.user_id || user?.id;
  const [meetings, setMeetings] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([
        listMeetings({ limit: 500 }),
        listContacts({ limit: 2000 }),
      ]);
      setMeetings(m);
      setContacts(c);
    } catch (e) {
      console.error('[meetings] load failed:', e.message || e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter(m => {
      if (filter !== 'all') {
        const cls = effectiveClassification(m);
        if (cls !== filter) return false;
      }
      if (!q) return true;
      const attEmails = (m.attendees || []).map(a => a?.email).filter(Boolean).join(' ');
      const attNames = (m.attendees || []).map(a => a?.name).filter(Boolean).join(' ');
      const hay = `${m.title || ''} ${m.summary || ''} ${m.notes || ''} ${attNames} ${attEmails}`.toLowerCase();
      return hay.includes(q);
    });
  }, [meetings, filter, search]);

  const counts = useMemo(() => {
    const by = { all: meetings.length };
    meetings.forEach(m => {
      const cls = effectiveClassification(m);
      by[cls] = (by[cls] || 0) + 1;
    });
    return by;
  }, [meetings]);

  const onReclassify = useCallback(async (cls) => {
    if (!selected) return;
    await setUserClassification(selected.id, cls);
    setSelected(s => s ? { ...s, user_classification: cls } : s);
    setMeetings(prev => prev.map(m => m.id === selected.id ? { ...m, user_classification: cls } : m));
  }, [selected]);

  const onSaveNotes = useCallback(async (notes) => {
    if (!selected) return;
    await updateMeeting(selected.id, { notes });
    setSelected(s => s ? { ...s, notes } : s);
    setMeetings(prev => prev.map(m => m.id === selected.id ? { ...m, notes } : m));
  }, [selected]);

  return (
    <div style={{ height: '100vh', background: T.bg, fontFamily: T.sans, overflow: 'auto' }}>
      <div style={{ height: 1, background: T.faintRule }}/>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '36px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, color: T.fadedInk, fontFamily: T.sans }}>← Dashboard</button>
            <ESWordmark height={14} color={T.ink}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: T.fadedInk }}>{user?.name || user?.email || ''}</span>
            <button onClick={onLogout} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: `1px solid ${T.faintRule}`, borderRadius: 999,
              cursor: 'pointer', padding: '5px 12px',
              fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
              color: T.fadedInk, fontFamily: T.sans,
            }}><LogOutI size={11} color="currentColor"/>Sign Out</button>
          </div>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 24, marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink, marginBottom: 14 }}>Library · Personal</div>
          <h1 style={{ fontSize: 'clamp(34px,5.4vw,56px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.022em', lineHeight: 1, margin: 0 }}>Meetings</h1>
          <div style={{ fontSize: 13, color: T.fadedInk, marginTop: 4 }}>
            {loading ? 'Loading…' : `${counts.all} meeting${counts.all === 1 ? '' : 's'} · synced from Fireflies every 5 min`}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', flexWrap: 'wrap',
          borderTop: `1px solid ${T.faintRule}`, borderBottom: `1px solid ${T.faintRule}`,
        }}>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: T.inkSoft2 }}>
            <span style={{ fontSize: 12, color: T.fadedInk }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search title, attendees, summary, notes…"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: T.ink, fontFamily: T.sans }}/>
          </div>
          {CLASS_OPTIONS.map(opt => {
            const active = filter === opt.id;
            const c = opt.id === 'all' ? counts.all : (counts[opt.id] || 0);
            return <button key={opt.id} onClick={() => setFilter(opt.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
              fontSize: 11, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer',
              background: active ? T.ink : 'transparent',
              color: active ? T.paper : T.ink70,
              border: `1px solid ${active ? T.ink : T.faintRule}`,
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}>{opt.label} <span style={{ opacity: .7, fontSize: 10 }}>{c}</span></button>;
          })}
        </div>

        {/* Table */}
        <div style={{ marginTop: 20, border: `1px solid ${T.faintRule}`, borderRadius: 10, overflow: 'hidden', background: T.paper }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '160px 1fr 1.4fr 90px 110px 24px',
            gap: 16, padding: '12px 18px', background: T.inkSoft2, borderBottom: `1px solid ${T.faintRule}`,
            fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink70,
          }}>
            <div>When</div><div>Title</div><div>Attendees</div><div style={{ textAlign:'right' }}>Duration</div><div>Type</div><div></div>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>Loading meetings…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>
              {meetings.length === 0
                ? 'No meetings synced yet. Vercel cron runs every 5 minutes — give it a moment.'
                : 'No meetings match this filter.'}
            </div>
          ) : (
            filtered.map(m => <MeetingRow key={m.id} m={m} onClick={() => setSelected(m)}/>)
          )}
        </div>

        <div style={{ marginTop: 16, padding: '14px 18px', borderRadius: 10, border: `1px dashed ${T.faintRule}`, color: T.fadedInk, fontSize: 12, lineHeight: 1.55 }}>
          <b style={{ color: T.ink }}>How attribution works.</b> When a meeting's attendees include a CRM contact's email, the meeting is auto-linked to that contact and shows up on their profile too. Internal team-only calls stay here without polluting the CRM. You can override the type per meeting (Client / Internal / Uncategorized) from the detail panel.
        </div>
      </div>

      {selected && (
        <MeetingDetail
          meeting={selected}
          projects={projects}
          contacts={contacts}
          userId={userId}
          onClose={() => setSelected(null)}
          onReclassify={onReclassify}
          onSaveNotes={onSaveNotes}
          onLinksChanged={async () => {
            // Re-fetch the affected meeting so meeting_contacts updates
            try {
              const fresh = await getMeeting(selected.id);
              if (fresh) {
                setSelected(fresh);
                setMeetings(prev => prev.map(m => m.id === fresh.id ? fresh : m));
              }
            } catch (e) {}
          }}
        />
      )}
    </div>
  );
}

export default MeetingsView;
