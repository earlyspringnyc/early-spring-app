import React, { useState, useMemo, useEffect, useCallback } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { calcProject, isOverdue } from '../utils/calc.js';
import { extractInvoiceData } from '../utils/pdfOcr.js';
import { updateProject as updateProjectInDb, restFetch } from '../lib/db.js';
import { toast } from '../lib/toast.js';
import InvoiceImportModal from '../components/modals/InvoiceImportModal.jsx';

// Category options for the org-level invoice ledger. The 'project' +
// 'staffing' categories let the row optionally point at a project so
// downstream views can group/roll up.
const ORG_INVOICE_CATEGORIES = [
  { id: 'project',               label: 'Project',           hint: 'Tied to a specific project' },
  { id: 'staffing',              label: 'Staffing',          hint: 'Crew / freelancers (optionally per project)' },
  { id: 'rent',                  label: 'Rent',              hint: 'Office / studio rent' },
  { id: 'utilities',             label: 'Utilities',         hint: 'Electric, internet, water' },
  { id: 'expenses',              label: 'Office Expenses',   hint: 'Supplies, SaaS, misc' },
  { id: 'vehicle',               label: 'Vehicle',           hint: 'Insurance, gas, repairs' },
  { id: 'professional_services', label: 'Professional',      hint: 'Accountant, lawyer, advisor' },
  { id: 'taxes',                 label: 'Taxes',             hint: 'Federal, state, sales' },
  { id: 'other',                 label: 'Other',             hint: 'Anything else' },
  { id: 'uncategorized',         label: 'Uncategorized',     hint: 'Triage me' },
];
const CATEGORY_LABEL = Object.fromEntries(ORG_INVOICE_CATEGORIES.map(c => [c.id, c.label]));

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
  { id: 'cashflow',    label: 'Cashflow' },
  { id: 'forecast',    label: 'Forecast' },
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

