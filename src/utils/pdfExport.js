import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ci } from './calc.js';
import { f$ } from './format.js';

// Early Spring brand tokens (RGB triplets — jsPDF colors)
const INK   = [15, 82, 186];        // Sapphire
const FADED = [133, 159, 215];      // ~ rgba(15,82,186,.42) on paper
const RULE  = [205, 215, 235];      // ~ rgba(15,82,186,.18) on paper
const ALERT = [122, 31, 31];

// Brand header — sapphire wordmark + thin rule, used on every export.
function drawBrandHeader(doc, opts) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = opts.margin;

  // Early Spring wordmark (text rendition since we're not embedding the SVG/font)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.setCharSpace(2);
  doc.text('EARLY SPRING', margin, 44);
  doc.setCharSpace(0);

  // Right-aligned: Lab tag + date
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...FADED);
  const labText = (opts.labTag || '').toUpperCase();
  if (labText) doc.text(labText, pageW - margin, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...FADED);
  doc.text(new Date().toLocaleDateString(), pageW - margin, 56, { align: 'right' });

  // Faint rule
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(margin, 64, pageW - margin, 64);
}

function drawTitle(doc, { kicker, title, sub, margin }) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.setCharSpace(1.5);
  doc.text((kicker || '').toUpperCase(), margin, 96);
  doc.setCharSpace(0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  doc.text(title || '', margin, 128);

  if (sub) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...FADED);
    doc.text(sub, margin, 148);
  }
}

function drawFooter(doc, opts) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = opts.margin;
  const pageCount = doc.internal.getNumberOfPages();
  const pageNum = doc.internal.getCurrentPageInfo().pageNumber;

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 36, pageW - margin, pageH - 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...FADED);
  doc.text('Prepared in Morgan · Early Spring', margin, pageH - 20);
  doc.text(`${pageNum} / ${pageCount}`, pageW - margin, pageH - 20, { align: 'right' });
}

const baseTable = (margin, opts = {}) => ({
  styles: { font: 'helvetica', fontSize: 10, cellPadding: { top: 8, right: 8, bottom: 8, left: 8 }, lineColor: RULE, lineWidth: 0.5, textColor: INK, fillColor: [255, 255, 255] },
  headStyles: { fillColor: [255, 255, 255], textColor: FADED, fontStyle: 'bold', fontSize: 8, lineWidth: { bottom: 1 }, lineColor: INK, cellPadding: { top: 6, right: 8, bottom: 8, left: 8 } },
  alternateRowStyles: { fillColor: [255, 255, 255] },
  margin: { left: margin, right: margin },
  ...opts,
});

