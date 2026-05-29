import { useState, useEffect, useMemo } from 'react';
import T from '../../theme/tokens.js';
import { listContacts, listContactsForProject, linkContactToProject, unlinkContactFromProject } from '../../lib/contacts.js';
import { normalizeCompany } from '../../utils/companyDedup.js';
import { restFetch } from '../../lib/db.js';

// "Select who from <company> is on this project."
// Same client (e.g. LaForce) can have different teams per project,
// so the link lives on the per-project junction (contact_projects)
// rather than the global contact.
const ROLE_OPTIONS = [
  { id: '',                 label: 'Not on this project' },
  { id: 'point_of_contact', label: 'Point of contact' },
  { id: 'champion',         label: 'Champion' },
  { id: 'rfp_sender',       label: 'RFP sender' },
  { id: 'team_member',      label: 'Team member' },
];

export default function ProjectTeamPicker({ project, userId, onClose, onSaved }) {
  const [companyContacts, setCompanyContacts] = useState([]);
  const [linkedRows, setLinkedRows] = useState([]); // [{ id, role, contacts: { id, ... } }]
  const [draft, setDraft] = useState({}); // { [contactId]: role || '' }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const targetNorm = normalizeCompany(project?.client || '');
      try {
        const linked = await listContactsForProject(project.id);
        const linkedFiltered = (linked || []).filter((r) => r.contacts);
        const linkedIds = new Set(linkedFiltered.map((r) => r.contacts.id));
        // All contacts where company matches the project's client.
        // Use search to keep the initial fetch tight, then filter
        // client-side via normalizeCompany so casing/suffix variants
        // ("LaForce" vs "LaForce, LLC") still match.
        let companyHits = [];
        if (targetNorm) {
          const rows = await listContacts({ search: project.client, limit: 500 });
          companyHits = (rows || []).filter((c) => normalizeCompany(c.company || '') === targetNorm);
        }
        // Merge: company contacts + already-linked (in case any
        // linked contact's company changed and no longer matches).
        const byId = new Map();
        companyHits.forEach((c) => byId.set(c.id, c));
        linkedFiltered.forEach((r) => byId.set(r.contacts.id, r.contacts));
        const all = Array.from(byId.values()).sort((a, b) => {
          const an = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
          const bn = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
          return an.localeCompare(bn);
        });
        // Build initial draft from current links.
        const initial = {};
        linkedFiltered.forEach((r) => {
          if (r.contacts?.id) initial[r.contacts.id] = r.role || 'team_member';
        });
        if (!cancelled) {
          setCompanyContacts(all);
          setLinkedRows(linkedFiltered);
          setDraft(initial);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id, project?.client]);

  const currentRoleByContact = useMemo(() => {
    const m = {};
    linkedRows.forEach((r) => { if (r.contacts?.id) m[r.contacts.id] = { id: r.id, role: r.role || 'team_member' }; });
    return m;
  }, [linkedRows]);

  const onSave = async () => {
    setSaving(true); setError('');
    try {
      for (const contact of companyContacts) {
        const desired = draft[contact.id] || ''; // '' means not on project
        const current = currentRoleByContact[contact.id];
        if (desired && !current) {
          // Add new link
          await linkContactToProject(userId, contact.id, project.id, desired);
        } else if (!desired && current) {
          // Remove link
          await unlinkContactFromProject(contact.id, project.id);
        } else if (desired && current && desired !== current.role) {
          // Update role — contact_projects has unique (contact_id, project_id, role),
          // so we delete the old row and insert the new one.
          await unlinkContactFromProject(contact.id, project.id);
          await linkContactToProject(userId, contact.id, project.id, desired);
        }
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(94vw, 720px)', maxHeight: '88vh', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.cream }}>Project team</div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{project?.client || 'Client'} — pick who's on this project</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: T.dim, fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          {loading ? (
            <div style={{ padding: 24, fontSize: 12, color: T.dim }}>Loading…</div>
          ) : companyContacts.length === 0 ? (
            <div style={{ padding: 24, fontSize: 12, color: T.dim, lineHeight: 1.55 }}>
              No CRM contacts found at <strong>{project?.client}</strong>. Add them in the CRM first (or check the company spelling on existing contacts).
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {companyContacts.map((c) => {
                const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '(no name)';
                const role = draft[c.id] || '';
                return (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: T.rS, background: role ? T.inkSoft : 'transparent' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.cream }}>{name}</div>
                      <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                        {[c.title, c.email].filter(Boolean).join(' · ') || c.company || ''}
                      </div>
                    </div>
                    <select value={role} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))} style={{ padding: '7px 10px', borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none', cursor: 'pointer' }}>
                      {ROLE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <div style={{ padding: '8px 24px', fontSize: 11, color: '#c53030' }}>{error}</div>}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: T.dim }}>
            {Object.values(draft).filter(Boolean).length} on team
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '9px 16px', background: 'transparent', color: T.cream, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, letterSpacing: '.06em', textTransform: 'uppercase' }}>Cancel</button>
            <button onClick={onSave} disabled={loading || saving} style={{ padding: '9px 18px', background: T.ink, color: T.paper, border: 'none', borderRadius: T.rS, fontSize: 11, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1, fontFamily: T.sans, letterSpacing: '.06em', textTransform: 'uppercase' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
