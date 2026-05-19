import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { VARIABLES, VARIABLES_BY_SECTION, SECTIONS, DERIVED, renderContract } from '../data/contractTemplate.js';
import { calcProject } from '../utils/calc.js';
import { getContractForProject, createContract, updateContract, sendContract, revokeContract } from '../lib/contracts.js';
import { listContactsForProject, listContacts } from '../lib/contacts.js';
import { getCompanyByName } from '../lib/companies.js';
import { uploadContractFile, signedUrlForContract, deleteContractFile } from '../lib/contractUpload.js';
import { renderContractMarkdown } from '../utils/markdownLite.js';
import { normalizeCompany } from '../utils/companyDedup.js';

// Contract editor — left pane is the variable form, right pane is
// a live preview of the rendered SOW + Exhibit A. Saves draft to
// the contracts table autosaved (debounced). "Generate share link"
// rotates a token and surfaces the public URL for sending.

const SAVE_DEBOUNCE_MS = 700;

// Compact "X ago" string for the Last saved indicator.
function relativeTime(date) {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5)  return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATUS_LABEL = {
  draft:   { label: 'Draft',   color: 'fadedInk' },
  sent:    { label: 'Sent',    color: 'ink' },
  viewed:  { label: 'Viewed',  color: 'ink' },
  signed:  { label: 'Signed',  color: 'ink' },
  revoked: { label: 'Revoked', color: 'alert' },
};

