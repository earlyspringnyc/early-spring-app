import { useState, useEffect } from 'react';
import T from '../../theme/tokens.js';
import { f$ } from '../../utils/format.js';
import { parseSheetUrl, getSheetTabs, readSheetCell, readEntireSheet } from '../../utils/sheetImport.js';
import { detectHeaderRow, detectColumns, mapRowsToCategories } from '../../utils/sheetMapper.js';
import { Card } from '../primitives/index.js';

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

function SheetImportModal({ onClose, onImport, accessToken, project }) {
  const [step, setStep] = useState(1); // 1=url, 2=path, 3a=quick, 3b=full-preview, 4=confirm
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [tabs, setTabs] = useState([]);
  const [selectedTab, setSelectedTab] = useState('');
  const [importPath, setImportPath] = useState(''); // 'quick' | 'full'

  // Quick import state
  const [cellRef, setCellRef] = useState('');
  const [cellValue, setCellValue] = useState(null);

  // Full import state
  const [sheetData, setSheetData] = useState([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [colMap, setColMap] = useState({});
  const [previewCats, setPreviewCats] = useState([]);

  const handleUrlSubmit = async () => {
    setError('');
    const id = parseSheetUrl(url);
    if (!id) { setError('Invalid Google Sheets URL'); return; }
    if (!accessToken) { setError('Sign in with Google to access Sheets'); return; }
    setLoading(true);
    try {
      const t = await getSheetTabs(accessToken, id);
      setSpreadsheetId(id);
      setTabs(t);
      setSelectedTab(t[0] || '');
      setStep(2);
    } catch (e) {
      setError('Could not access sheet. Make sure you have permission.');
    }
    setLoading(false);
  };

  const handleQuickRead = async () => {
    if (!cellRef.trim()) { setError('Enter a cell reference (e.g. B42)'); return; }
    setError(''); setLoading(true);
    try {
      const val = await readSheetCell(accessToken, spreadsheetId, cellRef.trim(), selectedTab);
      setCellValue(val);
      setStep('3a-preview');
    } catch (e) {
      setError('Could not read that cell. Check the reference.');
    }
    setLoading(false);
  };

  const handleFullRead = async () => {
    setError(''); setLoading(true);
    try {
      const rows = await readEntireSheet(accessToken, spreadsheetId, selectedTab);
      if (rows.length < 2) { setError('Sheet appears empty'); setLoading(false); return; }
      setSheetData(rows);
      const hIdx = detectHeaderRow(rows);
      setHeaderIdx(hIdx);
      const detected = detectColumns(rows[hIdx] || []);
      setColMap(detected);
      setStep('3b');
    } catch (e) {
      setError('Could not read sheet data.');
    }
    setLoading(false);
  };

  const generatePreview = () => {
    const cats = mapRowsToCategories(sheetData, headerIdx, colMap);
    setPreviewCats(cats);
    setStep('3b-preview');
  };

  const handleQuickConfirm = () => {
    const numVal = parseFloat(String(cellValue || '').replace(/[$,€£\s]/g, ''));
    if (isNaN(numVal)) { setError('Value is not a number'); return; }
    onImport({
      clientBudget: numVal,
      sheetImport: { spreadsheetId, sheetName: selectedTab, cellRef: cellRef.trim(), type: 'quick', lastSync: Date.now() },
    });
    onClose();
  };

  const handleFullConfirm = () => {
    onImport({
      cats: previewCats,
      sheetImport: { spreadsheetId, sheetName: selectedTab, type: 'full', colMap, headerIdx, lastSync: Date.now() },
    });
    onClose();
  };

  const updateColMap = (colIdx, field) => {
    const newMap = { ...colMap };
    // Remove any existing mapping to this field
    Object.keys(newMap).forEach(k => { if (newMap[k] === colIdx && k !== field) delete newMap[k]; });
    // Remove old mapping of this field
    if (field) {
      Object.keys(newMap).forEach(k => { if (k === field) delete newMap[k]; });
      newMap[field] = colIdx;
    } else {
      // Find which field was mapped to this col and remove it
      Object.keys(newMap).forEach(k => { if (newMap[k] === colIdx) delete newMap[k]; });
    }
    setColMap(newMap);
  };

  const reverseMap = {};
  Object.entries(colMap).forEach(([field, idx]) => { reverseMap[idx] = field; });

  return <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
    <div className="slide-in" onClick={e => e.stopPropagation()} style={{ width: step.toString().startsWith('3b') ? 'min(900px,92vw)' : 'min(520px,90vw)', maxHeight: '85vh', borderRadius: T.r, background: T.bg, border: `1px solid ${T.border}`, boxShadow: T.shadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Import from Google Sheet</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>&times;</button>
      </div>

      {/* Body */}
      <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>

        {/* Step 1: URL */}
        {step === 1 && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>Paste the URL of a Google Sheet you have access to.</p>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()} style={{ width: '100%', padding: '10px 12px', borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: T.cream, fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }} />
          {error && <p style={{ fontSize: 11, color: T.neg, marginTop: 8 }}>{error}</p>}
          <button onClick={handleUrlSubmit} disabled={!url.trim() || loading} style={{ marginTop: 12, padding: '10px 20px', borderRadius: T.rS, border: 'none', background: url.trim() ? T.cream : 'rgba(15,82,186,.05)', color: url.trim() ? '#0A0A0D' : 'rgba(15,82,186,.42)', fontSize: 12, fontWeight: 600, cursor: url.trim() ? 'pointer' : 'default', fontFamily: T.sans }}>{loading ? 'Connecting...' : 'Connect'}</button>
        </div>}

        {/* Step 2: Choose path */}
        {step === 2 && <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Sheet Tab</label>
            <select value={selectedTab} onChange={e => setSelectedTab(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}`, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none' }}>
              {tabs.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>How would you like to import?</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Card style={{ flex: 1, padding: 16, cursor: 'pointer', border: `1px solid ${importPath === 'quick' ? T.gold : T.border}`, transition: 'all .15s' }} onClick={() => setImportPath('quick')}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: T.cream }}>Quick Import</div>
              <p style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, margin: 0 }}>Pull a single total budget number from a specific cell.</p>
            </Card>
            <Card style={{ flex: 1, padding: 16, cursor: 'pointer', border: `1px solid ${importPath === 'full' ? T.gold : T.border}`, transition: 'all .15s' }} onClick={() => setImportPath('full')}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: T.cream }}>Full Import</div>
              <p style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, margin: 0 }}>Map columns to Morgan's budget structure with auto-detection.</p>
            </Card>
          </div>
          {error && <p style={{ fontSize: 11, color: T.neg, marginTop: 8 }}>{error}</p>}
          <button onClick={() => { if (importPath === 'quick') setStep('3a'); else if (importPath === 'full') handleFullRead(); }} disabled={!importPath || loading} style={{ marginTop: 16, padding: '10px 20px', borderRadius: T.rS, border: 'none', background: importPath ? T.cream : 'rgba(15,82,186,.05)', color: importPath ? '#0A0A0D' : 'rgba(15,82,186,.42)', fontSize: 12, fontWeight: 600, cursor: importPath ? 'pointer' : 'default', fontFamily: T.sans }}>{loading ? 'Reading sheet...' : 'Continue'}</button>
        </div>}

        {/* Step 3a: Quick import - cell ref */}
        {step === '3a' && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Enter the cell reference for your total sold budget.</p>
          <input value={cellRef} onChange={e => setCellRef(e.target.value)} placeholder="e.g. B42" onKeyDown={e => e.key === 'Enter' && handleQuickRead()} style={{ width: 120, padding: '10px 12px', borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: T.cream, fontSize: 14, fontFamily: T.mono, outline: 'none', textTransform: 'uppercase' }} />
          {error && <p style={{ fontSize: 11, color: T.neg, marginTop: 8 }}>{error}</p>}
          <button onClick={handleQuickRead} disabled={!cellRef.trim() || loading} style={{ marginLeft: 8, padding: '10px 16px', borderRadius: T.rS, border: 'none', background: cellRef.trim() ? T.cream : 'rgba(15,82,186,.05)', color: cellRef.trim() ? '#0A0A0D' : 'rgba(15,82,186,.42)', fontSize: 12, fontWeight: 600, cursor: cellRef.trim() ? 'pointer' : 'default', fontFamily: T.sans }}>{loading ? 'Reading...' : 'Read Cell'}</button>
        </div>}

        {/* Step 3a preview: show value */}
        {step === '3a-preview' && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Value found at <strong style={{ color: T.cream }}>{selectedTab}!{cellRef}</strong>:</p>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: T.mono, letterSpacing: '-0.03em', marginBottom: 16 }}>{cellValue}</div>
          {project.clientBudget > 0 && <p style={{ fontSize: 11, color: T.dim }}>Current budget: {f$(project.clientBudget)} &rarr; will be replaced</p>}
          {error && <p style={{ fontSize: 11, color: T.neg, marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={handleQuickConfirm} style={{ padding: '10px 20px', borderRadius: T.rS, border: 'none', background: T.cream, color: '#0A0A0D', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Set as Client Budget</button>
            <button onClick={() => setStep('3a')} style={{ padding: '10px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.cream, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Back</button>
          </div>
        </div>}

        {/* Step 3b: Full import - column mapping */}
        {step === '3b' && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 8 }}>Auto-detected column mappings. Adjust if needed.</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: T.dim }}>Header row: </label>
            <select value={headerIdx} onChange={e => { const idx = parseInt(e.target.value); setHeaderIdx(idx); setColMap(detectColumns(sheetData[idx] || [])); }} style={{ padding: '4px 8px', borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}`, color: T.cream, fontSize: 11, fontFamily: T.sans, outline: 'none' }}>
              {sheetData.slice(0, 15).map((row, i) => <option key={i} value={i}>Row {i + 1}: {(row || []).slice(0, 3).join(' | ')}</option>)}
            </select>
          </div>

          {/* Column mapping header */}
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
            <button onClick={() => setStep(2)} style={{ padding: '10px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.cream, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Back</button>
          </div>
        </div>}

        {/* Step 3b preview: mapped budget */}
        {step === '3b-preview' && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Preview of imported budget ({previewCats.reduce((s, c) => s + c.items.length, 0)} items in {previewCats.length} categories)</p>
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
            <button onClick={handleFullConfirm} disabled={previewCats.length === 0} style={{ padding: '10px 20px', borderRadius: T.rS, border: 'none', background: previewCats.length ? T.cream : 'rgba(15,82,186,.05)', color: previewCats.length ? '#0A0A0D' : 'rgba(15,82,186,.42)', fontSize: 12, fontWeight: 600, cursor: previewCats.length ? 'pointer' : 'default', fontFamily: T.sans }}>Import Budget</button>
            <button onClick={() => setStep('3b')} style={{ padding: '10px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.cream, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Adjust Mapping</button>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

export default SheetImportModal;
