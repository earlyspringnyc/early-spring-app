import { useState, useEffect, useMemo } from 'react';
import T from '../theme/tokens.js';
import { listAuditLog, diffFields } from '../lib/auditLog.js';

// Cross-org Activity feed — reads from the audit_log table that's
// populated by Postgres triggers on insert/update/delete of the
// key tables (projects, vendors, contracts, contacts, companies).
//
// Filter by table or search by record id. Each row expands to show
// the field diff. Useful when bringing on an external collaborator
// — "what did the bookkeeper change last week?".

const TABLE_LABELS = {
  all:       'All activity',
  projects:  'Projects',
  vendors:   'Vendors',
  contracts: 'Contracts',
  contacts:  'Contacts',
  companies: 'Companies',
};

function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)      return 'just now';
  if (ms < 3_600_000)   return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)  return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function actionColor(action) {
  if (action === 'insert') return T.pos;
  if (action === 'delete') return T.alert || T.neg;
  return T.gold;
}

function shortVal(v) {
  if (v == null) return '∅';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v).slice(0, 60); } catch { return '[obj]'; }
}

export default function ActivityView({ onBack }) {
  const [table, setTable] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAuditLog({ table: table === 'all' ? null : table, limit: 200 })
      .then(r => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [table]);

  const toggleRow = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const grouped = useMemo(() => {
    // Group by day for readability
    const byDay = new Map();
    for (const r of rows) {
      const day = new Date(r.at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(r);
    }
    return Array.from(byDay.entries());
  }, [rows]);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.cream, fontFamily: T.sans }}>
      <div style={{
        padding: '24px 32px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 13, fontFamily: T.sans }}>← Back</button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Activity</h1>
          <p style={{ fontSize: 12, color: T.dim, margin: '4px 0 0' }}>Audit trail of changes to projects, vendors, contracts, contacts, companies.</p>
        </div>
      </div>

      <div style={{ padding: '14px 32px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', gap: 4, background: T.surface, borderRadius: 20, padding: 3, width: 'fit-content' }}>
          {Object.entries(TABLE_LABELS).map(([id, label]) => (
            <button key={id} onClick={() => setTable(id)} style={{
              padding: '7px 16px', borderRadius: 18, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: table === id ? 700 : 500, fontFamily: T.sans,
              background: table === id ? T.ink : 'transparent',
              color: table === id ? T.paper : T.dim,
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 32px' }}>
        {loading && <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: T.dim }}>Loading…</div>}
        {!loading && rows.length === 0 && (
          <div style={{
            padding: 40, textAlign: 'center', fontSize: 13, color: T.dim,
            background: T.surface, borderRadius: T.rS, border: `1px dashed ${T.border}`,
          }}>
            No activity yet — once the audit-log SQL migration is run, changes will land here in real time.
          </div>
        )}
        {!loading && grouped.map(([day, items]) => (
          <div key={day} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>
              {day}
            </div>
            <div className="scroll-table"><div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, overflow: 'hidden' }}>
              {items.map((r, idx) => {
                const fields = expanded.has(r.id) ? diffFields(r.before, r.after) : null;
                return (
                  <div key={r.id} style={{ borderBottom: idx < items.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                    <button
                      onClick={() => toggleRow(r.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '10px 16px', background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left', fontFamily: T.sans, color: T.cream,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surfHov || 'rgba(255,255,255,.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{
                        padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                        background: `${actionColor(r.action)}18`, color: actionColor(r.action),
                        textTransform: 'uppercase', letterSpacing: '.06em',
                      }}>{r.action}</span>
                      <span style={{ fontSize: 12, color: T.cream, fontWeight: 600 }}>{r.table_name}</span>
                      <span style={{ fontSize: 11, color: T.dim, fontFamily: T.mono, opacity: .7 }}>{(r.record_id || '').slice(0, 8)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: T.dim, fontFamily: T.mono }}>{ago(r.at)}</span>
                    </button>
                    {fields && fields.length > 0 && (
                      <div style={{ padding: '6px 16px 14px 60px', fontSize: 11, color: T.dim }}>
                        {fields.map(f => (
                          <div key={f.key} style={{ marginBottom: 3, fontFamily: T.mono }}>
                            <span style={{ color: T.cream, fontWeight: 600 }}>{f.key}</span>
                            <span style={{ color: T.dim }}> :  </span>
                            <span style={{ color: T.dim }}>{shortVal(f.from)}</span>
                            <span style={{ color: T.dim }}> → </span>
                            <span style={{ color: T.gold }}>{shortVal(f.to)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {fields && fields.length === 0 && (
                      <div style={{ padding: '6px 16px 14px 60px', fontSize: 11, color: T.dim, fontStyle: 'italic' }}>
                        No tracked field changes (likely a metadata-only update).
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
