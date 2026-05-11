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
import { listContacts, createContact } from '../lib/contacts.js';
import { addProjectNote, meetingAlreadySavedToProject } from '../lib/projectNotes.js';

// Title-case a name string. Fireflies sometimes returns attendee
// names as lowercase usernames (e.g. "kamil") because the user's
// FF profile name isn't capitalized. We always display them
// title-cased so the UI reads cleanly regardless of source.
function titleCaseName(s) {
  if (!s) return s;
  return String(s)
    .split(/(\s+)/)
    .map(part => /^\s+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

// Personal email domains — never use as a "same company" signal.
const PERSONAL_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'me.com','aol.com','live.com','protonmail.com','proton.me','fastmail.com','mac.com','msn.com'
]);

// For each unlinked attendee, find the best CRM matches: exact-email,
// same-non-personal-domain, name match. Returns up to 3 per attendee.
function findContactSuggestions(attendee, allContacts) {
  if (!attendee) return [];
  const email = (attendee.email || '').toLowerCase().trim();
  const domain = email.includes('@') ? email.split('@')[1] : null;
  const nameStr = (attendee.name || '').trim().toLowerCase();
  const [aFirst, ...aRest] = nameStr.split(/\s+/);
  const aLast = aRest.join(' ');

  const out = [];
  const seen = new Set();
  const push = (c, reason) => {
    if (!c || seen.has(c.id)) return;
    seen.add(c.id); out.push({ contact: c, reason });
  };

  // 1. Exact email match (highest confidence)
  if (email) {
    const exact = allContacts.find(c => c.email && c.email.toLowerCase() === email);
    if (exact) push(exact, 'same email');
  }
  // 2. Same non-personal domain
  if (domain && !PERSONAL_DOMAINS.has(domain)) {
    allContacts
      .filter(c => c.email && c.email.toLowerCase().endsWith('@' + domain))
      .forEach(c => push(c, 'same company domain'));
  }
  // 3. Name match (both first + last present)
  if (aFirst && aLast) {
    allContacts
      .filter(c =>
        (c.first_name || '').toLowerCase() === aFirst &&
        (c.last_name || '').toLowerCase() === aLast
      )
      .forEach(c => push(c, 'name match'));
  }
  return out.slice(0, 3);
}

const CLASS_OPTIONS = [
  { id: 'all',           label: 'All' },
  { id: 'client',        label: 'Client / Prospect' },
  { id: 'internal',      label: 'Internal' },
  { id: 'uncategorized', label: 'Uncategorized' },
];
const CLASS_LABEL = Object.fromEntries(CLASS_OPTIONS.map(o => [o.id, o.label]));

function Stat({ icon, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.ink }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>
    </span>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, marginTop: 4 }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: '-.002em' }}>{title}</span>
      {subtitle && <span style={{ fontSize: 10, color: T.fadedInk, fontWeight: 500 }}>· {subtitle}</span>}
    </div>
  );
}

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
        {attendees.slice(0, 3).map(a => titleCaseName(a.name || a.email.split('@')[0])).join(', ')}
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

