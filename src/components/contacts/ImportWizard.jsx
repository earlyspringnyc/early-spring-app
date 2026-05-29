import { useState, useRef } from 'react';
import T from '../../theme/tokens.js';
import { importContacts } from '../../lib/contacts.js';
import { parseContactsCSV } from '../../utils/csvImport.js';

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

export default ImportWizard;
