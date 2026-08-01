/* ── Client-facing budget PNG (landscape, deck-ready) ──
   Renders section totals + agency fee + grand total to a 1920×1080
   PNG and triggers download. No line items, no margins, no actual
   costs, no net profit — only what the client should see. Drop the
   PNG into a slide and you're done. */

import { ct, ci, fmtRange, projectSupportsRanges } from './calc.js';
import { f0 } from './format.js';

const SAPPHIRE = '#0F52BA';
const PAPER = '#FFFFFF';
const INK_80 = 'rgba(15,82,186,.80)';
const INK_60 = 'rgba(15,82,186,.60)';
const FADED = 'rgba(15,82,186,.42)';
const RULE = 'rgba(15,82,186,.18)';
const HAIRLINE = 'rgba(15,82,186,.10)';

// Slide-friendly 16:9 at 2× DPR for crispness.
const W = 1920;
const H = 1080;
const DPR = 2;

const FONT_STACK = "'TWK Lausanne', -apple-system, 'Inter', system-ui, sans-serif";

// Detail-page geometry. Two columns per slide — a single column at a
// legible deck size only holds ~16 rows, which would push a normal budget
// to four or five files.
const DETAIL_TOP = 304;          // headerY (104) + 200, matching the summary body
const DETAIL_BOTTOM = H - 96 - 40;
const DETAIL_COL_H = DETAIL_BOTTOM - DETAIL_TOP;
const DETAIL_GAP = 80;
const SECTION_H = 58;
const ITEM_H = 38;
const DESC_H = 22;

async function waitForFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
}

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = W * DPR;
  c.height = H * DPR;
  return c;
}

