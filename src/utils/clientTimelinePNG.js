/* ── Client-facing timeline PNG / PDF (landscape, branded) ──
   Renders a Gantt bar chart + dated task list to a 1920×1080 PNG
   (or multi-page A4 landscape PDF). Mirrors the existing budget
   exporter's design language so artifacts feel like one family.
*/

import { parseD, fmtShort, daysBetween } from './date.js';

const SAPPHIRE = '#0F52BA';
const PAPER    = '#FFFFFF';
const INK_80   = 'rgba(15,82,186,.80)';
const INK_60   = 'rgba(15,82,186,.60)';
const FADED    = 'rgba(15,82,186,.42)';
const RULE     = 'rgba(15,82,186,.18)';
const HAIRLINE = 'rgba(15,82,186,.10)';
const GOLD     = '#F0B849';

const W = 1920;
const H = 1080;
const DPR = 2;
const FONT_STACK = "'TWK Lausanne', -apple-system, 'Inter', system-ui, sans-serif";

async function waitForFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
}

// Drop tasks that have no start date — they can't go on a Gantt.
function prepTasks(tasks) {
  return (tasks || [])
    .filter((t) => t && parseD(t.startDate))
    .map((t) => {
      const start = parseD(t.startDate);
      const end = parseD(t.endDate) || start;
      return { ...t, _start: start, _end: end };
    })
    .sort((a, b) => a._start - b._start);
}