export default function BooksView({ projects = [], onBack, user, onOpenProject, orgId }) {
  // ── Org-level invoice ledger ──────────────────────────────────────
  // Separate table (org_invoices) that's not tied to a specific
  // project. Holds rent, utilities, generic vendor bills, AR from
  // bookkeeping, etc. Project rows can also live here when Jennifer
  // wants to clock them centrally.
  const [orgInvoices, setOrgInvoices] = useState([]);
  const [orgLoading, setOrgLoading] = useState(false);
  // Per-row UI state: which row's comment box is open, and the
  // current draft text. Keyed by invoice id.
  const [commentOpen, setCommentOpen] = useState({});
  const [commentDraft, setCommentDraft] = useState({});
  // Inline add form state
  const [addOpen, setAddOpen] = useState(null);            // 'ap' | 'ar' | null
  const [importOpen, setImportOpen] = useState(null);      // 'ap' | 'ar' | null
  const [addDraft, setAddDraft] = useState({
    counterparty: '', notes: '', category: 'uncategorized',
    project_id: '', amount: '', issued_date: '', due_date: ''
  });

  const loadOrgInvoices = useCallback(async () => {
    if (!orgId) return;
    setOrgLoading(true);
    try {
      const rows = await restFetch(`/org_invoices?select=*&org_id=eq.${orgId}&order=created_at.desc&limit=500`);
      setOrgInvoices(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn('[books] org_invoices load failed:', e?.message);
    } finally { setOrgLoading(false); }
  }, [orgId]);
  useEffect(() => { loadOrgInvoices(); }, [loadOrgInvoices]);

  const userId = user?.user_id || user?.id || null;

  const addInvoice = useCallback(async (kind) => {
    if (!orgId || !userId) { toast.error('Org not loaded'); return; }
    if (!addDraft.counterparty.trim()) { toast.error('Vendor/client name required'); return; }
    const amt = parseFloat(addDraft.amount) || 0;
    if (amt <= 0) { toast.error('Amount must be > 0'); return; }
    const row = {
      org_id: orgId,
      created_by: userId,
      kind,
      category: addDraft.category || 'uncategorized',
      counterparty: addDraft.counterparty.trim(),
      notes: addDraft.notes.trim() || null,
      amount: amt,
      project_id: addDraft.project_id || null,
      issued_date: addDraft.issued_date || null,
      due_date: addDraft.due_date || null,
      status: kind === 'ar' ? 'sent' : 'pending',
    };
    try {
      const inserted = await restFetch('/org_invoices?select=*', { method: 'POST', body: row });
      const saved = Array.isArray(inserted) ? inserted[0] : inserted;
      if (saved) setOrgInvoices(prev => [saved, ...prev]);
      setAddOpen(null);
      setAddDraft({ counterparty: '', notes: '', category: 'uncategorized', project_id: '', amount: '', issued_date: '', due_date: '' });
      toast.success(`Added to ${kind === 'ap' ? 'AP' : 'AR'}`);
    } catch (e) {
      toast.error(`Add failed: ${e.message || e}`);
    }
  }, [orgId, userId, addDraft]);

  // Bulk-insert XLS-imported rows after Claude has categorized them
  // and Jennifer's reviewed in the modal.
  const bulkImport = useCallback(async (kind, items) => {
    if (!orgId || !userId || !items?.length) return;
    const batchId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `batch-${Date.now()}`;
    const rows = items.map(it => ({
      org_id: orgId,
      created_by: userId,
      kind,
      category: it.category || 'uncategorized',
      counterparty: String(it.counterparty || '').trim() || 'Unknown',
      notes: it.notes || null,
      amount: Number(it.amount) || 0,
      project_id: it.project_id || null,
      due_date: it.due_date || null,
      invoice_number: it.invoice_number || null,
      status: kind === 'ar' ? 'sent' : 'pending',
      ai_category_suggestion: it.ai_category_suggestion || null,
      ai_confidence: it.ai_confidence || null,
      import_batch_id: batchId,
    }));
    try {
      const inserted = await restFetch('/org_invoices?select=*', {
        method: 'POST',
        body: rows,
        prefer: 'return=representation',
      });
      const saved = Array.isArray(inserted) ? inserted : [inserted];
      setOrgInvoices(prev => [...saved, ...prev]);
      setImportOpen(null);
      toast.success(`Imported ${saved.length} ${kind === 'ap' ? 'AP' : 'AR'} row${saved.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(`Import failed: ${e.message || e}`);
    }
  }, [orgId, userId]);

  const updateInvoice = useCallback(async (id, patch) => {
    setOrgInvoices(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    try {
      await restFetch(`/org_invoices?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: patch, prefer: 'return=minimal',
      });
    } catch (e) {
      toast.error(`Save failed: ${e.message || e}`);
      loadOrgInvoices();
    }
  }, [loadOrgInvoices]);

  const approveInvoice = useCallback((id) => updateInvoice(id, {
    status: 'approved', approved_by: userId, approved_at: new Date().toISOString(),
  }), [updateInvoice, userId]);
  const declineInvoice = useCallback((id) => updateInvoice(id, { status: 'cancelled' }), [updateInvoice]);
  const reopenInvoice  = useCallback((id) => updateInvoice(id, { status: 'pending', approved_by: null, approved_at: null }), [updateInvoice]);
  const markPaid       = useCallback((id) => updateInvoice(id, { status: 'paid', paid_at: new Date().toISOString() }), [updateInvoice]);
  const saveComment    = useCallback((id) => {
    const txt = (commentDraft[id] || '').trim();
    updateInvoice(id, { notes: txt || null });
    setCommentOpen(o => ({ ...o, [id]: false }));
  }, [commentDraft, updateInvoice]);
  const deleteInvoice  = useCallback(async (id) => {
    if (!confirm('Delete this row? It can\'t be recovered.')) return;
    setOrgInvoices(prev => prev.filter(r => r.id !== id));
    try {
      await restFetch(`/org_invoices?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) { toast.error(`Delete failed: ${e.message || e}`); loadOrgInvoices(); }
  }, [loadOrgInvoices]);

  // Split for the two tabs
  const orgAP = orgInvoices.filter(r => r.kind === 'ap');
  const orgAR = orgInvoices.filter(r => r.kind === 'ar');


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

  // Cashflow events. A flat stream of every cash movement we can see
  // across projects + org ledger, each tagged 'actual' (already
  // happened) or 'forecast' (expected from outstanding invoices).
  // Buckets below roll these into monthly columns.
  const cashflowEvents = useMemo(() => {
    const events = [];
    const push = (date, amount, direction, kind, label, projectId, projectName, source) => {
      if (!date || isNaN(date.getTime?.() ?? date) || !(Number(amount) > 0)) return;
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return;
      events.push({ date: d, amount: Number(amount), direction, kind, label, projectId, projectName, source });
    };
    for (const p of projects) {
      const projectName = p.name || '(untitled)';
      const projectId = p.id;
      const vendors = p.vendors || [];
      // Project txns — always actual
      for (const t of p.txns || []) {
        const date = parseDate(t.date);
        const amount = Number(t.amount) || 0;
        if (!date || amount <= 0) continue;
        const dir = t.type === 'income' ? 'in' : 'out';
        const v = vendors.find(x => x.id === t.vendorId);
        push(date, amount, dir, 'actual', t.description || (dir === 'in' ? 'Income' : v?.name || 'Expense'), projectId, projectName, 'txn');
      }
      // Project docs — client invoices (AR) and vendor invoices (AP)
      for (const d of p.docs || []) {
        const amt = Number(d.amount) || 0;
        if (d.type === 'client_invoice') {
          if (d.status === 'paid' && amt > 0) {
            push(parseDate(d.paidDate || d.sentDate || d.dateAdded), amt, 'in', 'actual', `Client invoice ${d.name || ''}`.trim(), projectId, projectName, 'doc-ar');
          } else if (amt > 0 && d.dueDate) {
            push(parseDate(d.dueDate), amt, 'in', 'forecast', `Expected: ${d.name || 'client invoice'}`, projectId, projectName, 'doc-ar');
          }
        }
        if (d.type === 'invoice') {
          const vendor = vendors.find(v => v.id === d.vendorId);
          const paid = Number(d.paidAmount) || 0;
          const remaining = Math.max(0, amt - paid);
          if (paid > 0) {
            push(parseDate(d.paidDate || d.dueDate || d.dateAdded), paid, 'out', 'actual', `Paid: ${vendor?.name || 'vendor'} ${d.name || ''}`.trim(), projectId, projectName, 'doc-ap');
          }
          if (d.status !== 'paid' && remaining > 0 && d.dueDate) {
            push(parseDate(d.dueDate), remaining, 'out', 'forecast', `Expected: ${vendor?.name || 'vendor'} ${d.name || ''}`.trim(), projectId, projectName, 'doc-ap');
          }
        }
      }
    }
    // Org ledger — independent AP/AR rows
    for (const r of orgInvoices || []) {
      const amount = Number(r.amount) || 0;
      if (amount <= 0) continue;
      const direction = r.kind === 'ar' ? 'in' : 'out';
      const categoryLabel = r.category ? (CATEGORY_LABEL[r.category] || r.category) : '';
      const label = `${r.counterparty || 'Org'}${categoryLabel ? ` · ${categoryLabel}` : ''}`;
      if (r.status === 'paid' && r.paid_at) {
        push(new Date(r.paid_at), amount, direction, 'actual', label, r.project_id, '', 'org');
      } else if (r.status !== 'cancelled' && r.status !== 'declined' && r.due_date) {
        push(new Date(`${r.due_date}T00:00:00`), amount, direction, 'forecast', label, r.project_id, '', 'org');
      }
    }
    return events;
  }, [projects, orgInvoices]);

  // Bucket actual events into the past 12 months. Running balance is
  // cumulative across all-time actuals so the column always reflects
  // the cash position at month-end, not just the year-to-date sum.
  const monthlyActuals = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
        year: dt.getFullYear(),
        month: dt.getMonth(),
        label: dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        in: 0, out: 0, net: 0, runningBalance: 0, items: [],
      });
    }
    const byKey = new Map(buckets.map(b => [b.key, b]));
    const firstStart = new Date(buckets[0].year, buckets[0].month, 1);
    let preStart = 0;
    cashflowEvents.forEach(e => {
      if (e.kind !== 'actual') return;
      if (e.date < firstStart) {
        preStart += e.direction === 'in' ? e.amount : -e.amount;
        return;
      }
      const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
      const b = byKey.get(key);
      if (!b) return;
      if (e.direction === 'in') b.in += e.amount;
      else b.out += e.amount;
      b.items.push(e);
    });
    let running = preStart;
    buckets.forEach(b => {
      b.net = b.in - b.out;
      running += b.net;
      b.runningBalance = running;
    });
    return { buckets, openingBalance: preStart, currentBalance: running };
  }, [cashflowEvents]);

  // Forecast: next 6 months. Starting balance = current actual position
  // (sum of every actual event we've seen, up to today).
  const monthlyForecast = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 0; i < 6; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
      buckets.push({
        key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
        year: dt.getFullYear(),
        month: dt.getMonth(),
        label: dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        in: 0, out: 0, net: 0, runningBalance: 0, items: [],
      });
    }
    const byKey = new Map(buckets.map(b => [b.key, b]));
    let startingBalance = 0;
    cashflowEvents.forEach(e => {
      if (e.kind === 'actual') startingBalance += e.direction === 'in' ? e.amount : -e.amount;
      if (e.kind !== 'forecast') return;
      const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
      const b = byKey.get(key);
      if (!b) return;
      if (e.direction === 'in') b.in += e.amount;
      else b.out += e.amount;
      b.items.push(e);
    });
    let running = startingBalance;
    buckets.forEach(b => {
      b.net = b.in - b.out;
      running += b.net;
      b.runningBalance = running;
    });
    return { buckets, startingBalance, endingBalance: running };
  }, [cashflowEvents]);

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
        {tab === 'receivables' && (
          <>
            <OrgLedgerSection kind="ar" rows={orgAR} projects={projects} loading={orgLoading}
              addOpen={addOpen} setAddOpen={setAddOpen} addDraft={addDraft} setAddDraft={setAddDraft}
              importOpen={importOpen} setImportOpen={setImportOpen}
              addInvoice={addInvoice} updateInvoice={updateInvoice}
              approveInvoice={approveInvoice} declineInvoice={declineInvoice} reopenInvoice={reopenInvoice} markPaid={markPaid}
              commentOpen={commentOpen} setCommentOpen={setCommentOpen} commentDraft={commentDraft} setCommentDraft={setCommentDraft} saveComment={saveComment}
              deleteInvoice={deleteInvoice} onOpenProject={onOpenProject}/>
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${T.faintRule}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14 }}>Per-project receivables</div>
              <ARTable rows={flat.arReceivable} onOpenProject={onOpenProject}/>
            </div>
          </>
        )}
        {tab === 'payables' && (
          <>
            <OrgLedgerSection kind="ap" rows={orgAP} projects={projects} loading={orgLoading}
              addOpen={addOpen} setAddOpen={setAddOpen} addDraft={addDraft} setAddDraft={setAddDraft}
              importOpen={importOpen} setImportOpen={setImportOpen}
              addInvoice={addInvoice} updateInvoice={updateInvoice}
              approveInvoice={approveInvoice} declineInvoice={declineInvoice} reopenInvoice={reopenInvoice} markPaid={markPaid}
              commentOpen={commentOpen} setCommentOpen={setCommentOpen} commentDraft={commentDraft} setCommentDraft={setCommentDraft} saveComment={saveComment}
              deleteInvoice={deleteInvoice} onOpenProject={onOpenProject}/>
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${T.faintRule}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14 }}>Per-project payables</div>
              <APTable rows={flat.apPayable} onOpenProject={onOpenProject}/>
            </div>
          </>
        )}
        {tab === 'cashflow' && <CashflowTable mode="actual" data={monthlyActuals} onOpenProject={onOpenProject}/>}
        {tab === 'forecast' && <CashflowTable mode="forecast" data={monthlyForecast} onOpenProject={onOpenProject}/>}
        {tab === 'transactions' && <TxnTable rows={flat.txns} onOpenProject={onOpenProject}/>}
        {tab === 'vendors' && <VendorTable rows={flat.vendorRows} year={flat.year}/>}
      </div>
      {importOpen && (
        <InvoiceImportModal
          kind={importOpen}
          projects={projects}
          onClose={() => setImportOpen(null)}
          onImport={(items) => bulkImport(importOpen, items)}
        />
      )}
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

// Cashflow / Forecast view. Same component, two modes: 'actual' bills
// the past 12 months from project txns + paid invoices + paid org
// ledger rows; 'forecast' projects forward 6 months using outstanding
// invoice due dates + pending org ledger items. Tap a row to expand
// the contributing line items.
function CashflowTable({ mode, data, onOpenProject }) {
  const [expandedKey, setExpandedKey] = React.useState(null);
  const buckets = data?.buckets || [];
  const isActual = mode === 'actual';
  const maxFlow = Math.max(1, ...buckets.map(b => Math.max(b.in, b.out)));
  const fmtSigned = (n) => n === 0 ? f0(0) : (n > 0 ? f0(n) : `-${f0(Math.abs(n))}`);
  if (!buckets.length) return <EmptyHint>Nothing to chart yet.</EmptyHint>;

  const summaryStat = isActual
    ? { label: 'Current cash position', value: data.currentBalance }
    : { label: 'Projected end position (next 6 mo)', value: data.endingBalance };
  const subStat = isActual
    ? { label: '12 mo opening balance', value: data.openingBalance }
    : { label: 'Starting position (today)', value: data.startingBalance };

  return (
    <div>
      {/* Headline summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={{ padding: '14px 18px', borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase' }}>{summaryStat.label}</div>
          <div className="num" style={{ fontSize: 26, fontFamily: T.mono, fontWeight: 700, color: summaryStat.value >= 0 ? T.cream : T.neg, marginTop: 4 }}>{fmtSigned(summaryStat.value)}</div>
        </div>
        <div style={{ padding: '14px 18px', borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase' }}>{subStat.label}</div>
          <div className="num" style={{ fontSize: 18, fontFamily: T.mono, fontWeight: 700, color: subStat.value >= 0 ? T.dim : T.neg, marginTop: 4 }}>{fmtSigned(subStat.value)}</div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 110px 110px 110px 130px 36px', alignItems: 'center', padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        <div>Month</div>
        <div>Flow</div>
        <div style={{ textAlign: 'right' }}>{isActual ? 'In' : 'Expected In'}</div>
        <div style={{ textAlign: 'right' }}>{isActual ? 'Out' : 'Expected Out'}</div>
        <div style={{ textAlign: 'right' }}>Net</div>
        <div style={{ textAlign: 'right' }}>{isActual ? 'Balance' : 'Projected'}</div>
        <div></div>
      </div>

      {buckets.map((b) => {
        const inPct = (b.in / maxFlow) * 100;
        const outPct = (b.out / maxFlow) * 100;
        const isExpanded = expandedKey === b.key;
        const hasItems = b.items.length > 0;
        return (
          <React.Fragment key={b.key}>
            <div
              onClick={() => hasItems && setExpandedKey(isExpanded ? null : b.key)}
              style={{ display: 'grid', gridTemplateColumns: '160px 1fr 110px 110px 110px 130px 36px', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${T.faintRule}`, cursor: hasItems ? 'pointer' : 'default', transition: 'background .12s' }}
              onMouseEnter={e => hasItems && (e.currentTarget.style.background = T.surface)}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: T.cream }}>{b.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 12 }}>
                <div style={{ height: 6, background: T.surface, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${inPct}%`, background: T.pos, opacity: .8 }}/>
                </div>
                <div style={{ height: 6, background: T.surface, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${outPct}%`, background: T.neg, opacity: .8 }}/>
                </div>
              </div>
              <div className="num" style={{ textAlign: 'right', fontSize: 12, fontFamily: T.mono, color: b.in > 0 ? T.pos : T.dim }}>{b.in > 0 ? f0(b.in) : '—'}</div>
              <div className="num" style={{ textAlign: 'right', fontSize: 12, fontFamily: T.mono, color: b.out > 0 ? T.neg : T.dim }}>{b.out > 0 ? f0(b.out) : '—'}</div>
              <div className="num" style={{ textAlign: 'right', fontSize: 12, fontFamily: T.mono, color: b.net > 0 ? T.pos : b.net < 0 ? T.neg : T.dim, fontWeight: 700 }}>{fmtSigned(b.net)}</div>
              <div className="num" style={{ textAlign: 'right', fontSize: 12, fontFamily: T.mono, color: b.runningBalance >= 0 ? T.cream : T.neg, fontWeight: 700 }}>{fmtSigned(b.runningBalance)}</div>
              <div style={{ textAlign: 'right', color: T.dim, fontSize: 11 }}>{hasItems ? (isExpanded ? '▴' : '▾') : ''}</div>
            </div>
            {isExpanded && hasItems && (
              <div style={{ background: T.surface, borderBottom: `1px solid ${T.faintRule}`, padding: '8px 14px 14px 174px' }}>
                {b.items
                  .slice()
                  .sort((a, x) => a.date - x.date)
                  .map((it, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px 110px', gap: 10, alignItems: 'center', padding: '4px 0', fontSize: 11 }}>
                      <span style={{ color: T.dim, fontFamily: T.mono }}>{it.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span style={{ color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</span>
                      <span
                        style={{ color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: it.projectId && onOpenProject ? 'pointer' : 'default', textDecoration: it.projectId && onOpenProject ? 'underline' : 'none' }}
                        onClick={() => it.projectId && onOpenProject && onOpenProject(it.projectId)}
                      >{it.projectName || (it.source === 'org' ? 'Org ledger' : '')}</span>
                      <span className="num" style={{ textAlign: 'right', fontFamily: T.mono, fontWeight: 600, color: it.direction === 'in' ? T.pos : T.neg }}>{it.direction === 'in' ? '+' : '-'}{f0(it.amount)}</span>
                    </div>
                  ))}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Footnote / legend */}
      <div style={{ marginTop: 16, padding: '12px 16px', fontSize: 10, color: T.dim, lineHeight: 1.5, background: T.surface, borderRadius: T.rS, border: `1px solid ${T.border}` }}>
        {isActual ? (
          <>Sources · Project transactions, paid client invoices, paid vendor invoices, and paid rows from the org ledger. Running balance is cumulative across all-time activity, so the first column reflects your starting position 12 months ago.</>
        ) : (
          <>Sources · Outstanding client invoices (due date), outstanding vendor invoices (due date), and pending / approved / sent rows from the org ledger (due date). Starting position is your current cash, computed from all actual activity to date.</>
        )}
      </div>
    </div>
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

// ── Org-level ledger UI ───────────────────────────────────────────────
// The single most-used surface: Jennifer logs rows here, EP approves
// or declines, comments live inline. Each row is just metadata — no
// PDF viewer. Past commits cover invoice-file viewing in the project
// docs flow; this view is intentionally lighter.
function OrgLedgerSection({ kind, rows, projects, loading, addOpen, setAddOpen, addDraft, setAddDraft, importOpen, setImportOpen, addInvoice, updateInvoice, approveInvoice, declineInvoice, reopenInvoice, markPaid, commentOpen, setCommentOpen, commentDraft, setCommentDraft, saveComment, deleteInvoice, onOpenProject }) {
  const isAP = kind === 'ap';
  const sectionLabel = isAP ? 'Payables (AP)' : 'Receivables (AR)';
  const isAddOpen = addOpen === kind;
  const projectsById = useMemo(() => {
    const m = new Map();
    (projects || []).forEach(p => { const id = p.id || p._dbId; if (id) m.set(id, p); });
    return m;
  }, [projects]);

  // Split pending/in-flight from settled so the approval queue is the
  // visual focus.
  const pending = rows.filter(r => isAP ? (r.status === 'pending' || r.status === 'approved') : (r.status === 'sent' || r.status === 'overdue'));
  const settled = rows.filter(r => r.status === 'paid' || r.status === 'cancelled');

  return (
    <div>
      {/* Header + add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.cream, letterSpacing: '.08em', textTransform: 'uppercase' }}>{sectionLabel} ledger</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
            {pending.length} {isAP ? 'awaiting approval / payment' : 'outstanding'}
            {settled.length > 0 && ` · ${settled.length} settled`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setImportOpen(kind)} title="Bulk-import from an .xlsx file. Claude auto-categorizes each row." style={{ padding: '8px 14px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.cream, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
            ↑ Import XLS
          </button>
          <button onClick={() => setAddOpen(isAddOpen ? null : kind)} style={{ padding: '8px 14px', borderRadius: T.rS, border: 'none', background: T.ink, color: T.paper, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', cursor: 'pointer', fontFamily: T.sans }}>
            {isAddOpen ? '× Cancel' : `+ Add ${isAP ? 'AP' : 'AR'} row`}
          </button>
        </div>
      </div>

      {/* Inline add form */}
      {isAddOpen && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input value={addDraft.counterparty} onChange={e => setAddDraft({ ...addDraft, counterparty: e.target.value })} placeholder={isAP ? 'Vendor name' : 'Client name'} style={inp} autoFocus/>
            <input value={addDraft.amount} onChange={e => setAddDraft({ ...addDraft, amount: e.target.value })} placeholder="$ amount" inputMode="decimal" style={inp}/>
            <input value={addDraft.due_date} onChange={e => setAddDraft({ ...addDraft, due_date: e.target.value })} placeholder="Due (YYYY-MM-DD)" type="date" style={inp}/>
            <select value={addDraft.category} onChange={e => setAddDraft({ ...addDraft, category: e.target.value })} style={inp}>
              {ORG_INVOICE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <input value={addDraft.notes} onChange={e => setAddDraft({ ...addDraft, notes: e.target.value })} placeholder="What's it for? (e.g., June Brooklyn office rent)" style={inp}/>
            <select value={addDraft.project_id} onChange={e => setAddDraft({ ...addDraft, project_id: e.target.value })} style={inp}>
              <option value="">— no project —</option>
              {(projects || []).map(p => <option key={p.id || p._dbId} value={p.id || p._dbId}>{p.name || 'Untitled'}{p.client ? ` · ${p.client}` : ''}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => addInvoice(kind)} style={{ padding: '8px 16px', borderRadius: T.rS, border: 'none', background: T.ink, color: T.paper, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans }}>Save</button>
            <button onClick={() => setAddOpen(null)} style={{ padding: '8px 14px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.dim, fontSize: 11, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Pending queue */}
      {loading && rows.length === 0 ? (
        <div style={{ padding: 24, color: T.dim, fontSize: 12 }}>Loading…</div>
      ) : pending.length === 0 && settled.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: T.rS, color: T.dim, fontSize: 12 }}>
          Nothing here yet. Click "+ Add {isAP ? 'AP' : 'AR'} row" to get started.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, overflow: 'hidden' }}>
              <LedgerRowHeader isAP={isAP}/>
              {pending.map(r => (
                <LedgerRow key={r.id} r={r} isAP={isAP}
                  projectsById={projectsById}
                  onApprove={approveInvoice} onDecline={declineInvoice} onReopen={reopenInvoice} onMarkPaid={markPaid}
                  commentOpen={commentOpen} setCommentOpen={setCommentOpen} commentDraft={commentDraft} setCommentDraft={setCommentDraft} saveComment={saveComment}
                  updateInvoice={updateInvoice} deleteInvoice={deleteInvoice} onOpenProject={onOpenProject}/>
              ))}
            </div>
          )}
          {settled.length > 0 && (
            <details style={{ marginTop: 18 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: T.dim, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 10 }}>{settled.length} settled / cancelled</summary>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, overflow: 'hidden', marginTop: 10, opacity: .85 }}>
                <LedgerRowHeader isAP={isAP}/>
                {settled.map(r => (
                  <LedgerRow key={r.id} r={r} isAP={isAP}
                    projectsById={projectsById}
                    onApprove={approveInvoice} onDecline={declineInvoice} onReopen={reopenInvoice} onMarkPaid={markPaid}
                    commentOpen={commentOpen} setCommentOpen={setCommentOpen} commentDraft={commentDraft} setCommentDraft={setCommentDraft} saveComment={saveComment}
                    updateInvoice={updateInvoice} deleteInvoice={deleteInvoice} onOpenProject={onOpenProject}/>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

const inp = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', borderRadius: T.rS,
  background: T.bg, border: `1px solid ${T.border}`,
  color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none',
};

function LedgerRowHeader({ isAP }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 1fr 1fr 1fr 1fr auto', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, background: T.surfEl, fontSize: 9, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em' }}>
      <span>{isAP ? 'Vendor' : 'Client'}</span>
      <span>Description</span>
      <span>Category</span>
      <span>Project</span>
      <span>Due</span>
      <span style={{ textAlign: 'right' }}>Amount</span>
      <span style={{ textAlign: 'right' }}>Actions</span>
    </div>
  );
}

function LedgerRow({ r, isAP, projectsById, onApprove, onDecline, onReopen, onMarkPaid, commentOpen, setCommentOpen, commentDraft, setCommentDraft, saveComment, updateInvoice, deleteInvoice, onOpenProject }) {
  const proj = r.project_id ? projectsById.get(r.project_id) : null;
  const statusColor = r.status === 'paid' ? T.pos
    : r.status === 'approved' ? '#1F7A4F'
    : r.status === 'cancelled' ? T.dim
    : r.status === 'pending' ? T.gold
    : T.fadedInk;
  const isCommentOpen = !!commentOpen[r.id];
  const draftVal = commentDraft[r.id] !== undefined ? commentDraft[r.id] : (r.notes || '');

  return (
    <div style={{ borderBottom: `1px solid ${T.border}55` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 1fr 1fr 1fr 1fr auto', gap: 12, padding: '12px 16px', alignItems: 'center', fontSize: 12, color: T.cream }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.counterparty}</div>
        <div style={{ color: r.notes ? T.cream : T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || <em style={{ fontStyle: 'normal', color: T.dim }}>—</em>}</div>
        <div>
          <select value={r.category} onChange={e => updateInvoice(r.id, { category: e.target.value })} style={{ ...inp, padding: '4px 6px', fontSize: 11 }}>
            {ORG_INVOICE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {proj ? (
            <button onClick={() => onOpenProject?.(r.project_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.cyan, fontSize: 11, fontFamily: T.sans, padding: 0, textAlign: 'left' }}>{proj.name || 'Project'}</button>
          ) : <span style={{ color: T.dim, fontSize: 11 }}>—</span>}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.dim }}>{r.due_date || '—'}</div>
        <div style={{ textAlign: 'right', fontFamily: T.mono, fontWeight: 700 }}>{f$(r.amount || 0)}</div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
          {/* Status pill */}
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${statusColor}18`, color: statusColor, textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 }}>{r.status}</span>
          {/* Approve/decline only when relevant */}
          {isAP && r.status === 'pending' && (
            <>
              <button onClick={() => onApprove(r.id)} title="Approve" style={iconBtn('#1F7A4F')}>✓</button>
              <button onClick={() => onDecline(r.id)} title="Decline" style={iconBtn(T.alert)}>×</button>
            </>
          )}
          {isAP && r.status === 'approved' && (
            <>
              <button onClick={() => onMarkPaid(r.id)} title="Mark paid" style={iconBtn(T.pos)}>$</button>
              <button onClick={() => onReopen(r.id)} title="Reopen" style={iconBtn(T.dim)}>↺</button>
            </>
          )}
          {!isAP && (r.status === 'sent' || r.status === 'overdue') && (
            <button onClick={() => onMarkPaid(r.id)} title="Mark paid" style={iconBtn(T.pos)}>$</button>
          )}
          {(r.status === 'paid' || r.status === 'cancelled') && (
            <button onClick={() => onReopen(r.id)} title="Reopen" style={iconBtn(T.dim)}>↺</button>
          )}
          <button onClick={() => setCommentOpen(o => ({ ...o, [r.id]: !o[r.id] }))} title="Comment" style={iconBtn(T.cyan)}>💬</button>
          <button onClick={() => deleteInvoice(r.id)} title="Delete" style={iconBtn(T.alert)}>🗑</button>
        </div>
      </div>
      {isCommentOpen && (
        <div style={{ padding: '0 16px 12px' }}>
          <textarea value={draftVal} onChange={e => setCommentDraft(d => ({ ...d, [r.id]: e.target.value }))} placeholder="Note (e.g., 'pay next week', 'awaiting W9')" rows={2} style={{ ...inp, resize: 'vertical', fontSize: 12, fontFamily: T.sans, lineHeight: 1.5 }}/>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={() => saveComment(r.id)} style={{ padding: '5px 12px', borderRadius: T.rS, border: 'none', background: T.ink, color: T.paper, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans }}>Save</button>
            <button onClick={() => setCommentOpen(o => ({ ...o, [r.id]: false }))} style={{ padding: '5px 12px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.dim, fontSize: 10, cursor: 'pointer', fontFamily: T.sans }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function iconBtn(color) {
  return {
    width: 26, height: 26, borderRadius: 13, padding: 0,
    border: `1px solid ${color}40`, background: `${color}14`, color,
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: T.sans, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  };
}
