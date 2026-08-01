import { useState, useRef } from 'react';
import T from '../../theme/tokens.js';
import { getSession } from '../../lib/db.js';

// Bulk-import AP/AR rows from an XLS / XLSX file. Flow:
//   1. Pick a file → parse first sheet to rows.
//   2. Detect header row + map common columns (vendor, amount, due,
//      description) heuristically. User confirms / overrides.
//   3. Server-side Claude pass: every row gets a suggested category
//      + confidence tag.
//   4. Editable preview table — Jennifer fixes whatever Claude got
//      wrong (column dropdowns make this fast), unchecks rows she
//      doesn't want, then clicks Save.
//   5. Parent component (BooksView) receives the cleaned rows and
//      bulk-inserts into org_invoices.

const CATEGORIES = [
  { id: 'project',               label: 'Project' },
  { id: 'staffing',              label: 'Staffing' },
  { id: 'rent',                  label: 'Rent' },
  { id: 'utilities',             label: 'Utilities' },
  { id: 'expenses',              label: 'Office Expenses' },
  { id: 'vehicle',               label: 'Vehicle' },
  { id: 'professional_services', label: 'Professional' },
  { id: 'taxes',                 label: 'Taxes' },
  { id: 'other',                 label: 'Other' },
  { id: 'uncategorized',         label: 'Uncategorized' },
];

const HEADER_HINTS = {
  counterparty: ['vendor', 'payee', 'client', 'company', 'name', 'who', 'from'],
  amount:       ['amount', 'total', 'cost', 'price', 'value', 'paid', '$'],
  notes:        ['description', 'memo', 'notes', 'item', 'detail', 'purpose', 'for'],
  due_date:     ['due', 'date', 'pay by', 'invoice date', 'when'],
  invoice_number: ['invoice', 'inv #', 'inv no', 'number', 'ref'],
};

function pickColumn(headerCells, kind) {
  const hints = HEADER_HINTS[kind] || [];
  for (let i = 0; i < headerCells.length; i++) {
    const h = String(headerCells[i] || '').toLowerCase().trim();
    if (!h) continue;
    if (hints.some(hint => h.includes(hint))) return i;
  }
  return -1;
}

