import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { LogOutI, PlusI } from '../components/icons/index.js';
import {
  listContacts, createContact, updateContact, deleteContact, importContacts,
} from '../lib/contacts.js';
import { parseContactsCSV } from '../utils/csvImport.js';

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

function ContactRow({ c, onClick }) {
  const initials = ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase();
  const lastDate = c.last_contacted_at ? new Date(c.last_contacted_at) : null;
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '32px 2fr 1.6fr 1.4fr 1.2fr 1fr 24px',
      gap: 16, alignItems: 'center', padding: '12px 18px',
      borderBottom: `1px solid ${T.faintRule}`, cursor: 'pointer',
      transition: 'background .15s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = T.inkSoft}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: T.inkSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: T.ink,
        border: `1px solid ${T.faintRule}`,
      }}>{initials || '?'}</div>
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
      <div style={{ fontSize: 11, color: T.fadedInk, textAlign: 'right' }}>›</div>
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

function ContactsView({ user, onBack, onLogout, accessToken }) {
  const userId = user?.user_id || user?.id;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(c => {
      if (filter !== 'all' && (c.status || 'prospect') !== filter) return false;
      if (!q) return true;
      const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, filter, search]);

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
        <div style={{ marginBottom: 24, marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink, marginBottom: 14 }}>CRM · Personal</div>
          <h1 style={{ fontSize: 'clamp(34px,5.4vw,56px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.022em', lineHeight: 1, margin: 0 }}>Contacts</h1>
          <div style={{ fontSize: 13, color: T.fadedInk, marginTop: 4 }}>
            {loading ? 'Loading…' : `${counts.all} contact${counts.all === 1 ? '' : 's'}`}
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
          <button onClick={() => setShowImport(true)} style={btnGhost}>↑ Import CSV</button>
          <button onClick={() => alert('Coming next — for now, drop a CSV.')} style={btnSolid}>＋ New Contact</button>
        </div>

        {/* Table */}
        <div style={{ marginTop: 20, border: `1px solid ${T.faintRule}`, borderRadius: 10, overflow: 'hidden', background: T.paper }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '32px 2fr 1.6fr 1.4fr 1.2fr 1fr 24px',
            gap: 16, padding: '12px 18px', background: T.inkSoft2,
            borderBottom: `1px solid ${T.faintRule}`,
            fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink70,
          }}>
            <div></div><div>Name</div><div>Company</div><div>Title</div><div>Location</div><div>Status</div><div></div>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>Loading contacts…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>
              {contacts.length === 0
                ? <>No contacts yet. <button onClick={() => setShowImport(true)} style={{ ...btnGhost, padding: '6px 14px' }}>Import a CSV</button> to get started.</>
                : 'No contacts match this filter.'}
            </div>
          ) : (
            filtered.map(c => <ContactRow key={c.id} c={c} onClick={() => alert('Detail drawer coming next — Phase 1B.')}/>)
          )}
        </div>

        <div style={{ marginTop: 16, padding: '14px 18px', borderRadius: 10, border: `1px dashed ${T.faintRule}`, color: T.fadedInk, fontSize: 12, lineHeight: 1.55 }}>
          <b style={{ color: T.ink }}>Phase 1A.</b> Schema + import + browse. Coming next: contact detail with notes &amp; project linking, then Gmail thread sync, then Fireflies meeting routing.
        </div>
      </div>

      {showImport && <ImportWizard userId={userId} onClose={() => setShowImport(false)} onComplete={reload}/>}
    </div>
  );
}

export default ContactsView;