// Shared page chrome: paper, eyebrow, title, budget tag, rule, footer.
// Returns the layout anchors the body draws against.
function drawChrome(ctx, { project, budgetTag, pageLabel, footerRight }) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const M = 96;
  const headerY = M + 8;
  const clientName = (project?.client || '').toUpperCase();
  const projectName = project?.name || 'Production Budget';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  ctx.fillStyle = FADED;
  ctx.font = `700 14px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, clientName ? `${clientName} · PRODUCTION BUDGET` : 'PRODUCTION BUDGET', M, headerY, 2.2);
  ctx.textAlign = 'right';
  drawSpacedText(ctx, dateStr.toUpperCase(), W - M, headerY, 2.2);

  ctx.fillStyle = SAPPHIRE;
  ctx.font = `800 72px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText(projectName, M, headerY + 78);

  ctx.fillStyle = INK_60;
  ctx.font = `500 22px ${FONT_STACK}`;
  ctx.fillText(pageLabel ? `${budgetTag} · ${pageLabel}` : budgetTag, M, headerY + 116);

  ctx.strokeStyle = SAPPHIRE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(M, headerY + 158);
  ctx.lineTo(W - M, headerY + 158);
  ctx.stroke();

  ctx.fillStyle = FADED;
  ctx.font = `700 11px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'EARLY SPRING', M, H - 48, 2.4);
  ctx.textAlign = 'right';
  drawSpacedText(ctx, (footerRight || 'BUDGET ESTIMATE').toUpperCase(), W - M, H - 48, 2.4);

  return { M, headerY };
}

// Flatten the budget into drawable blocks for the detail pages: a header
// per section, then a row per line item carrying a client price.
function buildDetailBlocks(cats, ag, showR) {
  const blocks = [];
  const banded = (lo, hi) => showR && Math.abs((hi || 0) - (lo || 0)) >= 0.5;
  const pushSection = (label, items, cat) => {
    const priced = (items || []).filter(it => ci(it).clientPrice > 0);
    if (!priced.length) return;
    const t = ct(items || [], cat).totals;
    blocks.push({ type: 'section', label, min: t.clientMin, max: t.clientMax, value: t.clientPrice, isRange: banded(t.clientMin, t.clientMax) });
    // An overlaid category quotes a band its items don't sum to, so the
    // lines are suppressed here exactly as in the PDF and the client view.
    if (showR && t.hasOverlay && banded(t.clientMin, t.clientMax)) {
      blocks.push({ type: 'item', label: 'Estimated range', desc: '', min: t.clientMin, max: t.clientMax, value: t.clientPrice, isRange: true });
      return;
    }
    priced.forEach(it => {
      const c = ci(it);
      blocks.push({
        type: 'item', label: it.name || '', desc: it.details || '',
        min: c.minClient, max: c.maxClient, value: c.clientPrice,
        isRange: banded(c.minClient, c.maxClient),
      });
    });
  };
  (cats || []).forEach(c => pushSection(c.name, c.items, c));
  pushSection('Agency Production Costs', ag, null);
  return blocks;
}

const measureBlock = (b) => b.type === 'section' ? SECTION_H : ITEM_H + (b.desc ? DESC_H : 0);

// Pack blocks into columns, then pair columns into pages.
function paginateBlocks(blocks, colH) {
  const cols = [];
  let cur = [], h = 0;
  const flush = () => { if (cur.length) { cols.push(cur); cur = []; h = 0; } };
  blocks.forEach((b, i) => {
    const bh = measureBlock(b);
    // Never leave a section header stranded at the foot of a column —
    // carry it over together with its first row.
    const needs = b.type === 'section' && blocks[i + 1] ? bh + measureBlock(blocks[i + 1]) : bh;
    if (h + needs > colH && cur.length) flush();
    cur.push(b);
    h += bh;
  });
  flush();
  const pages = [];
  for (let i = 0; i < cols.length; i += 2) pages.push(cols.slice(i, i + 2));
  return pages;
}

function renderDetailPage(ctx, columns, { M, fmtMoney, fmtR }) {
  const colW = (W - 2 * M - DETAIL_GAP) / 2;
  columns.forEach((col, ci2) => {
    const x = M + ci2 * (colW + DETAIL_GAP);
    let y = DETAIL_TOP;
    col.forEach(b => {
      const valueTxt = b.isRange ? fmtR(b.min, b.max) : fmtMoney(b.value);
      if (b.type === 'section') {
        ctx.fillStyle = FADED;
        ctx.font = `700 12px ${FONT_STACK}`;
        ctx.textAlign = 'left';
        drawSpacedText(ctx, (b.label || '').toUpperCase(), x, y, 1.6);
        ctx.fillStyle = INK_80;
        ctx.font = `700 13px ${FONT_STACK}`;
        ctx.textAlign = 'right';
        ctx.fillText(valueTxt, x + colW, y);
        ctx.strokeStyle = RULE;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x + colW, y + 12); ctx.stroke();
        y += SECTION_H;
        return;
      }
      const valueFs = b.isRange ? 15 : 18;
      ctx.font = `700 ${valueFs}px ${FONT_STACK}`;
      const valueW = ctx.measureText(valueTxt).width;

      ctx.fillStyle = SAPPHIRE;
      ctx.font = `500 18px ${FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.fillText(ellipsize(ctx, b.label, Math.max(80, colW - valueW - 28)), x, y);

      ctx.font = `700 ${valueFs}px ${FONT_STACK}`;
      ctx.textAlign = 'right';
      ctx.fillText(valueTxt, x + colW, y);

      if (b.desc) {
        ctx.fillStyle = INK_60;
        ctx.font = `400 14px ${FONT_STACK}`;
        ctx.textAlign = 'left';
        ctx.fillText(ellipsize(ctx, b.desc, colW - 40), x, y + 22);
      }
      y += ITEM_H + (b.desc ? DESC_H : 0);

      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + colW, y - 14); ctx.stroke();
    });
  });
}

async function downloadCanvas(canvas, filename) {
  await new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob) {
          console.error('[clientBudgetPNG] toBlob returned null — encode failed');
          reject(new Error('PNG encoding failed (canvas.toBlob returned null)'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        console.log('[clientBudgetPNG] download triggered:', filename, blob.size, 'bytes');
        resolve();
      }, 'image/png');
    } catch (e) {
      console.error('[clientBudgetPNG] toBlob threw:', e);
      reject(e);
    }
  });
}

