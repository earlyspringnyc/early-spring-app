import { useState, useMemo } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { calcProject, isOverdue } from '../utils/calc.js';
import { extractInvoiceData } from '../utils/pdfOcr.js';
import { updateProject as updateProjectInDb } from '../lib/db.js';
import { toast } from '../lib/toast.js';

// Cross-project finance view for bookkeepers and admins.
//
// Walks every project the user can see and aggregates:
//   - Receivables   — unpaid client invoices, sorted by days
//                     outstanding (oldest first).
//   - Payables      — unpaid vendor invoices, same shape.
//   - Transactions  — flat log of every income + expense across
//                     all projects, CSV exportable.
//   - Vendors / W-9 — list of vendors with W-9 status and YTD
//                     paid total. Flags vendors paid $600+ with
//                     no W-9 on file (1099 risk).
//
// No new tables — reads project.docs / project.vendors / project.txns
// jsonb that already exist on each project row.

const tabs = [
  { id: 'receivables', label: 'Receivables (AR)' },
  { id: 'payables',    label: 'Payables (AP)' },
  { id: 'transactions',label: 'Transactions' },
  { id: 'vendors',     label: 'Vendors / 1099' },
];

// Parse a "M/D/YYYY" or "YYYY-MM-DD" date into a Date object.
// Falls back to null if the format isn't recognized.
function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
    return isNaN(d) ? null : d;
  }
  const m = String(s).split('/');
  if (m.length === 3) {
    const d = new Date(+m[2], +m[0] - 1, +m[1]);
    return isNaN(d) ? null : d;
  }
  return null;
}