function ContractEditor({ project, user }) {
  const userId = user?.user_id || user?.id;

  // Prefill seed when a contract doesn't exist yet for the project.
  // Total fee pre-fills from the project's CURRENT calculated total
  // (sum of cats + agency + fee) so the contract reflects what's
  // actually being charged, not the original target budget.
  const seedFields = useMemo(() => {
    const now = new Date();
    const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    let projectTotal = 0;
    try {
      if (project?.cats) projectTotal = Math.round(calcProject(project)?.grandTotal || 0);
    } catch (e) { /* fall back to clientBudget */ }
    return {
      effective_date: monthYear,
      client_legal_name: project?.client || '',
      project_name: project?.name || '',
      event_date: project?.eventDate || '',
      total_fee: projectTotal || project?.clientBudget || '',
      deposit_pct: 70,
      deposit_date: 'Upon Signature of SOW Document',
      final_pct: 30,
      final_due_date: '',
      incidentals_date: '',
      revision_rounds: 2,
      payment_terms_days: 30,
      phase_1_deliverables: '- Creative concepting\n- Design presentations\n- 2 rounds of client feedback\n- Final asset production (signage, collateral)\n- Installation planning',
      phase_1_client_resp: '- Personnel requirements (Brand Ambassadors)\n- Product + brand assets\n- Final approvals within agreed review windows',
      phase_1_timing: 'TBD',
      phase_2_deliverables: '- On-site execution + management\n- Build oversight\n- Setup, breakdown, security\n- Brand Ambassador support',
      phase_2_timing: 'TBD',
    };
  }, [project?.id, project?.cats, project?.ag, project?.feeP]);

  const [contract, setContract] = useState(null);
  const [fields, setFields] = useState(seedFields);
  // List of variable IDs the client can edit on the public signing
  // page. Stored as `client_fillable_fields` (jsonb array) on the
  // contracts row. Useful default for new contracts: address +
  // billing email — the things a client typically wants to update.
  const [clientFillable, setClientFillable] = useState(() =>
    VARIABLES.filter(v => v.clientEligible).map(v => v.id)
  );
  const [saveStatus, setSaveStatus] = useState('idle');
  // Timestamp of the last successful save, used by the "Last saved
  // Xm ago" indicator and the Save-now button's feedback.
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  // Save effect gates on `dirty` — flipped true ONLY by a user
  // edit. Reset to false on project switch and after load, so the
  // initial state-population from another project can never
  // accidentally autosave onto the new project's contract row.
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef(null);

  // Wizard step index. Persists per-project in localStorage so a
  // page refresh keeps you on the same step. Cap at SECTIONS.length-1.
  const stepStorageKey = project?.id ? `es_contract_step_${project.id}` : null;
  const [stepIndex, setStepIndexRaw] = useState(() => {
    if (!stepStorageKey) return 0;
    const stored = Number(localStorage.getItem(stepStorageKey));
    return Number.isFinite(stored) && stored >= 0 && stored < SECTIONS.length ? stored : 0;
  });
  const setStepIndex = useCallback((next) => {
    setStepIndexRaw(prev => {
      const clamped = Math.max(0, Math.min(SECTIONS.length - 1, typeof next === 'function' ? next(prev) : next));
      if (stepStorageKey) {
        try { localStorage.setItem(stepStorageKey, String(clamped)); } catch (e) {}
      }
      return clamped;
    });
  }, [stepStorageKey]);
  const currentSection = SECTIONS[stepIndex];
  const isReviewStep = currentSection?.id === 'review';

  // Pool of contacts available for autofill, drawn from this
  // project. Two sources merged, same as the project dashboard's
  // hardwire logic: explicit contact_projects links + any CRM
  // contact whose company matches project.client. Auto-fill picks
  // the highest-priority match (champion → POC → first); user can
  // also pick a specific contact via the suggestions dropdown.
  const [contactPool, setContactPool] = useState([]);
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const targetNorm = normalizeCompany(project.client || '');
        let byCompany = [];
        if (targetNorm) {
          const rows = await listContacts({ search: project.client, limit: 200 });
          byCompany = (rows || []).filter(c => normalizeCompany(c.company || '') === targetNorm);
        }
        const explicit = await listContactsForProject(project.id) || [];
        const pool = [];
        const seen = new Set();
        for (const lp of explicit) {
          const c = lp.contacts;
          if (c && !seen.has(c.id)) { seen.add(c.id); pool.push({ ...c, _role: lp.role }); }
        }
        for (const c of byCompany) {
          if (!seen.has(c.id)) { seen.add(c.id); pool.push({ ...c, _role: 'client_team' }); }
        }
        if (!cancelled) setContactPool(pool);
      } catch (e) {
        console.warn('[contract-editor] contact pool load failed:', e.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id, project?.client]);

  // Pull company metadata (legal address, legal name, billing email)
  // from the companies table. Used as the source-of-truth for the
  // client_legal_address / client_legal_name / client_billing_email
  // contract fields — so updating once in the company panel
  // propagates to every future contract automatically.
  const [companyMeta, setCompanyMeta] = useState(null);

  // Upload state for the "attach existing contract file" path.
  // The user can either build via the template OR upload a PDF/DOCX
  // they signed elsewhere. Both can coexist on the same contract row.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const uploadInputRef = useRef(null);
  const handleUploadClick = () => uploadInputRef.current?.click();
  const handleUploadChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      let contractId = contract?.id;
      if (!contractId) {
        const created = await createContract(userId, project.id, fields);
        if (!created) throw new Error('Could not initialize contract row');
        setContract(created);
        contractId = created.id;
      }
      // If there's an existing upload, delete it first to avoid orphans.
      if (contract?.uploaded_pdf_path) {
        await deleteContractFile(contract.uploaded_pdf_path).catch(() => {});
      }
      const { path, name } = await uploadContractFile(userId, contractId, file);
      const nowIso = new Date().toISOString();
      await updateContract(contractId, {
        uploaded_pdf_path: path,
        uploaded_pdf_name: name,
        uploaded_pdf_at: nowIso,
      });
      setContract(c => ({ ...(c || {}), uploaded_pdf_path: path, uploaded_pdf_name: name, uploaded_pdf_at: nowIso }));
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally { setUploading(false); }
  };
  const handleRemoveUpload = async () => {
    if (!contract?.id || !contract?.uploaded_pdf_path) return;
    if (!confirm('Remove the uploaded contract file?')) return;
    try {
      await deleteContractFile(contract.uploaded_pdf_path);
    } catch (e) { /* best-effort */ }
    await updateContract(contract.id, {
      uploaded_pdf_path: null, uploaded_pdf_name: null, uploaded_pdf_at: null,
    });
    setContract(c => ({ ...(c || {}), uploaded_pdf_path: null, uploaded_pdf_name: null, uploaded_pdf_at: null }));
  };
  const handleOpenUpload = async () => {
    if (!contract?.uploaded_pdf_path) return;
    const url = await signedUrlForContract(contract.uploaded_pdf_path);
    if (url) window.open(url, '_blank', 'noopener');
  };
  useEffect(() => {
    if (!project?.client) { setCompanyMeta(null); return; }
    let cancelled = false;
    getCompanyByName(project.client)
      .then(row => { if (!cancelled) setCompanyMeta(row); })
      .catch(e => { console.warn('[contract-editor] company meta load failed:', e.message || e); });
    return () => { cancelled = true; };
  }, [project?.client]);

  // Apply company metadata to the form fields when:
  //   - no contract row exists yet (fresh draft), OR
  //   - the target field is blank
  // Never overwrites a value the user typed.
  useEffect(() => {
    if (!companyMeta) return;
    setFields(f => {
      const next = { ...f };
      const fill = (key, val) => { if (val && !next[key]) next[key] = val; };
      fill('client_legal_name',   companyMeta.legal_name || companyMeta.name_canonical);
      fill('client_legal_address', companyMeta.address);
      fill('client_billing_addr',  companyMeta.address);
      fill('client_billing_email', companyMeta.billing_email);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyMeta]);

  // Pre-fill the client PM fields from the highest-priority
  // available contact if those fields are blank. Runs once after
  // the contact pool loads on a fresh contract (no row yet).
  useEffect(() => {
    if (!contactPool.length) return;
    if (contract) return; // existing contract — don't overwrite saved values
    setFields(f => {
      const pmFilled = !!(f.client_pm_name || f.client_pm_email);
      if (pmFilled) return f; // user already typed something — don't clobber
      const priority = ['champion', 'point_of_contact', 'rfp_sender', 'team_member', 'client_team', 'agent'];
      const ranked = [...contactPool].sort((a, b) => {
        const ai = priority.indexOf(a._role); const bi = priority.indexOf(b._role);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      const pick = ranked[0];
      if (!pick) return f;
      const name = `${pick.first_name || ''} ${pick.last_name || ''}`.trim();
      return {
        ...f,
        client_pm_name: name || f.client_pm_name,
        client_pm_email: pick.email || f.client_pm_email,
        client_pm_phone: pick.phone || f.client_pm_phone,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactPool]);

  // Apply a CRM contact to the client PM fields (name + email + phone).
  const applyContactToPM = useCallback((c) => {
    if (!c) return;
    setDirty(true);
    setFields(f => ({
      ...f,
      client_pm_name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      client_pm_email: c.email || '',
      client_pm_phone: c.phone || '',
    }));
  }, []);

  // Load existing contract for THIS project (or fall through to a
  // fresh seed). Resets all state immediately on project change to
  // prevent the previous project's fields from leaking into this one.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContract(null);
    setShareUrl(null);
    setFields(seedFields);
    setDirty(false);
    // Reset client-fillable to the eligible defaults (address +
    // billing email) — overwritten by the load below if the saved
    // contract has its own list.
    setClientFillable(VARIABLES.filter(v => v.clientEligible).map(v => v.id));
    // Restore the step the user was on for THIS project (per-project
    // localStorage key). If it's a brand-new project, defaults to 0.
    if (project?.id) {
      const stored = Number(localStorage.getItem(`es_contract_step_${project.id}`));
      setStepIndexRaw(
        Number.isFinite(stored) && stored >= 0 && stored < SECTIONS.length ? stored : 0
      );
    }
    (async () => {
      try {
        const row = await getContractForProject(project.id);
        if (cancelled) return;
        if (row) {
          setContract(row);
          // Merge: saved fields win, seed fills any gaps.
          setFields({ ...seedFields, ...(row.filled_fields || {}) });
          // Saved client-fillable list wins over the default. If the
          // column is missing (pre-migration) Array.isArray is false
          // and we keep the default.
          if (Array.isArray(row.client_fillable_fields)) {
            setClientFillable(row.client_fillable_fields);
          }
          if (row.share_token) {
            setShareUrl(`https://earlyspring.nyc/contract/${row.share_token}`);
          }
        }
        // dirty stays false after load — only user edits flip it.
      } catch (e) {
        console.error('[contract-editor] load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Auto-recompute derived fields whenever total_fee changes — UNLESS
  // user has manually overridden them. Override flagged by a sentinel.
  // Sets dirty=true so the save effect knows this came from a user edit.
  const updateField = useCallback((id, value) => {
    setDirty(true);
    setFields(prev => {
      const next = { ...prev, [id]: value };
      if (id === 'total_fee') {
        for (const [key, fn] of Object.entries(DERIVED)) {
          if (!prev[`${key}__override`]) {
            next[key] = fn(next);
          }
        }
      } else if (DERIVED[id]) {
        next[`${id}__override`] = true;
      }
      return next;
    });
  }, []);

  // Save the current fields immediately. Used by both the
  // debounced autosave and the "Save now" button. Surfaces any
  // pre-flight reason it couldn't save (missing user, missing
  // project, locked contract) AND surfaces the real error message
  // when the request itself fails — instead of silently returning.
  const [saveError, setSaveError] = useState(null);
  const doSave = useCallback(async () => {
    setSaveError(null);
    if (!userId) { setSaveError('Not signed in — refresh and try again.'); return; }
    if (!project?.id) { setSaveError('No project loaded.'); return; }
    if (contract?.status === 'signed') { setSaveError('Contract is signed — no further edits allowed.'); return; }
    setSaveStatus('saving');
    try {
      if (contract?.id) {
        await updateContract(contract.id, {
          filled_fields: fields,
          client_fillable_fields: clientFillable,
        });
      } else {
        const created = await createContract(userId, project.id, fields, {
          clientFillableFields: clientFillable,
        });
        if (created) {
          setContract(created);
        } else {
          throw new Error('Server returned no row after create. Did you run supabase-contracts.sql?');
        }
      }
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      setDirty(false);
      // Revert to idle after a moment so "Last saved Xm ago" takes over.
      setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 1800);
    } catch (e) {
      console.error('[contract-editor] save failed:', e);
      setSaveStatus('idle');
      setSaveError(e?.message || 'Save failed — check the console for details.');
      throw e;
    }
  }, [userId, project?.id, contract, fields, clientFillable]);

  // Debounced autosave. Only fires when `dirty` is true (i.e., the
  // user has actually edited something — never from a load/reset).
  useEffect(() => {
    if (!dirty) return;
    if (!userId || !project?.id) return;
    if (contract?.status === 'signed') return;
    setSaveStatus('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (contract?.id) {
          await updateContract(contract.id, {
            filled_fields: fields,
            client_fillable_fields: clientFillable,
          });
        } else {
          const created = await createContract(userId, project.id, fields, {
            clientFillableFields: clientFillable,
          });
          if (created) setContract(created);
        }
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        // Leave the "saved" status visible briefly, then revert to
        // idle so the "Last saved Xm ago" line takes over.
        setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 2000);
      } catch (e) {
        console.error('[contract-editor] save failed:', e);
        setSaveStatus('idle');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, dirty, clientFillable]);

  const handleSend = async () => {
    if (!contract?.id) {
      // Force a save first
      const created = await createContract(userId, project.id, fields);
      if (!created) return;
      setContract(created);
    }
    setSending(true);
    try {
      const targetId = contract?.id || (await createContract(userId, project.id, fields))?.id;
      const token = await sendContract(targetId);
      setShareUrl(`https://earlyspring.nyc/contract/${token}`);
      setContract(c => ({ ...(c || {}), share_token: token, status: 'sent', sent_at: new Date().toISOString() }));
    } catch (e) {
      alert('Could not generate share link: ' + (e.message || 'unknown'));
    } finally { setSending(false); }
  };

  // Email the contract directly to a recipient via Gmail (using the
  // signed-in user's Google access token, so the message arrives FROM
  // their address). Embeds the full SOW + Exhibit A body in the
  // message and includes the signing link as a CTA.
  const [sendStatus, setSendStatus] = useState(null); // 'sent' | 'error' | null
  const [sendError, setSendError] = useState(null);
  const [lastSentTo, setLastSentTo] = useState(null);
  const handleSendEmail = useCallback(async ({ to, message }) => {
    setSendStatus(null);
    setSendError(null);
    setSending(true);
    try {
      // Make sure the latest fields are persisted so the email
      // renders from the real saved values, not stale state.
      let targetId = contract?.id;
      if (!targetId) {
        const created = await createContract(userId, project.id, fields, { clientFillableFields: clientFillable });
        if (!created) throw new Error('Could not create contract row');
        setContract(created);
        targetId = created.id;
      } else if (dirty) {
        await updateContract(targetId, {
          filled_fields: fields,
          client_fillable_fields: clientFillable,
        });
      }

      const { getSession } = await import('../lib/db.js');
      const session = await getSession();
      const accessToken = (() => {
        try { return localStorage.getItem('es_google_token') || null; } catch { return null; }
      })();
      if (!accessToken) {
        throw new Error("Sign in with Google first — Morgan emails via your Gmail account so the contract arrives FROM you.");
      }
      const res = await fetch('/api/contract-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ contractId: targetId, to, message, accessToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Send failed: ${res.status}`);
      setShareUrl(data.signUrl);
      setContract(c => ({
        ...(c || {}),
        share_token: data.token,
        status: 'sent',
        sent_at: new Date().toISOString(),
      }));
      setLastSentTo(data.sentTo);
      setSendStatus('sent');
      setDirty(false);
    } catch (e) {
      setSendError(e.message || 'Send failed');
      setSendStatus('error');
    } finally { setSending(false); }
  }, [userId, project?.id, contract, fields, dirty, clientFillable]);

  const handleRevoke = async () => {
    if (!contract?.id) return;
    if (!confirm('Revoke the current share link? Anyone holding it will see a 404. You can generate a new one anytime.')) return;
    await revokeContract(contract.id);
    setShareUrl(null);
    setContract(c => ({ ...(c || {}), share_token: null, status: 'revoked' }));
  };

  const previewHtml = useMemo(() => {
    const md = renderContract(fields);
    return renderContractMarkdown(md);
  }, [fields]);

  const status = contract?.status || 'draft';
  // Lock the editor for signed contracts (immutable by design) AND
  // for the `finance` role (bookkeeper) — they get a read-only view
  // for reference but can't change fee, dates, or terms.
  const isLocked = status === 'signed' || user?.role === 'finance';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 480px) 1fr', gap: 24, padding: '24px 28px', maxWidth: 1640, margin: '0 auto', minHeight: 'calc(100vh - 100px)' }}>
      {/* Left: form */}
      <div style={{ minWidth: 0 }}>
        {saveError && (
          <div style={{
            marginBottom: 10, padding: '8px 12px', borderRadius: 6,
            background: T.alertSoft, border: `1px solid ${T.alert}55`,
            color: T.alert, fontSize: 12, lineHeight: 1.45,
          }}>
            ⚠ {saveError}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.cream, margin: 0, letterSpacing: '-0.012em' }}>Contract</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: T.dim, whiteSpace: 'nowrap' }}>
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                ? '✓ Saved'
                : lastSavedAt
                ? `Last saved ${relativeTime(lastSavedAt)}`
                : 'Not saved yet'}
            </span>
            {status !== 'signed' && (
              <button
                type="button"
                onClick={async () => {
                  // Always force a save — even when clean. Cheap PATCH,
                  // re-confirms the latest state, and avoids the "button
                  // doesn't do anything" perception when autosave already
                  // wrote and dirty is false.
                  clearTimeout(saveTimer.current);
                  try { await doSave(); } catch (e) { /* doSave already logs */ }
                }}
                disabled={saveStatus === 'saving'}
                title="Save the current state of the contract."
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: T.sans,
                  background: T.ink, color: T.paper, border: 'none',
                  cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  opacity: saveStatus === 'saving' ? .6 : 1,
                }}
              >💾 Save now</button>
            )}
          </div>
        </div>
        <StatusBar status={status} onSend={handleSend} onRevoke={handleRevoke} sending={sending} shareUrl={shareUrl} contract={contract}/>

        {/* Upload-existing-contract affordance. Sits under the
            status bar so it reads as an alternative path to the
            template editor below. Once uploaded, shows file name +
            uploaded date + open/replace/remove actions. */}
        <div style={{
          marginTop: 12, padding: '12px 14px', borderRadius: 8,
          background: T.surface, border: `1px solid ${T.faintRule}`,
        }}>
          {contract?.uploaded_pdf_path ? (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                📎 Uploaded contract file
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.cream, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contract.uploaded_pdf_name || 'contract file'}
                </div>
                <div style={{ fontSize: 10, color: T.dim }}>
                  {contract.uploaded_pdf_at ? `Uploaded ${new Date(contract.uploaded_pdf_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button type="button" onClick={handleOpenUpload} style={chromeBtn}>Open ↗</button>
                <button type="button" onClick={handleUploadClick} disabled={uploading} style={chromeBtn}>Replace</button>
                <button type="button" onClick={handleRemoveUpload} style={{ ...chromeBtn, color: T.alert, borderColor: `${T.alert}55` }}>Remove</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.cream }}>📎 Attach an existing contract file</div>
                <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                  PDF or DOCX, up to 25MB. Use this if you've already signed off-platform — Morgan keeps it for the record.
                </div>
              </div>
              <button type="button" onClick={handleUploadClick} disabled={uploading} style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: T.sans,
                background: T.ink, color: T.paper, border: 'none', cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? .6 : 1, textTransform: 'uppercase', letterSpacing: '.08em',
              }}>{uploading ? 'Uploading…' : '⬆ Upload'}</button>
            </div>
          )}
          {uploadError && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: T.alertSoft, color: T.alert, fontSize: 11, lineHeight: 1.45 }}>
              {uploadError}
            </div>
          )}
          <input ref={uploadInputRef} type="file" accept=".pdf,.doc,.docx,application/pdf" onChange={handleUploadChange} style={{ display: 'none' }}/>
        </div>

        {loading ? (
          <div style={{ marginTop: 24, fontSize: 12, color: T.dim, fontStyle: 'italic' }}>Loading…</div>
        ) : (
          <Wizard
            stepIndex={stepIndex}
            setStepIndex={setStepIndex}
            currentSection={currentSection}
            isReviewStep={isReviewStep}
            fields={fields}
            updateField={updateField}
            contactPool={contactPool}
            applyContactToPM={applyContactToPM}
            isLocked={isLocked}
            onSend={handleSend}
            onSendEmail={handleSendEmail}
            sendStatus={sendStatus}
            sendError={sendError}
            lastSentTo={lastSentTo}
            sending={sending}
            status={status}
            shareUrl={shareUrl}
            clientFillable={clientFillable}
            toggleClientFillable={(fieldId) => {
              setDirty(true);
              setClientFillable(prev =>
                prev.includes(fieldId) ? prev.filter(x => x !== fieldId) : [...prev, fieldId]
              );
            }}
          />
        )}
      </div>

      {/* Right: live preview */}
      <div style={{
        minWidth: 0, background: T.paper, color: T.ink,
        border: `1px solid ${T.faintRule}`, borderRadius: 10,
        padding: '48px 56px', maxHeight: 'calc(100vh - 140px)', overflow: 'auto',
        fontFamily: T.sans, lineHeight: 1.55,
      }}>
        {/* Early Spring horizontal lockup as a header mark. Loaded
            from the portfolio domain so it's the same canonical SVG
            the public contract page and email versions use. */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="https://earlyspring.nyc/early-spring-lockup-blue.svg"
            alt="Early Spring"
            style={{ height: 28, display: 'inline-block' }}
          />
        </div>
        <div className="contract-preview" dangerouslySetInnerHTML={{ __html: previewHtml }}/>
        <style>{`
          .contract-preview h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 8px; text-align: center; }
          .contract-preview h1 + h2 { text-align: center; }
          .contract-preview h2 { font-size: 18px; font-weight: 700; letter-spacing: -0.012em; margin: 8px 0 24px; color: ${T.ink70}; }
          .contract-preview h3 { font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin: 28px 0 12px; }
          .contract-preview h4 { font-size: 15px; font-weight: 700; letter-spacing: -0.005em; margin: 24px 0 14px; color: ${T.ink}; }
          .contract-preview p  { margin: 0 0 14px; font-size: 13px; }
          .contract-preview hr { border: none; border-top: 1px solid ${T.faintRule}; margin: 36px 0; }
          .contract-preview table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 13px; }
          .contract-preview td { border: 1px solid ${T.faintRule}; padding: 10px 12px; vertical-align: top; }
          .contract-preview td:first-child { font-weight: 600; background: ${T.inkSoft2}; width: 38%; }
          .contract-preview ul { margin: 0 0 14px 0; padding-left: 22px; font-size: 13px; }
          .contract-preview li { margin-bottom: 6px; }
          .contract-preview strong { font-weight: 700; }
        `}</style>
      </div>
    </div>
  );
}

function Wizard({
  stepIndex, setStepIndex, currentSection, isReviewStep,
  fields, updateField, contactPool, applyContactToPM, isLocked,
  onSend, onSendEmail, sendStatus, sendError, lastSentTo,
  sending, status, shareUrl,
  clientFillable, toggleClientFillable,
}) {
  const total = SECTIONS.length;
  const sectionVars = VARIABLES_BY_SECTION[currentSection?.id] || [];
  // Per-section completion check: how many fields in this section
  // have a non-empty value. Drives the "5 of 7 filled" subheader
  // and the section nav pills.
  const progressFor = (sectionId) => {
    const vs = VARIABLES_BY_SECTION[sectionId] || [];
    if (!vs.length) return { filled: 0, total: 0 };
    let filled = 0;
    for (const v of vs) {
      const val = fields[v.id];
      if (val != null && String(val).trim() !== '') filled++;
    }
    return { filled, total: vs.length };
  };

  return (
    <div style={{ marginTop: 18, opacity: isLocked ? .6 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
      {/* Step pills — clickable, show progress per section. */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {SECTIONS.map((s, i) => {
          const isActive = i === stepIndex;
          const { filled, total: tot } = progressFor(s.id);
          const isDone = tot > 0 && filled === tot;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStepIndex(i)}
              style={{
                padding: '5px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                background: isActive ? T.ink : 'transparent',
                color: isActive ? T.paper : T.dim,
                border: `1px solid ${isActive ? T.ink : T.faintRule}`,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em',
                fontFamily: T.sans,
              }}
              title={tot > 0 ? `${filled} of ${tot} filled` : ''}
            >
              {isDone && !isActive ? '✓ ' : ''}{i + 1}. {s.label}
            </button>
          );
        })}
      </div>

      {/* Step header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>
          Step {stepIndex + 1} of {total}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.cream, margin: 0, letterSpacing: '-0.012em' }}>
          {currentSection?.label}
        </h2>
        {currentSection?.intro && (
          <div style={{ marginTop: 4, fontSize: 12, color: T.dim, lineHeight: 1.5 }}>
            {currentSection.intro}
          </div>
        )}
      </div>

      {/* Step body */}
      {isReviewStep ? (
        <ReviewStep
          fields={fields}
          status={status}
          shareUrl={shareUrl}
          onSend={onSend}
          onSendEmail={onSendEmail}
          sendStatus={sendStatus}
          sendError={sendError}
          lastSentTo={lastSentTo}
          sending={sending}
          onJumpToSection={(idx) => setStepIndex(idx)}
        />
      ) : (
        <div>
          {sectionVars.map(spec => (
            <Field
              key={spec.id}
              spec={spec}
              value={fields[spec.id] ?? ''}
              onChange={v => updateField(spec.id, v)}
              contactPool={spec.id === 'client_pm_name' ? contactPool : null}
              onPickContact={applyContactToPM}
              clientFillable={Array.isArray(clientFillable) && clientFillable.includes(spec.id)}
              onToggleClientFillable={() => toggleClientFillable(spec.id)}
            />
          ))}
        </div>
      )}

      {/* Back / Next */}
      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <button
          type="button"
          onClick={() => setStepIndex(stepIndex - 1)}
          disabled={stepIndex === 0}
          style={{
            padding: '8px 16px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
            background: 'transparent', color: stepIndex === 0 ? T.fadedInk : T.cream,
            border: `1px solid ${T.faintRule}`,
            cursor: stepIndex === 0 ? 'default' : 'pointer',
            opacity: stepIndex === 0 ? .4 : 1,
          }}
        >← Back</button>
        {stepIndex < total - 1 && (
          <button
            type="button"
            onClick={() => setStepIndex(stepIndex + 1)}
            style={{
              padding: '8px 16px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
              background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '.08em',
            }}
          >Next →</button>
        )}
      </div>
    </div>
  );
}

// Final wizard step: section-completeness summary + send panel.
// Send panel collects recipient email (defaulting to client PM)
// and an optional intro message, then POSTs to /api/contract-send
// which embeds the full SOW into the email body and emails via the
// signed-in user's Gmail account.
function ReviewStep({
  fields, status, shareUrl, onSend, onSendEmail,
  sendStatus, sendError, lastSentTo, sending, onJumpToSection,
}) {
  const reviewable = SECTIONS.filter(s => s.id !== 'review');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Default the recipient to the saved client PM email whenever it
  // changes, but ONLY if the user hasn't typed anything yet — don't
  // clobber a self-test address they entered.
  useEffect(() => {
    if (!recipient && fields.client_pm_email) {
      setRecipient(fields.client_pm_email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.client_pm_email]);

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());
  const sendDisabled = !isValidEmail || sending;

  return (
    <div>
      <div style={{
        padding: '12px 14px', borderRadius: 8,
        background: T.surface, border: `1px solid ${T.faintRule}`,
        marginBottom: 14, fontSize: 12, color: T.cream, lineHeight: 1.5,
      }}>
        Read through the draft on the right. Jump back to any section below to make changes.
        When you're ready, send it directly to the client (or to yourself first as a test).
      </div>

      {/* Section completeness summary */}
      {reviewable.map((s, i) => {
        const vs = VARIABLES_BY_SECTION[s.id] || [];
        const filled = vs.filter(v => fields[v.id] != null && String(fields[v.id]).trim() !== '');
        const missing = vs.length - filled.length;
        return (
          <div key={s.id} style={{
            marginBottom: 8, padding: '10px 12px', borderRadius: 6,
            background: T.surface, border: `1px solid ${T.faintRule}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.cream }}>{s.label}</div>
              <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                {filled.length} of {vs.length} filled
                {missing > 0 ? ` · ${missing} blank` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onJumpToSection(i)}
              style={{
                padding: '5px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                background: 'transparent', color: T.cream, border: `1px solid ${T.faintRule}`,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em',
                fontFamily: T.sans,
              }}
            >Edit</button>
          </div>
        );
      })}

      {/* Send panel — primary action. Embeds the full SOW + link in
          the email body. Uses Gmail under the hood so the message
          arrives from the signed-in user's address. */}
      <div style={{
        marginTop: 18, padding: '16px 18px', borderRadius: 10,
        background: T.surface, border: `1px solid ${T.faintRule}`,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.14em',
          textTransform: 'uppercase', marginBottom: 10,
        }}>
          Send to client
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Recipient email
            </label>
            <input
              type="email"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="kamil@earlyspring.nyc (send to yourself as a test first)"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                background: T.bg, border: `1px solid ${T.border}`,
                color: T.cream, fontSize: 13, fontFamily: T.sans, outline: 'none',
              }}
            />
            <div style={{ marginTop: 4, fontSize: 10, color: T.dim, fontStyle: 'italic' }}>
              Defaults to the client PM email from Section 1. Override for self-tests.
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Short message (optional)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="As discussed on Tuesday — let me know if anything looks off and I'll revise. Aiming to lock by Friday."
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6, minHeight: 60,
                background: T.bg, border: `1px solid ${T.border}`,
                color: T.cream, fontSize: 13, fontFamily: T.sans, outline: 'none',
                resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onSendEmail({ to: recipient.trim(), message: message.trim() || null })}
              disabled={sendDisabled}
              style={{
                padding: '10px 18px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                fontFamily: T.sans, background: T.ink, color: T.paper, border: 'none',
                cursor: sendDisabled ? 'not-allowed' : 'pointer',
                opacity: sendDisabled ? .5 : 1,
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}
            >{sending ? 'Sending…' : (shareUrl ? '↺ Resend' : '✉ Send for signature')}</button>
            {shareUrl && (
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  padding: '8px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  fontFamily: T.sans, background: 'transparent', color: T.cream,
                  border: `1px solid ${T.faintRule}`, cursor: 'pointer',
                }}
              >{copied ? '✓ Copied' : 'Copy link'}</button>
            )}
            {sendStatus === 'sent' && lastSentTo && (
              <span style={{ fontSize: 11, color: T.dim, fontStyle: 'italic' }}>
                ✓ Sent to {lastSentTo}
              </span>
            )}
            {sendStatus === 'error' && sendError && (
              <span style={{ fontSize: 11, color: T.alert }}>
                {sendError}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fallback: still let the user generate a link without
          emailing, in case they want to send via Slack / iMessage /
          etc. Tucked under the primary send panel. */}
      {!shareUrl && (
        <div style={{ marginTop: 10, fontSize: 11, color: T.dim }}>
          Or{' '}
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            style={{
              padding: 0, background: 'transparent', border: 'none',
              color: T.cream, fontSize: 11, textDecoration: 'underline',
              cursor: sending ? 'wait' : 'pointer', fontFamily: T.sans,
            }}
          >generate a share link without emailing</button>
          {' '}to forward yourself via Slack or another channel.
        </div>
      )}
    </div>
  );
}