// ─────────────────────────────────────────────────────────────────────
// Client-facing Production Estimate PDF
// project: { name, client, ... }
// bd: { cats, ag, comp, feeP }
// opts: { title, filename }
// ─────────────────────────────────────────────────────────────────────
export function exportEstimatePDF(project, bd, opts = {}) {
  const filename = opts.filename || `${project?.name || 'estimate'}-production-estimate.pdf`;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;

  drawBrandHeader(doc, { margin, labTag: `Lab · ${project?.client || 'Client'}` });
  drawTitle(doc, {
    margin,
    kicker: 'Production Estimate',
    title: project?.name || 'Estimate',
    sub: [project?.client, project?.eventDate && `Event · ${project.eventDate}`].filter(Boolean).join('  ·  '),
  });

  // Build rows
  const body = [];
  (bd.cats || []).forEach(c => {
    const items = (c.items || []).filter(it => ci(it).clientPrice > 0);
    if (!items.length) return;
    body.push([
      { content: (c.name || '').toUpperCase(), colSpan: 3, styles: { fontStyle: 'bold', fontSize: 9, textColor: INK, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 14, right: 8, bottom: 6, left: 8 } } },
    ]);
    let catTotal = 0;
    items.forEach(it => {
      const price = ci(it).clientPrice;
      catTotal += price;
      body.push([
        it.name || '',
        { content: it.details || '', styles: { textColor: FADED } },
        { content: f$(price), styles: { halign: 'right' } },
      ]);
    });
    if (items.length > 1) {
      body.push([
        { content: `${c.name} subtotal`, colSpan: 2, styles: { fontStyle: 'bold', fontSize: 9, textColor: FADED, halign: 'right' } },
        { content: f$(catTotal), styles: { halign: 'right', fontStyle: 'bold', fontSize: 9, textColor: FADED } },
      ]);
    }
  });

  // Production subtotal
  body.push([
    { content: 'PRODUCTION SUBTOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', textColor: INK, fontSize: 9, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 14, right: 8, bottom: 8, left: 8 } } },
    { content: f$(bd.comp.productionSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', textColor: INK, fontSize: 9, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 14, right: 8, bottom: 8, left: 8 } } },
  ]);

  // Agency section
  const agItems = (bd.ag || []).filter(it => ci(it).clientPrice > 0);
  if (agItems.length) {
    body.push([
      { content: 'AGENCY', colSpan: 3, styles: { fontStyle: 'bold', fontSize: 9, textColor: INK, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 14, right: 8, bottom: 6, left: 8 } } },
    ]);
    agItems.forEach(it => {
      body.push([
        it.name || '',
        { content: it.details || '', styles: { textColor: FADED } },
        { content: f$(ci(it).clientPrice), styles: { halign: 'right' } },
      ]);
    });
    body.push([
      { content: 'AGENCY SUBTOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', textColor: FADED, fontSize: 9 } },
      { content: f$(bd.comp.agencyCostsSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', textColor: FADED, fontSize: 9 } },
    ]);
  }

  if (bd.comp.agencyFee?.clientPrice) {
    body.push([
      { content: 'AGENCY FEE', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', textColor: INK, fontSize: 9 } },
      { content: f$(bd.comp.agencyFee.clientPrice), styles: { halign: 'right', fontStyle: 'bold', textColor: INK, fontSize: 9 } },
    ]);
  }

  // Grand total — no inverse fill, just a thick top rule and large display number
  body.push([
    { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fontSize: 11, halign: 'right', textColor: INK, lineWidth: { top: 2 }, lineColor: INK, cellPadding: { top: 18, right: 8, bottom: 12, left: 8 } } },
    { content: f$(bd.comp.grandTotal), styles: { halign: 'right', fontStyle: 'bold', fontSize: 16, textColor: INK, lineWidth: { top: 2 }, lineColor: INK, cellPadding: { top: 14, right: 8, bottom: 10, left: 8 } } },
  ]);

  autoTable(doc, {
    ...baseTable(margin),
    startY: 168,
    head: [[
      { content: 'Item', styles: { halign: 'left' } },
      { content: 'Description', styles: { halign: 'left' } },
      { content: 'Cost', styles: { halign: 'right' } },
    ]],
    body,
    columnStyles: { 0: { cellWidth: 170 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 100, halign: 'right' } },
    didDrawPage: () => drawFooter(doc, { margin }),
  });

  doc.save(filename);
}

