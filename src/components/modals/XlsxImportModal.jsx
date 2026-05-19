import { useState, useRef } from 'react';
import T from '../../theme/tokens.js';
import { f$ } from '../../utils/format.js';
import { detectHeaderRow, detectColumns, mapRowsToCategories } from '../../utils/sheetMapper.js';

const FIELD_OPTIONS = [
  { value: '', label: 'Skip' },
  { value: 'category', label: 'Category' },
  { value: 'item', label: 'Item / Description' },
  { value: 'cost', label: 'Cost / Amount' },
  { value: 'qty', label: 'Quantity' },
  { value: 'rate', label: 'Rate' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'notes', label: 'Notes' },
];

function XlsxImportModal({ onClose, onImport }) {
  // 1=file, 2=tab+map, 3=preview
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [selectedTab, setSelectedTab] = useState('');
  const [sheetData, setSheetData] = useState([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [colMap, setColMap] = useState({});
  const [previewCats, setPreviewCats] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const readSheetAsRows = (wb, name) => {
    const XLSX = wb._XLSX;
    const ws = wb.Sheets[name];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError(''); setLoading(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      wb._XLSX = XLSX;
      const names = wb.SheetNames || [];
      if (!names.length) { setError('No sheets found in this file'); setLoading(false); return; }
      const first = names[0];
      const rows = readSheetAsRows(wb, first);
      if (rows.length < 2) { setError('Sheet appears empty'); setLoading(false); return; }
      const hIdx = detectHeaderRow(rows);
      setWorkbook(wb);
      setTabs(names);
      setSelectedTab(first);
      setSheetData(rows);
      setHeaderIdx(hIdx);
      setColMap(detectColumns(rows[hIdx] || []));
      setFileName(file.name);
      setStep(2);
    } catch (e) {
      console.error('[xlsx-import]', e);
      setError('Could not read this file. Make sure it is a valid .xlsx or .xls file.');
    }
    setLoading(false);
  };

  const switchTab = (name) => {
    if (!workbook) return;
    const rows = readSheetAsRows(workbook, name);
    setSelectedTab(name);
    setSheetData(rows);
    const hIdx = detectHeaderRow(rows);
    setHeaderIdx(hIdx);
    setColMap(detectColumns(rows[hIdx] || []));
  };

  const generatePreview = () => {
    const cats = mapRowsToCategories(sheetData, headerIdx, colMap);
    setPreviewCats(cats);
    setStep(3);
  };

  const handleConfirm = () => {
    onImport({ cats: previewCats });
    onClose();
  };

  const updateColMap = (colIdx, field) => {
    const newMap = { ...colMap };
    Object.keys(newMap).forEach(k => { if (newMap[k] === colIdx && k !== field) delete newMap[k]; });
    if (field) {
      Object.keys(newMap).forEach(k => { if (k === field) delete newMap[k]; });
      newMap[field] = colIdx;
    } else {
      Object.keys(newMap).forEach(k => { if (newMap[k] === colIdx) delete newMap[k]; });
    }
    setColMap(newMap);
  };

  const reverseMap = {};
  Object.entries(colMap).forEach(([field, idx]) => { reverseMap[idx] = field; });

  return <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
    <div className="slide-in" onClick={e => e.stopPropagation()} style={{ width: step === 2 || step === 3 ? 'min(900px,92vw)' : 'min(520px,90vw)', maxHeight: '85vh', borderRadius: T.r, background: T.bg, border: `1px solid ${T.border}`, boxShadow: T.shadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Import from XLSX{fileName ? ` — ${fileName}` : ''}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>&times;</button>
      </div>

      {/* Body */}
      <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>

        {/* Step 1: file picker */}
        {step === 1 && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>Upload a spreadsheet (.xlsx, .xls, .csv) to replace this budget's line items.</p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${dragOver ? T.gold : T.border}`, borderRadius: T.rS, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(240,184,73,.06)' : 'transparent', transition: 'all .15s' }}
          >
            <div style={{ fontSize: 13, color: T.cream, marginBottom: 6, fontWeight: 600 }}>{loading ? 'Reading file…' : 'Drop file here or click to browse'}</div>
            <div style={{ fontSize: 11, color: T.dim }}>.xlsx, .xls, or .csv</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            style={{ display: 'none' }}
          />
          {error && <p style={{ fontSize: 11, color: T.neg, marginTop: 12 }}>{error}</p>}
        </div>}

        {/* Step 2: tab + column mapping */}
        {step === 2 && <div>
          {tabs.length > 1 && <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Sheet Tab</label>
            <select value={selectedTab} onChange={e => switchTab(e.target.value)} style={{ width: 240, padding: '8px 10px', borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}`, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none' }}>
              {tabs.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>}

          <p style={{ fontSize: 12, color: T.dim, marginBottom: 8 }}>Auto-detected column mappings. Adjust if needed.</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: T.dim }}>Header row: </label>
            <select value={headerIdx} onChange={e => { const idx = parseInt(e.target.value); setHeaderIdx(idx); setColMap(detectColumns(sheetData[idx] || [])); }} style={{ padding: '4px 8px', borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}`, color: T.cream, fontSize: 11, fontFamily: T.sans, outline: 'none' }}>
              {sheetData.slice(0, 15).map((row, i) => <option key={i} value={i}>Row {i + 1}: {(row || []).slice(0, 3).join(' | ')}</option>)}
            </select>
          </div>

          <div style={{ overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.rS, marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: T.sans }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {(sheetData[headerIdx] || []).map((h, i) => <th key={i} style={{ padding: '6px 8px', textAlign: 'left', minWidth: 90 }}>
                    <div style={{ fontSize: 10, color: T.dim, marginBottom: 4 }}>{String(h || `Col ${i + 1}`)}</div>
                    <select value={reverseMap[i] || ''} onChange={e => updateColMap(i, e.target.value)} style={{ width: '100%', padding: '3px 4px', borderRadius: 4, background: T.surfEl, border: `1px solid ${T.border}`, color: reverseMap[i] ? T.gold : T.dim, fontSize: 10, fontFamily: T.sans, outline: 'none' }}>
                      {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </th>)}
                </tr>
              </thead>
              <tbody>
                {sheetData.slice(headerIdx + 1, headerIdx + 8).map((row, i) => <tr key={i} style={{ borderBottom: `1px solid ${T.border}22` }}>
                  {(sheetData[headerIdx] || []).map((_, j) => <td key={j} style={{ padding: '4px 8px', color: T.dim, fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row?.[j] ?? ''}</td>)}
                </tr>)}
              </tbody>
            </table>
          </div>

          {error && <p style={{ fontSize: 11, color: T.neg, marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={generatePreview} disabled={colMap.item === undefined && colMap.category === undefined} style={{ padding: '10px 20px', borderRadius: T.rS, border: 'none', background: T.cream, color: '#0A0A0D', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Generate Preview</button>
            <button onClick={() => { setStep(1); setWorkbook(null); setTabs([]); setSheetData([]); setColMap({}); setFileName(''); }} style={{ padding: '10px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.cream, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Back</button>
          </div>
        </div>}

        {/* Step 3: preview */}
        {step === 3 && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Preview of imported budget ({previewCats.reduce((s, c) => s + c.items.length, 0)} items in {previewCats.length} categories). This will replace the current budget's line items.</p>
          <div style={{ maxHeight: 400, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.rS, marginBottom: 16 }}>
            {previewCats.map(cat => <div key={cat.id}>
              <div style={{ padding: '8px 12px', background: T.surfEl, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${T.border}`, color: T.cream }}>{cat.name}</div>
              {cat.items.map(item => <div key={item.id} style={{ display: 'flex', padding: '6px 12px 6px 24px', borderBottom: `1px solid ${T.border}22`, fontSize: 11, gap: 12 }}>
                <span style={{ flex: 1, color: T.cream }}>{item.name}</span>
                {item.qxr && <span style={{ color: T.dim }}>{item.qty} x {f$(item.rate)}</span>}
                <span style={{ fontFamily: T.mono, fontWeight: 600, color: T.cream, minWidth: 80, textAlign: 'right' }}>{f$(item.actualCost)}</span>
              </div>)}
            </div>)}
          </div>
          {previewCats.length === 0 && <p style={{ fontSize: 12, color: T.neg }}>No items detected. Try adjusting the column mapping.</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleConfirm} disabled={previewCats.length === 0} style={{ padding: '10px 20px', borderRadius: T.rS, border: 'none', background: previewCats.length ? T.cream : 'rgba(15,82,186,.05)', color: previewCats.length ? '#0A0A0D' : 'rgba(15,82,186,.42)', fontSize: 12, fontWeight: 600, cursor: previewCats.length ? 'pointer' : 'default', fontFamily: T.sans }}>Import Budget</button>
            <button onClick={() => setStep(2)} style={{ padding: '10px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.cream, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Adjust Mapping</button>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

export default XlsxImportModal;