function daysSince(s) {
  const d = parseDate(s);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// Bucket a "days outstanding" number into 0-30 / 31-60 / 61-90 / 90+.
function ageBucket(days) {
  if (days == null) return '—';
  if (days <= 30)   return '0–30';
  if (days <= 60)   return '31–60';
  if (days <= 90)   return '61–90';
  return '90+';
}
const ageColor = (b) => b === '90+' ? T.alert : b === '61–90' ? T.alert : b === '31–60' ? T.gold : T.ink70;

// CSV cell escape — quotes wrapped, internal quotes doubled.
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function BooksView({ projects = [], onBack, user, onOpenProject }) {
  // Cross-project OCR batch — find every doc with fileData attached
  // that hasn't been processed (amount=0 and not paid), run the
  // shared extractor, write results back to Supabase. Drive-only
  // docs (fileData=null after Drive upload) are skipped — the user
  // can edit those manually in the project's Finance viewer.
  const [scanProgress, setScanProgress] = useState(null); // { current, total, projectName }
  const [scanResult, setScanResult] = useState('');
  const scanAllProjects = async () => {
    // Build the work list across every project
    const work = [];
    for (const p of projects) {
      const docs = p.docs || [];
      for (const d of docs) {
        if (d.fileData && (!d.amount || d.amount === 0) && d.status !== 'paid') {
          work.push({ projectId: p.id || p._dbId, project: p, doc: d });
        }
      }
    }
    if (work.length === 0) {
      setScanResult('Nothing to scan — every doc with a file attached already has an amount.');
      return;
    }
    setScanResult('');
    let updated = 0, failed = 0;
    // Group by project so we batch writes (one Supabase update per project)
    const byProject = new Map();
    for (let i = 0; i < work.length; i++) {
      const { projectId, project, doc } = work[i];
      setScanProgress({ current: i + 1, total: work.length, projectName: project.name || project.client || 'project' });
      try {
        const parsed = await extractInvoiceData(doc.fileData, doc.name || 'document');
        if (!parsed) { failed += 1; continue; }
        // Pull (or initialize) this project's draft
        let draft = byProject.get(projectId);
        if (!draft) { draft = { project, docs: [...(project.docs || [])] }; byProject.set(projectId, draft); }
        // Match vendor by name
        let matchedVendorId = '';
        if (parsed.vendor) {
          const vName = parsed.vendor.toLowerCase();
          const found = (project.vendors || []).find(v => (v.name || '').toLowerCase().includes(vName) || vName.includes((v.name || '').toLowerCase()));
          if (found) matchedVendorId = found.id;
        }
        // Store the AI's read as a SUGGESTION on the doc rather than
        // overwriting fields directly. The viewer surfaces these with
        // an Apply / Reject step so a wrong extraction doesn't silently
        // pollute the books.
        draft.docs = draft.docs.map(d => {
          if (d.id !== doc.id) return d;
          return {
            ...d,
            ocrSuggestion: {
              type: parsed.type || '',
              amount: parsed.amount && parsed.amount > 0 ? parsed.amount : 0,
              dueDate: parsed.dueDate || '',
              number: parsed.number || '',
              vendor: parsed.vendor || '',
              vendorId: matchedVendorId || '',
              scannedAt: new Date().toISOString(),
            },
          };
        });
        updated += 1;
      } catch (e) { failed += 1; }
    }
    // Flush each project's draft back to Supabase
    for (const [projectId, draft] of byProject) {
      try {
        await updateProjectInDb(projectId, { ...draft.project, docs: draft.docs });
      } catch (e) {
        console.error('[books-scan] save failed for', projectId, e);
      }
    }
    setScanProgress(null);
    setScanResult(`Scanned ${work.length} doc(s). ${updated} AI suggestion(s) ready for review. Open each doc to Apply or Reject. ${failed > 0 ? `${failed} failed.` : ''}`);
    toast.success(`Scanned ${work.length} doc(s) — review suggestions in each project's Finance tab.`);
  };
  const unscannedCount = useMemo(
    () => projects.reduce((a, p) => a + (p.docs || []).filter(d => d.fileData && (!d.amount || d.amount === 0) && d.status !== 'paid' && !d.ocrSuggestion).length, 0),
    [projects],
  );
  const [tab, setTab] = useState('receivables');

  // Flatten all rows once. Keeps tabs cheap to switch between.
  const flat = useMemo(() => {
    const arReceivable = [];   // unpaid client invoices
    const apPayable    = [];   // unpaid vendor invoices
    const txns         = [];   // every income/expense
    const vendorAgg    = new Map(); // vendor name → { name, w9, ytdPaid, ... }
    const year = new Date().getFullYear();

    for (const p of projects) {
      const projectName = p.name || '(untitled)';
      const projectId = p.id;
      const client = p.client || '';
      const docs = p.docs || [];
      const ts = p.txns || [];
      const vendors = p.vendors || [];

      // AR — client invoices we sent that aren't paid yet
      for (const d of docs) {
        if (d.type === 'client_invoice' && d.status !== 'paid') {
          const sent = d.sentDate || d.dateAdded;
          const days = daysSince(sent);
          arReceivable.push({
            id: d.id,
            projectId,
            projectName,
            client,
            number: d.name || '',
            amount: Number(d.amount) || 0,
            sentDate: sent || '',
            dueDate: d.dueDate || '',
            daysOutstanding: days ?? 0,
            bucket: ageBucket(days),
            fileName: d.fileName || null,
          });
        }
      }

      // AP — vendor invoices we owe that aren't paid yet
      for (const d of docs) {
        if (d.type === 'invoice' && d.status !== 'paid') {
          const due = d.dueDate;
          const days = daysSince(due);
          const vendor = vendors.find(v => v.id === d.vendorId);
          apPayable.push({
            id: d.id,
            projectId,
            projectName,
            number: d.name || '',
            vendorName: vendor?.name || '',
            amount: Number(d.amount) || 0,
            paidAmount: Number(d.paidAmount) || 0,
            remaining: Number(d.amount) - Number(d.paidAmount || 0),
            dueDate: due || '',
            daysOutstanding: days != null && days > 0 ? days : 0,
            bucket: days != null && days > 0 ? ageBucket(days) : 'not due',
          });
        }
      }

      // Transactions — flatten with project context
      for (const t of ts) {
        const vendor = vendors.find(v => v.id === t.vendorId);
        txns.push({
          id: t.id,
          projectId, projectName, client,
          date: t.date || '',
          type: t.type || '',
          description: t.description || '',
          category: t.category || '',
          vendor: vendor?.name || '',
          amount: Number(t.amount) || 0,
        });

        // Vendor YTD aggregation (only for current-year expenses)
        if (t.type === 'expense' && t.vendorId && vendor) {
          const d = parseDate(t.date);
          if (d && d.getFullYear() === year) {
            const key = vendor.id;
            const existing = vendorAgg.get(key) || {
              id: vendor.id,
              name: vendor.name,
              email: vendor.email || '',
              w9Status: vendor.w9Status || 'pending',
              vendorType: vendor.vendorType || 'other',
              ytdPaid: 0,
              projects: new Set(),
            };
            existing.ytdPaid += Number(t.amount) || 0;
            existing.projects.add(projectName);
            vendorAgg.set(key, existing);
          }
        }
      }
    }

    // Sort: AR/AP oldest first; txns newest first
    arReceivable.sort((a, b) => (b.daysOutstanding || 0) - (a.daysOutstanding || 0));
    apPayable.sort((a, b) => (b.daysOutstanding || 0) - (a.daysOutstanding || 0));
    txns.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // Vendors as an array, flag 1099 risk = paid >= $600 AND W-9 != 'received'/'verified'
    const vendorRows = Array.from(vendorAgg.values())
      .map(v => ({
        ...v,
        projects: Array.from(v.projects),
        flag1099: v.ytdPaid >= 600 && !['received', 'verified'].includes(v.w9Status),
      }))
      .sort((a, b) => b.ytdPaid - a.ytdPaid);

    return {
      arReceivable,
      apPayable,
      txns,
      vendorRows,
      arTotal: arReceivable.reduce((a, r) => a + r.amount, 0),
      apTotal: apPayable.reduce((a, r) => a + r.remaining, 0),
      year,
    };
  }, [projects]);

  // Per-tab export
  const exportTab = () => {
    if (tab === 'transactions') {
      const rows = [
        ['Date','Type','Project','Client','Description','Category','Vendor','Amount','GL Code','Notes'],
        ...flat.txns.map(t => [
          t.date, t.type, t.projectName, t.client, t.description,
          t.category, t.vendor, t.amount, '', '',
        ]),
      ];
      downloadCSV(`morgan-transactions-${new Date().toISOString().slice(0,10)}.csv`, rows);
    } else if (tab === 'receivables') {
      const rows = [
        ['Invoice','Client','Project','Amount','Sent','Due','Days Outstanding','Bucket'],
        ...flat.arReceivable.map(r => [
          r.number, r.client, r.projectName, r.amount, r.sentDate, r.dueDate, r.daysOutstanding, r.bucket,
        ]),
      ];
      downloadCSV(`morgan-receivables-${new Date().toISOString().slice(0,10)}.csv`, rows);
    } else if (tab === 'payables') {
      const rows = [
        ['Invoice','Vendor','Project','Amount','Paid','Remaining','Due','Days Outstanding','Bucket'],
        ...flat.apPayable.map(r => [
          r.number, r.vendorName, r.projectName, r.amount, r.paidAmount, r.remaining, r.dueDate, r.daysOutstanding, r.bucket,
        ]),
      ];
      downloadCSV(`morgan-payables-${new Date().toISOString().slice(0,10)}.csv`, rows);
    } else if (tab === 'vendors') {
      const rows = [
        ['Vendor','Email','Type','W-9 status','YTD paid','Projects','1099 risk'],
        ...flat.vendorRows.map(v => [
          v.name, v.email, v.vendorType, v.w9Status, v.ytdPaid, v.projects.join('; '), v.flag1099 ? 'YES' : 'no',
        ]),
      ];
      downloadCSV(`morgan-vendors-${flat.year}-${new Date().toISOString().slice(0,10)}.csv`, rows);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.cream, fontFamily: T.sans }}>
      {/* Header */}
      <div className="books-header" style={{
        padding: '24px 32px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 13, fontFamily: T.sans }}>← Back</button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Books</h1>
            <p style={{ fontSize: 12, color: T.dim, margin: '4px 0 0' }}>Cross-project finance. Receivables, payables, transactions, vendor 1099s.</p>
          </div>
        </div>
        <div className="books-header-metrics" style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase' }}>Outstanding AR</div>
            <div className="num" style={{ fontSize: 18, fontFamily: T.mono, fontWeight: 700, color: T.pos }}>{f0(flat.arTotal)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase' }}>Outstanding AP</div>
            <div className="num" style={{ fontSize: 18, fontFamily: T.mono, fontWeight: 700, color: T.neg }}>{f0(flat.apTotal)}</div>
          </div>
        </div>
      </div>

      {/* Tab pills */}
      <div style={{ padding: '14px 32px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 4, background: T.surface, borderRadius: 20, padding: 3, width: 'fit-content' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '7px 16px', borderRadius: 18, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.id ? 700 : 500, fontFamily: T.sans,
              background: tab === t.id ? T.ink : 'transparent',
              color: tab === t.id ? T.paper : T.dim,
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {scanResult && <span style={{ fontSize: 10, color: T.dim, fontStyle: 'italic' }}>{scanResult}</span>}
          {(unscannedCount > 0 || scanProgress) && (
            <button onClick={scanAllProjects} disabled={!!scanProgress} style={{
              padding: '8px 14px', borderRadius: T.rS,
              background: scanProgress ? 'transparent' : 'rgba(74,222,128,.08)',
              color: scanProgress ? T.dim : T.pos,
              border: `1px solid ${scanProgress ? T.border : 'rgba(74,222,128,.2)'}`,
              fontSize: 11, fontWeight: 600, cursor: scanProgress ? 'default' : 'pointer', fontFamily: T.sans,
            }}>
              {scanProgress ? `Scanning ${scanProgress.current}/${scanProgress.total} (${scanProgress.projectName})…` : `Scan all unscanned (${unscannedCount})`}
            </button>
          )}
          <button onClick={exportTab} style={{
            padding: '8px 16px', borderRadius: T.rS, background: 'transparent',
            color: T.cream, border: `1px solid ${T.border}`,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
          }}>↓ Export CSV</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 32px' }}>
        {tab === 'receivables' && <ARTable rows={flat.arReceivable} onOpenProject={onOpenProject}/>}
        {tab === 'payables' && <APTable rows={flat.apPayable} onOpenProject={onOpenProject}/>}
        {tab === 'transactions' && <TxnTable rows={flat.txns} onOpenProject={onOpenProject}/>}
        {tab === 'vendors' && <VendorTable rows={flat.vendorRows} year={flat.year}/>}
      </div>
    </div>
  );
}

function EmptyHint({ children }) {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center', fontSize: 13,
      color: T.dim, fontStyle: 'italic',
      background: T.surface, borderRadius: T.rS, border: `1px dashed ${T.border}`,
    }}>{children}</div>
  );
}

function ARTable({ rows, onOpenProject }) {
  if (!rows.length) return <EmptyHint>No outstanding client invoices. Upload one from a project's Finance tab.</EmptyHint>;
  return (
    <Table
      headers={['Invoice', 'Client / Project', 'Sent', 'Due', 'Age', 'Amount']}
      gridCols=".8fr 1.4fr .8fr .8fr .6fr .6fr"
      rows={rows.map(r => ({
        key: r.id,
        onClick: r.projectId && onOpenProject ? () => onOpenProject(r.projectId) : null,
        cells: [
          <span style={{ fontWeight: 600 }}>{r.number}</span>,
          <div><div>{r.client || '—'}</div><div style={{ fontSize: 10, color: T.dim }}>{r.projectName}</div></div>,
          <span style={{ fontFamily: T.mono, fontSize: 11 }}>{r.sentDate || '—'}</span>,
          <span style={{ fontFamily: T.mono, fontSize: 11 }}>{r.dueDate || '—'}</span>,
          <span style={{
            padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
            background: `${ageColor(r.bucket)}18`, color: ageColor(r.bucket),
          }}>{r.bucket}{r.daysOutstanding ? ` · ${r.daysOutstanding}d` : ''}</span>,
          <span className="num" style={{ fontFamily: T.mono, fontWeight: 700, textAlign: 'right', color: T.gold }}>{f$(r.amount)}</span>,
        ],
      }))}
    />
  );
}

function APTable({ rows, onOpenProject }) {
  if (!rows.length) return <EmptyHint>No outstanding vendor invoices. Vendor invoices land here when uploaded under a project's Finance tab.</EmptyHint>;
  return (
    <Table
      headers={['Invoice', 'Vendor / Project', 'Due', 'Age', 'Remaining']}
      gridCols=".8fr 1.6fr .8fr .8fr .7fr"
      rows={rows.map(r => ({
        key: r.id,
        onClick: r.projectId && onOpenProject ? () => onOpenProject(r.projectId) : null,
        cells: [
          <span style={{ fontWeight: 600 }}>{r.number}</span>,
          <div><div>{r.vendorName || '—'}</div><div style={{ fontSize: 10, color: T.dim }}>{r.projectName}</div></div>,
          <span style={{ fontFamily: T.mono, fontSize: 11 }}>{r.dueDate || '—'}</span>,
          <span style={{
            padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
            background: r.bucket === 'not due' ? `${T.dim}18` : `${ageColor(r.bucket)}18`,
            color: r.bucket === 'not due' ? T.dim : ageColor(r.bucket),
          }}>{r.bucket}{r.daysOutstanding ? ` · ${r.daysOutstanding}d` : ''}</span>,
          <span className="num" style={{ fontFamily: T.mono, fontWeight: 700, textAlign: 'right', color: T.neg }}>{f$(r.remaining)}</span>,
        ],
      }))}
    />
  );
}

function TxnTable({ rows, onOpenProject }) {
  if (!rows.length) return <EmptyHint>No transactions yet across any project.</EmptyHint>;
  return (
    <Table
      headers={['Date', 'Type', 'Description', 'Project', 'Vendor', 'Amount']}
      gridCols=".6fr .5fr 2fr 1.2fr 1fr .8fr"
      rows={rows.slice(0, 500).map(t => ({
        key: t.id,
        onClick: t.projectId && onOpenProject ? () => onOpenProject(t.projectId) : null,
        cells: [
          <span style={{ fontFamily: T.mono, fontSize: 11 }}>{t.date || '—'}</span>,
          <span style={{
            padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
            background: t.type === 'income' ? `${T.pos}18` : `${T.neg}18`,
            color: t.type === 'income' ? T.pos : T.neg,
            textTransform: 'uppercase',
          }}>{t.type}</span>,
          <span>{t.description}</span>,
          <span style={{ fontSize: 11, color: T.dim }}>{t.projectName}</span>,
          <span style={{ fontSize: 11, color: T.dim }}>{t.vendor || '—'}</span>,
          <span className="num" style={{ fontFamily: T.mono, fontWeight: 700, textAlign: 'right', color: t.type === 'income' ? T.pos : T.neg }}>
            {t.type === 'income' ? '+' : '−'}{f$(t.amount)}
          </span>,
        ],
      }))}
      footnote={rows.length > 500 ? `Showing 500 of ${rows.length} transactions. Export CSV for the full set.` : null}
    />
  );
}

function VendorTable({ rows, year }) {
  if (!rows.length) return <EmptyHint>No vendor expenses recorded this year ({year}).</EmptyHint>;
  return (
    <>
      <div style={{ marginBottom: 12, fontSize: 11, color: T.dim }}>
        YTD totals for {year}. Vendors flagged <strong style={{ color: T.alert }}>1099 risk</strong> have been paid $600+ but don't have a W-9 on file.
      </div>
      <Table
        headers={['Vendor', 'Type', 'W-9', 'YTD paid', '1099?']}
        gridCols="2fr 1fr .8fr .8fr .6fr"
        rows={rows.map(v => ({
          key: v.id,
          cells: [
            <div><div style={{ fontWeight: 600 }}>{v.name}</div>{v.email && <div style={{ fontSize: 10, color: T.dim }}>{v.email}</div>}</div>,
            <span style={{ fontSize: 11, color: T.dim }}>{v.vendorType}</span>,
            <span style={{
              padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
              background: ['received', 'verified'].includes(v.w9Status) ? `${T.pos}18` : `${T.gold}18`,
              color: ['received', 'verified'].includes(v.w9Status) ? T.pos : T.gold,
              textTransform: 'uppercase',
            }}>{v.w9Status}</span>,
            <span className="num" style={{ fontFamily: T.mono, fontWeight: 700, textAlign: 'right' }}>{f$(v.ytdPaid)}</span>,
            v.flag1099
              ? <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${T.alert}18`, color: T.alert, textTransform: 'uppercase' }}>1099 risk</span>
              : <span style={{ fontSize: 11, color: T.dim }}>—</span>,
          ],
        }))}
      />
    </>
  );
}

function Table({ headers, gridCols, rows, footnote }) {
  return (
    <div className="scroll-table">
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols, padding: '12px 18px',
        borderBottom: `1px solid ${T.border}`, background: T.surfEl || T.surface,
      }}>
        {headers.map((h, i) => (
          <span key={i} style={{
            fontSize: 10, fontWeight: 700, color: T.dim,
            textTransform: 'uppercase', letterSpacing: '.1em',
            textAlign: i === headers.length - 1 ? 'right' : 'left',
          }}>{h}</span>
        ))}
      </div>
      {rows.map((r, idx) => (
        <div
          key={r.key}
          onClick={r.onClick || undefined}
          style={{
            display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center',
            padding: '10px 18px',
            borderBottom: idx < rows.length - 1 ? `1px solid ${T.border}` : 'none',
            cursor: r.onClick ? 'pointer' : 'default',
            transition: 'background .12s ease',
            fontSize: 13, color: T.cream,
          }}
          onMouseEnter={e => { if (r.onClick) e.currentTarget.style.background = T.surfHov || 'rgba(255,255,255,.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {r.cells.map((c, i) => (
            <div key={i} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: i === r.cells.length - 1 ? 'right' : 'left' }}>{c}</div>
          ))}
        </div>
      ))}
      {footnote && (
        <div style={{ padding: '10px 18px', borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.dim, fontStyle: 'italic' }}>
          {footnote}
        </div>
      )}
    </div>
    </div>
  );
}