// ─────────────────────────────────────────────────────────────────────
// Internal Production Budget PDF (includes cost + margin + client price)
// ─────────────────────────────────────────────────────────────────────
export function exportBudgetPDF(project, data, opts = {}) {
  const { cats, ag, comp, feeP, vendors = [] } = data;
  const filename = opts.filename || `${project?.name || 'budget'}-production-budget.pdf`;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const margin = 40;

  drawBrandHeader(doc, { margin, labTag: `Internal · ${project?.client || 'Client'}` });
  drawTitle(doc, {
    margin,
    kicker: 'Production Budget',
    title: project?.name || 'Budget',
    sub: [project?.client, 'Internal — cost, margin, client price'].filter(Boolean).join('  ·  '),
  });

  const fp = (v) => `${Math.round((v || 0) * 100)}%`;
  const body = [];
  (cats || []).forEach(c => {
    const items = (c.items || []);
    if (!items.length) return;
    body.push([{ content: (c.name || '').toUpperCase(), colSpan: 6, styles: { fontStyle: 'bold', fontSize: 9, textColor: INK, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 12, right: 8, bottom: 6, left: 8 } } }]);
    items.forEach(it => {
      const cp = it.actualCost === 0 ? 0 : it.actualCost * (1 + it.margin);
      const vendorName = vendors.find(v => v.id === it.vendorId)?.name || '';
      body.push([
        it.name || '',
        { content: it.details || '', styles: { textColor: FADED } },
        { content: vendorName, styles: { textColor: FADED } },
        { content: f$(it.actualCost || 0), styles: { halign: 'right' } },
        { content: fp(it.margin || 0), styles: { halign: 'right', textColor: FADED } },
        { content: f$(cp), styles: { halign: 'right', fontStyle: 'bold' } },
      ]);
    });
  });

  body.push([
    { content: 'PRODUCTION SUBTOTAL', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', textColor: INK, fontSize: 9, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 12, right: 8, bottom: 8, left: 8 } } },
    { content: f$(comp.productionSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', textColor: INK, fontSize: 9, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 12, right: 8, bottom: 8, left: 8 } } },
  ]);

  const agItems = (ag || []);
  if (agItems.length) {
    body.push([{ content: 'AGENCY', colSpan: 6, styles: { fontStyle: 'bold', fontSize: 9, textColor: INK, lineWidth: { top: 1 }, lineColor: INK, cellPadding: { top: 12, right: 8, bottom: 6, left: 8 } } }]);
    agItems.forEach(it => {
      const cp = it.actualCost === 0 ? 0 : it.actualCost * (1 + it.margin);
      body.push([
        it.name || '',
        { content: it.details || '', styles: { textColor: FADED } },
        '',
        { content: f$(it.actualCost || 0), styles: { halign: 'right' } },
        { content: fp(it.margin || 0), styles: { halign: 'right', textColor: FADED } },
        { content: f$(cp), styles: { halign: 'right', fontStyle: 'bold' } },
      ]);
    });
    body.push([
      { content: 'AGENCY SUBTOTAL', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', textColor: FADED, fontSize: 9 } },
      { content: f$(comp.agencyCostsSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', textColor: FADED, fontSize: 9 } },
    ]);
  }

  if (comp.agencyFee?.clientPrice) {
    body.push([
      { content: `AGENCY FEE (${fp(feeP)})`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', textColor: INK, fontSize: 9 } },
      { content: f$(comp.agencyFee.clientPrice), styles: { halign: 'right', fontStyle: 'bold', textColor: INK, fontSize: 9 } },
    ]);
  }

  body.push([
    { content: 'GRAND TOTAL', colSpan: 5, styles: { fontStyle: 'bold', fontSize: 11, halign: 'right', textColor: INK, lineWidth: { top: 2 }, lineColor: INK, cellPadding: { top: 16, right: 8, bottom: 10, left: 8 } } },
    { content: f$(comp.grandTotal), styles: { halign: 'right', fontStyle: 'bold', fontSize: 14, textColor: INK, lineWidth: { top: 2 }, lineColor: INK, cellPadding: { top: 14, right: 8, bottom: 10, left: 8 } } },
  ]);

  body.push([
    { content: 'NET PROFIT', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', textColor: comp.netProfit < 0 ? ALERT : INK, fontSize: 9 } },
    { content: f$(comp.netProfit), styles: { halign: 'right', fontStyle: 'bold', textColor: comp.netProfit < 0 ? ALERT : INK, fontSize: 9 } },
  ]);

  autoTable(doc, {
    ...baseTable(margin),
    startY: 168,
    head: [[
      'Item', 'Description', 'Vendor',
      { content: 'Actual Cost', styles: { halign: 'right' } },
      { content: 'Margin', styles: { halign: 'right' } },
      { content: 'Client Price', styles: { halign: 'right' } },
    ]],
    body,
    columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 110 }, 3: { cellWidth: 90 }, 4: { cellWidth: 60 }, 5: { cellWidth: 100 } },
    didDrawPage: () => drawFooter(doc, { margin }),
  });

  doc.save(filename);
}
