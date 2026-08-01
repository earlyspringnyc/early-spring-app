import { f$ } from './format.js';

// Single source of truth for whether a project's budget should
// display as ranges. Pitching projects default-on (so the UI shows
// the toggle as enabled before the user has touched it); any other
// stage defaults off unless the user explicitly flipped it on.
// All client-facing exports must use this — a strict
// `!!project.budgetSupportsRanges` check misses the pitching default.
export function projectSupportsRanges(project) {
  if (!project) return false;
  if (project.budgetSupportsRanges === true) return true;
  if (project.budgetSupportsRanges === false) return false;
  return (project.stage || '').toLowerCase() === 'pitching';
}

// Range support: items can be flagged as `isRange: true` with
// `minPrice` + `maxPrice` instead of (or alongside) a single client
// price — used on pitching budgets where the bid is given as a band.
// For non-range items, minClient === maxClient === clientPrice, so
// summation logic stays uniform.
export function ci(item) {
  if (item.excluded) return { ...item, clientPrice: 0, minClient: 0, maxClient: 0, variance: 0, _originalCost: item.actualCost * (1 + item.margin) };

  if (item.isRange) {
    const minP = Number(item.minPrice) || 0;
    const maxP = Number(item.maxPrice) || 0;
    // Midpoint stands in for clientPrice where a single number is
    // still needed (variance reports, legacy exports).
    const mid = (minP + maxP) / 2;
    return { ...item, clientPrice: mid, minClient: minP, maxClient: maxP, variance: mid - item.actualCost };
  }

  // Override takes precedence over the cost × margin calc. Set
  // by editing the Client column directly; cleared via the × that
  // appears next to overridden amounts.
  const hasOverride = typeof item.clientPriceOverride === 'number' && isFinite(item.clientPriceOverride) && item.clientPriceOverride >= 0;
  const cp = hasOverride
    ? item.clientPriceOverride
    : (item.actualCost === 0 ? 0 : item.actualCost * (1 + item.margin));
  return { ...item, clientPrice: cp, minClient: cp, maxClient: cp, variance: cp - item.actualCost };
}

// Optionally apply a category-level range overlay (cat.rangeMin /
// cat.rangeMax) that supersedes the computed sum on display. Both
// the overlaid and raw sums are returned so the UI can flag when
// they disagree.
export function ct(items, cat) {
  const c = items.map(ci);
  const s = k => c.reduce((a, i) => a + (i[k] || 0), 0);
  const sumMin = s('minClient');
  const sumMax = s('maxClient');
  const overlayMinRaw = cat ? Number(cat.rangeMin) : NaN;
  const overlayMaxRaw = cat ? Number(cat.rangeMax) : NaN;
  const hasOverlay = Number.isFinite(overlayMinRaw) && Number.isFinite(overlayMaxRaw)
    && (overlayMinRaw > 0 || overlayMaxRaw > 0);
  const displayMin = hasOverlay ? overlayMinRaw : sumMin;
  const displayMax = hasOverlay ? overlayMaxRaw : sumMax;
  return {
    items: c,
    totals: {
      budget: s('budget'),
      estCost: s('estCost'),
      actualCost: s('actualCost'),
      clientPrice: s('clientPrice'),
      variance: s('variance'),
      clientMin: displayMin,
      clientMax: displayMax,
      sumMin,
      sumMax,
      hasOverlay,
    },
  };
}

export function calcProject(p) {
  const prod = p.cats.reduce((a, c) => {
    const t = ct(c.items, c).totals;
    return {
      actualCost: a.actualCost + t.actualCost,
      clientPrice: a.clientPrice + t.clientPrice,
      variance: a.variance + t.variance,
      clientMin: a.clientMin + (t.clientMin || 0),
      clientMax: a.clientMax + (t.clientMax || 0),
    };
  }, { actualCost: 0, clientPrice: 0, variance: 0, clientMin: 0, clientMax: 0 });
  const agT = p.ag.reduce((a, it) => {
    const c = ci(it);
    return {
      actualCost: a.actualCost + c.actualCost,
      clientPrice: a.clientPrice + c.clientPrice,
      variance: a.variance + c.variance,
      clientMin: a.clientMin + (c.minClient || 0),
      clientMax: a.clientMax + (c.maxClient || 0),
    };
  }, { actualCost: 0, clientPrice: 0, variance: 0, clientMin: 0, clientMax: 0 });
  const fA = (prod.actualCost + agT.actualCost) * p.feeP, fC = (prod.clientPrice + agT.clientPrice) * p.feeP;
  // Agency fee at a flat % rides on the displayed prices: a low-end
  // total gets the low-end fee, high-end gets the high-end fee.
  const fee = {
    actualCost: fA,
    clientPrice: fC,
    variance: fC - fA,
    minClient: (prod.clientMin + agT.clientMin) * p.feeP,
    maxClient: (prod.clientMax + agT.clientMax) * p.feeP,
  };
  const grandTotal = fee.clientPrice + prod.clientPrice + agT.clientPrice;
  const grandMin = fee.minClient + prod.clientMin + agT.clientMin;
  const grandMax = fee.maxClient + prod.clientMax + agT.clientMax;
  // Rep fee is a % of the FINAL client spend (the number on the
  // invoice), not the agency fee cost. So a 10% rep fee on a
  // $250K client total is $25K — the rep gets paid against what
  // the client actually pays you.
  const repFeeAmt = p.repFeeEnabled ? grandTotal * (p.repFeeP || 0.10) : 0;
  const netProfit = prod.variance + agT.variance + fee.clientPrice - repFeeAmt;
  return { productionSubtotal: prod, agencyCostsSubtotal: agT, agencyFee: fee, repFee: repFeeAmt, grandTotal, grandMin, grandMax, netProfit };
}

// Format a range or a single number. Collapses when min === max
// (within $0.50 to dodge midpoint float noise) so totals don't
// display as awkward "$5,000 – $5,000".
export function fmtRange(min, max, formatter = f$) {
  const a = Number(min) || 0;
  const b = Number(max) || 0;
  if (Math.abs(a - b) < 0.5) return formatter(a);
  return `${formatter(a)} – ${formatter(b)}`;
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
