import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import T from '../theme/tokens.js';
import {
  updateContact, deleteContact,
  linkContactToProject, unlinkContactFromProject, listProjectsForContact,
} from '../lib/contacts.js';
import { listMeetingsForContact, effectiveClassification } from '../lib/meetings.js';

const STATUS_OPTIONS = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'active',   label: 'Active' },
  { id: 'past',     label: 'Past' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'press',    label: 'Press' },
];

const TYPE_OPTIONS = [
  { id: 'brand',    label: 'Brand', icon: '◆' },
  { id: 'agency',   label: 'Agency', icon: '◇' },
  { id: 'vendor',   label: 'Vendor', icon: '▣' },
  { id: 'agent',    label: 'Agent', icon: '◍' },
  { id: 'press',    label: 'Press', icon: '✎' },
  { id: 'internal', label: 'Internal', icon: '●' },
];

const PROJECT_ROLES = [
  { id: 'rfp_sender',       label: 'RFP sender' },
  { id: 'champion',         label: 'Champion' },
  { id: 'point_of_contact', label: 'Point of contact' },
  { id: 'team_member',      label: 'Team member' },
];

function ContactDetailDrawer({ contact: initialContact, projects = [], userId, onClose, onUpdate, onDelete }) {
  const [contact, setContact] = useState(initialContact);
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [linkedMeetings, setLinkedMeetings] = useState([]);
  const [tab, setTab] = useState('overview');
  const [showBio, setShowBio] = useState(false);
  const [linkProjectId, setLinkProjectId] = useState('');
  const [linkRole, setLinkRole] = useState('point_of_contact');
  const [deleting, setDeleting] = useState(false);
  const saveTimers = useRef(new Map());

  // Reset state when a different contact is opened
  useEffect(() => { setContact(initialContact); }, [initialContact?.id]);

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
  }, [contact?.id]);

  const linkableProjects = useMemo(() => {
    const linkedIds = new Set(linkedProjects.map(lp => lp.projects?.id).filter(Boolean));
    return (projects || []).filter(p => !linkedIds.has(p.id));
  }, [projects, linkedProjects]);

  // Debounced field save — 500ms after last keystroke
  const updateField = useCallback((field, value) => {
    setContact(c => ({ ...c, [field]: value }));
    const existing = saveTimers.current.get(field);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      saveTimers.current.delete(field);
      try {
        await updateContact(contact.id, { [field]: value });
        onUpdate?.({ ...contact, [field]: value });
      } catch (e) {
        console.error('[contact-drawer] save failed:', e.message || e);
      }
    }, 500);
    saveTimers.current.set(field, t);
  }, [contact, onUpdate]);

  // Immediate save for instant fields (status pills, link/unlink, etc.)
  const updateImmediate = useCallback(async (patch) => {
    setContact(c => ({ ...c, ...patch }));
    try {
      await updateContact(contact.id, patch);
      onUpdate?.({ ...contact, ...patch });
    } catch (e) {
      console.error('[contact-drawer] update failed:', e.message || e);
    }
  }, [contact, onUpdate]);

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

  // Flush any pending debounced saves on close
  useEffect(() => () => {
    saveTimers.current.forEach(t => clearTimeout(t));
    saveTimers.current.clear();
  }, []);

  if (!contact) return null;

  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '(No name)';
  const initials = ((contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')).toUpperCase();
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => { setAvatarError(false); }, [contact?.avatar_url]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 760, maxWidth: '95vw', height: '100vh', overflow: 'auto',
        background: T.paper, borderLeft: `1px solid ${T.faintRule}`,
        boxShadow: '-16px 0 48px rgba(15,82,186,.12)', fontFamily: T.sans,
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 18px', borderBottom: `1px solid ${T.faintRule}`, position: 'sticky', top: 0, background: T.paper, zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
              <button
                onClick={() => {
                  const next = prompt('Photo URL — paste a LinkedIn profile photo URL or any image link (empty to clear):', contact.avatar_url || '');
                  if (next === null) return;
                  const v = next.trim();
                  updateImmediate({ avatar_url: v || null });
                }}
                title="Click to change photo"
                style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
              >
                {contact.avatar_url && !avatarError ? (
                  <img
                    src={contact.avatar_url}
                    alt=""
                    onError={() => setAvatarError(true)}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${T.faintRule}`, display: 'block' }}
                  />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', background: T.inkSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: T.ink, border: `1px solid ${T.faintRule}`,
                  }}>{initials || '?'}</div>
                )}
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: '-0.012em', wordBreak: 'break-word' }}>
                  {fullName}
                </h2>
                <div style={{ fontSize: 12, color: T.fadedInk, marginTop: 4 }}>
                  {contact.title && <span>{contact.title}</span>}
                  {contact.title && contact.company && <span> · </span>}
                  {contact.company && <span>{contact.company}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: 'pointer', width: 28, height: 28 }}>×</button>
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
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0 28px', borderBottom: `1px solid ${T.faintRule}`, position: 'sticky', top: 152, background: T.paper, zIndex: 1 }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'notes', label: 'Notes' },
            { id: 'projects', label: `Projects · ${linkedProjects.length}` },
            { id: 'meetings', label: `Meetings · ${linkedMeetings.length}` },
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
                <EditableField label="First name" value={contact.first_name || ''} onChange={v => updateField('first_name', v)}/>
                <EditableField label="Last name" value={contact.last_name || ''} onChange={v => updateField('last_name', v)}/>
                <EditableField label="Email" value={contact.email || ''} onChange={v => updateField('email', v.toLowerCase().trim() || null)}/>
                <EditableField label="Phone" value={contact.phone || ''} onChange={v => updateField('phone', v || null)}/>
                <EditableField label="Title" value={contact.title || ''} onChange={v => updateField('title', v || null)}/>
                <EditableField label="Company" value={contact.company || ''} onChange={v => updateField('company', v || null)}/>
                <EditableField label="Location" value={contact.location || ''} onChange={v => updateField('location', v || null)}/>
                <EditableField label="LinkedIn URL" value={contact.linkedin_url || ''} onChange={v => updateField('linkedin_url', v || null)}/>
                <EditableField label="Company URL" value={contact.company_url || ''} onChange={v => updateField('company_url', v || null)}/>
                <EditableField label="Photo URL" value={contact.avatar_url || ''} onChange={v => updateField('avatar_url', v || null)}/>
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
                onChange={e => updateField('notes', e.target.value)}
                placeholder="What should you remember about this person?"
                style={{
                  width: '100%', minHeight: 320, padding: 14, borderRadius: 8,
                  border: `1px solid ${T.faintRule}`, background: T.inkSoft2,
                  fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none', resize: 'vertical',
                }}
              />
              <div style={{ marginTop: 6, fontSize: 10, color: T.fadedInk, textAlign: 'right' }}>Autosaves as you type.</div>
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
                  {linkedProjects.map(lp => (
                    <div key={`${lp.projects?.id}-${lp.role}`} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 14px', border: `1px solid ${T.faintRule}`, borderRadius: 8, marginBottom: 6,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{lp.projects?.name || '(deleted project)'}</div>
                        <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2 }}>
                          {PROJECT_ROLES.find(r => r.id === lp.role)?.label || lp.role}
                          {lp.projects?.stage && <span> · {lp.projects.stage}</span>}
                        </div>
                      </div>
                      <button onClick={() => onRemoveProjectLink(lp.projects?.id, lp.role)} style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                        background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.fadedInk, cursor: 'pointer',
                      }}>Unlink</button>
                    </div>
                  ))}
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
        </div>
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

export default ContactDetailDrawer;
