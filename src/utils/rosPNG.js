/* ── Run of Show PNG (landscape, deck/print-ready) ──
   Renders the cue sheet (Start · End · Cue · Location · Lead · Notes)
   to a wide PNG and triggers download. Height grows with the number of
   cues so the sheet stays readable; width is fixed at 1920 so it always
   reads horizontal. Mirrors the brand styling of clientBudgetPNG. */

import { byCueTime } from './rosTime.js';

const SAPPHIRE = '#0F52BA';
const PAPER = '#FFFFFF';
const INK_80 = 'rgba(15,82,186,.80)';
const INK_60 = 'rgba(15,82,186,.60)';
const FADED = 'rgba(15,82,186,.42)';
const RULE = 'rgba(15,82,186,.18)';
const HAIRLINE = 'rgba(15,82,186,.10)';
const ZEBRA = 'rgba(15,82,186,.03)';

const W = 1920;
const DPR = 2;
const FONT_STACK = "'TWK Lausanne', -apple-system, 'Inter', system-ui, sans-serif";

async function waitForFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
}

export async function exportROSPNG(project, entries, opts = {}) {
  await Promise.race([waitForFonts(), new Promise((res) => setTimeout(res, 3000))]);

  const rows = (Array.isArray(entries) ? entries : []).slice().sort(byCueTime);

  // ── Layout metrics ──
  const M = 96;
  const headerBlock = 250;   // eyebrow + title + subtitle + rule
  const tableHeadH = 64;
  const rowH = 58;
  const footerH = 110;
  const H = Math.round(headerBlock + tableHeadH + Math.max(rows.length, 1) * rowH + footerH);

  // Column x-offsets (within content width 1728)
  const cols = [
    { key: 'time',     label: 'Start',    x: M,        w: 120 },
    { key: 'endTime',  label: 'End',      x: M + 120,  w: 120 },
    { key: 'item',     label: 'Cue',      x: M + 240,  w: 520 },
    { key: 'location', label: 'Location', x: M + 760,  w: 300 },
    { key: 'lead',     label: 'Lead',     x: M + 1060, w: 230 },
    { key: 'notes',    label: 'Notes',    x: M + 1290, w: W - M - (M + 1290) },
  ];

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // ── Header ──
  const headerY = M + 8;
  const clientName = (project?.client || '').toUpperCase();
  const projectName = project?.name || 'Run of Show';
  const venueName = project?.rosVenueName || project?.data?.rosVenueName || '';
  const eventDate = project?.eventDate || project?.data?.eventDate || '';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  ctx.fillStyle = FADED;
  ctx.font = `700 14px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpaced(ctx, clientName ? `${clientName} · RUN OF SHOW` : 'RUN OF SHOW', M, headerY, 2.2);
  ctx.textAlign = 'right';
  drawSpaced(ctx, dateStr.toUpperCase(), W - M, headerY, 2.2);

  ctx.fillStyle = SAPPHIRE;
  ctx.font = `800 64px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText(ellipsize(ctx, projectName, W - 2 * M), M, headerY + 74);

  const subParts = [venueName, eventDate && `Event · ${eventDate}`, `${rows.length} cue${rows.length === 1 ? '' : 's'}`].filter(Boolean);
  ctx.fillStyle = INK_60;
  ctx.font = `500 22px ${FONT_STACK}`;
  ctx.fillText(subParts.join('   ·   '), M, headerY + 112);

  ctx.strokeStyle = SAPPHIRE;
  ctx.lineWidth = 1.5;
  line(ctx, M, headerY + 150, W - M, headerY + 150);

  // ── Table header ──
  let y = headerBlock;
  ctx.fillStyle = FADED;
  ctx.font = `700 12px ${FONT_STACK}`;
  cols.forEach((c) => { ctx.textAlign = 'left'; drawSpaced(ctx, c.label.toUpperCase(), c.x, y + 28, 1.4); });
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  line(ctx, M, y + tableHeadH - 12, W - M, y + tableHeadH - 12);

  // ── Rows ──
  y += tableHeadH;
  rows.forEach((r, idx) => {
    const isBreak = String(r.item || '').trim().toUpperCase() === 'BREAK';
    if (idx % 2 === 1) { ctx.fillStyle = ZEBRA; ctx.fillRect(M, y - rowH + 16, W - 2 * M, rowH); }
    const baseY = y - rowH + 38;

    cols.forEach((c) => {
      const raw = r[c.key] || '';
      if (!raw) return;
      ctx.textAlign = 'left';
      if (c.key === 'time') { ctx.fillStyle = SAPPHIRE; ctx.font = `700 24px ${FONT_STACK}`; }
      else if (c.key === 'endTime') { ctx.fillStyle = FADED; ctx.font = `500 22px ${FONT_STACK}`; }
      else if (c.key === 'item') { ctx.fillStyle = isBreak ? INK_60 : SAPPHIRE; ctx.font = `${isBreak ? 500 : 600} 22px ${FONT_STACK}`; }
      else if (c.key === 'lead') { ctx.fillStyle = INK_80; ctx.font = `500 19px ${FONT_STACK}`; }
      else { ctx.fillStyle = INK_60; ctx.font = `400 19px ${FONT_STACK}`; }
      ctx.fillText(ellipsize(ctx, String(raw), c.w - 18), c.x, baseY);
    });

    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    line(ctx, M, y + 16, W - M, y + 16);
    y += rowH;
  });

  // ── Footer wordmark ──
  ctx.fillStyle = FADED;
  ctx.font = `700 11px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  drawSpaced(ctx, 'EARLY SPRING', M, H - 44, 2.4);
  ctx.textAlign = 'right';
  drawSpaced(ctx, 'RUN OF SHOW', W - M, H - 44, 2.4);

  // ── Download ──
  const filename = opts.filename || `${(project?.name || 'run-of-show')}-run-of-show.png`;
  await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('PNG encoding failed')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      resolve();
    }, 'image/png');
  });
}

// ── Helpers (canvas letter-spacing + truncation) ──
function drawSpaced(ctx, text, x, y, spacing) {
  if (!text) return;
  const align = ctx.textAlign;
  let start = x;
  if (align === 'right') start = x - measureSpaced(ctx, text, spacing);
  else if (align === 'center') start = x - measureSpaced(ctx, text, spacing) / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  let cx = start;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  ctx.textAlign = prev;
}
function measureSpaced(ctx, text, spacing) {
  const chars = [...text];
  let w = 0;
  chars.forEach((ch, i) => { w += ctx.measureText(ch).width; if (i < chars.length - 1) w += spacing; });
  return w;
}
function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
