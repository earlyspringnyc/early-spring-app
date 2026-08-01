import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { restFetch, getSession } from '../lib/db.js';

// Talent wardrobe tracker. Sticky-header table inside the Creative
// section of a project. One row per person; sizes, address, 5
// purchase checkboxes, tracking number. Headshots live in the
// wardrobe-headshots Supabase Storage bucket; we resolve the public
// URL on the client.
//
// Editing strategy: cell-level updates are debounced (500ms) so
// typing in size fields doesn't write per-keystroke. Checkboxes save
// immediately. Optimistic local state — server errors revert + toast.

const GARMENTS = [
  { key: 'purchased_shorts',     label: 'Shorts',     linkKey: 'link_shorts',     priceKey: 'price_shorts',     trackKey: 'tracking_shorts' },
  { key: 'purchased_shirt',      label: 'Shirt',      linkKey: 'link_shirt',      priceKey: 'price_shirt',      trackKey: 'tracking_shirt' },
  { key: 'purchased_sunglasses', label: 'Sunglasses', linkKey: 'link_sunglasses', priceKey: 'price_sunglasses', trackKey: 'tracking_sunglasses' },
  { key: 'purchased_scarf',      label: 'Scarf',      linkKey: 'link_scarf',      priceKey: 'price_scarf',      trackKey: 'tracking_scarf' },
  { key: 'purchased_shoes',      label: 'Shoes',      linkKey: 'link_shoes',      priceKey: 'price_shoes',      trackKey: 'tracking_shoes' },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

function publicHeadshot(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/wardrobe-headshots/${path}`;
}

const enc = encodeURIComponent;

export default function WardrobeTable({ project, updateProject, user, onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const userId = user?.user_id || user?.id || null;
  const projectId = project?.id || project?._dbId;

  const saveTimers = useRef(new Map());
  const fileInputRef = useRef(null);
  const [uploadingId, setUploadingId] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const out = await restFetch(`/project_wardrobe?select=*&project_id=eq.${enc(projectId)}&order=sort_order.asc,created_at.asc`);
      setRows(Array.isArray(out) ? out : []);
    } catch (e) {
      setErrorMsg(e?.message || 'Could not load wardrobe');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Flush pending writes on unmount so a tab close doesn't lose edits
  useEffect(() => () => {
    saveTimers.current.forEach(t => clearTimeout(t));
    saveTimers.current.clear();
  }, []);

  const patchRow = useCallback((id, patch, immediate = false) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const existing = saveTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const fire = async () => {
      saveTimers.current.delete(id);
      try {
        await restFetch(`/project_wardrobe?id=eq.${enc(id)}`, {
          method: 'PATCH', body: patch, prefer: 'return=minimal',
        });
      } catch (e) {
        console.error('[wardrobe] save failed:', e?.message || e);
      }
    };
    if (immediate) fire();
    else saveTimers.current.set(id, setTimeout(fire, 500));
  }, []);

  const addRow = useCallback(async () => {
    if (!projectId || !userId) return;
    const sortOrder = rows.length ? Math.max(...rows.map(r => r.sort_order || 0)) + 1 : 0;
    try {
      const inserted = await restFetch('/project_wardrobe?select=*', {
        method: 'POST',
        body: { project_id: projectId, user_id: userId, name: '', sort_order: sortOrder },
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) setRows(prev => [...prev, row]);
    } catch (e) {
      setErrorMsg(e?.message || 'Could not add row');
    }
  }, [projectId, userId, rows]);

  const deleteRow = useCallback(async (id) => {
    if (!confirm('Delete this row?')) return;
    setRows(prev => prev.filter(r => r.id !== id));
    try {
      await restFetch(`/project_wardrobe?id=eq.${enc(id)}`, { method: 'DELETE' });
    } catch (e) {
      console.error('[wardrobe] delete failed:', e?.message || e);
      load();
    }
  }, [load]);

  const runImport = async () => {
    if (!importUrl.trim() || !projectId) return;
    setImporting(true);
    setImportResult(null);
    setErrorMsg('');
    try {
      const session = await getSession();
      const res = await fetch('/api/wardrobe/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ url: importUrl.trim(), project_id: projectId }),
      });
      // Parse defensively — Vercel error responses (timeout, 502) may not be JSON
      let data = null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) {
        data = await res.json().catch(() => null);
      } else {
        const txt = await res.text().catch(() => '');
        data = { error: txt.slice(0, 300) || `HTTP ${res.status}` };
      }
      if (!res.ok) {
        const errStr = typeof data?.error === 'string'
          ? data.error
          : (data?.error ? JSON.stringify(data.error) : `Import failed (${res.status})`);
        throw new Error(errStr);
      }
      setImportResult(data);
      await load();
    } catch (e) {
      const msg = typeof e?.message === 'string' && e.message
        ? e.message
        : (typeof e === 'string' ? e : 'Import failed');
      setErrorMsg(msg);
    } finally {
      setImporting(false);
    }
  };

  const uploadHeadshot = async (rowId, file) => {
    if (!file || !projectId) return;
    setUploadingId(rowId);
    try {
      const session = await getSession();
      if (!session?.access_token) throw new Error('Not signed in');
      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const objectKey = `${projectId}/${rowId}.${ext}`;
      const up = await fetch(
        `${SUPABASE_URL}/storage/v1/object/wardrobe-headshots/${enc(objectKey)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': file.type,
            'x-upsert': 'true',
          },
          body: file,
        }
      );
      if (!up.ok) {
        const t = await up.text();
        throw new Error(`Upload failed: ${t.slice(0, 120)}`);
      }
      // Bust browser cache for the same object key
      patchRow(rowId, { headshot_path: `${objectKey}?v=${Date.now()}` }, true);
      patchRow(rowId, { headshot_path: objectKey }, true);
    } catch (e) {
      setErrorMsg(e.message || 'Upload failed');
    } finally {
      setUploadingId(null);
    }
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const fullyOutfitted = rows.filter(r => GARMENTS.every(g => r[g.key])).length;
    const totalChecks = total * GARMENTS.length;
    const doneChecks = rows.reduce((acc, r) => acc + GARMENTS.filter(g => r[g.key]).length, 0);
    const spend = rows.reduce((acc, r) => acc + GARMENTS.reduce((a, g) => a + (Number(r[g.priceKey]) || 0), 0), 0);
    return { total, fullyOutfitted, totalChecks, doneChecks, pct: totalChecks ? Math.round((doneChecks / totalChecks) * 100) : 0, spend };
  }, [rows]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: T.rS, background: 'transparent', border: `1px solid ${T.border}`, color: T.dim, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, marginBottom: 10 }}>← Back to Creative</button>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.cream, margin: 0 }}>Talent Wardrobe</h2>
          <p style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
            {stats.total} {stats.total === 1 ? 'person' : 'people'} · {stats.fullyOutfitted} fully outfitted · {stats.doneChecks}/{stats.totalChecks} items purchased{stats.spend > 0 ? ` · $${stats.spend.toLocaleString('en-US', { maximumFractionDigits: 0 })} spent` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setImportOpen(!importOpen)} style={{ padding: '8px 14px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: importOpen ? T.surfEl : 'transparent', color: T.cream, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
            Import from StaffConnect
          </button>
          <button onClick={addRow} style={{ padding: '8px 14px', borderRadius: T.rS, border: 'none', background: T.ink, color: T.paper, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', cursor: 'pointer', fontFamily: T.sans }}>
            + Add talent
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <div style={{ height: 4, background: T.surface, borderRadius: 2, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ width: `${stats.pct}%`, height: '100%', background: T.ink, transition: 'width .4s ease' }} />
        </div>
      )}

      {/* Import panel */}
      {importOpen && (
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Paste a StaffConnect presentation URL — pulls names, headshots, sizes, addresses for the full roster
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://shesocorporate.staffconnect-app.com/presentation.php?id=…"
              disabled={importing}
              style={{ flex: 1, padding: '10px 12px', borderRadius: T.rS, background: T.paper, border: `1px solid ${T.border}`, color: T.ink, fontSize: 12, fontFamily: T.sans, outline: 'none' }}
            />
            <button onClick={runImport} disabled={!importUrl.trim() || importing} style={{ padding: '10px 18px', borderRadius: T.rS, border: 'none', background: T.ink, color: T.paper, fontSize: 12, fontWeight: 700, cursor: importing ? 'wait' : 'pointer', opacity: !importUrl.trim() || importing ? .5 : 1, fontFamily: T.sans }}>
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
          {importResult && (
            <div style={{ marginTop: 12, fontSize: 12, color: T.dim }}>
              Imported {importResult.imported} of {importResult.roster_size}
              {importResult.skipped > 0 && ` · skipped ${importResult.skipped} (already present)`}
              {importResult.errors?.length > 0 && ` · ${importResult.errors.length} errors`}
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: T.rS, background: T.alertSoft, border: `1px solid ${T.alert}`, color: T.alert, fontSize: 12 }}>
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.dim, fontSize: 12 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', border: `2px dashed ${T.border}`, borderRadius: T.r, color: T.dim }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.cream, marginBottom: 6 }}>No talent yet</div>
          <p style={{ fontSize: 12 }}>Import from a StaffConnect link above, or add talent one at a time.</p>
        </div>
      ) : (
        <div style={{ overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.rS, background: T.surface }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: T.sans, minWidth: 1100 }}>
            <thead>
              <tr style={{ background: T.surfEl, borderBottom: `1px solid ${T.border}` }}>
                <Th sticky>Talent</Th>
                <Th>Waist</Th>
                <Th>Shoe</Th>
                <Th>Shirt</Th>
                {GARMENTS.map(g => <Th key={g.key} center>{g.label}</Th>)}
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isExpanded = expandedId === r.id;
                return (
                  <Row
                    key={r.id}
                    row={r}
                    expanded={isExpanded}
                    onToggleExpand={() => setExpandedId(isExpanded ? null : r.id)}
                    onPatch={patchRow}
                    onDelete={() => deleteRow(r.id)}
                    onUploadHeadshot={(file) => uploadHeadshot(r.id, file)}
                    uploadingHeadshot={uploadingId === r.id}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, sticky, center }) {
  return (
    <th style={{
      textAlign: center ? 'center' : 'left',
      padding: '10px 12px',
      fontSize: 9,
      fontWeight: 700,
      color: T.dim,
      textTransform: 'uppercase',
      letterSpacing: '.08em',
      ...(sticky ? { position: 'sticky', left: 0, background: T.surfEl, zIndex: 1, minWidth: 240 } : {}),
    }}>{children}</th>
  );
}

function Row({ row, expanded, onToggleExpand, onPatch, onDelete, onUploadHeadshot, uploadingHeadshot }) {
  const fileRef = useRef(null);
  const headshotSrc = publicHeadshot((row.headshot_path || '').split('?')[0]);
  const cacheKey = (row.headshot_path || '').split('?')[1];

  return (
    <>
      <tr style={{ borderBottom: `1px solid ${T.border}55` }}>
        <td style={{ padding: '10px 12px', position: 'sticky', left: 0, background: T.surface, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
                background: T.surfEl, border: `1px solid ${T.border}`,
                flexShrink: 0, cursor: 'pointer', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Upload headshot"
            >
              {headshotSrc ? (
                <img src={cacheKey ? `${headshotSrc}?${cacheKey}` : headshotSrc} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 10, color: T.dim }}>+</span>
              )}
              {uploadingHeadshot && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,82,186,.6)', color: T.paper, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>…</div>
              )}
            </div>
            <input
              type="file"
              ref={fileRef}
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadHeadshot(f);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                value={row.name || ''}
                onChange={(e) => onPatch(row.id, { name: e.target.value })}
                placeholder="Name"
                style={{ width: '100%', background: 'transparent', border: 'none', color: T.cream, fontSize: 13, fontWeight: 600, fontFamily: T.sans, outline: 'none', padding: 0 }}
              />
              <button onClick={onToggleExpand} style={{ background: 'none', border: 'none', color: T.ink, fontSize: 10, fontWeight: 600, padding: 0, cursor: 'pointer', fontFamily: T.sans, textDecoration: 'underline' }}>
                {expanded ? '▴ Hide details' : '▾ Details (address, links, notes)'}
              </button>
            </div>
          </div>
        </td>
        <SizeCell row={row} field="waist_size" onPatch={onPatch} placeholder="29" width={60} />
        <SizeCell row={row} field="shoe_size" onPatch={onPatch} placeholder="9" width={50} />
        <SizeCell row={row} field="shirt_size" onPatch={onPatch} placeholder="M" width={50} />
        {GARMENTS.map(g => {
          const url = row[g.linkKey];
          const priceRaw = row[g.priceKey];
          const priceVal = priceRaw === null || priceRaw === undefined || priceRaw === '' ? '' : priceRaw;
          return (
            <td key={g.key} style={{ padding: '10px 8px', verticalAlign: 'top' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Checkbox checked={!!row[g.key]} onChange={(v) => onPatch(row.id, { [g.key]: v }, true)} />
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" title={url} onClick={(e) => e.stopPropagation()} style={{ color: T.ink, fontSize: 12, textDecoration: 'none', opacity: .7 }}>↗</a>
                  ) : null}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, padding: '2px 4px' }}>
                  <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={priceVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      onPatch(row.id, { [g.priceKey]: v === '' ? null : Number(v) });
                    }}
                    placeholder="—"
                    style={{ width: 56, background: 'transparent', border: 'none', color: T.ink, fontSize: 11, fontFamily: T.mono, textAlign: 'right', outline: 'none', padding: 0 }}
                  />
                </div>
                <input
                  value={row[g.trackKey] || ''}
                  onChange={(e) => onPatch(row.id, { [g.trackKey]: e.target.value })}
                  placeholder="Tracking #"
                  title="Tracking number"
                  style={{ width: 96, background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.ink, fontSize: 10, padding: '3px 6px', fontFamily: T.mono, outline: 'none' }}
                />
              </div>
            </td>
          );
        })}
        <td style={{ padding: '10px 8px' }}>
          <button onClick={onDelete} title="Delete row" style={{ background: 'transparent', border: 'none', color: T.dim, fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
        </td>
      </tr>

      {expanded && (
        <tr style={{ background: T.surfEl }}>
          <td colSpan={9} style={{ padding: '12px 18px' }}>
            {/* Product links FIRST — most-asked-for field in this view */}
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                Product links for {row.name || 'this person'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                {GARMENTS.map(g => (
                  <div key={g.linkKey}>
                    <div style={{ fontSize: 9, color: T.dim, marginBottom: 3 }}>{g.label}</div>
                    <input
                      value={row[g.linkKey] || ''}
                      onChange={(e) => onPatch(row.id, { [g.linkKey]: e.target.value })}
                      placeholder="https://…"
                      style={{ width: '100%', background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.ink, fontSize: 11, padding: '5px 8px', fontFamily: T.mono, outline: 'none' }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Shipping address</div>
                <textarea
                  value={row.shipping_address || ''}
                  onChange={(e) => onPatch(row.id, { shipping_address: e.target.value })}
                  rows={3}
                  placeholder="Street, City, State ZIP"
                  style={{ width: '100%', background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.ink, fontSize: 12, padding: '6px 10px', fontFamily: T.sans, lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Phone</div>
                    <input value={row.phone || ''} onChange={(e) => onPatch(row.id, { phone: e.target.value })} style={{ width: '100%', background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.ink, fontSize: 12, padding: '6px 10px', fontFamily: T.sans, outline: 'none' }}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Email</div>
                    <input value={row.email || ''} onChange={(e) => onPatch(row.id, { email: e.target.value })} style={{ width: '100%', background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.ink, fontSize: 12, padding: '6px 10px', fontFamily: T.sans, outline: 'none' }}/>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Notes</div>
                  <input value={row.notes || ''} onChange={(e) => onPatch(row.id, { notes: e.target.value })} placeholder="Fit notes, allergies, etc." style={{ width: '100%', background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.ink, fontSize: 12, padding: '6px 10px', fontFamily: T.sans, outline: 'none' }}/>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SizeCell({ row, field, onPatch, placeholder, width }) {
  return (
    <td style={{ padding: '10px 8px' }}>
      <input
        value={row[field] || ''}
        onChange={(e) => onPatch(row.id, { [field]: e.target.value })}
        placeholder={placeholder}
        style={{ width, background: T.paper, border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.ink, fontSize: 11, padding: '4px 8px', fontFamily: T.mono, outline: 'none' }}
      />
    </td>
  );
}

function Checkbox({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 22, height: 22, borderRadius: T.rS,
        border: `1.5px solid ${checked ? T.ink : T.border}`,
        background: checked ? T.ink : 'transparent',
        color: T.paper, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, fontFamily: T.sans, fontWeight: 700, fontSize: 13,
        lineHeight: 1, transition: 'all .12s',
      }}
      aria-pressed={checked}
    >
      {checked ? '✓' : ''}
    </button>
  );
}
