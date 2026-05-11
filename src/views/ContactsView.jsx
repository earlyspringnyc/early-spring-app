import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { LogOutI, PlusI } from '../components/icons/index.js';
import {
  listContacts, createContact, updateContact, deleteContact, importContacts,
  rocketReachLookup, previewReenrich, applyReenrichPatch, syncRocketReachContacts,
  backfillAvatarsFromRocketReach,
} from '../lib/contacts.js';
import { parseContactsCSV } from '../utils/csvImport.js';
import { clusterByCompany } from '../utils/companyDedup.js';
import ContactDetailDrawer from '../components/ContactDetailDrawer.jsx';

const STATUS_OPTIONS = [
  { id: 'all',      label: 'All' },
  { id: 'prospect', label: 'Prospects' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'active',   label: 'Active' },
  { id: 'past',     label: 'Past' },
  { id: 'vendor',   label: 'Vendors' },
  { id: 'press',    label: 'Press' },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(s => [s.id, s.label]));

function StatusBadge({ status }) {
  const map = {
    prospect: { color: T.ink70, bg: 'transparent', border: T.faintRule },
    pitching: { color: T.paper, bg: T.ink, border: T.ink },
    active:   { color: T.ink, bg: T.inkSoft, border: T.ink },
    past:     { color: T.fadedInk, bg: 'transparent', border: T.faintRule },
    vendor:   { color: T.ink70, bg: T.inkSoft2, border: T.faintRule },
    press:    { color: T.ink70, bg: 'transparent', border: T.faintRule },
  };
  const s = map[status] || map.prospect;
  return <span style={{
    display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999,
    fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
    color: s.color, background: s.bg, border: `1px solid ${s.border}`,
  }}>{STATUS_LABEL[status] || status}</span>;
}

function ContactAvatar({ c, size = 32 }) {
  const initials = ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase();
  const [errored, setErrored] = useState(false);
  if (c.avatar_url && !errored) {
    return <img
      src={c.avatar_url}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size, height: size, borderRadius: '50%',
        objectFit: 'cover',
        border: `1px solid ${T.faintRule}`, background: T.inkSoft, flexShrink: 0,
      }}
    />;
  }
  return <div style={{
    width: size, height: size, borderRadius: '50%', background: T.inkSoft,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size < 36 ? 11 : 14, fontWeight: 700, color: T.ink,
    border: `1px solid ${T.faintRule}`, flexShrink: 0,
  }}>{initials || '?'}</div>;
}