function computeTimeline(tasks) {
  if (!tasks.length) return null;
  let minD = new Date(Math.min(...tasks.map((t) => t._start.getTime())));
  let maxD = new Date(Math.max(...tasks.map((t) => t._end.getTime())));
  // 2-day visual buffer on each side
  minD = new Date(minD.getTime() - 2 * 86400000);
  maxD = new Date(maxD.getTime() + 2 * 86400000);
  const totalDays = Math.max(daysBetween(minD, maxD), 7);
  // Tick marks: weekly if span < 16 weeks, monthly otherwise.
  const ticks = [];
  if (totalDays <= 16 * 7) {
    let cur = new Date(minD);
    while (cur <= maxD) {
      ticks.push({ date: new Date(cur), label: fmtShort(cur) });
      cur = new Date(cur.getTime() + 7 * 86400000);
    }
  } else {
    let cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
    while (cur <= maxD) {
      ticks.push({
        date: new Date(cur),
        label: cur.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }
  return { minD, maxD, totalDays, ticks };
}

function statusFill(t) {
  const s = t.status || 'todo';
  if (s === 'done')        return SAPPHIRE;
  if (s === 'progress')    return INK_80;
  if (s === 'roadblocked') return '#9A1A1A';
  return INK_60;
}

// Wraps `text` so each line fits within maxWidth on the given ctx.
function wrapLine(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width <= maxWidth) line = probe;
    else { if (line) out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

function drawWordmark(ctx, x, y) {
  ctx.fillStyle = SAPPHIRE;
  ctx.font = `700 14px ${FONT_STACK}`;
  // ESWordmark equivalent — wordmark "EARLY SPRING" with wide tracking.
  const label = 'EARLY SPRING';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y, 200);
}

function drawHeader(ctx, project, taskCount) {
  // Top brand row
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 100);
  ctx.lineTo(W - 80, 100);
  ctx.stroke();

  ctx.fillStyle = SAPPHIRE;
  ctx.font = `700 13px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillText('EARLY SPRING', 80, 70);

  ctx.fillStyle = FADED;
  ctx.font = `700 11px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(`PRODUCTION SCHEDULE · ${(project.client || 'CLIENT').toUpperCase()}`, W - 80, 72);
  ctx.textAlign = 'left';

  // Title block
  ctx.fillStyle = SAPPHIRE;
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.fillText(project.name || 'Project Timeline', 80, 140, W - 160);

  // Meta row
  ctx.fillStyle = FADED;
  ctx.font = `500 16px ${FONT_STACK}`;
  const meta = [
    project.client && `${project.client}`,
    project.eventDate && `Event · ${project.eventDate}`,
    `${taskCount} task${taskCount === 1 ? '' : 's'}`,
    `Generated ${new Date().toLocaleDateString()}`,
  ].filter(Boolean).join('     ');
  ctx.fillText(meta, 80, 215);
}

function drawFooter(ctx) {
  const y = H - 60;
  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(80, y);
  ctx.lineTo(W - 80, y);
  ctx.stroke();

  ctx.fillStyle = SAPPHIRE;
  ctx.font = `700 11px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillText('EARLY SPRING', 80, y + 18);

  ctx.fillStyle = FADED;
  ctx.font = `500 11px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText('Prepared in Morgan', W - 80, y + 18);
  ctx.textAlign = 'left';
}

function drawTimelineChart(ctx, tasks, range, area) {
  const { minD, totalDays, ticks } = range;
  const { x, y, w, h } = area;

  // Sidebar with task labels takes a fixed slice on the left.
  const labelW = 260;
  const trackX = x + labelW;
  const trackW = w - labelW;

  // Header row: tick labels + line
  ctx.fillStyle = FADED;
  ctx.font = `700 10px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  ticks.forEach((t) => {
    const left = trackX + ((daysBetween(minD, t.date)) / totalDays) * trackW;
    ctx.fillText(t.label.toUpperCase(), left + 4, y + 8);
    ctx.strokeStyle = HAIRLINE;
    ctx.beginPath();
    ctx.moveTo(left, y + 20);
    ctx.lineTo(left, y + h);
    ctx.stroke();
  });

  // Today marker
  const today = new Date();
  if (today >= minD && today <= new Date(minD.getTime() + totalDays * 86400000)) {
    const todayX = trackX + (daysBetween(minD, today) / totalDays) * trackW;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(todayX, y + 20);
    ctx.lineTo(todayX, y + h);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.font = `700 9px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText('TODAY', todayX, y + 4);
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
  }

  // Divider between label column and chart
  ctx.strokeStyle = SAPPHIRE;
  ctx.beginPath();
  ctx.moveTo(trackX, y + 20);
  ctx.lineTo(trackX, y + h);
  ctx.stroke();

  // Rows
  const rowH = Math.min(34, Math.max(20, (h - 30) / Math.max(tasks.length, 1)));
  const barH = Math.max(12, rowH - 12);

  tasks.forEach((t, i) => {
    const top = y + 30 + i * rowH;
    // Label
    ctx.fillStyle = SAPPHIRE;
    ctx.font = `600 12px ${FONT_STACK}`;
    ctx.textBaseline = 'middle';
    const name = ctx.measureText(t.name).width > labelW - 16
      ? `${t.name.slice(0, 28)}…`
      : t.name;
    ctx.fillText(name, x + 8, top + rowH / 2);

    // Bar
    const left = trackX + (daysBetween(minD, t._start) / totalDays) * trackW;
    const right = trackX + ((daysBetween(minD, t._end) + 1) / totalDays) * trackW;
    const barW = Math.max(right - left, 2);
    ctx.fillStyle = statusFill(t);
    ctx.globalAlpha = (t.status === 'done') ? 0.45 : 1;
    ctx.fillRect(left, top + (rowH - barH) / 2, barW, barH);
    ctx.globalAlpha = 1;

    // In-bar date label if wide enough
    if (barW > 80) {
      ctx.fillStyle = PAPER;
      ctx.font = `600 10px ${FONT_STACK}`;
      const dateLabel = t._end > t._start
        ? `${fmtShort(t._start)} → ${fmtShort(t._end)}`
        : fmtShort(t._start);
      ctx.fillText(dateLabel, left + 8, top + rowH / 2);
    }
  });

  // Row separators
  for (let i = 1; i < tasks.length; i++) {
    ctx.strokeStyle = HAIRLINE;
    ctx.beginPath();
    ctx.moveTo(x, y + 30 + i * rowH);
    ctx.lineTo(x + w, y + 30 + i * rowH);
    ctx.stroke();
  }
}

function drawEmpty(ctx) {
  ctx.fillStyle = FADED;
  ctx.font = `500 16px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No dated tasks yet — add start dates to populate this timeline.', W / 2, H / 2);
  ctx.textAlign = 'left';
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export async function exportClientTimelinePNG(project, tasks, opts = {}) {
  await waitForFonts();
  const prepped = prepTasks(tasks);
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // Paper
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, project, prepped.length);

  if (prepped.length === 0) {
    drawEmpty(ctx);
  } else {
    const range = computeTimeline(prepped);
    drawTimelineChart(ctx, prepped, range, { x: 80, y: 280, w: W - 160, h: H - 280 - 80 });
  }

  drawFooter(ctx);

  // Trigger download
  const filename = opts.filename || `${(project.name || 'project').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-timeline.png`;
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

// PDF variant — single page A4 landscape. For now wraps the PNG render
// into a jsPDF document; multi-page support added when needed.
export async function exportClientTimelinePDF(project, tasks, opts = {}) {
  await waitForFonts();
  const prepped = prepTasks(tasks);
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  drawHeader(ctx, project, prepped.length);
  if (prepped.length === 0) drawEmpty(ctx);
  else {
    const range = computeTimeline(prepped);
    drawTimelineChart(ctx, prepped, range, { x: 80, y: 280, w: W - 160, h: H - 280 - 80 });
  }
  drawFooter(ctx);

  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = await import('jspdf');
  // A4 landscape: 297×210mm. Aspect ratio of our canvas is 16:9, so
  // we fit width-to-page-width and let the height fall short.
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const imgW = pageW;
  const imgH = (H / W) * imgW;
  const top = (pageH - imgH) / 2;
  pdf.addImage(imgData, 'PNG', 0, top, imgW, imgH, undefined, 'FAST');

  const filename = opts.filename || `${(project.name || 'project').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-timeline.pdf`;
  pdf.save(filename);
}
