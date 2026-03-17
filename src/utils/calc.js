import { f$ } from './format.js';

export function ci(item) {
  const cp = item.actualCost === 0 ? 0 : item.actualCost * (1 + item.margin);
  return { ...item, clientPrice: cp, variance: cp - item.actualCost };
}

export function ct(items) {
  const c = items.map(ci);
  const s = k => c.reduce((a, i) => a + i[k], 0);
  return { items: c, totals: { budget: s("budget"), estCost: s("estCost"), actualCost: s("actualCost"), clientPrice: s("clientPrice"), variance: s("variance") } };
}

export function calcProject(p) {
  const prod = p.cats.reduce((a, c) => { const t = ct(c.items).totals; return { actualCost: a.actualCost + t.actualCost, clientPrice: a.clientPrice + t.clientPrice, variance: a.variance + t.variance }; }, { actualCost: 0, clientPrice: 0, variance: 0 });
  const agT = p.ag.reduce((a, it) => { const c = ci(it); return { actualCost: a.actualCost + c.actualCost, clientPrice: a.clientPrice + c.clientPrice, variance: a.variance + c.variance }; }, { actualCost: 0, clientPrice: 0, variance: 0 });
  const fA = (prod.actualCost + agT.actualCost) * p.feeP, fC = (prod.clientPrice + agT.clientPrice) * p.feeP;
  const fee = { actualCost: fA, clientPrice: fC, variance: fC - fA };
  return { productionSubtotal: prod, agencyCostsSubtotal: agT, agencyFee: fee, grandTotal: fee.clientPrice + prod.clientPrice + agT.clientPrice, netProfit: prod.variance + agT.variance + fee.clientPrice };
}

export function isOverdue(doc) {
  if (!doc.dueDate || doc.status === "paid") return false;
  const p = doc.dueDate.split("/");
  if (p.length !== 3) return false;
  return new Date(p[2], p[0] - 1, p[1]) < new Date();
}

export function getPayStatus(itemId, docs) {
  const linked = (docs || []).filter(d => d.linkedItemId === itemId && d.type === "invoice");
  if (!linked.length) return "none";
  const totalAmt = linked.reduce((a, d) => a + d.amount, 0);
  const totalPaid = linked.reduce((a, d) => a + d.paidAmount, 0);
  if (totalPaid >= totalAmt && totalAmt > 0) return "paid";
  if (totalPaid > 0) return "partial";
  return "invoiced";
}

export function getVendorName(vendorId, vendors) {
  const v = (vendors || []).find(v => v.id === vendorId);
  return v ? v.name : "";
}
