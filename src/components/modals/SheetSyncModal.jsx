import { useState, useEffect } from 'react';
import T from '../../theme/tokens.js';
import { f$ } from '../../utils/format.js';
import { readSheetCell, readEntireSheet } from '../../utils/sheetImport.js';
import { mapRowsToCategories, buildDiffPreview } from '../../utils/sheetMapper.js';

function SheetSyncModal({ onClose, onSync, accessToken, project }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [diff, setDiff] = useState(null);
  const [newValue, setNewValue] = useState(null);
  const config = project.sheetImport;

  useEffect(() => {
    if (!config || !accessToken) return;
    (async () => {
      try {
        if (config.type === 'quick') {
          const val = await readSheetCell(accessToken, config.spreadsheetId, config.cellRef, config.sheetName);
          const numVal = parseFloat(String(val || '').replace(/[$,€£\s]/g, ''));
          setNewValue({ raw: val, parsed: isNaN(numVal) ? null : numVal });
        } else if (config.type === 'full') {
          const rows = await readEntireSheet(accessToken, config.spreadsheetId, config.sheetName);
          const cats = mapRowsToCategories(rows, config.headerIdx, config.colMap);
          const d = buildDiffPreview(project.cats, cats);
          setDiff({ ...d, cats });
        }
      } catch (e) {
        setError('Could not read sheet. Check your access.');
      }
      setLoading(false);
    })();
  }, [config, accessToken]);

  const handleConfirm = () => {
    if (config.type === 'quick' && newValue?.parsed != null) {
      onSync({ clientBudget: newValue.parsed, sheetImport: { ...config, lastSync: Date.now() } });
    } else if (config.type === 'full' && diff?.cats) {
      onSync({ cats: diff.cats, sheetImport: { ...config, lastSync: Date.now() } });
    }
    onClose();
  };

  const lastSyncDate = config?.lastSync ? new Date(config.lastSync).toLocaleDateString() : 'never';

  return <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
    <div className="slide-in" onClick={e => e.stopPropagation()} style={{ width: 'min(560px,90vw)', maxHeight: '80vh', borderRadius: T.r, background: T.bg, border: `1px solid ${T.border}`, boxShadow: T.shadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Sync from Sheet</div>
          <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>Last synced: {lastSyncDate}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>&times;</button>
      </div>

      <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
        {loading && <p style={{ color: T.dim, fontSize: 13 }}>Reading sheet...</p>}
        {error && <p style={{ color: T.neg, fontSize: 12 }}>{error}</p>}

        {/* Quick sync diff */}
        {!loading && config?.type === 'quick' && newValue && <div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', marginBottom: 4 }}>Current</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: T.mono }}>{f$(project.clientBudget || 0)}</div>
            </div>
            <span style={{ fontSize: 20, color: T.dim }}>&rarr;</span>
            <div>
              <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', marginBottom: 4 }}>From Sheet</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: T.mono, color: newValue.parsed !== project.clientBudget ? T.gold : T.cream }}>{newValue.parsed != null ? f$(newValue.parsed) : newValue.raw}</div>
            </div>
          </div>
          {newValue.parsed === project.clientBudget && <p style={{ fontSize: 12, color: T.dim }}>No changes detected.</p>}
        </div>}

        {/* Full sync diff */}
        {!loading && config?.type === 'full' && diff && <div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>{diff.summary}</p>
          {diff.added.length > 0 && <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#34D399', textTransform: 'uppercase', marginBottom: 4 }}>Added</div>
            {diff.added.map((item, i) => <div key={i} style={{ fontSize: 11, padding: '4px 0', color: T.cream }}><span style={{ color: '#34D399', marginRight: 6 }}>+</span>{item.name} <span style={{ color: T.dim }}>({item.catName})</span> <span style={{ fontFamily: T.mono }}>{f$(item.actualCost)}</span></div>)}
          </div>}
          {diff.changed.length > 0 && <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#FBBF24', textTransform: 'uppercase', marginBottom: 4 }}>Changed</div>
            {diff.changed.map((item, i) => <div key={i} style={{ fontSize: 11, padding: '4px 0', color: T.cream }}><span style={{ color: '#FBBF24', marginRight: 6 }}>~</span>{item.name} <span style={{ color: T.dim }}>{f$(item.oldCost)} &rarr;</span> <span style={{ fontFamily: T.mono }}>{f$(item.newCost)}</span></div>)}
          </div>}
          {diff.removed.length > 0 && <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.neg, textTransform: 'uppercase', marginBottom: 4 }}>Removed</div>
            {diff.removed.map((item, i) => <div key={i} style={{ fontSize: 11, padding: '4px 0', color: T.dim }}><span style={{ color: T.neg, marginRight: 6 }}>-</span>{item.name}</div>)}
          </div>}
          {diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0 && <p style={{ fontSize: 12, color: T.dim }}>No changes detected.</p>}
        </div>}
      </div>

      {!loading && !error && <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.cream, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
        <button onClick={handleConfirm} style={{ padding: '8px 20px', borderRadius: T.rS, border: 'none', background: T.cream, color: '#0A0A0D', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Apply Changes</button>
      </div>}
    </div>
  </div>;
}

export default SheetSyncModal;