function ContactRow({ c, onClick, onRefresh, refreshing }) {
  const [hover, setHover] = useState(false);
  const canRefresh = !!(c.linkedin_url || c.email);
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '32px 2fr 1.6fr 1.4fr 1.2fr 1fr 56px',
      gap: 16, alignItems: 'center', padding: '12px 18px',
      borderBottom: `1px solid ${T.faintRule}`, cursor: 'pointer',
      transition: 'background .15s',
      background: hover ? T.inkSoft : 'transparent',
    }}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    >
      <ContactAvatar c={c} size={32}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(c.first_name || '') + ' ' + (c.last_name || '')}
        </div>
        <div style={{ fontSize: 11, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.email || <i style={{ opacity: .55 }}>no email on file</i>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: T.ink70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || '—'}</div>
      <div style={{ fontSize: 12, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || '—'}</div>
      <div style={{ fontSize: 12, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.location || '—'}</div>
      <div><StatusBadge status={c.status || 'prospect'}/></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        {canRefresh && (
          <button
            onClick={e => { e.stopPropagation(); onRefresh?.(c); }}
            title="Refresh from RocketReach"
            disabled={refreshing}
            style={{
              opacity: hover || refreshing ? 1 : 0,
              transition: 'opacity .15s',
              width: 22, height: 22, borderRadius: '50%',
              background: refreshing ? T.ink : 'transparent',
              border: `1px solid ${T.faintRule}`,
              color: refreshing ? T.paper : T.ink70,
              fontSize: 11, fontFamily: T.sans, fontWeight: 600,
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >↻</button>
        )}
        <span style={{ fontSize: 11, color: T.fadedInk }}>›</span>
      </div>
    </div>
  );
}

function ImportWizard({ userId, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const onFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const out = parseContactsCSV(e.target.result);
        setParsed({ ...out, fileName: file.name });
        setStep(2);
      } catch (err) { alert('Could not parse CSV: ' + err.message); }
    };
    reader.readAsText(file);
  };

  const runImport = async () => {
    if (!parsed?.contacts?.length) return;
    setImporting(true);
    try {
      const res = await importContacts(userId, parsed.contacts, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(res);
      setStep(3);
    } catch (e) {
      alert('Import failed: ' + (e.message || e));
    } finally { setImporting(false); }
  };

  const finish = () => {
    onComplete?.();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 600, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, padding: 28,
        border: `1px solid ${T.faintRule}`, boxShadow: T.shadow,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.01em' }}>Import contacts</h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk,
            cursor: 'pointer', width: 28, height: 28, borderRadius: '50%',
          }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `1px solid ${T.faintRule}` }}>
          {[1,2,3].map(n => {
            const active = step === n;
            const done = step > n;
            return <div key={n} style={{
              flex: 1, padding: '10px 0', textAlign: 'center',
              fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
              color: active ? T.ink : done ? T.ink70 : T.fadedInk,
              borderBottom: active ? `2px solid ${T.ink}` : 'none',
              marginBottom: -1,
            }}>
              <span style={{
                display: 'inline-block', width: 18, height: 18, borderRadius: '50%',
                background: active ? T.ink : done ? T.ink70 : T.inkSoft,
                color: active || done ? T.paper : T.ink70,
                fontSize: 10, fontWeight: 700, lineHeight: '18px', marginRight: 8,
              }}>{n}</span>
              {n === 1 ? 'Upload' : n === 2 ? 'Review' : 'Done'}
            </div>;
          })}
        </div>

        {step === 1 && (
          <div>
            <div onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.inkSoft2; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; onFile(e.dataTransfer.files?.[0]); }}
              style={{
                border: `2px dashed ${T.faintRule}`, borderRadius: 10, padding: '40px 20px',
                textAlign: 'center', cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 28, color: T.fadedInk, marginBottom: 12 }}>↑</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 4 }}>Drop your CSV or click to choose</div>
              <div style={{ fontSize: 11, color: T.fadedInk }}>RocketReach and LinkedIn Connections exports detected automatically.</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
              onChange={e => onFile(e.target.files?.[0])}/>
          </div>
        )}

        {step === 2 && parsed && (
          <div>
            <div style={{ marginBottom: 16, fontSize: 12, color: T.ink70 }}>
              Detected <b style={{ color: T.ink }}>{parsed.source === 'rocketreach' ? 'RocketReach' : parsed.source === 'linkedin' ? 'LinkedIn' : 'generic CSV'}</b> format —
              <b style={{ color: T.ink }}> {parsed.count} rows</b> in <i>{parsed.fileName}</i>.
            </div>
            <div style={{ background: T.inkSoft2, borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: T.ink70, lineHeight: 1.55 }}>
              We'll match against existing contacts by <b>LinkedIn URL</b> first, then by <b>email</b>. Matches are merged (your notes/tags/status are never overwritten). Brand-new rows get status <b>prospect</b>.
            </div>
            {parsed.warnings?.length > 0 && (
              <div style={{ background: T.alertSoft, border: `1px solid ${T.alert}33`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: T.alert }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{parsed.warnings.length} duplicates within the file</div>
                <div style={{ opacity: .8, maxHeight: 80, overflow: 'auto' }}>{parsed.warnings.slice(0, 6).join(' · ')}{parsed.warnings.length > 6 ? ' …' : ''}</div>
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink70, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Preview · first 3 rows</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
              {parsed.contacts.slice(0, 3).map((c, i) => (
                <div key={i} style={{ padding: 12, border: `1px solid ${T.faintRule}`, borderRadius: 8, background: T.inkSoft2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{(c.first_name || '') + ' ' + (c.last_name || '')}</div>
                  <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2 }}>{c.email || '—'}</div>
                  <div style={{ fontSize: 11, color: T.ink70, marginTop: 6 }}>{c.title || '—'}</div>
                  <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2 }}>{c.company || '—'}</div>
                </div>
              ))}
            </div>
            {importing && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: T.ink70, marginBottom: 6 }}>Importing… {progress.done} of {progress.total}</div>
                <div style={{ height: 4, borderRadius: 2, background: T.inkSoft, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total * 100) : 0}%`, background: T.ink, transition: 'width .2s' }}/>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button onClick={() => setStep(1)} disabled={importing} style={btnGhost}>← Back</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} disabled={importing} style={btnGhost}>Cancel</button>
                <button onClick={runImport} disabled={importing} style={{ ...btnSolid, opacity: importing ? .5 : 1 }}>
                  {importing ? 'Importing…' : `Import ${parsed.count} contacts →`}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 16 }}>
              Done. <b>{result.created}</b> created, <b>{result.merged}</b> merged into existing contacts
              {result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ''}.
            </div>
            {result.errors.length > 0 && (
              <div style={{ background: T.alertSoft, border: `1px solid ${T.alert}33`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: T.alert }}>
                <b>{result.errors.length} errors:</b> {result.errors.slice(0, 3).map(e => e.message).join(' · ')}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={finish} style={btnSolid}>View contacts</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnSolid = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 700, fontFamily: T.sans,
  background: T.ink, color: T.paper,
};
const btnGhost = {
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
};

const NEW_TYPE_OPTIONS = [
  { id: '',         label: 'Type…' },
  { id: 'brand',    label: 'Brand' },
  { id: 'agency',   label: 'Agency' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'agent',    label: 'Agent' },
  { id: 'press',    label: 'Press' },
  { id: 'internal', label: 'Internal (me / team)' },
];
const NEW_STATUS_OPTIONS = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'active',   label: 'Active' },
  { id: 'past',     label: 'Past' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'press',    label: 'Press' },
];

function NewContactModal({ userId, onClose, onCreated }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    title: '', company: '', location: '', linkedin_url: '',
    contact_type: '', status: 'prospect',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const canSave = (form.first_name.trim() || form.last_name.trim() || form.email.trim()) && !saving;

  const onSave = async () => {
    setSaving(true); setError(null);
    try {
      const body = { ...form, sources: ['manual'] };
      // Trim + null-out empty strings so DB doesn't store ""
      Object.keys(body).forEach(k => {
        if (typeof body[k] === 'string') {
          const t = body[k].trim();
          body[k] = t === '' ? null : t;
        }
      });
      // Lowercase email for unique-index match
      if (body.email) body.email = body.email.toLowerCase();
      // Lowercase linkedin url for the same reason
      if (body.linkedin_url) body.linkedin_url = body.linkedin_url.toLowerCase().split('?')[0].replace(/\/$/, '');
      const created = await createContact(userId, body);
      if (!created) throw new Error('No contact returned');
      onCreated?.(created);
      onClose();
    } catch (e) {
      setError(e.message || 'Could not create');
    } finally { setSaving(false); }
  };

  const inp = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: `1px solid ${T.faintRule}`, background: T.paper,
    fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none',
  };
  const Field = ({ label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </div>
  );

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 600, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, padding: 28,
        border: `1px solid ${T.faintRule}`, boxShadow: T.shadow, fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.01em' }}>New contact</h2>
          <button onClick={onClose} disabled={saving} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: saving ? 'wait' : 'pointer', width: 28, height: 28 }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
          <Field label="First name"><input autoFocus value={form.first_name} onChange={e => update('first_name', e.target.value)} style={inp}/></Field>
          <Field label="Last name"><input value={form.last_name} onChange={e => update('last_name', e.target.value)} style={inp}/></Field>
          <Field label="Email"><input value={form.email} onChange={e => update('email', e.target.value)} placeholder="name@company.com" style={inp}/></Field>
          <Field label="Phone"><input value={form.phone} onChange={e => update('phone', e.target.value)} style={inp}/></Field>
          <Field label="Title"><input value={form.title} onChange={e => update('title', e.target.value)} style={inp}/></Field>
          <Field label="Company"><input value={form.company} onChange={e => update('company', e.target.value)} style={inp}/></Field>
          <Field label="Location"><input value={form.location} onChange={e => update('location', e.target.value)} style={inp}/></Field>
          <Field label="LinkedIn URL"><input value={form.linkedin_url} onChange={e => update('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" style={inp}/></Field>
          <Field label="Type">
            <select value={form.contact_type} onChange={e => update('contact_type', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {NEW_TYPE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e => update('status', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {NEW_STATUS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 11, color: T.fadedInk, lineHeight: 1.55 }}>
          At least one of first name, last name, or email is required. Anything else is optional — add later from the contact detail drawer.
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancel</button>
          <button onClick={onSave} disabled={!canSave} style={{ ...btnSolid, opacity: canSave ? 1 : .4, cursor: canSave ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : 'Add contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LookupModal({ userId, onClose, onCreated }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  const lookup = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null); setProfile(null);
    try {
      const isLinkedIn = q.includes('linkedin.com');
      const isEmail = q.includes('@') && !isLinkedIn;
      const body = isLinkedIn ? { linkedin_url: q } : isEmail ? { email: q } : { name: q };
      const { profile, status } = await rocketReachLookup(body);
      if (!profile || (!profile.first_name && !profile.email && !profile.linkedin_url)) {
        setError(status === 'queued' || status === 'searching'
          ? 'RocketReach is still searching — try again in a minute.'
          : 'No matching profile found.');
      } else {
        setProfile(profile);
      }
    } catch (e) {
      setError(e.message || 'Lookup failed');
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const created = await createContact(userId, { ...profile, status: 'prospect' });
      onCreated?.(created);
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, padding: 28,
        border: `1px solid ${T.faintRule}`, boxShadow: T.shadow, fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.01em' }}>Lookup a contact</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: 'pointer', width: 28, height: 28 }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: T.ink70, lineHeight: 1.5, marginBottom: 14 }}>
          Paste a <b>LinkedIn URL</b>, an <b>email</b>, or a <b>name</b> — RocketReach finds the rest.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
            placeholder="https://linkedin.com/in/… or sarah@brand.com"
            autoFocus
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${T.faintRule}`, background: T.inkSoft2,
              color: T.ink, fontSize: 13, fontFamily: T.sans, outline: 'none',
            }}
          />
          <button onClick={lookup} disabled={loading || !query.trim()} style={{
            ...btnSolid, opacity: loading || !query.trim() ? .5 : 1,
            cursor: loading || !query.trim() ? 'default' : 'pointer',
          }}>{loading ? 'Looking up…' : 'Lookup'}</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: T.alertSoft, border: `1px solid ${T.alert}33`, borderRadius: 8, color: T.alert, fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {profile && (
          <div style={{ border: `1px solid ${T.faintRule}`, borderRadius: 10, padding: 18, background: T.inkSoft2, marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
              {(profile.first_name || '') + ' ' + (profile.last_name || '')}
            </div>
            <div style={{ fontSize: 12, color: T.ink70, marginBottom: 12 }}>
              {profile.title ? <b>{profile.title}</b> : null}{profile.title && profile.company ? ' · ' : ''}{profile.company || ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
              {profile.email && <Field label="Email" value={profile.email}/>}
              {profile.phone && <Field label="Phone" value={profile.phone}/>}
              {profile.location && <Field label="Location" value={profile.location}/>}
              {profile.linkedin_url && <Field label="LinkedIn" value={profile.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}/>}
              {profile.company_url && <Field label="Company URL" value={profile.company_url.replace(/^https?:\/\/(www\.)?/, '')}/>}
            </div>
            {profile.bio && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.faintRule}`, fontSize: 12, color: T.ink70, lineHeight: 1.55 }}>
                {profile.bio.length > 280 ? profile.bio.slice(0, 280) + '…' : profile.bio}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={loading} style={btnGhost}>Cancel</button>
          {profile && (
            <button onClick={save} disabled={loading} style={{ ...btnSolid, opacity: loading ? .5 : 1 }}>
              {loading ? 'Saving…' : 'Add to CRM →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

// Company logo via Google's favicon service. Free, no auth, returns
// a square favicon at the requested size. Falls back to a sapphire
// initial-letter tile when the favicon doesn't exist for the domain.
function CompanyLogo({ cluster, size = 36 }) {
  const domain = cluster.emailDomain || (cluster.contacts[0]?.company_url || '')
    .replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase() || null;
  const [errored, setErrored] = useState(false);
  const letter = (cluster.canonical || '?').charAt(0).toUpperCase();

  if (!domain || errored) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 6, background: T.inkSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size < 32 ? 13 : 16, fontWeight: 700, color: T.ink,
        border: `1px solid ${T.faintRule}`, flexShrink: 0,
      }}>{letter}</div>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size, height: size, borderRadius: 6, objectFit: 'cover',
        border: `1px solid ${T.faintRule}`, background: T.paper, flexShrink: 0,
      }}
    />
  );
}

function CompanyCard({ cluster, selected, onClick }) {
  const STAGE_ORDER = ['active', 'pitching', 'prospect', 'vendor', 'press', 'past'];
  const orderedStages = STAGE_ORDER.filter(s => cluster.stages.includes(s));
  const lastSeen = cluster.lastContactedAt
    ? relativeDays(cluster.lastContactedAt)
    : null;
  return (
    <div onClick={onClick} style={{
      padding: '16px 18px',
      border: `1px solid ${selected ? T.ink : T.faintRule}`,
      background: selected ? T.inkSoft2 : T.paper,
      borderRadius: 10, cursor: 'pointer',
      transition: 'all .18s',
      display: 'flex', flexDirection: 'column', gap: 10,
      fontFamily: T.sans,
    }}
    onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(15,82,186,.08)'; } }}
    onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CompanyLogo cluster={cluster} size={36}/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '-.003em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cluster.canonical || <i style={{ opacity: .55, fontWeight: 400 }}>No company</i>}
          </div>
          {cluster.aliases.length > 0 && (
            <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Also: ${cluster.aliases.join(' · ')}`}>
              also: {cluster.aliases.join(' · ')}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.ink70, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {cluster.count}
        </div>
      </div>

      {orderedStages.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {orderedStages.map(s => <StatusBadge key={s} status={s}/>)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.fadedInk }}>
        <span>{cluster.count} contact{cluster.count === 1 ? '' : 's'}</span>
        <span>{lastSeen || '—'}</span>
      </div>
    </div>
  );
}

function relativeDays(iso) {
  if (!iso) return null;
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return diff + 'd ago';
  if (diff < 30) return Math.round(diff / 7) + 'w ago';
  if (diff < 365) return Math.round(diff / 30) + 'mo ago';
  return Math.round(diff / 365) + 'y ago';
}

function CompanyDetail({ cluster, onClose, onRefreshContact, refreshingId, onDeleteCompany, deletingCompany, onOpenContact }) {
  return (
    <div data-company-detail style={{
      marginTop: 24, border: `1px solid ${T.faintRule}`, borderRadius: 10, overflow: 'hidden', background: T.paper,
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
      <div>
        {cluster.contacts.map(c => (
          <ContactRow
            key={c.id} c={c}
            onClick={() => onOpenContact?.(c.id)}
            onRefresh={onRefreshContact}
            refreshing={refreshingId === c.id}
          />
        ))}
      </div>
    </div>
  );
}

const FIELD_LABELS = {
  first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Phone',
  title: 'Title', company: 'Company', company_url: 'Company URL',
  location: 'Location', linkedin_url: 'LinkedIn', avatar_url: 'Photo',
};

function RefreshPreviewModal({ contact, patch, onCancel, onApply, applying }) {
  const fields = Object.keys(FIELD_LABELS).filter(k => k in patch);
  const noChanges = fields.length === 0;
  // Per-row selection: default = all checked. User can uncheck a row
  // to keep that field's current value.
  const [selected, setSelected] = useState(() => new Set(fields));
  // Reset selection when patch changes (re-opening the modal on a new contact)
  useEffect(() => { setSelected(new Set(fields)); /* eslint-disable-next-line */ }, [Object.keys(patch).sort().join(',')]);

  const toggleField = (k) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const setAll = (on) => setSelected(on ? new Set(fields) : new Set());
  const selectedCount = selected.size;

  // Render the value cell — image thumbnail for photo, text otherwise
  const renderValue = (k, value, isCurrent) => {
    if (k === 'avatar_url' && value) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={value} alt="" style={{
            width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
            border: `1px solid ${T.faintRule}`,
            opacity: isCurrent ? .5 : 1, filter: isCurrent ? 'grayscale(1)' : 'none',
          }}/>
          <span style={{ fontSize: 10, color: isCurrent ? T.fadedInk : T.ink70, wordBreak: 'break-all' }}>
            {value.length > 40 ? value.slice(0, 40) + '…' : value}
          </span>
        </div>
      );
    }
    if (!value) return <i style={{ opacity: .55, fontWeight: 400 }}>empty</i>;
    return value;
  };

  const buildFilteredPatch = () => {
    const out = {};
    for (const k of selected) out[k] = patch[k];
    return out;
  };

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 720, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, padding: 28,
        border: `1px solid ${T.faintRule}`, boxShadow: T.shadow, fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 6 }}>Review refresh</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.012em' }}>
              {(contact.first_name || '') + ' ' + (contact.last_name || '')}
            </h2>
            <div style={{ fontSize: 12, color: T.fadedInk, marginTop: 2 }}>
              From RocketReach. Tick only the fields you want to update — others stay as they are.
            </div>
          </div>
          <button onClick={onCancel} disabled={applying} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: applying ? 'wait' : 'pointer', width: 28, height: 28 }}>×</button>
        </div>

        {noChanges ? (
          <div style={{
            marginTop: 18, padding: '18px 16px', borderRadius: 10,
            background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
            fontSize: 13, color: T.ink, lineHeight: 1.55,
          }}>
            <b>Nothing to update.</b> RocketReach's data matches what you already have in Morgan.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 18, marginBottom: 6, display: 'flex', gap: 8 }}>
              <button onClick={() => setAll(true)} disabled={applying} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70, cursor: 'pointer',
              }}>Select all</button>
              <button onClick={() => setAll(false)} disabled={applying} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70, cursor: 'pointer',
              }}>Clear all</button>
            </div>
            <div style={{ border: `1px solid ${T.faintRule}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '28px 110px 1fr 1fr',
                gap: 16, padding: '10px 14px',
                background: T.inkSoft2, borderBottom: `1px solid ${T.faintRule}`,
                fontSize: 9, fontWeight: 700, color: T.ink70, letterSpacing: '.10em', textTransform: 'uppercase',
              }}>
                <div></div><div>Field</div><div>Current</div><div>New</div>
              </div>
              {fields.map(k => {
                const checked = selected.has(k);
                return (
                  <label key={k} style={{
                    display: 'grid', gridTemplateColumns: '28px 110px 1fr 1fr',
                    gap: 16, padding: '12px 14px',
                    borderBottom: `1px solid ${T.faintRule}`, alignItems: 'center',
                    cursor: 'pointer', background: checked ? T.paper : T.inkSoft2,
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleField(k)}
                      disabled={applying}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0F52BA' }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 600, color: checked ? T.ink70 : T.fadedInk }}>{FIELD_LABELS[k]}</div>
                    <div style={{ fontSize: 12, color: contact[k] ? T.fadedInk : T.ink25, textDecoration: (contact[k] && checked) ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                      {renderValue(k, contact[k], true)}
                    </div>
                    <div style={{ fontSize: 12, color: checked ? T.ink : T.fadedInk, fontWeight: checked ? 500 : 400, wordBreak: 'break-word' }}>
                      {renderValue(k, patch[k], false)}
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 8,
          background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
          fontSize: 11, color: T.ink70, lineHeight: 1.6,
        }}>
          <b style={{ color: T.ink }}>Untouched no matter what you pick:</b> your notes, tags, status, and any field not listed above. Only the ticked rows would change.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} disabled={applying} style={{ ...btnGhost, opacity: applying ? .5 : 1 }}>Cancel</button>
          {!noChanges && (
            <button onClick={() => onApply(buildFilteredPatch())} disabled={applying || selectedCount === 0} style={{
              ...btnSolid,
              opacity: (applying || selectedCount === 0) ? .5 : 1,
              cursor: (applying || selectedCount === 0) ? 'default' : 'pointer',
            }}>
              {applying ? 'Applying…' : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Stats / priorities panel — what to focus on right now.
// 1. Active pitches → list of pitching-status contacts with company
// 2. Top companies → top 4 clusters by contact count
// 3. Going cold → contacts not touched in 90+ days
// 4. Total → quick orientation
function StatsCards({ contacts, clusters, onFilter, onPickCompany }) {
  const stats = useMemo(() => {
    const pitching = contacts.filter(c => (c.status || 'prospect') === 'pitching');
    const active = contacts.filter(c => (c.status || 'prospect') === 'active');
    const ninetyDaysAgo = Date.now() - 90 * 86400000;
    const goingCold = contacts.filter(c => {
      const stage = c.status || 'prospect';
      if (stage === 'past' || stage === 'vendor') return false;
      if (!c.last_contacted_at) return false; // no signal — don't count
      return new Date(c.last_contacted_at).getTime() < ninetyDaysAgo;
    });
    // Filter out "Freelance" / "Self-Employed" / "Consultant" etc. from
    // priority surfaces — they're not real prospects, just labels on
    // independent contacts.
    // Filter out independent (Freelance / Self-Employed) AND internal
    // (your own team) contacts from priority surfaces — neither are
    // real prospects.
    const realContacts = contacts.filter(c => c.contact_type !== 'internal');
    return {
      total: realContacts.length,
      companyCount: clusters.filter(cl => !cl.isInternal).length,
      pitching: pitching.slice(0, 4),
      pitchingTotal: pitching.length,
      active: active.length,
      topCompanies: clusters.filter(cl => !cl.isIndependent && !cl.isInternal).slice(0, 4),
      goingCold: goingCold.length,
    };
  }, [contacts, clusters]);

  const baseCard = {
    padding: '14px 16px', borderRadius: 10,
    border: `1px solid ${T.faintRule}`, background: T.paper,
    transition: 'all .18s', cursor: 'pointer', fontFamily: T.sans,
    minHeight: 132, display: 'flex', flexDirection: 'column',
  };
  const label = { fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.ink70, marginBottom: 8 };
  const bigValue = { fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: '-.018em', lineHeight: 1 };
  const sub = { fontSize: 11, color: T.fadedInk, marginTop: 6 };
  const listRow = { display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8, padding: '2px 0' };

  const hover = on => e => {
    e.currentTarget.style.borderColor = on ? T.ink : T.faintRule;
    e.currentTarget.style.transform = on ? 'translateY(-1px)' : 'none';
    e.currentTarget.style.boxShadow = on ? '0 6px 18px rgba(15,82,186,.06)' : 'none';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20, marginBottom: 4 }}>
      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => onFilter('all')}>
        <div style={label}>Total</div>
        <div style={bigValue}>{stats.total}</div>
        <div style={sub}>across {stats.companyCount} compan{stats.companyCount === 1 ? 'y' : 'ies'}</div>
      </div>

      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => onFilter('pitching')}>
        <div style={label}>Active pitches <span style={{ color: T.ink, fontWeight: 800 }}>{stats.pitchingTotal}</span></div>
        {stats.pitching.length === 0 ? (
          <div style={{ ...sub, marginTop: 4 }}>No active pitches.</div>
        ) : (
          <div style={{ marginTop: 4 }}>
            {stats.pitching.map(c => (
              <div key={c.id} style={listRow}>
                <span style={{ color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {c.company || '—'}
                </span>
                <span style={{ color: T.fadedInk, whiteSpace: 'nowrap' }}>
                  {(c.first_name || '') + (c.last_name ? ' ' + c.last_name[0] + '.' : '')}
                </span>
              </div>
            ))}
            {stats.pitchingTotal > stats.pitching.length && (
              <div style={{ ...sub, marginTop: 6 }}>+ {stats.pitchingTotal - stats.pitching.length} more</div>
            )}
          </div>
        )}
      </div>

      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>
        <div style={label}>Top companies</div>
        {stats.topCompanies.length === 0 ? (
          <div style={{ ...sub, marginTop: 4 }}>No companies yet.</div>
        ) : (
          <div style={{ marginTop: 4 }}>
            {stats.topCompanies.map(cl => (
              <div key={cl.canonical} style={listRow}
                onClick={e => { e.stopPropagation(); onPickCompany(cl.canonical); }}>
                <span style={{ color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {cl.canonical || <i style={{ opacity: .55 }}>No company</i>}
                </span>
                <span style={{ color: T.fadedInk, fontWeight: 600, whiteSpace: 'nowrap' }}>{cl.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>
        <div style={label}>Going cold</div>
        <div style={bigValue}>{stats.goingCold}</div>
        <div style={sub}>no contact in 90+ days{stats.goingCold === 0 ? '' : ' · follow up'}</div>
      </div>
    </div>
  );
}

function ContactsView({ user, onBack, onLogout, accessToken, projects = [] }) {
  const userId = user?.user_id || user?.id;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [backfillingAvatars, setBackfillingAvatars] = useState(false);

  const onBackfillAvatars = useCallback(async () => {
    if (backfillingAvatars) return;
    setBackfillingAvatars(true);
    setSyncStatus('Backfilling profile photos from RocketReach…');
    try {
      const r = await backfillAvatarsFromRocketReach();
      setSyncStatus(`Photos backfilled. ${r.updated} updated · ${r.alreadyHad} already had one · ${r.noImage} no photo on file · ${r.noMatch} no CRM match.`);
      await reload();
    } catch (e) {
      setSyncStatus('Backfill failed: ' + (e.message || 'unknown'));
    } finally {
      setBackfillingAvatars(false);
      setTimeout(() => setSyncStatus(''), 10000);
    }
  }, [backfillingAvatars, reload]);
  // Preview state for the per-row refresh confirmation modal
  const [refreshPreview, setRefreshPreview] = useState(null); // { contact, patch }
  const [applyingRefresh, setApplyingRefresh] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listContacts({ limit: 1000 });
      setContacts(rows);
    } catch (e) {
      console.error('[contacts] load failed:', e.message || e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Auto-sync from RocketReach on first visit so the list reflects any
  // contacts you saved via the LinkedIn extension since you were last
  // here. Runs once per session — the cron handles ongoing background
  // sync. The button stays as a manual force-refresh.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current || !userId) return;
    autoSyncedRef.current = true;
    onSyncRocketReachSilent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onSyncRocketReachSilent = useCallback(async () => {
    try {
      const result = await syncRocketReachContacts(userId);
      if ((result.created || 0) > 0 || (result.merged || 0) > 0) {
        await reload();
      }
    } catch (e) {
      // Silent — the manual sync button is there if anything's wrong
      console.warn('[contacts] auto-sync failed:', e?.message || e);
    }
  }, [userId, reload]);

  const onSyncRocketReach = useCallback(async () => {
    if (syncing) return;
    setSyncing(true); setSyncStatus('Fetching from RocketReach…');
    try {
      const result = await syncRocketReachContacts(userId, {
        onProgress: (page, seen) => setSyncStatus(`Fetched page ${page} · ${seen} contacts`),
      });
      setSyncStatus(`Synced. ${result.created} new, ${result.merged} merged${result.skipped?.length ? `, ${result.skipped.length} skipped` : ''}.`);
      await reload();
    } catch (e) {
      setSyncStatus('Sync failed: ' + (e.message || 'unknown'));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus(''), 6000);
    }
  }, [userId, syncing, reload]);

  // Two-step refresh: fetch + preview, then user confirms apply.
  const onRefreshContact = useCallback(async (contact) => {
    setRefreshingId(contact.id);
    try {
      const { patch } = await previewReenrich(contact);
      // Always open the preview so the user gets explicit feedback —
      // even when there's nothing to change, the modal will say so.
      setRefreshPreview({ contact, patch });
    } catch (e) {
      alert('Refresh failed: ' + (e.message || 'unknown'));
    } finally { setRefreshingId(null); }
  }, []);

  const onApplyRefresh = useCallback(async (selectedPatch) => {
    if (!refreshPreview) return;
    const { contact, patch } = refreshPreview;
    const effective = selectedPatch || patch; // fall back to full if not supplied
    if (!effective || !Object.keys(effective).length) { setRefreshPreview(null); return; }
    setApplyingRefresh(true);
    try {
      await applyReenrichPatch(contact.id, effective);
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, ...effective } : c));
      setRefreshPreview(null);
    } catch (e) {
      alert('Could not apply changes: ' + (e.message || 'unknown'));
    } finally { setApplyingRefresh(false); }
  }, [refreshPreview]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(c => {
      if (filter !== 'all' && (c.status || 'prospect') !== filter) return false;
      if (!q) return true;
      const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, filter, search]);

  // Cluster filtered contacts into companies. Dedup logic in
  // companyDedup.js — normalizes names (Volvo Cars vs Volvo Car USA)
  // and merges by email domain. Recomputed on every render so newly
  // synced contacts automatically join the right cluster.
  // Default order is by count (used by stats panel for "top companies").
  const clusters = useMemo(() => clusterByCompany(filtered), [filtered]);
  // Main grid uses alphabetical order — easier to scan when you know
  // who you're looking for. Stats panel still highlights priorities
  // (top by count, active pitches, going cold) above the grid.
  const clustersAlpha = useMemo(() =>
    [...clusters].sort((a, b) =>
      (a.canonical || '').toLowerCase().localeCompare((b.canonical || '').toLowerCase())
    ),
    [clusters]
  );

  // Keep the selected company by canonical name so re-renders don't
  // lose the selection when the underlying cluster array changes.
  const [selectedCanonical, setSelectedCanonical] = useState(null);
  const selectedCluster = useMemo(
    () => clusters.find(cl => cl.canonical === selectedCanonical) || null,
    [clusters, selectedCanonical]
  );
  // 412 cards is too many to render or scan. Default to top 10 by
  // contact count (priorities), with a "Show all" toggle that expands
  // to the full A–Z list. A live search query bypasses the limit —
  // when you're hunting for something specific, see everything that
  // matches.
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const TOP_COUNT = 10;
  // Detail drawer state — open a contact by id, drawer reads/updates
  // and lifts changes back into the local list so the UI stays fresh.
  const [openContactId, setOpenContactId] = useState(null);
  const openContact = useMemo(
    () => contacts.find(c => c.id === openContactId) || null,
    [contacts, openContactId]
  );

  const counts = useMemo(() => {
    const by = { all: contacts.length };
    contacts.forEach(c => { const s = c.status || 'prospect'; by[s] = (by[s] || 0) + 1; });
    return by;
  }, [contacts]);

  return (
    <div style={{ height: '100vh', background: T.bg, fontFamily: T.sans, overflow: 'auto' }}>
      <div style={{ height: 1, background: T.faintRule }}/>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '36px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={onBack} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 0, fontSize: 14, color: T.fadedInk, fontFamily: T.sans,
            }}>← Dashboard</button>
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

        {/* Page heading */}
        <div style={{ marginBottom: 8, marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink, marginBottom: 14 }}>CRM · Personal</div>
          <h1 style={{ fontSize: 'clamp(34px,5.4vw,56px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.022em', lineHeight: 1, margin: 0 }}>Contacts</h1>
          <div style={{ fontSize: 13, color: T.fadedInk, marginTop: 4 }}>
            {loading ? 'Loading…' : `${counts.all} contact${counts.all === 1 ? '' : 's'}`}
          </div>
        </div>

        {/* Priorities — stats above the company grid */}
        {!loading && contacts.length > 0 && (
          <StatsCards
            contacts={contacts}
            clusters={clusters}
            onFilter={(f) => setFilter(f)}
            onPickCompany={(canonical) => {
              setSelectedCanonical(canonical);
              setTimeout(() => {
                const el = document.querySelector('[data-company-detail]');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 50);
            }}
          />
        )}

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', flexWrap: 'wrap',
          borderTop: `1px solid ${T.faintRule}`, borderBottom: `1px solid ${T.faintRule}`,
        }}>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: T.inkSoft2 }}>
            <span style={{ fontSize: 12, color: T.fadedInk }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company, email, title…"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: T.ink, fontFamily: T.sans }}/>
          </div>
          {STATUS_OPTIONS.map(s => {
            const active = filter === s.id;
            const c = s.id === 'all' ? counts.all : counts[s.id] || 0;
            return <button key={s.id} onClick={() => setFilter(s.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
              fontSize: 11, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer',
              background: active ? T.ink : 'transparent',
              color: active ? T.paper : T.ink70,
              border: `1px solid ${active ? T.ink : T.faintRule}`,
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}>{s.label} <span style={{ opacity: .7, fontSize: 10 }}>{c}</span></button>;
          })}
          <button onClick={onSyncRocketReach} disabled={syncing} style={{ ...btnGhost, opacity: syncing ? .5 : 1, cursor: syncing ? 'wait' : 'pointer' }}>
            {syncing ? 'Syncing…' : '↻ Sync RocketReach'}
          </button>
          <button onClick={onBackfillAvatars} disabled={backfillingAvatars} style={{ ...btnGhost, opacity: backfillingAvatars ? .5 : 1, cursor: backfillingAvatars ? 'wait' : 'pointer' }}>
            {backfillingAvatars ? 'Backfilling…' : '📷 Backfill photos'}
          </button>
          <button onClick={() => setShowImport(true)} style={btnGhost}>↑ Import CSV</button>
          <button onClick={() => setShowNewContact(true)} style={btnSolid}>＋ New contact</button>
        </div>

        {/* Companies grid */}
        <div style={{ marginTop: 20 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>Loading contacts…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12, border: `1px dashed ${T.faintRule}`, borderRadius: 10 }}>
              {contacts.length === 0
                ? <>No contacts yet. <button onClick={() => setShowImport(true)} style={{ ...btnGhost, padding: '6px 14px' }}>Import a CSV</button> to get started.</>
                : 'No contacts match this filter.'}
            </div>
          ) : (
            <>
              {(() => {
                const searching = search.trim().length > 0;
                const showingAll = showAllCompanies || searching;
                // Top 10 by count when collapsed — exclude independent
                // (freelance, self-employed, etc.) AND internal (your
                // own team) clusters since neither are real prospects.
                // They're still browsable in the A–Z view and via search.
                const topCompanies = clusters.filter(cl => !cl.isIndependent && !cl.isInternal);
                const visible = showingAll ? clustersAlpha : topCompanies.slice(0, TOP_COUNT);
                const hidden = clustersAlpha.length - visible.length;
                const independentCount = clusters.filter(cl => cl.isIndependent)
                  .reduce((n, cl) => n + cl.count, 0);
                return (
                  <>
                    <div style={{ fontSize: 11, color: T.fadedInk, marginBottom: 12 }}>
                      {showingAll
                        ? <>{clustersAlpha.length} compan{clustersAlpha.length === 1 ? 'y' : 'ies'} · {filtered.length} contact{filtered.length === 1 ? '' : 's'} · A–Z</>
                        : <>Top {visible.length} of {topCompanies.length} compan{topCompanies.length === 1 ? 'y' : 'ies'} · ranked by contact count{independentCount > 0 ? ` · ${independentCount} independent contact${independentCount === 1 ? '' : 's'} hidden` : ''}</>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                      {visible.map(cl => (
                        <CompanyCard
                          key={cl.canonical + ':' + cl.count}
                          cluster={cl}
                          selected={selectedCanonical === cl.canonical}
                          onClick={() => setSelectedCanonical(selectedCanonical === cl.canonical ? null : cl.canonical)}
                        />
                      ))}
                    </div>
                    {!showingAll && hidden > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <button onClick={() => setShowAllCompanies(true)} style={{
                          padding: '8px 18px', borderRadius: 999,
                          background: 'transparent', border: `1px solid ${T.faintRule}`,
                          color: T.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
                          transition: 'all .18s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.inkSoft; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; }}
                        >Show all {clusters.length} companies (A–Z)</button>
                      </div>
                    )}
                    {showingAll && !searching && clusters.length > TOP_COUNT && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <button onClick={() => setShowAllCompanies(false)} style={{
                          padding: '8px 18px', borderRadius: 999,
                          background: 'transparent', border: `1px solid ${T.faintRule}`,
                          color: T.fadedInk, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
                        }}>Collapse to top {TOP_COUNT}</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}

          {selectedCluster && (
            <CompanyDetail
              cluster={selectedCluster}
              onClose={() => setSelectedCanonical(null)}
              onRefreshContact={onRefreshContact}
              refreshingId={refreshingId}
              onOpenContact={(id) => setOpenContactId(id)}
              deletingCompany={deletingCompany}
              onDeleteCompany={async () => {
                const n = selectedCluster.contacts.length;
                const name = selectedCluster.canonical || 'No company';
                if (!confirm(`Delete all ${n} contact${n === 1 ? '' : 's'} at "${name}"? This can't be undone.`)) return;
                setDeletingCompany(true);
                try {
                  // Parallel delete; restFetch handles auth + RLS.
                  await Promise.all(selectedCluster.contacts.map(c => deleteContact(c.id)));
                  const idsToRemove = new Set(selectedCluster.contacts.map(c => c.id));
                  setContacts(prev => prev.filter(c => !idsToRemove.has(c.id)));
                  setSelectedCanonical(null);
                } catch (e) {
                  alert('Delete failed: ' + (e.message || 'unknown'));
                } finally { setDeletingCompany(false); }
              }}
            />
          )}
        </div>

        {syncStatus && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: T.inkSoft, border: `1px solid ${T.faintRule}`, color: T.ink, fontSize: 12, fontWeight: 500 }}>
            {syncStatus}
          </div>
        )}
        <div style={{ marginTop: 16, padding: '14px 18px', borderRadius: 10, border: `1px dashed ${T.faintRule}`, color: T.fadedInk, fontSize: 12, lineHeight: 1.55 }}>
          <b style={{ color: T.ink }}>Company dedup.</b> Variants like "Volvo Cars" / "Volvo Car USA" and "Mattel" / "Mattel, Inc." merge automatically based on name normalization + email-domain matching. New contacts join the right cluster on the next render — no manual cleanup needed.
        </div>
      </div>

      {showImport && <ImportWizard userId={userId} onClose={() => setShowImport(false)} onComplete={reload}/>}
      {showNewContact && (
        <NewContactModal
          userId={userId}
          onClose={() => setShowNewContact(false)}
          onCreated={(c) => {
            setContacts(prev => [c, ...prev]);
            setOpenContactId(c.id);
          }}
        />
      )}
      {refreshPreview && (
        <RefreshPreviewModal
          contact={refreshPreview.contact}
          patch={refreshPreview.patch}
          applying={applyingRefresh}
          onCancel={() => !applyingRefresh && setRefreshPreview(null)}
          onApply={onApplyRefresh}
        />
      )}
      {openContact && (
        <ContactDetailDrawer
          contact={openContact}
          projects={projects}
          userId={userId}
          onClose={() => setOpenContactId(null)}
          onUpdate={(updated) => {
            setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
          }}
          onDelete={(id) => {
            setContacts(prev => prev.filter(c => c.id !== id));
          }}
        />
      )}
    </div>
  );
}

export default ContactsView;
