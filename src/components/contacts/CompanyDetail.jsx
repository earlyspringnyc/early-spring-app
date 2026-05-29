import { useState, useEffect, useRef, useCallback } from 'react';
import T from '../../theme/tokens.js';
import { getCompanyByName, upsertCompany } from '../../lib/companies.js';
import { listProjectsForContacts } from '../../lib/contacts.js';
import { CompanyLogo } from './primitives.jsx';
import ContactRow from './ContactRow.jsx';

function CompanyMetaInput({ label, value, placeholder, onChange, onBlur, multiline }) {
  const inputStyle = {
    width: '100%', padding: '6px 8px', borderRadius: 6,
    border: `1px solid ${T.faintRule}`, background: T.paper,
    fontSize: 12, fontFamily: T.sans, color: T.ink, outline: 'none',
  };
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} style={{ ...inputStyle, minHeight: 50, resize: 'vertical', lineHeight: 1.5 }}/>
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} style={inputStyle}/>
      )}
    </div>
  );
}

function CompanyDetail({ cluster, onClose, onRefreshContact, refreshingId, onDeleteCompany, deletingCompany, onOpenContact, pinned, onTogglePin, onOpenProject, onScheduleMeeting, canSchedule, userId }) {
  // Company-level metadata stored in the companies table. Edits
  // propagate to the contract editor + any other surface that
  // reads getCompanyByName(project.client). Autosave on blur.
  const [companyMeta, setCompanyMeta] = useState(null);
  const [companyDirty, setCompanyDirty] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companySaveError, setCompanySaveError] = useState(null);
  const [companyLastSavedAt, setCompanyLastSavedAt] = useState(null);
  const companySaveTimer = useRef(null);
  useEffect(() => {
    if (!cluster?.canonical) return;
    let cancelled = false;
    getCompanyByName(cluster.canonical)
      .then(row => { if (!cancelled) setCompanyMeta(row || { name_canonical: cluster.canonical, address: '', website: '', legal_name: '', billing_email: '' }); })
      .catch(() => { if (!cancelled) setCompanyMeta({ name_canonical: cluster.canonical, address: '', website: '', legal_name: '', billing_email: '' }); });
    return () => { cancelled = true; };
  }, [cluster?.canonical]);
  const saveCompanyMeta = useCallback(async () => {
    if (!userId || !cluster?.canonical || !companyMeta) return;
    setCompanySaving(true);
    setCompanySaveError(null);
    try {
      const saved = await upsertCompany(userId, cluster.canonical, {
        legal_name: companyMeta.legal_name || null,
        address: companyMeta.address || null,
        website: companyMeta.website || null,
        billing_email: companyMeta.billing_email || null,
      });
      if (saved) setCompanyMeta(saved);
      setCompanyDirty(false);
      setCompanyLastSavedAt(Date.now());
    } catch (e) {
      console.error('[company-detail] save failed:', e.message || e);
      setCompanySaveError(e.message || 'Save failed');
    } finally {
      setCompanySaving(false);
    }
  }, [userId, cluster?.canonical, companyMeta]);
  // Debounced auto-save 800ms after edit.
  useEffect(() => {
    if (!companyDirty) return;
    clearTimeout(companySaveTimer.current);
    companySaveTimer.current = setTimeout(() => { saveCompanyMeta(); }, 800);
    return () => clearTimeout(companySaveTimer.current);
  }, [companyDirty, saveCompanyMeta]);
  const setMetaField = (key, value) => {
    setCompanyMeta(m => ({ ...(m || {}), [key]: value }));
    setCompanyDirty(true);
  };

  // Company-data lookup via Claude with web search. Returns up to 3
  // candidates so the user can pick — names like "LaForce" are
  // ambiguous (PR agency vs. hardware vs. architects). User picks,
  // we fill-only merge into blank fields.
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState(null);
  const [enrichSources, setEnrichSources] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const handleLookup = async () => {
    if (!cluster?.canonical) return;
    setEnriching(true);
    setEnrichError(null);
    setCandidates([]);
    try {
      const { getSession } = await import('../../lib/db.js');
      const session = await getSession();
      const res = await fetch('/api/company-enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ company_name: cluster.canonical }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Lookup failed: ${res.status}`);
      const list = Array.isArray(data.candidates) ? data.candidates : [];
      if (!list.length) {
        setEnrichError('No candidates found. Try refining the company name.');
      } else {
        setCandidates(list);
      }
      setEnrichSources(data.sources || []);
    } catch (e) {
      setEnrichError(e.message || 'Lookup failed');
    } finally { setEnriching(false); }
  };
  // User explicitly chose this candidate, so overwrite whatever was
  // there — including stale data from a previous wrong-match lookup.
  // Only overwrite fields the candidate actually has; leave others
  // (like billing_email) alone since the candidate doesn't speak to them.
  const pickCandidate = (c) => {
    setCompanyMeta(m => {
      const next = { ...(m || {}) };
      if (c.legal_name) next.legal_name = c.legal_name;
      if (c.address)    next.address = c.address;
      if (c.website)    next.website = c.website;
      return next;
    });
    setCompanyDirty(true);
    setCandidates([]);
  };
  // Aggregate linked projects across all contacts in this cluster.
  // Single batched query (contact_id=in.(...)); deduped by project id
  // so a project linked by multiple contacts shows once, and bucketed
  // by contact_id for the per-row "N awarded" badges.
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [projectsByContact, setProjectsByContact] = useState({});
  useEffect(() => {
    if (!cluster?.contacts?.length) { setLinkedProjects([]); setProjectsByContact({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const ids = cluster.contacts.map(c => c.id);
        const rows = await listProjectsForContacts(ids);
        const perContact = Object.fromEntries(ids.map(id => [id, []]));
        const seen = new Set();
        const out = [];
        for (const lp of rows) {
          if (lp.contact_id && perContact[lp.contact_id]) perContact[lp.contact_id].push(lp);
          const pid = lp?.projects?.id;
          if (!pid || seen.has(pid)) continue;
          seen.add(pid);
          out.push(lp);
        }
        if (!cancelled) {
          setLinkedProjects(out);
          setProjectsByContact(perContact);
        }
      } catch (e) {
        console.error('[company-detail] projects fetch failed:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [cluster?.id]);

  return (
    <div data-company-detail style={{
      // No marginTop — this card is now rendered inline inside the
      // company grid (full-width row), so the grid's gap handles the
      // spacing between the clicked card and this detail.
      border: `1px solid ${T.faintRule}`, borderRadius: 10, overflow: 'hidden', background: T.paper,
    }}>
      <div style={{
        padding: '16px 22px', background: T.inkSoft2, borderBottom: `1px solid ${T.faintRule}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <CompanyLogo cluster={cluster} size={44}/>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: '-.008em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cluster.canonical || <i style={{ opacity: .55, fontWeight: 400 }}>No company</i>}
            </div>
            <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 3 }}>
              {cluster.count} contact{cluster.count === 1 ? '' : 's'}
              {cluster.aliases.length > 0 ? ' · includes ' + cluster.aliases.join(', ') : ''}
              {cluster.emailDomain ? ' · @' + cluster.emailDomain : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {onTogglePin && (
            <button onClick={onTogglePin} title={pinned ? 'Unpin from top' : 'Pin to top'} style={{
              background: pinned ? T.ink : 'transparent', border: `1px solid ${pinned ? T.ink : T.faintRule}`, borderRadius: 999,
              padding: '6px 12px', fontSize: 11, fontWeight: 600,
              color: pinned ? T.paper : T.ink70, cursor: 'pointer', fontFamily: T.sans,
            }}>{pinned ? '📌 Pinned' : '📌 Pin to top'}</button>
          )}
          {onDeleteCompany && (
            <button onClick={onDeleteCompany} disabled={deletingCompany} title={`Delete all ${cluster.count} contact${cluster.count === 1 ? '' : 's'} in this company`} style={{
              background: 'transparent', border: `1px solid ${T.alert}33`, borderRadius: 999,
              padding: '6px 12px', fontSize: 11, fontWeight: 600, color: T.alert, cursor: deletingCompany ? 'wait' : 'pointer',
              fontFamily: T.sans, opacity: deletingCompany ? .5 : 1,
            }}>{deletingCompany ? 'Deleting…' : 'Delete company'}</button>
          )}
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${T.faintRule}`, borderRadius: 999,
            padding: '6px 12px', fontSize: 11, fontWeight: 600, color: T.ink70, cursor: 'pointer', fontFamily: T.sans,
          }}>Close</button>
        </div>
      </div>
      {/* Company-level fields. Edits autopopulate the contract
          editor's Client legal address / Billing fields for any
          project where project.client matches this company. */}
      <div style={{
        padding: '14px 22px', borderBottom: `1px solid ${T.faintRule}`,
        background: T.inkSoft3,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.16em', textTransform: 'uppercase',
          }}>
            Company details
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleLookup}
              disabled={enriching}
              title="Use Claude with web search to find this company's legal name, address, and website. Fills blanks only."
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                background: T.ink, color: T.paper, border: 'none',
                cursor: enriching ? 'wait' : 'pointer', opacity: enriching ? .6 : 1,
                textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: T.sans,
              }}
            >{enriching ? 'Looking up…' : '🪄 Look up online'}</button>
            <button
              type="button"
              onClick={() => {
                // Force a save — cancel any pending debounced run first
                // so the click writes the latest state rather than
                // racing with a 800ms-later autosave.
                clearTimeout(companySaveTimer.current);
                saveCompanyMeta();
              }}
              disabled={companySaving}
              title="Save company details now"
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                background: T.ink, color: T.paper, border: 'none',
                cursor: companySaving ? 'wait' : 'pointer',
                opacity: companySaving ? .6 : 1,
                textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: T.sans,
              }}
            >{companySaving ? 'Saving…' : '💾 Save now'}</button>
            <span style={{ fontSize: 10, color: companySaveError ? T.alert : T.fadedInk, fontStyle: 'italic' }}>
              {companySaveError
                ? companySaveError
                : companyDirty
                  ? 'Unsaved changes'
                  : companyLastSavedAt
                    ? `Saved ${new Date(companyLastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : 'Auto-fills into contracts'}
            </span>
          </div>
        </div>
        {enrichError && (
          <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: T.alertSoft, color: T.alert, fontSize: 11, lineHeight: 1.45 }}>
            {enrichError}
          </div>
        )}
        {enrichSources.length > 0 && (
          <div style={{ marginBottom: 8, fontSize: 10, color: T.fadedInk }}>
            Sources: {enrichSources.slice(0, 3).map((s, i) => (
              <span key={s.url}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noopener" style={{ color: T.ink70 }}>{s.title || new URL(s.url).hostname}</a>
              </span>
            ))}
          </div>
        )}
        {candidates.length > 0 && (
          <div style={{
            marginBottom: 10, padding: 10, background: T.paper,
            border: `1px solid ${T.faintRule}`, borderRadius: 8,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.16em',
              textTransform: 'uppercase', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>Pick the right one · {candidates.length} match{candidates.length === 1 ? '' : 'es'}</span>
              <button
                type="button"
                onClick={() => setCandidates([])}
                style={{
                  background: 'transparent', border: 'none', color: T.fadedInk,
                  fontSize: 10, cursor: 'pointer', padding: 0, letterSpacing: '.08em',
                }}
              >Dismiss</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {candidates.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickCandidate(c)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 6,
                    border: `1px solid ${T.faintRule}`, background: T.paper,
                    cursor: 'pointer', fontFamily: T.sans, color: T.ink,
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.inkSoft3; e.currentTarget.style.borderColor = T.ink; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.paper; e.currentTarget.style.borderColor = T.faintRule; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{c.legal_name || cluster.canonical}</div>
                  {c.description && (
                    <div style={{ fontSize: 11, color: T.ink70 }}>{c.description}</div>
                  )}
                  <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {c.website && <span>{c.website}</span>}
                    {c.address && <span>· {c.address}</span>}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 8, fontStyle: 'italic' }}>
              Picking overwrites legal name, address, and website. Edit any of them after.
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
          <CompanyMetaInput label="Legal entity name" value={companyMeta?.legal_name || ''} placeholder={cluster.canonical + ', Inc.'} onChange={v => setMetaField('legal_name', v)} onBlur={saveCompanyMeta}/>
          <CompanyMetaInput label="Website" value={companyMeta?.website || ''} placeholder="example.com" onChange={v => setMetaField('website', v)} onBlur={saveCompanyMeta}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <CompanyMetaInput label="Legal address" value={companyMeta?.address || ''} placeholder="1010 Frontier Way, Nashville TN 37203" multiline onChange={v => setMetaField('address', v)} onBlur={saveCompanyMeta}/>
          <CompanyMetaInput label="Billing email (AP)" value={companyMeta?.billing_email || ''} placeholder="ap@example.com" onChange={v => setMetaField('billing_email', v)} onBlur={saveCompanyMeta}/>
        </div>
      </div>

      {linkedProjects.length > 0 && (
        <div style={{
          padding: '14px 22px', borderBottom: `1px solid ${T.faintRule}`,
          background: T.inkSoft3,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.16em',
            textTransform: 'uppercase', marginBottom: 8,
          }}>
            Linked projects · {linkedProjects.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {linkedProjects.map(lp => {
              const pid = lp.projects?.id;
              const clickable = !!(pid && onOpenProject);
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => clickable && onOpenProject(pid)}
                  disabled={!clickable}
                  title={clickable ? 'Open project' : ''}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
                    background: T.paper, color: T.ink, border: `1px solid ${T.faintRule}`,
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                  onMouseEnter={e => { if (clickable) e.currentTarget.style.borderColor = T.ink; }}
                  onMouseLeave={e => { if (clickable) e.currentTarget.style.borderColor = T.faintRule; }}
                >
                  {lp.projects?.name || '(deleted)'}
                  {clickable && <span style={{ color: T.fadedInk, fontSize: 10 }}>→</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div>
        {cluster.contacts.map(c => {
          const projs = projectsByContact[c.id] || [];
          // "Awarded" in Morgan = both `awarded` and `current` per
          // STAGE_LABELS. Count those for the badge.
          const awarded = projs.filter(lp => lp.projects?.stage === 'awarded' || lp.projects?.stage === 'current').length;
          const pitching = projs.filter(lp => lp.projects?.stage === 'pitching').length;
          return (
            <ContactRow
              key={c.id} c={c}
              awardedCount={awarded}
              pitchingCount={pitching}
              onClick={() => onOpenContact?.(c.id)}
              onRefresh={onRefreshContact}
              refreshing={refreshingId === c.id}
              onSchedule={onScheduleMeeting}
              canSchedule={canSchedule}
            />
          );
        })}
      </div>
    </div>
  );
}

export default CompanyDetail;
