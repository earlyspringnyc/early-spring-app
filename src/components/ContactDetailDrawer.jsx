import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import T from '../theme/tokens.js';
import {
  updateContact, deleteContact,
  linkContactToProject, unlinkContactFromProject, listProjectsForContact,
} from '../lib/contacts.js';
import { listMeetingsForContact, effectiveClassification } from '../lib/meetings.js';
import { uploadAvatar } from '../lib/avatarUpload.js';
import { listGmailThreadsForEmail } from '../utils/gmail.js';
import { deriveCompanyWebsiteFromEmail } from '../utils/companyDedup.js';
import ScheduleMeetingModal from './ScheduleMeetingModal.jsx';
import ConceptMenuBuilder from './ConceptMenuBuilder.jsx';
import ShareContactModal from './contacts/ShareContactModal.jsx';

// Status = pipeline stage. Four states; `vendor` and `press`
// previously lived here but overlapped with type — moved out.
const STATUS_OPTIONS = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'active',   label: 'Active' },
  { id: 'past',     label: 'Past' },
];

// Type = what they are in their org. Four kinds. `agent` was
// effectively one person (Louisa) so handled via tag instead;
// `press` is rare enough to also use a tag.
const TYPE_OPTIONS = [
  { id: 'brand',    label: 'Brand', icon: '◆' },
  { id: 'agency',   label: 'Agency', icon: '◇' },
  { id: 'vendor',   label: 'Vendor', icon: '▣' },
  { id: 'internal', label: 'Internal', icon: '●' },
];

// Per-project roles. `agent` lives here (not as a contact type)
// because it's a relationship to a specific project — Louisa is
// the agent on the Braun project, but a regular intro source
// elsewhere. Project-scoped, not contact-scoped.
const PROJECT_ROLES = [
  { id: 'rfp_sender',       label: 'RFP sender' },
  { id: 'champion',         label: 'Champion' },
  { id: 'point_of_contact', label: 'Point of contact' },
  { id: 'agent',            label: 'Agent' },
  { id: 'team_member',      label: 'Team member' },
];