// Smarter contact-linking UX. Reads the meeting's attendees, finds
// the best CRM matches per attendee, surfaces them at the top with
// one-click Link buttons. For attendees with no match, a one-click
// "Add as new contact" button creates the contact + auto-links it.
// Below that, a fuzzy search input over the full CRM with up to 8
// inline results.
function ContactLinkSection({
  meeting, contacts, linkedContacts, linkableContacts,
  contactSearch, setContactSearch,
  onLinkContact, onUnlinkContact, onCreateFromAttendee, creatingAttendeeEmail,
}) {
  // Attendees that aren't already linked to a CRM contact via email
  const linkedEmails = new Set(
    linkedContacts.map(lc => lc.contacts?.email?.toLowerCase()).filter(Boolean)
  );
  const unlinkedAttendees = (meeting.attendees || [])
    .filter(a => (a.email || a.name) && !linkedEmails.has((a.email || '').toLowerCase()));

  const suggestionsByAttendee = unlinkedAttendees.map(att => ({
    att,
    suggestions: findContactSuggestions(att, linkableContacts),
  }));

  const q = contactSearch.trim().toLowerCase();
  const filteredContacts = q
    ? linkableContacts.filter(c => {
        const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''}`.toLowerCase();
        return hay.includes(q);
      }).slice(0, 8)
    : [];

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        Linked contacts · {linkedContacts.length}
      </div>

      {linkedContacts.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {linkedContacts.map(mc => {
            const t = mc.contacts.contact_type;
            const typeMap = { brand: '◆', agency: '◇', vendor: '▣', agent: '◍', press: '✎', internal: '●' };
            const typeLabel = { brand: 'Brand', agency: 'Agency', vendor: 'Vendor', agent: 'Agent', press: 'Press', internal: 'Internal' };
            return (
              <span key={mc.contact_id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 999, fontSize: 11,
                background: T.inkSoft, color: T.ink, border: `1px solid ${T.faintRule}`,
              }}>
                {t && <span title={typeLabel[t]} style={{ fontSize: 11 }}>{typeMap[t]}</span>}
                {mc.contacts.first_name} {mc.contacts.last_name}
                {mc.contacts.company ? ` · ${mc.contacts.company}` : ''}
                {mc.match_type === 'auto-email' && <span style={{ opacity: .55, fontSize: 9 }}>auto</span>}
                <button onClick={() => onUnlinkContact(mc.contact_id)} title="Unlink" style={{
                  background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer',
                  padding: 0, fontSize: 12, lineHeight: 1,
                }}>×</button>
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: T.fadedInk, marginBottom: 12, fontStyle: 'italic' }}>No contacts linked.</div>
      )}

      {/* Attendee-driven suggestions */}
      {suggestionsByAttendee.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.ink70, marginBottom: 6 }}>From this meeting's attendees</div>
          <div style={{ border: `1px solid ${T.faintRule}`, borderRadius: 8, overflow: 'hidden' }}>
            {suggestionsByAttendee.map(({ att, suggestions }, i) => {
              const isCreating = creatingAttendeeEmail === (att.email || att.name);
              return (
                <div key={i} style={{
                  padding: '10px 12px',
                  borderBottom: i < suggestionsByAttendee.length - 1 ? `1px solid ${T.faintRule}` : 'none',
                  background: T.paper,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {titleCaseName(att.name || (att.email && att.email.split('@')[0])) || 'Unnamed'}
                      </div>
                      {att.email && (
                        <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.email}
                        </div>
                      )}
                    </div>
                    {att.email && (
                      <button
                        onClick={() => onCreateFromAttendee(att)}
                        disabled={isCreating}
                        style={{
                          padding: '4px 10px', borderRadius: 999, border: `1px solid ${T.faintRule}`,
                          background: 'transparent', color: T.ink, fontSize: 10, fontWeight: 600,
                          cursor: isCreating ? 'wait' : 'pointer', fontFamily: T.sans, opacity: isCreating ? .5 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >{isCreating ? 'Adding…' : '+ Add as new'}</button>
                    )}
                  </div>
                  {suggestions.length > 0 ? (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {suggestions.map(({ contact: c, reason }) => (
                        <button key={c.id} onClick={() => onLinkContact(c.id)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                          background: T.ink, color: T.paper, border: 'none', cursor: 'pointer', fontFamily: T.sans,
                        }}>
                          Link {c.first_name} {c.last_name}
                          {c.company ? <span style={{ opacity: .75, fontWeight: 400 }}>· {c.company}</span> : null}
                          <span style={{ opacity: .65, fontSize: 9 }}>({reason})</span>
                        </button>
                      ))}
                    </div>
                  ) : att.email ? (
                    <div style={{ marginTop: 6, fontSize: 10, color: T.fadedInk, fontStyle: 'italic' }}>No CRM match — add or search below.</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <input
          value={contactSearch}
          onChange={e => setContactSearch(e.target.value)}
          placeholder="Search contacts by name, email, company, title…"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 12, fontFamily: T.sans,
            border: `1px solid ${T.faintRule}`, background: T.inkSoft2, color: T.ink, outline: 'none',
          }}
        />
        {q && filteredContacts.length > 0 && (
          <div style={{
            marginTop: 6, border: `1px solid ${T.faintRule}`, borderRadius: 8, background: T.paper, overflow: 'hidden',
          }}>
            {filteredContacts.map(c => (
              <button key={c.id} onClick={() => onLinkContact(c.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', background: 'transparent', border: 'none',
                borderBottom: `1px solid ${T.faintRule}`,
                cursor: 'pointer', fontFamily: T.sans,
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.inkSoft}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>
                  {c.first_name} {c.last_name}
                  {c.company ? <span style={{ color: T.fadedInk, fontWeight: 400 }}> · {c.company}</span> : null}
                </div>
                {c.email && <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 2 }}>{c.email}</div>}
              </button>
            ))}
          </div>
        )}
        {q && filteredContacts.length === 0 && (
          <div style={{ marginTop: 6, padding: 10, fontSize: 11, color: T.fadedInk, fontStyle: 'italic' }}>
            No matches.
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingDetail({ meeting, projects = [], contacts = [], userId, onCreateProject, onClose, onReclassify, onSaveNotes, onLinksChanged }) {
  const [tab, setTab] = useState('summary');
  const [notesDraft, setNotesDraft] = useState(meeting?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [linkProjectId, setLinkProjectId] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [creatingAttendeeEmail, setCreatingAttendeeEmail] = useState(null);
  // Inline-create-project state. User types a name, clicks Create,
  // we make the project and immediately link this meeting to it.
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  // Track which linked projects already have this meeting saved as
  // a note + which ones are mid-save (for button state).
  const [savedToProjects, setSavedToProjects] = useState(new Set());
  const [savingProjectId, setSavingProjectId] = useState(null);

  useEffect(() => { setNotesDraft(meeting?.notes || ''); }, [meeting?.id]);
  useEffect(() => {
    if (!meeting?.id) return;
    listProjectsForMeeting(meeting.id).then(setLinkedProjects).catch(() => {});
  }, [meeting?.id]);

  // For each linked project, check whether this meeting has already
  // been saved as a project_note, so the button can show "✓ Saved".
  useEffect(() => {
    if (!meeting?.id || linkedProjects.length === 0) { setSavedToProjects(new Set()); return; }
    let cancelled = false;
    (async () => {
      const saved = new Set();
      for (const lp of linkedProjects) {
        if (!lp.projects?.id) continue;
        try {
          if (await meetingAlreadySavedToProject(meeting.id, lp.projects.id)) {
            saved.add(lp.projects.id);
          }
        } catch (e) {}
      }
      if (!cancelled) setSavedToProjects(saved);
    })();
    return () => { cancelled = true; };
  }, [meeting?.id, linkedProjects.length]);

  // Build the note content from the meeting's summary + action items
  // and persist it as a project_note on the chosen project.
  const onSaveToProjectNotes = async (projectId) => {
    if (!projectId || !meeting?.id) return;
    setSavingProjectId(projectId);
    try {
      const parts = [];
      const head = `🎥 ${meeting.title || 'Untitled'} — ${meeting.occurred_at ? new Date(meeting.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}${meeting.duration_minutes ? ` · ${meeting.duration_minutes}m` : ''}`;
      parts.push(head);
      if (meeting.summary) parts.push('\n' + meeting.summary);
      const ai = (meeting.action_items || []).filter(Boolean);
      if (ai.length) parts.push('\n✅ Action items:\n' + ai.map(a => '• ' + (typeof a === 'string' ? a : JSON.stringify(a))).join('\n'));
      if (meeting.external_url) parts.push('\n🔗 ' + meeting.external_url);
      await addProjectNote(userId, projectId, {
        content: parts.join('\n'),
        source: 'meeting',
        source_meeting_id: meeting.id,
      });
      setSavedToProjects(prev => new Set([...prev, projectId]));
    } catch (e) {
      alert('Could not save to project notes: ' + (e.message || 'unknown'));
    } finally {
      setSavingProjectId(null);
    }
  };

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

  // Create a brand-new project from the meeting context, then auto-link
  // this meeting to it. Default client = the meeting title (often
  // descriptive of the brand or topic) so the project is searchable.
  const onCreateAndLinkProject = async () => {
    const name = newProjectName.trim();
    if (!name || !onCreateProject) return;
    setCreatingProject(true);
    try {
      const newId = await onCreateProject(name, '', '', '', '', 0, 'pitching');
      if (newId) {
        await linkMeetingToProject(userId, meeting.id, newId);
        const next = await listProjectsForMeeting(meeting.id);
        setLinkedProjects(next);
        setNewProjectName('');
        onLinksChanged?.();
      } else {
        alert('Could not create project.');
      }
    } catch (e) {
      alert('Create failed: ' + (e.message || 'unknown'));
    } finally { setCreatingProject(false); }
  };

  const onLinkContact = async (contactId) => {
    if (!contactId) return;
    try {
      await linkContactToMeeting(userId, meeting.id, contactId);
      setContactSearch('');
      onLinksChanged?.(); // parent re-fetches meetings so meeting_contacts updates
    } catch (e) { alert('Link failed: ' + (e.message || 'unknown')); }
  };

  const onUnlinkContact = async (contactId) => {
    try {
      await unlinkContactFromMeeting(meeting.id, contactId);
      onLinksChanged?.();
    } catch (e) { alert('Unlink failed: ' + (e.message || 'unknown')); }
  };

  // Create a new contact from a meeting attendee in one click, then
  // auto-link it. Names are split first-word vs rest; status defaults
  // to 'prospect' (since they're external to your team) but the user
  // can change it from the contact detail drawer afterward.
  const onCreateFromAttendee = async (att) => {
    if (!att?.email && !att?.name) return;
    setCreatingAttendeeEmail(att.email || att.name);
    try {
      const nameParts = (att.name || '').trim().split(/\s+/);
      const newContact = await createContact(userId, {
        first_name: nameParts[0] || null,
        last_name: nameParts.slice(1).join(' ') || null,
        email: att.email || null,
        status: 'prospect',
        sources: ['meeting'],
      });
      if (newContact?.id) {
        await linkContactToMeeting(userId, meeting.id, newContact.id);
        onLinksChanged?.();
      }
    } catch (e) {
      alert('Could not add contact: ' + (e.message || 'unknown'));
    } finally {
      setCreatingAttendeeEmail(null);
    }
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
              {/* At-a-glance stat row */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center',
                padding: '12px 14px', borderRadius: 10,
                background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
                marginBottom: 24,
              }}>
                <Stat icon="📅" label={fmtTime(meeting.occurred_at)}/>
                <Stat icon="⏱️" label={meeting.duration_minutes ? `${meeting.duration_minutes} min` : '—'}/>
                <Stat icon="👥" label={`${(meeting.attendees || []).length} attendee${(meeting.attendees || []).length === 1 ? '' : 's'}`}/>
                <Stat icon="🏷️" label={CLASS_LABEL[effectiveClassification(meeting)] || 'Uncategorized'}/>
              </div>

              {/* Section: people */}
              <SectionHeader icon="👥" title="People" subtitle="Who's on this meeting and how it lines up with your CRM"/>
              <ContactLinkSection
                meeting={meeting}
                contacts={contacts}
                linkedContacts={linkedContacts}
                linkableContacts={linkableContacts}
                contactSearch={contactSearch}
                setContactSearch={setContactSearch}
                onLinkContact={onLinkContact}
                onUnlinkContact={onUnlinkContact}
                onCreateFromAttendee={onCreateFromAttendee}
                creatingAttendeeEmail={creatingAttendeeEmail}
              />

              {/* Section: projects */}
              <SectionHeader icon="📌" title="Projects" subtitle={`Linked · ${linkedProjects.length}`}/>
              <div style={{ marginBottom: 24 }}>
                {linkedProjects.length > 0 ? (
                  <div style={{ marginBottom: 10 }}>
                    {linkedProjects.map(lp => {
                      const pid = lp.projects?.id;
                      const saved = savedToProjects.has(pid);
                      const isSaving = savingProjectId === pid;
                      return (
                        <div key={pid} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          padding: '8px 12px', borderRadius: 8, marginBottom: 4,
                          background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lp.projects?.name || '(deleted)'}
                            </span>
                            {lp.match_type === 'auto-contact' && <span style={{ opacity: .55, fontSize: 9, color: T.ink70 }}>auto</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => !saved && !isSaving && onSaveToProjectNotes(pid)}
                              disabled={saved || isSaving}
                              title={saved ? 'Already saved to this project' : 'Append the meeting summary + action items to this project\'s notes'}
                              style={{
                                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                                background: saved ? 'transparent' : T.ink, color: saved ? T.ink70 : T.paper,
                                border: saved ? `1px solid ${T.faintRule}` : 'none',
                                cursor: (saved || isSaving) ? 'default' : 'pointer',
                                opacity: isSaving ? .5 : 1,
                              }}
                            >{saved ? '✓ Saved' : isSaving ? 'Saving…' : '📥 Save to notes'}</button>
                            <button onClick={() => onUnlinkProject(pid)} title="Unlink" style={{
                              background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer',
                              padding: '4px 6px', fontSize: 14, lineHeight: 1,
                            }}>×</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: T.fadedInk, marginBottom: 8, fontStyle: 'italic' }}>No projects linked.</div>
                )}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <select value={linkProjectId} onChange={e => setLinkProjectId(e.target.value)} style={selectStyle}>
                    <option value="">Link an existing project…</option>
                    {linkableProjects.map(p => <option key={p.id} value={p.id}>{p.name || '(unnamed)'}</option>)}
                  </select>
                  <button onClick={onLinkProject} disabled={!linkProjectId} style={miniLinkBtn(linkProjectId)}>Link</button>
                </div>
                {onCreateProject && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newProjectName.trim() && !creatingProject) onCreateAndLinkProject(); }}
                      placeholder="Or create a new project from this meeting…"
                      style={{
                        flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 11, fontFamily: T.sans,
                        border: `1px solid ${T.faintRule}`, background: T.paper, color: T.ink, outline: 'none',
                      }}
                    />
                    <button onClick={onCreateAndLinkProject} disabled={!newProjectName.trim() || creatingProject} style={{
                      padding: '7px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
                      background: T.ink, color: T.paper, border: 'none',
                      cursor: (newProjectName.trim() && !creatingProject) ? 'pointer' : 'default',
                      opacity: (newProjectName.trim() && !creatingProject) ? 1 : .4,
                    }}>{creatingProject ? 'Creating…' : '＋ Create'}</button>
                  </div>
                )}
              </div>

              {/* Section: summary */}
              <SectionHeader icon="📝" title="Summary" subtitle="From Fireflies"/>
              {meeting.summary ? (
                <div style={{
                  padding: '14px 18px', borderLeft: `3px solid ${T.ink}`, background: T.inkSoft2,
                  borderRadius: '0 8px 8px 0', marginBottom: 24,
                  fontSize: 13, color: T.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                }}>{meeting.summary}</div>
              ) : (
                <div style={{ marginBottom: 24, padding: '14px 18px', borderRadius: 8, background: T.inkSoft2, border: `1px dashed ${T.faintRule}`, fontSize: 12, color: T.fadedInk, fontStyle: 'italic' }}>
                  No summary from Fireflies for this meeting.
                </div>
              )}

              {/* Section: keywords */}
              {(meeting.keywords || []).length > 0 && (
                <>
                  <SectionHeader icon="🎯" title="Topics" subtitle={`${meeting.keywords.length} key term${meeting.keywords.length === 1 ? '' : 's'}`}/>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
                    {meeting.keywords.map((k, i) => (
                      <span key={i} style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                        background: T.inkSoft2, color: T.ink70, border: `1px solid ${T.faintRule}`,
                      }}>{typeof k === 'string' ? k : JSON.stringify(k)}</span>
                    ))}
                  </div>
                </>
              )}

              {/* Section: action items */}
              {(meeting.action_items || []).length > 0 && (
                <>
                  <SectionHeader icon="✅" title="Action items" subtitle={`${meeting.action_items.length} item${meeting.action_items.length === 1 ? '' : 's'}`}/>
                  <div style={{ border: `1px solid ${T.faintRule}`, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
                    {meeting.action_items.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '12px 14px',
                        borderBottom: i < meeting.action_items.length - 1 ? `1px solid ${T.faintRule}` : 'none',
                        background: T.paper,
                      }}>
                        <span style={{ flexShrink: 0, marginTop: 1, fontSize: 14 }}>◯</span>
                        <span style={{ fontSize: 13, color: T.ink, lineHeight: 1.55 }}>
                          {typeof a === 'string' ? a : JSON.stringify(a)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Open in Fireflies */}
              {meeting.external_url && (
                <div style={{ marginTop: 8 }}>
                  <a href={meeting.external_url} target="_blank" rel="noopener" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 11, fontWeight: 600, color: T.ink, textDecoration: 'none',
                    padding: '8px 14px', borderRadius: 999, border: `1px solid ${T.faintRule}`,
                  }}>🎥 Open transcript in Fireflies ↗</a>
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

          {tab === 'attendees' && (() => {
            // Group attendees: anyone whose email matches a contact_type='internal'
            // contact (or whose email is the current viewer's) folds into a single
            // "Internal team" pill so client-facing rows aren't drowned in
            // your own + teammates' rows.
            const internalEmails = new Set(
              contacts.filter(c => c.contact_type === 'internal' && c.email).map(c => c.email.toLowerCase())
            );
            const all = meeting.attendees || [];
            const internals = all.filter(a => a.email && internalEmails.has(a.email.toLowerCase()));
            const externals = all.filter(a => !(a.email && internalEmails.has(a.email.toLowerCase())));
            return (
              <>
                <SectionHeader icon="👥" title="Attendees" subtitle={`${all.length} on the call${internals.length ? ` · ${externals.length} external` : ''}`}/>
                {internals.length > 0 && (
                  <div style={{
                    padding: '10px 14px', marginBottom: 8, borderRadius: 8,
                    background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
                    fontSize: 12, color: T.ink70,
                  }}>
                    <span style={{ fontWeight: 600, color: T.ink }}>● Internal team · {internals.length}</span>
                    <span style={{ marginLeft: 8 }}>
                      {internals.map(a => titleCaseName(a.name || a.email?.split('@')[0])).filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                <div style={{ border: `1px solid ${T.faintRule}`, borderRadius: 8, overflow: 'hidden' }}>
                  {externals.length === 0 ? (
                    <div style={{ padding: '14px 16px', fontSize: 12, color: T.fadedInk, fontStyle: 'italic' }}>
                      No external attendees — this looks like an internal-only call.
                    </div>
                  ) : externals.map((a, i) => {
                    const initials = (a.name || a.email || '?').split(/[\s@]/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');
                    return (
                      <div key={i} style={{
                        padding: '12px 14px',
                        borderBottom: i < externals.length - 1 ? `1px solid ${T.faintRule}` : 'none',
                        display: 'flex', alignItems: 'center', gap: 12, background: T.paper,
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', background: T.inkSoft,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: T.ink, border: `1px solid ${T.faintRule}`, flexShrink: 0,
                        }}>{initials || '?'}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {titleCaseName(a.name || a.email?.split('@')[0]) || '—'}
                          </div>
                          {a.email && <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2 }}>{a.email}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {tab === 'notes' && (
            <>
              <SectionHeader icon="✍️" title="Your private notes" subtitle="Layered on top of the Fireflies summary"/>
              <div style={{ fontSize: 11, color: T.ink70, lineHeight: 1.5, marginBottom: 10 }}>
                Free-form. Sync never touches this field — your call recaps stay yours.
              </div>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                placeholder="What did you take away from this meeting?"
                style={{
                  width: '100%', minHeight: 240, padding: 14, borderRadius: 8,
                  border: `1px solid ${T.faintRule}`, background: T.inkSoft2,
                  fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none', resize: 'vertical',
                  lineHeight: 1.6,
                }}
              />
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={saveNotes} disabled={savingNotes} style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, fontFamily: T.sans,
                  background: T.ink, color: T.paper, opacity: savingNotes ? .5 : 1,
                }}>{savingNotes ? 'Saving…' : '💾 Save notes'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingsView({ user, onBack, onLogout, accessToken, projects = [], onCreateProject, onOpenContacts }) {
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
      // Include linked CRM contacts so "show me meetings with Sarah Chen"
      // works even when Sarah attended from a personal email Fireflies
      // didn't capture as her name.
      const linkedContactNames = (m.meeting_contacts || [])
        .map(mc => `${mc.contacts?.first_name || ''} ${mc.contacts?.last_name || ''} ${mc.contacts?.company || ''}`)
        .join(' ');
      const hay = `${m.title || ''} ${m.summary || ''} ${m.notes || ''} ${attNames} ${attEmails} ${linkedContactNames}`.toLowerCase();
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
            {onOpenContacts && (
              <button onClick={onOpenContacts} style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', border: `1px solid ${T.faintRule}`, borderRadius: 999,
                color: T.ink, cursor: 'pointer', transition: 'all .18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.inkSoft; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; }}
              >Contacts</button>
            )}
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
          onCreateProject={onCreateProject}
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