function buildClientRows(cats, ag, feeP, comp, project) {
  const showR = projectSupportsRanges(project);
  const rows = [];
  cats.forEach(c => {
    const totals = ct(c.items, c).totals;
    if (totals.clientPrice > 0 || c.items.length > 0) {
      rows.push({
        label: c.name,
        value: totals.clientPrice,
        min: totals.clientMin,
        max: totals.clientMax,
        isRange: showR && Math.abs((totals.clientMax || 0) - (totals.clientMin || 0)) >= 0.5,
      });
    }
  });
  const agencyClient = (ag || []).reduce((a, it) => a + ci(it).clientPrice, 0);
  const agencyMin = (ag || []).reduce((a, it) => a + (ci(it).minClient || 0), 0);
  const agencyMax = (ag || []).reduce((a, it) => a + (ci(it).maxClient || 0), 0);
  if (agencyClient > 0 || (ag || []).length > 0) {
    rows.push({
      label: 'Agency Production Costs',
      value: agencyClient,
      min: agencyMin,
      max: agencyMax,
      isRange: showR && Math.abs(agencyMax - agencyMin) >= 0.5,
    });
  }
  return rows;
}

export async function exportClientBudgetPNG(project, data, opts = {}) {
  console.log('[clientBudgetPNG] entry');
  // Race waitForFonts against a 3s timeout — on some systems the
  // promise never resolves and the whole export hangs silently.
  await Promise.race([
    waitForFonts(),
    new Promise(res => setTimeout(res, 3000)),
  ]);
  console.log('[clientBudgetPNG] fonts ready (or timed out)');

  const { cats = [], ag = [], comp, feeP = 0, activeBudgetName } = data;
  const showR = projectSupportsRanges(project);
  const rows = buildClientRows(cats, ag, feeP, comp, project);
  const productionSubtotal = comp?.productionSubtotal?.clientPrice || 0;
  const productionMin = comp?.productionSubtotal?.clientMin || productionSubtotal;
  const productionMax = comp?.productionSubtotal?.clientMax || productionSubtotal;
  const productionIsRange = showR && Math.abs(productionMax - productionMin) >= 0.5;
  console.log('[clientBudgetPNG] rows:', rows.length, 'productionSubtotal:', productionSubtotal, 'showR:', showR);
  const agencySubtotal = comp?.agencyCostsSubtotal?.clientPrice || 0;
  const agencySubMin = comp?.agencyCostsSubtotal?.clientMin || agencySubtotal;
  const agencySubMax = comp?.agencyCostsSubtotal?.clientMax || agencySubtotal;
  const agencySubIsRange = showR && Math.abs(agencySubMax - agencySubMin) >= 0.5;
  const agencyFee = comp?.agencyFee?.clientPrice || 0;
  const agencyFeeMin = comp?.agencyFee?.minClient || agencyFee;
  const agencyFeeMax = comp?.agencyFee?.maxClient || agencyFee;
  const agencyFeeIsRange = showR && Math.abs(agencyFeeMax - agencyFeeMin) >= 0.5;
  const grandTotal = comp?.grandTotal || 0;
  const grandMin = comp?.grandMin || grandTotal;
  const grandMax = comp?.grandMax || grandTotal;
  const grandIsRange = showR && Math.abs(grandMax - grandMin) >= 0.5;
  const clientBudget = project?.clientBudget || 0;
  const fmtMoney = (v) => f0(v);
  const fmtR = (lo, hi) => fmtRange(lo, hi, fmtMoney);

  const budgetTag = activeBudgetName ? activeBudgetName : 'Primary Budget';

  // Line-item detail gets its own slide(s): a 16:9 frame can't hold 30+
  // rows AND the summary at a size anyone can read off a projector.
  const detailPages = paginateBlocks(buildDetailBlocks(cats, ag, showR), DETAIL_COL_H);
  const totalPages = 1 + detailPages.length;
  const pageTag = (n) => totalPages > 1 ? ` · ${n} / ${totalPages}` : '';

  const canvas = newCanvas();
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.textBaseline = 'alphabetic';

  const { M, headerY } = drawChrome(ctx, {
    project, budgetTag,
    footerRight: `Budget Estimate${pageTag(1)}`,
  });

  // ── Body: two columns — line entries on left, totals card on right ──
  const bodyTop = headerY + 200;
  const bodyBottom = H - M - 40;
  const leftColW = 980;
  const rightColX = M + leftColW + 80;
  const rightColW = W - M - rightColX;

  // LEFT — section totals
  ctx.fillStyle = FADED;
  ctx.font = `700 12px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'SECTION', M, bodyTop, 1.6);
  ctx.textAlign = 'right';
  drawSpacedText(ctx, 'TOTAL', M + leftColW, bodyTop, 1.6);

  // Hairline under headers
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, bodyTop + 14);
  ctx.lineTo(M + leftColW, bodyTop + 14);
  ctx.stroke();

  // Section rows — auto-fit row height to available space
  const sectionsAvailable = bodyBottom - (bodyTop + 14) - 220; // reserve space for subtotals block at bottom of left col
  const rowCount = Math.max(rows.length, 1);
  const rowH = Math.min(64, Math.max(40, Math.floor(sectionsAvailable / rowCount)));
  const labelFs = rowH >= 56 ? 22 : (rowH >= 48 ? 20 : 18);
  const valueFs = rowH >= 56 ? 24 : (rowH >= 48 ? 22 : 20);

  let y = bodyTop + 14 + rowH;
  rows.forEach((r, idx) => {
    ctx.fillStyle = SAPPHIRE;
    ctx.font = `500 ${labelFs}px ${FONT_STACK}`;
    ctx.textAlign = 'left';
    // Truncate label if too long
    const maxLabelW = leftColW - 260;
    const label = ellipsize(ctx, r.label, maxLabelW);
    ctx.fillText(label, M, y);

    ctx.font = `700 ${r.isRange ? Math.max(16, valueFs - 4) : valueFs}px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(r.isRange ? fmtR(r.min, r.max) : fmtMoney(r.value), M + leftColW, y);

    // Row hairline
    if (idx < rows.length - 1) {
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M, y + 14);
      ctx.lineTo(M + leftColW, y + 14);
      ctx.stroke();
    }
    y += rowH;
  });

  // Production + Agency subtotals block (bottom of left column)
  const subtotalsY = bodyBottom - 90;
  ctx.strokeStyle = SAPPHIRE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(M, subtotalsY - 18);
  ctx.lineTo(M + leftColW, subtotalsY - 18);
  ctx.stroke();

  ctx.fillStyle = INK_80;
  ctx.font = `700 16px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'PRODUCTION SUBTOTAL', M, subtotalsY + 14, 1.4);
  ctx.font = `700 ${productionIsRange ? 18 : 22}px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(productionIsRange ? fmtR(productionMin, productionMax) : fmtMoney(productionSubtotal), M + leftColW, subtotalsY + 14);

  ctx.font = `700 16px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'AGENCY COSTS SUBTOTAL', M, subtotalsY + 56, 1.4);
  ctx.font = `700 ${agencySubIsRange ? 18 : 22}px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(agencySubIsRange ? fmtR(agencySubMin, agencySubMax) : fmtMoney(agencySubtotal), M + leftColW, subtotalsY + 56);

  // ── RIGHT: Totals card ──
  const cardX = rightColX;
  const cardY = bodyTop - 20;
  const cardW = rightColW;
  const cardH = bodyBottom - cardY;

  // Card fill (subtle sapphire wash)
  ctx.fillStyle = 'rgba(15,82,186,.04)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 8);
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 8);
  ctx.stroke();

  // Card padding
  const cx = cardX + 36;
  const cw = cardW - 72;

  ctx.fillStyle = FADED;
  ctx.font = `700 12px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'SUMMARY', cx, cardY + 44, 1.6);

  // Agency Fee row
  ctx.fillStyle = INK_80;
  ctx.font = `500 18px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText(`Agency Fee (${Math.round((feeP || 0) * 100)}%)`, cx, cardY + 100);
  ctx.fillStyle = SAPPHIRE;
  ctx.font = `700 ${agencyFeeIsRange ? 18 : 22}px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(agencyFeeIsRange ? fmtR(agencyFeeMin, agencyFeeMax) : fmtMoney(agencyFee), cx + cw, cardY + 100);

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cardY + 124);
  ctx.lineTo(cx + cw, cardY + 124);
  ctx.stroke();

  // Optional client budget reference
  if (clientBudget > 0) {
    ctx.fillStyle = INK_60;
    ctx.font = `500 18px ${FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.fillText('Client Budget', cx, cardY + 172);
    ctx.font = `500 22px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(f0(clientBudget), cx + cw, cardY + 172);

    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cardY + 196);
    ctx.lineTo(cx + cw, cardY + 196);
    ctx.stroke();
  }

  // GRAND TOTAL — anchored to bottom of card, prominent
  const gtBlockY = cardY + cardH - 140;
  ctx.fillStyle = SAPPHIRE;
  ctx.lineWidth = 2;
  ctx.strokeStyle = SAPPHIRE;
  ctx.beginPath();
  ctx.moveTo(cx, gtBlockY);
  ctx.lineTo(cx + cw, gtBlockY);
  ctx.stroke();

  ctx.fillStyle = FADED;
  ctx.font = `700 13px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'GRAND TOTAL', cx, gtBlockY + 34, 1.8);

  ctx.fillStyle = SAPPHIRE;
  ctx.font = `800 ${grandIsRange ? 40 : 56}px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(grandIsRange ? fmtR(grandMin, grandMax) : fmtMoney(grandTotal), cx + cw, gtBlockY + 88);

  if (clientBudget > 0) {
    // Variance against the high end of the band — if the top of the
    // range is over budget, the client should see that, not just the
    // midpoint.
    const cmp = grandIsRange ? grandMax : grandTotal;
    const variance = clientBudget - cmp;
    const over = variance < 0;
    ctx.fillStyle = over ? '#7A1F1F' : INK_60;
    ctx.font = `500 14px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    const txt = over ? `${f0(Math.abs(variance))} over client budget` : `${f0(variance)} under client budget`;
    ctx.fillText(txt, cx + cw, gtBlockY + 116);
  }

  // ── Download: summary first, then a slide per detail page ──
  const filename = opts.filename || `${(project?.name || 'budget')}-client-summary.png`;
  const base = filename.replace(/\.png$/i, '');
  console.log('[clientBudgetPNG] summary rendered; detail pages:', detailPages.length);
  await downloadCanvas(canvas, filename);

  for (let i = 0; i < detailPages.length; i++) {
    const dCanvas = newCanvas();
    const dCtx = dCanvas.getContext('2d');
    dCtx.scale(DPR, DPR);
    dCtx.textBaseline = 'alphabetic';
    const chrome = drawChrome(dCtx, {
      project, budgetTag,
      pageLabel: detailPages.length > 1 ? `Line Item Detail ${i + 1} of ${detailPages.length}` : 'Line Item Detail',
      footerRight: `Line Item Detail${pageTag(i + 2)}`,
    });
    renderDetailPage(dCtx, detailPages[i], { M: chrome.M, fmtMoney, fmtR });
    // Chrome throttles rapid programmatic downloads; a beat between them
    // keeps the browser from dropping the later files.
    await new Promise(res => setTimeout(res, 350));
    await downloadCanvas(dCanvas, `${base}-detail-${i + 1}.png`);
  }
}

// Canvas letterSpacing is inconsistent across browsers; manually draw
// each glyph with a fixed extra advance. Good enough for the small
// uppercase labels we use it on.
function drawSpacedText(ctx, text, x, y, spacing) {
  if (!text) return;
  const align = ctx.textAlign;
  if (align === 'right') {
    const width = measureSpaced(ctx, text, spacing);
    drawSpacedFromLeft(ctx, text, x - width, y, spacing);
  } else if (align === 'center') {
    const width = measureSpaced(ctx, text, spacing);
    drawSpacedFromLeft(ctx, text, x - width / 2, y, spacing);
  } else {
    drawSpacedFromLeft(ctx, text, x, y, spacing);
  }
}

function drawSpacedFromLeft(ctx, text, x, y, spacing) {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = prevAlign;
}

function measureSpaced(ctx, text, spacing) {
  let w = 0;
  const chars = [...text];
  chars.forEach((ch, i) => {
    w += ctx.measureText(ch).width;
    if (i < chars.length - 1) w += spacing;
  });
  return w;
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