function ContactDetailDrawer({ contact: initialContact, projects = [], allContacts = [], userId, userName, accessToken, onClose, onUpdate, onDelete, onEnrich, onOpenPrepBrief, onOpenProject }) {
  const [contact, setContact] = useState(initialContact);
  // `dirty` holds in-progress edits keyed by field name. The contact
  // state above is the union of (saved data) + (dirty edits) for
  // display; saved data only updates after the user hits Save.
  const [dirty, setDirty] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [linkedMeetings, setLinkedMeetings] = useState([]);
  const [gmailThreads, setGmailThreads] = useState(null);  // null = not loaded; [] = loaded empty
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [showBio, setShowBio] = useState(false);
  const [linkProjectId, setLinkProjectId] = useState('');
  const [linkRole, setLinkRole] = useState('point_of_contact');
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [enrichInput, setEnrichInput] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showConceptMenu, setShowConceptMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const fileInputRef = useRef(null);

  const hasUnsavedChanges = Object.keys(dirty).length > 0;
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // Reset state when a different contact is opened
  useEffect(() => {
    setContact(initialContact);
    setDirty({});
    setEnrichInput('');
    setEnrichError(null);
  }, [initialContact?.id]);

  // When the same contact gets patched externally (e.g. the enrich
  // modal applied a RocketReach diff while the drawer was open), the
  // parent passes a new `initialContact` reference. Merge it in
  // without clobbering any in-progress dirty edits or unsaved-typed
  // notes, so the drawer reflects the new values immediately.
  useEffect(() => {
    if (!initialContact) return;
    setContact({
      ...initialContact,
      ...dirtyRef.current,
      ...(notesPendingRef.current !== null ? { notes: notesPendingRef.current } : {}),
    });
  }, [initialContact]);

  const runEnrich = useCallback(async () => {
    if (!onEnrich) return;
    const raw = enrichInput.trim();
    let override;
    if (raw) {
      override = raw.includes('@') ? { email: raw } : { linkedin_url: raw };
    } else if (contact.linkedin_url) {
      override = { linkedin_url: contact.linkedin_url };
    } else if (contact.email) {
      override = { email: contact.email };
    } else {
      setEnrichError('Paste a LinkedIn URL or email to look up.');
      return;
    }
    setEnriching(true);
    setEnrichError(null);
    try {
      await onEnrich(contact, override);
    } catch (e) {
      setEnrichError(e.message || 'Lookup failed');
    } finally {
      setEnriching(false);
    }
  }, [onEnrich, enrichInput, contact]);

  // Load linked projects + meetings whenever contact id changes
  useEffect(() => {
    if (!contact?.id) return;
    (async () => {
      try {
        const [projs, meetings] = await Promise.all([
          listProjectsForContact(contact.id),
          listMeetingsForContact(contact.id),
        ]);
        setLinkedProjects(projs || []);
        setLinkedMeetings(meetings || []);
      } catch (e) {
        console.error('[contact-drawer] load failed:', e.message || e);
      }
    })();
    // Reset Gmail state — re-fetch when the tab is opened.
    setGmailThreads(null); setGmailError(null);
  }, [contact?.id]);

  // Lazy-fetch Gmail threads when the user opens the Gmail tab. Only
  // fires once per contact-open — manually trigger refresh below.
  const fetchGmail = useCallback(async (force = false) => {
    if (!contact?.email || !accessToken) return;
    if (gmailThreads !== null && !force) return; // already loaded
    setGmailLoading(true); setGmailError(null);
    try {
      const rows = await listGmailThreadsForEmail(accessToken, contact.email, { limit: 25 });
      setGmailThreads(rows);
    } catch (e) {
      setGmailError(e.message || 'Could not load Gmail');
      setGmailThreads([]);
    } finally { setGmailLoading(false); }
  }, [contact?.email, accessToken, gmailThreads]);

  useEffect(() => {
    if (tab === 'gmail') fetchGmail(false);
  }, [tab, fetchGmail]);

  const linkableProjects = useMemo(() => {
    const linkedIds = new Set(linkedProjects.map(lp => lp.projects?.id).filter(Boolean));
    return (projects || []).filter(p => !linkedIds.has(p.id));
  }, [projects, linkedProjects]);

  // Draft-only field update. Stages the change in `dirty`, shows
  // the Save bar; nothing is written until the user clicks Save.
  // Lets the user revisit edits before committing instead of
  // autosaving every keystroke.
  const updateField = useCallback((field, value) => {
    setContact(c => ({ ...c, [field]: value }));
    setDirty(d => ({ ...d, [field]: value }));
  }, []);

  // Immediate save for instant-commit fields (status pills, contact
  // type, photo upload). These don't pollute the dirty state; user
  // clicked a discrete action and expects it to stick.
  const updateImmediate = useCallback(async (patch) => {
    setContact(c => ({ ...c, ...patch }));
    try {
      await updateContact(contact.id, patch);
      onUpdate?.({ ...contact, ...patch });
    } catch (e) {
      console.error('[contact-drawer] update failed:', e.message || e);
    }
  }, [contact, onUpdate]);

  // Auto-fill company_url from the email domain when empty.
  // Runs once per contact open — doesn't re-derive on subsequent
  // email edits, so the user can clear an auto-filled URL without
  // it bouncing back. Persisted immediately so it sticks across
  // refreshes without needing a Save click.
  const autoFilledRef = useRef(null);
  useEffect(() => {
    if (!contact?.id) return;
    if (autoFilledRef.current === contact.id) return;
    autoFilledRef.current = contact.id;
    if ((contact.company_url || '').trim()) return;
    const derived = deriveCompanyWebsiteFromEmail(contact.email);
    if (!derived) return;
    updateImmediate({ company_url: derived });
  }, [contact?.id, contact?.email, contact?.company_url, updateImmediate]);

  // Save all pending field edits. Discards dirty state on success.
  const saveAll = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    setSaving(true);
    try {
      await updateContact(contact.id, dirty);
      onUpdate?.({ ...contact, ...dirty });
      setDirty({});
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      alert('Save failed: ' + (e.message || 'unknown'));
    } finally { setSaving(false); }
  }, [contact, dirty, hasUnsavedChanges, onUpdate]);

  // Discard pending edits and revert local state to last-saved.
  const discardChanges = useCallback(() => {
    if (!hasUnsavedChanges) return;
    if (!confirm('Discard your unsaved changes?')) return;
    // Revert by re-applying initialContact's values for each dirty key
    const revertPatch = {};
    for (const k of Object.keys(dirty)) revertPatch[k] = initialContact?.[k] ?? null;
    setContact(c => ({ ...c, ...revertPatch }));
    setDirty({});
  }, [dirty, hasUnsavedChanges, initialContact]);

  // Cmd/Ctrl+S keyboard shortcut to save
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && hasUnsavedChanges && !saving) {
        e.preventDefault();
        saveAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasUnsavedChanges, saving, saveAll]);

  // File-input upload handler. Uploads to Supabase storage, sets
  // avatar_url immediately (separate write — doesn't go through
  // the dirty/save flow).
  const onPickAvatar = () => fileInputRef.current?.click();
  const onAvatarFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be reselected
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(userId, contact.id, file);
      if (!url) throw new Error('No URL returned');
      await updateImmediate({ avatar_url: url });
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally { setUploadingAvatar(false); }
  };

  const onAddProjectLink = useCallback(async () => {
    if (!linkProjectId) return;
    try {
      await linkContactToProject(userId, contact.id, linkProjectId, linkRole);
      const projs = await listProjectsForContact(contact.id);
      setLinkedProjects(projs || []);
      setLinkProjectId('');
      setLinkRole('point_of_contact');
    } catch (e) {
      alert('Could not link project: ' + (e.message || 'unknown'));
    }
  }, [userId, contact?.id, linkProjectId, linkRole]);

  const onRemoveProjectLink = useCallback(async (projectId, role) => {
    try {
      await unlinkContactFromProject(contact.id, projectId, role);
      setLinkedProjects(prev => prev.filter(lp => !(lp.projects?.id === projectId && lp.role === role)));
    } catch (e) {
      alert('Could not unlink: ' + (e.message || 'unknown'));
    }
  }, [contact?.id]);

  const onDeleteContact = useCallback(async () => {
    if (!confirm(`Delete ${contact.first_name || ''} ${contact.last_name || ''}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteContact(contact.id);
      onDelete?.(contact.id);
      onClose();
    } catch (e) {
      alert('Delete failed: ' + (e.message || 'unknown'));
      setDeleting(false);
    }
  }, [contact, onClose, onDelete]);

  // Notes autosave. Long-form textarea is the one field where users
  // reasonably expect typing → persisted. The Overview fields stay on
  // explicit-Save so a half-typed email/URL doesn't write half-data.
  //
  // notesPendingRef holds the latest typed-but-not-yet-saved value so
  // an external refresh of initialContact (e.g. enrich diff applied,
  // contacts list re-fetched) can't clobber in-progress typing.
  const [notesSaveState, setNotesSaveState] = useState('idle'); // idle | saving | saved
  const notesTimerRef = useRef(null);
  const notesLastSavedRef = useRef(initialContact?.notes ?? '');
  const notesPendingRef = useRef(null);
  useEffect(() => {
    notesLastSavedRef.current = initialContact?.notes ?? '';
    notesPendingRef.current = null;
    setNotesSaveState('idle');
  }, [initialContact?.id]);

  const flushNotes = useCallback(async () => {
    if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
    const pending = notesPendingRef.current;
    if (pending === null || pending === notesLastSavedRef.current) return;
    try {
      await updateContact(contact.id, { notes: pending });
      notesLastSavedRef.current = pending;
      notesPendingRef.current = null;
      onUpdate?.({ ...contact, notes: pending });
      setNotesSaveState('saved');
      setTimeout(() => setNotesSaveState(s => s === 'saved' ? 'idle' : s), 1500);
    } catch (e) {
      console.error('[contact-drawer] notes autosave failed:', e?.message || e);
      setNotesSaveState('idle');
    }
  }, [contact, onUpdate]);

  const onNotesChange = useCallback((value) => {
    setContact(c => ({ ...c, notes: value }));
    notesPendingRef.current = value;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    if (value === notesLastSavedRef.current) { setNotesSaveState('idle'); return; }
    setNotesSaveState('saving');
    notesTimerRef.current = setTimeout(() => { flushNotes(); }, 700);
  }, [flushNotes]);

  useEffect(() => () => { if (notesTimerRef.current) clearTimeout(notesTimerRef.current); }, []);

  // Avatar error state — kept above the early-return below to obey
  // React's rules-of-hooks (must be called in the same order each render).
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => { setAvatarError(false); }, [contact?.avatar_url]);

  // Warn before closing the drawer with unsaved edits — the user
  // explicitly opted for Save-on-click, so prompting is the right
  // call rather than silently discarding. Flush any pending notes
  // autosave first so the last 700ms of typing isn't lost.
  const safeClose = async () => {
    await flushNotes();
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Close without saving?')) return;
    }
    onClose();
  };

  if (!contact) return null;

  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '(No name)';
  const initials = ((contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')).toUpperCase();

  return (
    <div onClick={safeClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 760, maxWidth: '95vw', height: '100vh',
        background: T.paper, borderLeft: `1px solid ${T.faintRule}`,
        boxShadow: '-16px 0 48px rgba(15,82,186,.12)', fontFamily: T.sans,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 18px', borderBottom: `1px solid ${T.faintRule}`, position: 'sticky', top: 0, background: T.paper, zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={onPickAvatar}
                  disabled={uploadingAvatar}
                  title={uploadingAvatar ? 'Uploading…' : 'Click to upload a new photo'}
                  style={{ padding: 0, border: 'none', background: 'transparent', cursor: uploadingAvatar ? 'wait' : 'pointer', display: 'block', position: 'relative' }}
                >
                  {contact.avatar_url && !avatarError ? (
                    <img
                      src={contact.avatar_url}
                      alt=""
                      onError={() => setAvatarError(true)}
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${T.faintRule}`, display: 'block', opacity: uploadingAvatar ? .4 : 1 }}
                    />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%', background: T.inkSoft,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700, color: T.ink, border: `1px solid ${T.faintRule}`,
                      opacity: uploadingAvatar ? .4 : 1,
                    }}>{initials || '?'}</div>
                  )}
                  {/* Tiny camera badge in the corner — visual cue that it's clickable */}
                  <span style={{
                    position: 'absolute', right: -2, bottom: -2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: T.ink, color: T.paper, fontSize: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `2px solid ${T.paper}`,
                  }}>{uploadingAvatar ? '…' : '✎'}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onAvatarFileChosen}
                  style={{ display: 'none' }}
                />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: '-0.012em', wordBreak: 'break-word' }}>
                  {fullName}
                </h2>
                <div style={{ fontSize: 12, color: T.fadedInk, marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  {contact.title && <span>{contact.title}</span>}
                  {contact.title && contact.company && <span>·</span>}
                  {contact.company && <span>{contact.company}</span>}
                  {(() => {
                    // Live count of awarded / pitching project links — bumps as
                    // project stages change without reopening the drawer.
                    const awarded = linkedProjects.filter(lp => lp.projects?.stage === 'awarded' || lp.projects?.stage === 'current').length;
                    const pitching = linkedProjects.filter(lp => lp.projects?.stage === 'pitching').length;
                    return (
                      <>
                        {awarded > 0 && (
                          <span title={`${awarded} awarded project${awarded === 1 ? '' : 's'} with this contact`} style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                            background: T.ink, color: T.paper, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                          }}>✓ {awarded} awarded</span>
                        )}
                        {pitching > 0 && (
                          <span title={`${pitching} project${pitching === 1 ? '' : 's'} pitching with this contact`} style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                            background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
                            letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                          }}>◐ {pitching} pitching</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {accessToken && contact.email && (
                <button onClick={() => setShowScheduleModal(true)} title="Send a Google Calendar invite to this contact" style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '.08em',
                }}>📅 Schedule</button>
              )}
              {onOpenPrepBrief && (
                <button onClick={() => onOpenPrepBrief(contact)} title="Open a printable brief for your next call with this contact" style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: T.sans,
                  background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '.08em',
                }}>✦ Prep next meeting</button>
              )}
              <button onClick={() => setShowConceptMenu(true)} title="Build a 3-tier concept menu to send before formal budget" style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}>✦ Concept menu</button>
              <button onClick={() => setShowShareModal(true)} title="Email this contact's card to someone — name, role, company, clickable email/phone/LinkedIn" style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}>✉ Share</button>
              <button onClick={safeClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: 'pointer', width: 28, height: 28 }}>×</button>
            </div>
          </div>

          {/* Status pills */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 6 }}>Status · funnel stage</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(opt => {
                const active = (contact.status || 'prospect') === opt.id;
                return <button key={opt.id} onClick={() => updateImmediate({ status: opt.id })} style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em',
                  background: active ? T.ink : 'transparent',
                  color: active ? T.paper : T.ink70,
                  border: `1px solid ${active ? T.ink : T.faintRule}`,
                }}>{opt.label}</button>;
              })}
            </div>
          </div>

          {/* Type pills */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 6 }}>Type · what kind of contact</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TYPE_OPTIONS.map(opt => {
                const active = contact.contact_type === opt.id;
                return <button key={opt.id} onClick={() => updateImmediate({ contact_type: active ? null : opt.id })} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em',
                  background: active ? T.inkSoft : 'transparent',
                  color: active ? T.ink : T.ink70,
                  border: `1px solid ${active ? T.ink : T.faintRule}`,
                }}>
                  <span style={{ fontSize: 11 }}>{opt.icon}</span>
                  {opt.label}
                </button>;
              })}
            </div>
          </div>

          {/* Tags — free-form cross-cutting labels */}
          <TagsEditor
            tags={Array.isArray(contact.tags) ? contact.tags : []}
            onChange={(next) => updateImmediate({ tags: next })}
          />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0 28px', borderBottom: `1px solid ${T.faintRule}`, position: 'sticky', top: 152, background: T.paper, zIndex: 1 }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'notes', label: 'Notes' },
            { id: 'projects', label: `Projects · ${linkedProjects.length}` },
            { id: 'meetings', label: `Meetings · ${linkedMeetings.length}` },
            ...(contact.email ? [{ id: 'gmail', label: 'Gmail' }] : []),
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'transparent', border: 'none', padding: '12px 14px',
              font: 'inherit', fontSize: 12, fontWeight: 600,
              color: tab === t.id ? T.ink : T.fadedInk,
              cursor: 'pointer', borderBottom: `2px solid ${tab === t.id ? T.ink : 'transparent'}`,
              fontFamily: T.sans,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px 80px' }}>
          {tab === 'overview' && (
            <>
              {/* One-click verify — re-fetches LinkedIn via RocketReach
                  and shows a diff in the existing RefreshPreviewModal.
                  Shown whenever we have something to look up by. The
                  sparse panel below still adds an override input for
                  contacts with no LI URL / wrong identifiers. */}
              {onEnrich && (contact.linkedin_url || contact.email) && (
                <div style={{
                  marginBottom: 14, padding: '10px 14px', borderRadius: 8,
                  background: T.inkSoft3, border: `1px solid ${T.faintRule}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.ink }}>
                        Verify on LinkedIn
                      </div>
                      <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 2, lineHeight: 1.5 }}>
                        Re-fetches via RocketReach to catch role/company changes. You'll see a per-field preview before anything saves.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={runEnrich}
                      disabled={enriching}
                      style={{
                        padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
                        background: T.ink, color: T.paper, border: 'none',
                        cursor: enriching ? 'wait' : 'pointer', opacity: enriching ? .6 : 1, whiteSpace: 'nowrap',
                      }}
                    >{enriching ? 'Checking…' : '↻ Verify'}</button>
                  </div>
                  {/* Only render the error here when the sparse panel
                      isn't visible — otherwise it would show twice. */}
                  {enrichError && contact.title && contact.company && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.alert, lineHeight: 1.5 }}>{enrichError}</div>
                  )}
                </div>
              )}

              {/* Sparse-contact heuristic: shows the enrich affordance
                  only when there's something obvious to fill in.
                  Contacts created from a Fireflies attendee land here
                  (just email + name); fully synced contacts hide it. */}
              {onEnrich && (!contact.title || !contact.company) && (
                <div style={{
                  marginBottom: 22, padding: '12px 14px', borderRadius: 8,
                  background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: '-0.005em' }}>
                        🚀 Enrich from RocketReach
                      </div>
                      <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 2, lineHeight: 1.5 }}>
                        Paste a LinkedIn URL or email to pull fresh data. You'll see a per-field preview before anything saves.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={enrichInput}
                      onChange={e => setEnrichInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !enriching) { e.preventDefault(); runEnrich(); } }}
                      placeholder={contact.linkedin_url || contact.email || 'https://linkedin.com/in/… or name@company.com'}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: 6,
                        border: `1px solid ${T.faintRule}`, background: T.paper,
                        fontSize: 12, fontFamily: T.sans, color: T.ink, outline: 'none',
                      }}
                    />
                    <button onClick={runEnrich} disabled={enriching} style={{
                      padding: '8px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
                      background: T.ink, color: T.paper, border: 'none',
                      cursor: enriching ? 'wait' : 'pointer', opacity: enriching ? .6 : 1, whiteSpace: 'nowrap',
                    }}>{enriching ? 'Looking up…' : 'Lookup'}</button>
                  </div>
                  {enrichError && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.alert, lineHeight: 1.5 }}>
                      {enrichError}
                    </div>
                  )}
                  {!enrichError && !enrichInput && !contact.linkedin_url && contact.email && (
                    <div style={{ marginTop: 8, fontSize: 10, color: T.fadedInk, lineHeight: 1.5 }}>
                      Will look up by <b style={{ color: T.ink70 }}>{contact.email}</b>. Paste a LinkedIn URL above for a more accurate match.
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
                <EditableField label="First name" value={contact.first_name || ''} onChange={v => updateField('first_name', v)}/>
                <EditableField label="Last name" value={contact.last_name || ''} onChange={v => updateField('last_name', v)}/>
                <EditableField label="Email" value={contact.email || ''} onChange={v => updateField('email', v.toLowerCase().trim() || null)}/>
                <EditableField label="Phone" value={contact.phone || ''} onChange={v => updateField('phone', v || null)}/>
                <EditableField label="Title" value={contact.title || ''} onChange={v => updateField('title', v || null)}/>
                <EditableField label="Company" value={contact.company || ''} onChange={v => updateField('company', v || null)}/>
                <EditableField label="Location" value={contact.location || ''} onChange={v => updateField('location', v || null)}/>
                <ClickableUrlField label="LinkedIn URL" value={contact.linkedin_url || ''} onChange={v => updateField('linkedin_url', v || null)}/>
                <ClickableUrlField label="Company URL" value={contact.company_url || ''} onChange={v => updateField('company_url', v || null)}/>
              </div>

              {contact.bio && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase' }}>Background</div>
                    <span style={{ fontSize: 9, color: T.ink40 }}>· RocketReach-generated, read-only</span>
                  </div>
                  <div style={{
                    padding: '12px 14px', borderRadius: 8, background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
                    fontSize: 12, color: T.ink70, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    maxHeight: showBio ? 'none' : 100, overflow: 'hidden', position: 'relative',
                  }}>
                    {contact.bio}
                    {!showBio && contact.bio.length > 200 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to bottom, transparent, ' + T.inkSoft2 + ')' }}/>
                    )}
                  </div>
                  {contact.bio.length > 200 && (
                    <button onClick={() => setShowBio(!showBio)} style={{
                      marginTop: 6, padding: '4px 10px', fontSize: 10, fontWeight: 600,
                      background: 'transparent', border: 'none', color: T.ink, cursor: 'pointer', fontFamily: T.sans,
                    }}>{showBio ? 'Show less' : 'Show more'}</button>
                  )}
                </div>
              )}

              {contact.sources?.length > 0 && (
                <div style={{ marginTop: 24, fontSize: 11, color: T.fadedInk }}>
                  Source{contact.sources.length === 1 ? '' : 's'}: {contact.sources.join(' · ')}
                  {contact.last_contacted_at && <span> · Last contacted {new Date(contact.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                </div>
              )}

              <div style={{ marginTop: 36, paddingTop: 16, borderTop: `1px solid ${T.faintRule}` }}>
                <button onClick={onDeleteContact} disabled={deleting} style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
                  background: 'transparent', border: `1px solid ${T.alert}33`, color: T.alert,
                  cursor: 'pointer', opacity: deleting ? .5 : 1,
                }}>{deleting ? 'Deleting…' : 'Delete contact'}</button>
              </div>
            </>
          )}

          {tab === 'notes' && (
            <div>
              <div style={{ fontSize: 11, color: T.ink70, lineHeight: 1.5, marginBottom: 10 }}>
                Free-form. Anything Morgan won't overwrite — call recaps, follow-up plans, personal context. Markdown ok, plain text fine.
              </div>
              <textarea
                value={contact.notes || ''}
                onChange={e => onNotesChange(e.target.value)}
                placeholder="What should you remember about this person?"
                style={{
                  width: '100%', minHeight: 320, padding: 14, borderRadius: 8,
                  border: `1px solid ${T.faintRule}`, background: T.inkSoft2,
                  fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none', resize: 'vertical',
                }}
              />
              <div style={{ marginTop: 6, fontSize: 10, color: T.fadedInk, textAlign: 'right' }}>
                {notesSaveState === 'saving' ? 'Saving…'
                  : notesSaveState === 'saved' ? '✓ Saved'
                  : 'Autosaves as you type'}
              </div>
            </div>
          )}

          {tab === 'projects' && (
            <div>
              {linkedProjects.length === 0 ? (
                <div style={{ padding: '18px 16px', border: `1px dashed ${T.faintRule}`, borderRadius: 8, color: T.fadedInk, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                  Not linked to any projects yet. Add a link below if this contact is part of a project.
                </div>
              ) : (
                <div style={{ marginBottom: 18 }}>
                  {linkedProjects.map(lp => {
                    const pid = lp.projects?.id;
                    const clickable = !!(pid && onOpenProject);
                    return (
                      <div key={`${pid}-${lp.role}`} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', border: `1px solid ${T.faintRule}`, borderRadius: 8, marginBottom: 6,
                        background: T.paper,
                      }}>
                        <button
                          type="button"
                          onClick={() => clickable && onOpenProject(pid)}
                          disabled={!clickable}
                          style={{
                            flex: 1, minWidth: 0, textAlign: 'left',
                            background: 'transparent', border: 'none', padding: 0,
                            cursor: clickable ? 'pointer' : 'default', fontFamily: T.sans,
                          }}
                          title={clickable ? 'Open project' : ''}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {lp.projects?.name || '(deleted project)'}
                            {clickable && <span style={{ color: T.fadedInk, fontSize: 11 }}>→</span>}
                          </div>
                          <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2 }}>
                            {PROJECT_ROLES.find(r => r.id === lp.role)?.label || lp.role}
                            {lp.projects?.stage && <span> · {lp.projects.stage}</span>}
                          </div>
                        </button>
                        <button onClick={() => onRemoveProjectLink(pid, lp.role)} style={{
                          padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                          background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.fadedInk, cursor: 'pointer',
                          marginLeft: 10,
                        }}>Unlink</button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>Add link</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={linkProjectId} onChange={e => setLinkProjectId(e.target.value)} style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 12, fontFamily: T.sans,
                  border: `1px solid ${T.faintRule}`, background: T.paper, color: T.ink, cursor: 'pointer',
                }}>
                  <option value="">Select a project…</option>
                  {linkableProjects.map(p => <option key={p.id} value={p.id}>{p.name || '(unnamed)'}</option>)}
                </select>
                <select value={linkRole} onChange={e => setLinkRole(e.target.value)} style={{
                  padding: '8px 10px', borderRadius: 6, fontSize: 12, fontFamily: T.sans,
                  border: `1px solid ${T.faintRule}`, background: T.paper, color: T.ink, cursor: 'pointer',
                }}>
                  {PROJECT_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <button onClick={onAddProjectLink} disabled={!linkProjectId} style={{
                  padding: '8px 16px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
                  background: T.ink, color: T.paper, border: 'none', cursor: linkProjectId ? 'pointer' : 'default', opacity: linkProjectId ? 1 : .4,
                }}>Link</button>
              </div>
            </div>
          )}

          {tab === 'meetings' && (
            <div>
              {linkedMeetings.length === 0 ? (
                <div style={{ padding: '18px 16px', border: `1px dashed ${T.faintRule}`, borderRadius: 8, color: T.fadedInk, fontSize: 12, textAlign: 'center', lineHeight: 1.55 }}>
                  No meetings linked yet. Meetings auto-attach when a Fireflies attendee's email matches this contact's email ({contact.email || '—'}).
                </div>
              ) : (
                <div>
                  {linkedMeetings.map(m => {
                    const cls = effectiveClassification(m);
                    return (
                      <div key={m.id} style={{
                        padding: '12px 14px', border: `1px solid ${T.faintRule}`, borderRadius: 8, marginBottom: 6,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.title || 'Untitled meeting'}
                          </div>
                          <div style={{ fontSize: 11, color: T.fadedInk, whiteSpace: 'nowrap' }}>
                            {m.occurred_at ? new Date(m.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 4 }}>
                          {m.duration_minutes ? `${m.duration_minutes}m` : '—'} · {cls} · {m._match_type === 'manual' ? 'manually linked' : 'auto-matched by email'}
                        </div>
                        {m.summary && (
                          <div style={{ fontSize: 12, color: T.ink70, marginTop: 8, lineHeight: 1.55, maxHeight: 60, overflow: 'hidden' }}>
                            {m.summary.length > 200 ? m.summary.slice(0, 200) + '…' : m.summary}
                          </div>
                        )}
                        {m.external_url && (
                          <a href={m.external_url} target="_blank" rel="noopener" style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: T.ink, textDecoration: 'underline', textDecorationColor: T.faintRule }}>
                            Open in Fireflies ↗
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'gmail' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: T.ink70 }}>
                  Threads to/from <b>{contact.email}</b>.
                  Metadata only — body content isn't stored in Morgan.
                </div>
                <button onClick={() => fetchGmail(true)} disabled={gmailLoading} style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                  background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
                  cursor: gmailLoading ? 'wait' : 'pointer',
                }}>{gmailLoading ? 'Loading…' : '↻ Refresh'}</button>
              </div>

              {!accessToken && (
                <div style={{ padding: '14px 16px', borderRadius: 8, background: T.inkSoft2, border: `1px solid ${T.faintRule}`, fontSize: 12, color: T.ink70, lineHeight: 1.55 }}>
                  Sign in with Google to enable Gmail sync. The first sign-in after the latest deploy will ask for Gmail read access — that's what powers this tab.
                </div>
              )}

              {gmailError && (
                <div style={{ padding: '12px 14px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 11, lineHeight: 1.55 }}>
                  {gmailError}. Most common cause: Gmail read scope hasn't been granted yet — sign out + sign back in to re-authorize.
                </div>
              )}

              {gmailLoading && gmailThreads === null && (
                <div style={{ padding: 30, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>Loading threads…</div>
              )}

              {gmailThreads && gmailThreads.length === 0 && !gmailLoading && !gmailError && (
                <div style={{ padding: '18px 16px', border: `1px dashed ${T.faintRule}`, borderRadius: 8, color: T.fadedInk, fontSize: 12, textAlign: 'center' }}>
                  No threads found with this email.
                </div>
              )}

              {gmailThreads && gmailThreads.length > 0 && (
                <div>
                  {gmailThreads.map(t => (
                    <a key={t.id}
                      href={`https://mail.google.com/mail/u/0/#all/${t.threadId}`}
                      target="_blank" rel="noopener"
                      style={{
                        display: 'block', padding: '12px 14px', textDecoration: 'none',
                        border: `1px solid ${T.faintRule}`, borderRadius: 8, marginBottom: 6,
                        background: T.paper, color: T.ink, fontFamily: T.sans,
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 11, color: t.direction === 'in' ? T.ink70 : T.fadedInk, flexShrink: 0 }}>
                            {t.direction === 'in' ? '↙' : '↗'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.subject}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: T.fadedInk, whiteSpace: 'nowrap' }}>
                          {t.date ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                        </span>
                      </div>
                      {t.snippet && (
                        <div style={{ fontSize: 11, color: T.fadedInk, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.snippet}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>{/* end scroll area */}

        {/* Sticky save bar — appears only when there are pending edits
            OR briefly after a successful save (savedFlash). */}
        {(hasUnsavedChanges || savedFlash) && (
          <div style={{
            padding: '12px 20px', borderTop: `1px solid ${T.faintRule}`,
            background: hasUnsavedChanges ? T.inkSoft : T.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ fontSize: 12, color: T.ink70, display: 'flex', alignItems: 'center', gap: 8 }}>
              {hasUnsavedChanges ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.ink, display: 'inline-block' }}/>
                  <span><b style={{ color: T.ink, fontWeight: 700 }}>{Object.keys(dirty).length}</b> unsaved change{Object.keys(dirty).length === 1 ? '' : 's'}</span>
                </>
              ) : (
                <>
                  <span style={{ color: T.ink, fontWeight: 600 }}>✓ Saved</span>
                </>
              )}
            </div>
            {hasUnsavedChanges && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={discardChanges} disabled={saving} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
                  background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
                  cursor: saving ? 'wait' : 'pointer', opacity: saving ? .5 : 1,
                }}>Discard</button>
                <button onClick={saveAll} disabled={saving} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
                  background: T.ink, color: T.paper, border: 'none',
                  cursor: saving ? 'wait' : 'pointer', opacity: saving ? .5 : 1,
                }}>{saving ? 'Saving…' : '💾 Save changes'}</button>
              </div>
            )}
          </div>
        )}
      </div>
      {showScheduleModal && (
        <ScheduleMeetingModal
          contact={contact}
          accessToken={accessToken}
          userName={null /* drawer doesn't know user name; modal will fall back */}
          onClose={() => setShowScheduleModal(false)}
          onScheduled={() => {
            // Scheduling counts as a touchpoint — bump last_contacted_at
            // so the follow-up engine doesn't immediately flag them.
            const now = new Date().toISOString();
            updateImmediate({ last_contacted_at: now });
          }}
        />
      )}
      {showConceptMenu && (
        <ConceptMenuBuilder
          contact={contact}
          onClose={() => setShowConceptMenu(false)}
        />
      )}
      {showShareModal && (
        <ShareContactModal
          contact={contact}
          defaultFromName={userName}
          suggestions={allContacts}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}

function TagsEditor({ tags, onChange }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    // De-dupe case-insensitively
    const lower = v.toLowerCase();
    if (tags.some(t => t.toLowerCase() === lower)) { setDraft(''); return; }
    onChange([...tags, v]);
    setDraft('');
  };
  const remove = (t) => onChange(tags.filter(x => x !== t));
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 6 }}>
        Tags · free-form labels
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {tags.map(t => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600,
            background: T.inkSoft, color: T.ink, border: `1px solid ${T.faintRule}`,
          }}>
            {t}
            <button onClick={() => remove(t)} title="Remove" style={{
              background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer',
              padding: 0, fontSize: 12, lineHeight: 1,
            }}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onBlur={() => { if (draft.trim()) add(); }}
          placeholder={tags.length ? 'Add another…' : '+ Add a tag (Cannes 2024, Q4, etc.)'}
          style={{
            flex: '0 0 auto', minWidth: 160,
            padding: '4px 10px', borderRadius: 999, fontSize: 11,
            border: `1px dashed ${T.faintRule}`, background: 'transparent',
            color: T.ink, outline: 'none', fontFamily: T.sans,
          }}
        />
      </div>
    </div>
  );
}

