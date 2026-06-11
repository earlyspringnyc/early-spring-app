import * as XLSX from 'xlsx';

// Workback schedule → .xlsx. Mirrors the columns of the PDF export
// (Week Of · Phase · Milestone · Owner · Status · T-Day) plus a Details
// column carrying the row's annotation / intro / bullet deliverables so
// nothing is lost in the spreadsheet. Used by both the staff Workback
// view and the client portal download.

function parseMDY(s) {
  if (!s) return null;
  const p = String(s).split('/');
  if (p.length !== 3) return null;
  const m = parseInt(p[0], 10), d = parseInt(p[1], 10), y = parseInt(p[2], 10);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

function fmtFull(s) {
  const d = parseMDY(s);
  if (!d) return s || '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function exportWorkbackXLSX(project, items, opts = {}) {
  const rows = Array.isArray(items) ? items : [];
  const filename = opts.filename || `${project?.name || 'workback'}-workback-schedule.xlsx`;

  const eventDateStr = project?.eventDate || project?.data?.eventDate || '';
  const eventDate = parseMDY(eventDateStr);

  const header = ['Date', 'Phase', 'Milestone', 'Details', 'Owner', 'Status', 'T-Day'];
  const aoa = [header];

  rows.forEach((r) => {
    let tDay = '';
    const d = parseMDY(r.date);
    if (d && eventDate) {
      const days = Math.round((eventDate - d) / 86400000);
      tDay = days === 0 ? 'Event' : days > 0 ? `T-${days}d` : `T+${Math.abs(days)}d`;
    }
    const details = [
      r.annotation,
      r.intro,
      ...((r.items || []).map((b) => (b && b.trim() ? `• ${b.trim()}` : '')).filter(Boolean)),
    ].filter(Boolean).join('\n');

    aoa.push([
      fmtFull(r.date),
      r.phase || '',
      r.name || '',
      details,
      r.owner || '',
      r.status || 'Not Started',
      tDay,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 44 }, { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Workback');
  XLSX.writeFile(wb, filename);
}