function parseDateCell(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D/YYYY → YYYY-MM-DD
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3], 10); if (yr < 100) yr += 2000;
    return `${yr}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  // Excel serial date → JS date
  const serial = Number(s);
  if (!isNaN(serial) && serial > 30000 && serial < 80000) {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

export default function InvoiceImportModal({ kind = 'ap', projects = [], onClose, onImport }) {
  const [step, setStep] = useState('file');      // file → map → review → done
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);          // raw 2D array from XLS
  const [headerIdx, setHeaderIdx] = useState(0);
  const [colMap, setColMap] = useState({});      // { counterparty: 0, amount: 2, ... }
  const [parsedRows, setParsedRows] = useState([]); // [{ counterparty, amount, notes, due_date, suggested_category, ai_confidence, include }]
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const isAP = kind === 'ap';

  const handleFile = async (file) => {
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error('No sheets found in this file');
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
      if (!aoa.length) throw new Error('Sheet is empty');
      setFileName(file.name);
      setRows(aoa);
      // Detect header row: first row with at least 2 non-empty string cells
      let hi = 0;
      for (let i = 0; i < Math.min(aoa.length, 10); i++) {
        const nonEmptyStrings = aoa[i].filter(c => typeof c === 'string' && c.trim()).length;
        if (nonEmptyStrings >= 2) { hi = i; break; }
      }
      setHeaderIdx(hi);
      const headerCells = aoa[hi] || [];
      const guess = {
        counterparty: pickColumn(headerCells, 'counterparty'),
        amount:       pickColumn(headerCells, 'amount'),
        notes:        pickColumn(headerCells, 'notes'),
        due_date:     pickColumn(headerCells, 'due_date'),
        invoice_number: pickColumn(headerCells, 'invoice_number'),
      };
      setColMap(guess);
      setStep('map');
    } catch (e) {
      setError(e.message || 'Could not parse file');
    } finally { setBusy(false); }
  };

  const buildPreviewRows = async () => {
    setBusy(true); setError('');
    try {
      const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => String(c || '').trim()));
      const drafts = dataRows.map(r => ({
        counterparty: String(colMap.counterparty >= 0 ? r[colMap.counterparty] : '').trim(),
        amount: parseAmount(colMap.amount >= 0 ? r[colMap.amount] : 0),
        notes: String(colMap.notes >= 0 ? r[colMap.notes] : '').trim(),
        due_date: colMap.due_date >= 0 ? parseDateCell(r[colMap.due_date]) : null,
        invoice_number: String(colMap.invoice_number >= 0 ? r[colMap.invoice_number] : '').trim() || null,
      })).filter(r => r.counterparty || r.amount > 0);

      if (drafts.length === 0) { setError('No rows to import — check the column mapping above.'); setBusy(false); return; }

      // Ask Claude to categorize
      const session = await getSession();
      const res = await fetch('/api/categorize-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ rows: drafts }),
      });
      let categorized = drafts.map(d => ({ ...d, suggested_category: 'uncategorized', ai_confidence: 'low', ai_reasoning: '' }));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rows) && data.rows.length === drafts.length) {
          categorized = data.rows;
        }
      } else {
        console.warn('[invoice-import] categorize failed:', res.status);
      }
      // Each row also has include + chosen category (defaults to suggested) + project_id
      setParsedRows(categorized.map(r => ({
        ...r,
        include: true,
        category: r.suggested_category || 'uncategorized',
        project_id: '',
      })));
      setStep('review');
    } catch (e) {
      setError(e.message || 'Failed to build preview');
    } finally { setBusy(false); }
  };

  const togglePatch = (idx, patch) => {
    setParsedRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const finish = () => {
    const keepers = parsedRows.filter(r => r.include);
    if (keepers.length === 0) { setError('Nothing to save — at least one row must be checked.'); return; }
    onImport?.(keepers.map(r => ({
      counterparty: r.counterparty,
      notes: r.notes || null,
      amount: r.amount,
      due_date: r.due_date || null,
      invoice_number: r.invoice_number || null,
      category: r.category,
      project_id: r.project_id || null,
      ai_category_suggestion: r.suggested_category || null,
      ai_confidence: r.ai_confidence || null,
    })));
  };

  const headerCells = rows[headerIdx] || [];
  const colCount = Math.max(...rows.map(r => r?.length || 0), headerCells.length);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,82,186,.32)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: T.sans }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(960px, 95vw)', maxHeight: '90vh', background: T.bg, borderRadius: T.r, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 22px', borderBottom: `1px solid ${T.border}` }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: '.10em', textTransform: 'uppercase' }}>Import {isAP ? 'AP' : 'AR'} from spreadsheet</div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
              {step === 'file' && 'Drop an .xlsx file with rows of invoices / line items'}
              {step === 'map' && `Step 2 of 3 — confirm which columns are which in ${fileName}`}
              {step === 'review' && `Step 3 of 3 — review ${parsedRows.length} rows. Claude pre-filled categories; fix anything that looks off.`}
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.dim, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
          {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: T.alertSoft, color: T.alert, fontSize: 12, borderRadius: T.rS }}>{error}</div>}

          {step === 'file' && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              style={{ padding: 'clamp(40px, 6vw, 64px)', border: `2px dashed ${dragOver ? T.ink : T.border}`, borderRadius: T.r, background: dragOver ? `${T.ink}06` : 'transparent', textAlign: 'center', cursor: busy ? 'wait' : 'pointer' }}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }}/>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.cream, marginBottom: 6 }}>
                {busy ? 'Reading…' : (dragOver ? 'Drop to upload' : 'Drop a spreadsheet here or click to pick')}
              </div>
              <div style={{ fontSize: 11, color: T.dim }}>.xlsx or .xls. First sheet, header row auto-detected, columns mapped on the next step.</div>
            </div>
          )}

          {step === 'map' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 18 }}>
                {[
                  ['counterparty', isAP ? 'Vendor' : 'Client'],
                  ['amount', 'Amount'],
                  ['notes', 'Description'],
                  ['due_date', 'Due date'],
                  ['invoice_number', 'Invoice #'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}{key === 'counterparty' || key === 'amount' ? ' *' : ''}</div>
                    <select value={colMap[key] >= 0 ? colMap[key] : ''} onChange={e => setColMap({ ...colMap, [key]: e.target.value === '' ? -1 : parseInt(e.target.value, 10) })} style={modalInp}>
                      <option value="">— Not in file —</option>
                      {Array.from({ length: colCount }).map((_, i) => (
                        <option key={i} value={i}>Column {String.fromCharCode(65 + i)} — {String(headerCells[i] || '(blank)')}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview the first 5 rows so the user can sanity-check */}
              <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>First 5 rows from the sheet</div>
              <div style={{ overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.rS, maxHeight: 220 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: T.mono }}>
                  <tbody>
                    {rows.slice(headerIdx, headerIdx + 6).map((r, i) => (
                      <tr key={i} style={{ background: i === 0 ? T.surfEl : 'transparent' }}>
                        {Array.from({ length: colCount }).map((_, j) => (
                          <td key={j} style={{ padding: '6px 10px', borderRight: `1px solid ${T.border}`, color: i === 0 ? T.ink : T.cream, fontWeight: i === 0 ? 700 : 400, whiteSpace: 'nowrap' }}>{String(r[j] || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div>
              <div style={{ overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.rS }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: T.surfEl, color: T.dim }}>
                      <th style={th}></th>
                      <th style={th}>{isAP ? 'Vendor' : 'Client'}</th>
                      <th style={th}>Description</th>
                      <th style={th}>Amount</th>
                      <th style={th}>Due</th>
                      <th style={th}>Category <span style={{ color: T.gold, marginLeft: 2 }}>★</span></th>
                      <th style={th}>Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => {
                      const conf = r.ai_confidence || 'low';
                      const confColor = conf === 'high' ? '#1F7A4F' : conf === 'medium' ? T.gold : T.dim;
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${T.border}55`, opacity: r.include ? 1 : .35 }}>
                          <td style={td}><input type="checkbox" checked={r.include} onChange={e => togglePatch(i, { include: e.target.checked })}/></td>
                          <td style={td}><input value={r.counterparty} onChange={e => togglePatch(i, { counterparty: e.target.value })} style={miniInp}/></td>
                          <td style={td}><input value={r.notes} onChange={e => togglePatch(i, { notes: e.target.value })} style={miniInp}/></td>
                          <td style={td}><input value={r.amount} onChange={e => togglePatch(i, { amount: parseFloat(e.target.value) || 0 })} inputMode="decimal" style={miniInp}/></td>
                          <td style={td}><input type="date" value={r.due_date || ''} onChange={e => togglePatch(i, { due_date: e.target.value || null })} style={miniInp}/></td>
                          <td style={td}>
                            <select value={r.category} onChange={e => togglePatch(i, { category: e.target.value })} style={{ ...miniInp, borderColor: r.category === r.suggested_category ? confColor : T.border }}>
                              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                            <div style={{ fontSize: 9, color: confColor, marginTop: 2, fontFamily: T.mono }}>{conf} confidence</div>
                          </td>
                          <td style={td}>
                            <select value={r.project_id} onChange={e => togglePatch(i, { project_id: e.target.value })} style={miniInp}>
                              <option value="">— none —</option>
                              {projects.map(p => <option key={p.id || p._dbId} value={p.id || p._dbId}>{p.name || 'Untitled'}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: T.dim }}>
                <span style={{ color: T.gold }}>★</span> = Claude's guess. Yellow border = medium confidence; gray = low. Uncheck rows you don't want to import.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 22px', borderTop: `1px solid ${T.border}`, gap: 10 }}>
          {step === 'map' && (
            <>
              <button onClick={() => setStep('file')} style={btnSecondary}>← Back</button>
              <button onClick={buildPreviewRows} disabled={busy || colMap.counterparty < 0 || colMap.amount < 0} style={{ ...btnPrimary, opacity: (colMap.counterparty < 0 || colMap.amount < 0) ? .5 : 1, marginLeft: 'auto' }}>
                {busy ? 'Categorizing…' : 'Categorize with Claude →'}
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <button onClick={() => setStep('map')} style={btnSecondary}>← Back</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <div style={{ alignSelf: 'center', fontSize: 11, color: T.dim }}>{parsedRows.filter(r => r.include).length} of {parsedRows.length} selected</div>
                <button onClick={finish} style={btnPrimary}>Save to {isAP ? 'AP' : 'AR'} ledger</button>
              </div>
            </>
          )}
          {step === 'file' && <button onClick={onClose} style={{ ...btnSecondary, marginLeft: 'auto' }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

const modalInp = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none' };
const miniInp = { width: '100%', boxSizing: 'border-box', padding: '4px 6px', borderRadius: 4, background: T.bg, border: `1px solid ${T.border}`, color: T.cream, fontSize: 11, fontFamily: T.sans, outline: 'none' };
const th = { padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: `1px solid ${T.border}` };
const td = { padding: '6px 10px', verticalAlign: 'top' };
const btnPrimary = { padding: '10px 18px', borderRadius: T.rS, border: 'none', background: T.ink, color: T.paper, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, letterSpacing: '.04em' };
const btnSecondary = { padding: '10px 14px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.dim, fontSize: 12, cursor: 'pointer', fontFamily: T.sans };
