import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ci } from './calc.js';
import { f$, fp } from './format.js';

// Client-facing Production Estimate PDF
// project: { name, client, ... }
// bd: { cats, ag, comp, feeP }
// opts: { title, filename }
export function exportEstimatePDF(project, bd, opts = {}) {
  const title = opts.title || 'Production Estimate';
  const filename = opts.filename || `${project?.name || 'estimate'}-production-estimate.pdf`;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(title, margin, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  const sub = [project?.name, project?.client].filter(Boolean).join(' — ');
  if (sub) doc.text(sub, margin, 74);
  const dateStr = new Date().toLocaleDateString();
  doc.text(dateStr, pageW - margin, 74, { align: 'right' });

  // Build rows
  const body = [];
  (bd.cats || []).forEach(c => {
    const items = (c.items || []).filter(it => ci(it).clientPrice > 0);
    if (!items.length) return;
    body.push([
      { content: c.name.toUpperCase(), colSpan: 3, styles: { fillColor: [245, 244, 241], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 9 } },
    ]);
    let catTotal = 0;
    items.forEach(it => {
      const price = ci(it).clientPrice;
      catTotal += price;
      body.push([
        it.name || '',
        it.details || '',
        { content: f$(price), styles: { halign: 'right' } },
      ]);
    });
    if (items.length > 1) {
      body.push([
        { content: `${c.name} Subtotal`, colSpan: 2, styles: { fontStyle: 'bold', fontSize: 8, textColor: [100, 100, 100] } },
        { content: f$(catTotal), styles: { halign: 'right', fontStyle: 'bold', fontSize: 8, textColor: [100, 100, 100] } },
      ]);
    }
  });

  // Production subtotal
  body.push([
    { content: 'PRODUCTION SUBTOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [250, 250, 248] } },
    { content: f$(bd.comp.productionSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', fillColor: [250, 250, 248] } },
  ]);

  // Agency section
  const agItems = (bd.ag || []).filter(it => ci(it).clientPrice > 0);
  if (agItems.length) {
    body.push([
      { content: 'AGENCY', colSpan: 3, styles: { fillColor: [245, 244, 241], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 9 } },
    ]);
    agItems.forEach(it => {
      body.push([
        it.name || '',
        it.details || '',
        { content: f$(ci(it).clientPrice), styles: { halign: 'right' } },
      ]);
    });
    body.push([
      { content: 'AGENCY SUBTOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [250, 250, 248] } },
      { content: f$(bd.comp.agencyCostsSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', fillColor: [250, 250, 248] } },
    ]);
  }

  if (bd.comp.agencyFee?.clientPrice) {
    body.push([
      { content: `AGENCY FEE (${fp(bd.feeP)})`, colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: f$(bd.comp.agencyFee.clientPrice), styles: { halign: 'right', fontStyle: 'bold' } },
    ]);
  }

  body.push([
    { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [30, 30, 30], textColor: [255, 255, 255] } },
    { content: f$(bd.comp.grandTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: [30, 30, 30], textColor: [255, 255, 255] } },
  ]);

  autoTable(doc, {
    startY: 96,
    head: [[
      { content: 'Item', styles: { halign: 'left' } },
      { content: 'Description', styles: { halign: 'left' } },
      { content: 'Cost', styles: { halign: 'right' } },
    ]],
    body,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineColor: [230, 230, 228], lineWidth: 0.5, textColor: [30, 30, 30] },
    headStyles: { fillColor: [255, 255, 255], textColor: [120, 120, 120], fontStyle: 'bold', fontSize: 8, lineWidth: { bottom: 1 }, lineColor: [200, 200, 200] },
    columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 90, halign: 'right' } },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`${project?.name || ''}`, margin, pageH - 20);
      doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${pageCount}`, pageW - margin, pageH - 20, { align: 'right' });
    },
  });

  doc.save(filename);
}

// Internal Production Budget PDF (includes cost + margin + client price)
export function exportBudgetPDF(project, data, opts = {}) {
  const { cats, ag, comp, feeP, vendors = [] } = data;
  const title = opts.title || 'Production Budget';
  const filename = opts.filename || `${project?.name || 'budget'}-production-budget.pdf`;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(title, margin, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  const sub = [project?.name, project?.client].filter(Boolean).join(' — ');
  if (sub) doc.text(sub, margin, 68);
  doc.text(new Date().toLocaleDateString(), pageW - margin, 68, { align: 'right' });

  const body = [];
  (cats || []).forEach(c => {
    const items = (c.items || []);
    if (!items.length) return;
    body.push([{ content: c.name.toUpperCase(), colSpan: 6, styles: { fillColor: [245, 244, 241], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 9 } }]);
    items.forEach(it => {
      const cp = it.actualCost === 0 ? 0 : it.actualCost * (1 + it.margin);
      const vendorName = vendors.find(v => v.id === it.vendorId)?.name || '';
      body.push([
        it.name || '',
        it.details || '',
        vendorName,
        { content: f$(it.actualCost || 0), styles: { halign: 'right' } },
        { content: fp(it.margin || 0), styles: { halign: 'right' } },
        { content: f$(cp), styles: { halign: 'right' } },
      ]);
    });
  });

  body.push([
    { content: 'PRODUCTION SUBTOTAL', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [250, 250, 248], halign: 'right' } },
    { content: f$(comp.productionSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', fillColor: [250, 250, 248] } },
  ]);

  const agItems = (ag || []);
  if (agItems.length) {
    body.push([{ content: 'AGENCY', colSpan: 6, styles: { fillColor: [245, 244, 241], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 9 } }]);
    agItems.forEach(it => {
      const cp = it.actualCost === 0 ? 0 : it.actualCost * (1 + it.margin);
      body.push([
        it.name || '',
        it.details || '',
        '',
        { content: f$(it.actualCost || 0), styles: { halign: 'right' } },
        { content: fp(it.margin || 0), styles: { halign: 'right' } },
        { content: f$(cp), styles: { halign: 'right' } },
      ]);
    });
    body.push([
      { content: 'AGENCY SUBTOTAL', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [250, 250, 248], halign: 'right' } },
      { content: f$(comp.agencyCostsSubtotal.clientPrice), styles: { halign: 'right', fontStyle: 'bold', fillColor: [250, 250, 248] } },
    ]);
  }

  if (comp.agencyFee?.clientPrice) {
    body.push([
      { content: `AGENCY FEE (${fp(feeP)})`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: f$(comp.agencyFee.clientPrice), styles: { halign: 'right', fontStyle: 'bold' } },
    ]);
  }

  body.push([
    { content: 'GRAND TOTAL', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [30, 30, 30], textColor: [255, 255, 255], halign: 'right' } },
    { content: f$(comp.grandTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: [30, 30, 30], textColor: [255, 255, 255] } },
  ]);

  body.push([
    { content: 'NET PROFIT', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: f$(comp.netProfit), styles: { halign: 'right', fontStyle: 'bold' } },
  ]);

  autoTable(doc, {
    startY: 86,
    head: [[
      'Item', 'Description', 'Vendor',
      { content: 'Actual Cost', styles: { halign: 'right' } },
      { content: 'Margin', styles: { halign: 'right' } },
      { content: 'Client Price', styles: { halign: 'right' } },
    ]],
    body,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, lineColor: [230, 230, 228], lineWidth: 0.5, textColor: [30, 30, 30] },
    headStyles: { fillColor: [255, 255, 255], textColor: [120, 120, 120], fontStyle: 'bold', fontSize: 8, lineWidth: { bottom: 1 }, lineColor: [200, 200, 200] },
    columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 100 }, 3: { cellWidth: 80 }, 4: { cellWidth: 60 }, 5: { cellWidth: 90 } },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`${project?.name || ''}`, margin, pageH - 18);
      doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${pageCount}`, pageW - margin, pageH - 18, { align: 'right' });
    },
  });

  doc.save(filename);
}