function StatusBar({ status, onSend, onRevoke, sending, shareUrl, contract }) {
  const meta = STATUS_LABEL[status] || STATUS_LABEL.draft;
  const isDraft = status === 'draft' || status === 'revoked';
  const isLive = status === 'sent' || status === 'viewed';
  const isSigned = status === 'signed';

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8, background: T.surface,
      border: `1px solid ${T.faintRule}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: shareUrl ? 10 : 0 }}>
        <span style={{
          padding: '4px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700,
          background: status === 'signed' ? T.ink : status === 'revoked' ? T.alertSoft : T.inkSoft,
          color: status === 'signed' ? T.paper : status === 'revoked' ? T.alert : T.ink,
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: T.dim, flex: 1 }}>
          {status === 'draft' && 'Fill in the fields and generate a share link when ready.'}
          {status === 'sent' && (contract?.sent_at ? `Sent ${new Date(contract.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Sent — awaiting client.')}
          {status === 'viewed' && (contract?.viewed_at ? `Viewed ${new Date(contract.viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Viewed by client.')}
          {status === 'signed' && contract?.signed_name && `Signed by ${contract.signed_name}`}
          {status === 'revoked' && 'Share link revoked.'}
        </span>
      </div>
      {shareUrl && !isSigned && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            readOnly value={shareUrl}
            onClick={e => e.target.select()}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`,
              background: T.bg, fontSize: 11, color: T.cream, fontFamily: T.sans, outline: 'none',
            }}/>
          <button onClick={() => navigator.clipboard?.writeText(shareUrl)} style={chromeBtn}>Copy</button>
          <a href={shareUrl} target="_blank" rel="noopener" style={{ ...chromeBtn, textDecoration: 'none' }}>Open ↗</a>
        </div>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        {isDraft && (
          <button onClick={onSend} disabled={sending} style={primaryBtn}>
            {sending ? 'Generating…' : '✍ Generate share link'}
          </button>
        )}
        {isLive && (
          <button onClick={onRevoke} style={ghostBtn}>Revoke link</button>
        )}
      </div>
    </div>
  );
}

function Field({ spec, value, onChange, contactPool, onPickContact, clientFillable, onToggleClientFillable }) {
  const isMulti = spec.kind === 'textarea';
  const type = spec.kind === 'currency' || spec.kind === 'number' ? 'number'
    : spec.kind === 'date' ? 'date'
    : 'text';
  const [focused, setFocused] = useState(false);

  // AI polish state — runs only on fields marked spec.ai === true.
  // `pending` holds the {original, polished} pair until the user
  // accepts or reverts.
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState(null);
  const [pending, setPending] = useState(null);
  const runPolish = async () => {
    if (!value || polishing) return;
    setPolishing(true);
    setPolishError(null);
    try {
      const { getSession } = await import('../lib/db.js');
      const session = await getSession();
      const res = await fetch('/api/contract-polish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ text: value, field: spec.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Polish failed: ${res.status}`);
      if (data.polished && data.polished !== value) {
        setPending({ original: value, polished: data.polished });
      } else {
        setPolishError('Already clean — nothing to tighten.');
      }
    } catch (e) {
      setPolishError(e.message || 'Polish failed');
    } finally { setPolishing(false); }
  };
  const acceptPolish = () => {
    if (!pending) return;
    onChange(pending.polished);
    setPending(null);
  };
  const revertPolish = () => setPending(null);

  const ROLE_LABEL = { rfp_sender: 'RFP', champion: 'Champion', point_of_contact: 'POC', agent: 'Agent', team_member: 'Team', client_team: 'Client team' };
  const hasPool = Array.isArray(contactPool) && contactPool.length > 0;
  const q = String(value || '').trim().toLowerCase();
  const matches = hasPool
    ? contactPool.filter(c => {
        const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
        return !q || name.includes(q) || (c.email || '').toLowerCase().includes(q);
      }).slice(0, 8)
    : [];
  const showDropdown = focused && hasPool && matches.length > 0;

  return (
    <div style={{ marginBottom: 18, position: hasPool ? 'relative' : 'static' }}>
      {/* Conversational prompt when available — falls back to the
          label. The label sits under it as a secondary caption so
          the rendered field still reads as identifiable. */}
      {spec.prompt ? (
        <>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.cream, lineHeight: 1.4, marginBottom: 2 }}>
            {spec.prompt}
          </label>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            {spec.label}
            {spec.kind === 'currency' && <span style={{ color: T.fadedInk, fontWeight: 400, marginLeft: 6 }}>· USD</span>}
            {hasPool && <span style={{ color: T.fadedInk, fontWeight: 400, marginLeft: 6 }}>· {contactPool.length} from CRM</span>}
          </div>
        </>
      ) : (
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
          {spec.label}
          {spec.kind === 'currency' && <span style={{ color: T.fadedInk, fontWeight: 400, marginLeft: 6 }}>· USD</span>}
          {hasPool && <span style={{ color: T.fadedInk, fontWeight: 400, marginLeft: 6 }}>· {contactPool.length} from CRM</span>}
        </label>
      )}
      {isMulti ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={spec.placeholder || ''}
          // Tab on an EMPTY textarea accepts the placeholder as the
          // value. Once there's text, Tab works normally (moves focus
          // to the next field) so you don't get stuck.
          onKeyDown={e => {
            if (e.key === 'Tab' && !e.shiftKey && !value && spec.placeholder) {
              e.preventDefault();
              onChange(spec.placeholder);
            }
          }}
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={spec.placeholder || ''}
          autoComplete="off"
          style={inputStyle}
        />
      )}
      {spec.ai && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={runPolish}
            disabled={!value || polishing}
            title="Tighten this with Claude. You'll see before/after and can accept or revert."
            style={{
              padding: '3px 9px', borderRadius: 999, fontSize: 9, fontWeight: 700,
              background: value && !polishing ? T.ink : T.surface,
              color: value && !polishing ? T.paper : T.fadedInk,
              border: `1px solid ${value && !polishing ? T.ink : T.faintRule}`,
              cursor: !value ? 'default' : polishing ? 'wait' : 'pointer',
              textTransform: 'uppercase', letterSpacing: '.06em',
              opacity: !value ? .5 : polishing ? .7 : 1,
              fontFamily: T.sans,
            }}
          >{polishing ? 'Polishing…' : '✨ Polish'}</button>
          {polishError && (
            <span style={{ fontSize: 10, color: T.alert, fontStyle: 'italic' }}>{polishError}</span>
          )}
        </div>
      )}
      {pending && (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 6,
          background: T.surface, border: `1px solid ${T.faintRule}`,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 6 }}>
            ✨ Suggested polish
          </div>
          <div style={{
            fontSize: 12, color: T.cream, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', marginBottom: 8,
          }}>
            {pending.polished}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={acceptPolish} style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: T.sans,
            }}>Accept</button>
            <button type="button" onClick={revertPolish} style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600,
              background: 'transparent', color: T.dim, border: `1px solid ${T.faintRule}`,
              cursor: 'pointer', fontFamily: T.sans,
            }}>Keep original</button>
          </div>
        </div>
      )}
      {spec.clientEligible && onToggleClientFillable && (
        <label style={{
          marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10, color: T.dim, cursor: 'pointer', userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={!!clientFillable}
            onChange={onToggleClientFillable}
            style={{ cursor: 'pointer', accentColor: T.ink }}
          />
          <span>Let client edit this on the signing page</span>
        </label>
      )}
      {spec.help && <div style={{ marginTop: 4, fontSize: 10, color: T.dim, fontStyle: 'italic' }}>{spec.help}</div>}
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rS,
          boxShadow: T.shadow, maxHeight: 280, overflow: 'auto', fontFamily: T.sans,
        }}>
          {matches.map(c => {
            const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '(No name)';
            return (
              <button
                key={c.id} type="button"
                onMouseDown={e => { e.preventDefault(); onPickContact?.(c); setFocused(false); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                  width: '100%', padding: '8px 12px', background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${T.faintRule}`, cursor: 'pointer',
                  textAlign: 'left', fontFamily: T.sans, color: T.cream, fontSize: 13,
                }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                    {c.title && <span style={{ color: T.dim, fontWeight: 400 }}>, {c.title}</span>}
                  </div>
                  {c.email && <div style={{ fontSize: 10, color: T.dim, marginTop: 1 }}>{c.email}</div>}
                </div>
                {c._role && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: T.inkSoft, color: T.ink, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap',
                  }}>{ROLE_LABEL[c._role] || c._role}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  background: T.surface, border: `1px solid ${T.border}`,
  color: T.cream, fontSize: 13, fontFamily: T.sans, outline: 'none',
};

const primaryBtn = {
  padding: '7px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
  background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: '.08em',
};

const ghostBtn = {
  padding: '7px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.dim, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
};

const chromeBtn = {
  padding: '6px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.cream, border: `1px solid ${T.border}`, cursor: 'pointer',
};

export default ContractEditor;
