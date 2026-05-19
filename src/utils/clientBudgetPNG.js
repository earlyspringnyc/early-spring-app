/* ── Client-facing budget PNG (landscape, deck-ready) ──
   Renders section totals + agency fee + grand total to a 1920×1080
   PNG and triggers download. No line items, no margins, no actual
   costs, no net profit — only what the client should see. Drop the
   PNG into a slide and you're done. */

import { ct, ci } from './calc.js';
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

async function waitForFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
}

function buildClientRows(cats, ag, feeP, comp, project) {
  const rows = [];
  cats.forEach(c => {
    const totals = ct(c.items).totals;
    if (totals.clientPrice > 0 || c.items.length > 0) {
      rows.push({ label: c.name, value: totals.clientPrice });
    }
  });
  const agencyClient = (ag || []).reduce((a, it) => a + ci(it).clientPrice, 0);
  if (agencyClient > 0 || (ag || []).length > 0) {
    rows.push({ label: 'Agency Production Costs', value: agencyClient });
  }
  return rows;
}

export async function exportClientBudgetPNG(project, data, opts = {}) {
  await waitForFonts();

  const { cats = [], ag = [], comp, feeP = 0, activeBudgetName } = data;
  const rows = buildClientRows(cats, ag, feeP, comp, project);
  const productionSubtotal = comp?.productionSubtotal?.clientPrice || 0;
  const agencySubtotal = comp?.agencyCostsSubtotal?.clientPrice || 0;
  const agencyFee = comp?.agencyFee?.clientPrice || 0;
  const grandTotal = comp?.grandTotal || 0;
  const clientBudget = project?.clientBudget || 0;

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.textBaseline = 'alphabetic';

  // ── Paper ──
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // ── Margins / layout ──
  const M = 96;
  const headerY = M + 8;

  // ── Header: client + project + budget tag · date ──
  const clientName = (project?.client || '').toUpperCase();
  const projectName = project?.name || 'Production Budget';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const budgetTag = activeBudgetName ? activeBudgetName : 'Primary Budget';

  // Top eyebrow — client name (left), date (right)
  ctx.fillStyle = FADED;
  ctx.font = `700 14px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  const eyebrowLeft = clientName ? `${clientName} · PRODUCTION BUDGET` : 'PRODUCTION BUDGET';
  drawSpacedText(ctx, eyebrowLeft, M, headerY, 2.2);

  ctx.textAlign = 'right';
  drawSpacedText(ctx, dateStr.toUpperCase(), W - M, headerY, 2.2);

  // Project title (large)
  ctx.fillStyle = SAPPHIRE;
  ctx.font = `800 72px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText(projectName, M, headerY + 78);

  // Budget tag
  ctx.fillStyle = INK_60;
  ctx.font = `500 22px ${FONT_STACK}`;
  ctx.fillText(budgetTag, M, headerY + 116);

  // Thin sapphire rule under header
  ctx.strokeStyle = SAPPHIRE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(M, headerY + 158);
  ctx.lineTo(W - M, headerY + 158);
  ctx.stroke();

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

    ctx.font = `700 ${valueFs}px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(f0(r.value), M + leftColW, y);

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
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(f0(productionSubtotal), M + leftColW, subtotalsY + 14);

  ctx.font = `700 16px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'AGENCY COSTS SUBTOTAL', M, subtotalsY + 56, 1.4);
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(f0(agencySubtotal), M + leftColW, subtotalsY + 56);

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
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(f0(agencyFee), cx + cw, cardY + 100);

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
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(f0(grandTotal), cx + cw, gtBlockY + 88);

  if (clientBudget > 0) {
    const variance = clientBudget - grandTotal;
    const over = variance < 0;
    ctx.fillStyle = over ? '#7A1F1F' : INK_60;
    ctx.font = `500 14px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    const txt = over ? `${f0(Math.abs(variance))} over client budget` : `${f0(variance)} under client budget`;
    ctx.fillText(txt, cx + cw, gtBlockY + 116);
  }

  // ── Footer wordmark ──
  ctx.fillStyle = FADED;
  ctx.font = `700 11px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpacedText(ctx, 'EARLY SPRING', M, H - 48, 2.4);
  ctx.textAlign = 'right';
  drawSpacedText(ctx, 'CLIENT-FACING SUMMARY', W - M, H - 48, 2.4);

  // ── Download ──
  const filename = opts.filename || `${(project?.name || 'budget')}-client-summary.png`;
  await new Promise(resolve => {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      resolve();
    }, 'image/png');
  });
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