function EditableField({ label, value, onChange, fullWidth }) {
  return (
    <div style={fullWidth ? { gridColumn: 'span 2' } : {}}>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 6,
          border: `1px solid ${T.faintRule}`, background: T.paper,
          fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none',
          transition: 'border-color .15s',
        }}
        onFocus={e => e.target.style.borderColor = T.ink}
        onBlur={e => e.target.style.borderColor = T.faintRule}
      />
    </div>
  );
}

// URL field that defaults to a clickable link with a ✎ to enter edit
// mode. Empty value opens directly into edit mode so the field is still
// fillable on a brand-new contact. Editing flows into the same dirty/
// Save bar as the other Overview fields — no separate save logic.
function ClickableUrlField({ label, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const v = (value || '').trim();
  if (editing || !v) {
    return (
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
        <input
          autoFocus={editing}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={e => { e.target.style.borderColor = T.faintRule; if (e.target.value.trim()) setEditing(false); }}
          onFocus={e => e.target.style.borderColor = T.ink}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 6,
            border: `1px solid ${T.faintRule}`, background: T.paper,
            fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none',
            transition: 'border-color .15s',
          }}
        />
      </div>
    );
  }
  const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const display = v.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 10px', borderRadius: 6,
        border: `1px solid ${T.faintRule}`, background: T.paper,
        minHeight: 35, // match input height
      }}>
        <a
          href={href}
          target="_blank"
          rel="noopener"
          title={href}
          style={{
            flex: 1, minWidth: 0,
            fontSize: 13, fontFamily: T.sans, color: T.ink,
            textDecoration: 'underline', textDecorationColor: T.faintRule,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >{display} ↗</a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit"
          style={{
            background: 'transparent', border: 'none', color: T.fadedInk,
            cursor: 'pointer', fontSize: 12, padding: 2, lineHeight: 1, flexShrink: 0,
          }}
        >✎</button>
      </div>
    </div>
  );
}

export default ContactDetailDrawer;
