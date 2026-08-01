import React, { useState, useMemo, useRef } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { upsertAllDayCalendarEvent } from '../utils/google.js';
import { toast } from '../lib/toast.js';
import { buildPhaseColorMap, phaseColor } from '../utils/workbackPhases.js';

// Workback schedule — table view.
//
// Modeled on the spreadsheet workback the team already uses:
//   Date | Phase | Milestone | Owner | Status
//
// Each row also carries optional rich fields (intro line, parenthetical
// annotation, bullet deliverables, multi-day end date) which surface
// when the row is expanded — they ride along into the Google Calendar
// event description on sync.
//
// project.workbackSchedule shape:
//   [{ id, date, endDate?, phase, name, owner, status,
//      intro?, annotation?, items?, gcalEventId?, syncedAt? }]

const STATUSES = ['Not Started', 'On Track', 'At Risk', 'Delayed', 'Complete', 'On Hold'];
const OWNERS = ['ES', 'Client', 'Vendor', 'AV', 'Freelancer', 'Other'];
const PHASE_SUGGESTIONS = ['Pre-Production', 'Creative', 'Production', 'Vendor Management', 'Final Prep', 'Event Week', 'Wrap'];

const STATUS_COLOR = {
  'Not Started': { bg: 'transparent', fg: '#6B7480', border: 'rgba(15,82,186,.18)' },
  'On Track':    { bg: 'rgba(15,82,186,.06)', fg: '#0F52BA', border: 'rgba(15,82,186,.30)' },
  'At Risk':     { bg: 'rgba(240,184,73,.14)', fg: '#A56F00', border: '#F0B849' },
  'Delayed':     { bg: 'rgba(122,31,31,.10)', fg: '#7A1F1F', border: 'rgba(122,31,31,.30)' },
  'Complete':    { bg: 'rgba(15,82,186,.10)', fg: '#0F52BA', border: '#0F52BA' },
  'On Hold':     { bg: 'transparent', fg: '#6B7480', border: '#6B7480' },
};

const MS_DAY = 86400000;

function parseDate(mmddyyyy) {
  if (!mmddyyyy) return null;
  const parts = mmddyyyy.split('/');
  if (parts.length !== 3) return null;
  const m = parseInt(parts[0], 10), d = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

function toInput(mmddyyyy) {
  if (!mmddyyyy) return '';
  const parts = mmddyyyy.split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
}

function fromInput(yyyymmdd) {
  if (!yyyymmdd) return '';
  const parts = yyyymmdd.split('-');
  if (parts.length !== 3) return '';
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function fmtDateMDY(d) {
  if (!d || isNaN(d)) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtNice(mmddyyyy) {
  const d = parseDate(mmddyyyy);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

// Inclusive span of a multi-day milestone: the 10th → the 11th is 2 days.
// Returns null when either end is missing/unparseable, and a negative
// number if the range is backwards (legacy data — the pickers now block it).
function spanDays(start, end) {
  const a = parseDate(start), b = parseDate(end);
  if (!a || !b) return null;
  const n = daysBetween(a, b);
  return n === null ? null : n + 1;
}

// Normalize legacy data so older projects don't break.
//   - Phase rows from the v2 model collapse into a `phase` tag on the
//     milestones that followed them.
//   - Flat v1 rows ({ date, name, notes }) gain default fields.
function normalize(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  let currentPhase = '';
  items.forEach(r => {
    if (!r) return;
    if (r.type === 'phase') {
      currentPhase = r.name || '';
      return;
    }
    const base = {
      id: r.id || uid(),
      date: r.date || '',
      endDate: r.endDate || '',
      phase: r.phase || currentPhase || '',
      name: r.name || '',
      owner: r.owner || 'ES',
      status: r.status || 'Not Started',
      intro: r.intro || '',
      annotation: r.annotation || '',
      items: Array.isArray(r.items) ? r.items : (r.notes ? [String(r.notes)] : []),
      gcalEventId: r.gcalEventId || null,
      syncedAt: r.syncedAt || null,
      // Internal-only rows kept out of the client portal + its exports.
      hiddenFromClient: r.hiddenFromClient || false,
    };
    out.push(base);
  });
  return out;
}

function buildEventDescription(row) {
  const lines = [];
  if (row.phase) lines.push(`Phase: ${row.phase}`);
  if (row.owner) lines.push(`Owner: ${row.owner}`);
  if (row.status) lines.push(`Status: ${row.status}`);
  if (row.annotation) lines.push(row.annotation);
  if (row.intro) lines.push('', row.intro);
  (row.items || []).forEach(b => { if (b && b.trim()) lines.push(`• ${b.trim()}`); });
  return lines.join('\n');
}

export default function WorkbackV({ project, updateProject, canEdit, accessToken, requestCalendarAccess }) {
  const raw = project?.workbackSchedule;
  const normalized = useMemo(() => normalize(raw), [raw]);
  const eventDateRaw = project?.eventDate || project?.data?.eventDate || '';
  const eventDate = parseDate(eventDateRaw);
  const [syncing, setSyncing] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const dragId = useRef(null);
  const [overId, setOverId] = useState(null);

  const patchItems = (next) => updateProject({ workbackSchedule: next });

  // Moving the start of a multi-day milestone carries its end date along,
  // preserving the duration — the way dragging a Gantt bar behaves. Without
  // this you'd have to edit the end first just to push a range later.
  const moveStart = (row, nextDate) => {
    if (!nextDate || !row.endDate) return { date: nextDate };
    const from = parseDate(row.date), to = parseDate(nextDate), end = parseDate(row.endDate);
    if (!from || !to || !end) return { date: nextDate };
    // Shift by whole calendar days via setDate rather than adding a raw ms
    // delta: across a DST boundary local midnights are 23h/25h apart, and
    // ms arithmetic lands the end date an hour short, i.e. a day early.
    const delta = daysBetween(from, to);
    const shifted = new Date(end);
    shifted.setDate(shifted.getDate() + delta);
    return { date: nextDate, endDate: fmtDateMDY(shifted) };
  };

  // Functional updaters: each rebuilds the schedule from the LATEST project
  // state (p.workbackSchedule) rather than the `normalized` snapshot captured
  // at render, so a rapid second edit can't ship a stale array and silently
  // drop a just-added/edited row (same class of bug fixed in Budget + ROS).
  const updateRow = (id, patch) => {
    updateProject(p => ({ workbackSchedule: normalize(p.workbackSchedule).map(r => r.id === id ? { ...r, ...patch } : r) }));
  };

  const addRow = (afterIdx) => {
    updateProject(p => {
      const cur = normalize(p.workbackSchedule);
      const lastPhase = cur.length ? cur[cur.length - 1].phase : '';
      const row = {
        id: uid(), date: '', endDate: '', phase: lastPhase,
        name: '', owner: 'ES', status: 'Not Started',
        intro: '', annotation: '', items: [], hiddenFromClient: false,
      };
      const next = [...cur];
      next.splice(typeof afterIdx === 'number' ? afterIdx + 1 : next.length, 0, row);
      return { workbackSchedule: next };
    });
  };

  const removeRow = (id) => {
    const row = normalized.find(r => r.id === id);
    if (!row) return;
    if (!confirm(`Delete milestone "${row.name || 'untitled'}"?`)) return;
    updateProject(p => ({ workbackSchedule: normalize(p.workbackSchedule).filter(r => r.id !== id) }));
  };

  const sortByDate = () => {
    const next = [...normalized].sort((a, b) => {
      const da = parseDate(a.date), db = parseDate(b.date);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
    patchItems(next);
  };

  const handleDragStart = (id) => { dragId.current = id; };
  const handleDragOver = (e, id) => { e.preventDefault(); setOverId(id); };
  const handleDrop = (id) => {
    if (!dragId.current || dragId.current === id) { dragId.current = null; setOverId(null); return; }
    const fromIdx = normalized.findIndex(r => r.id === dragId.current);
    const toIdx = normalized.findIndex(r => r.id === id);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...normalized];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    dragId.current = null;
    setOverId(null);
    patchItems(next);
  };

  const addBullet = (id) => {
    const row = normalized.find(r => r.id === id);
    if (!row) return;
    updateRow(id, { items: [...(row.items || []), ''] });
  };
  const updateBullet = (id, idx, value) => {
    const row = normalized.find(r => r.id === id);
    if (!row) return;
    const next = [...row.items]; next[idx] = value;
    updateRow(id, { items: next });
  };
  const removeBullet = (id, idx) => {
    const row = normalized.find(r => r.id === id);
    if (!row) return;
    updateRow(id, { items: row.items.filter((_, i) => i !== idx) });
  };

  const syncOne = async (row) => {
    if (!accessToken) { toast.error('Connect Google Calendar first'); return; }
    if (!row.date || !row.name?.trim()) { toast.error('Add a date and name before syncing'); return; }
    setSyncing(s => ({ ...s, [row.id]: true }));
    try {
      const projectTag = project?.name ? ` · ${project.name}` : '';
      const description = buildEventDescription(row);
      const result = await upsertAllDayCalendarEvent(accessToken, {
        title: `${row.name.trim()}${projectTag}`,
        dateMMDDYYYY: row.date,
        endDateMMDDYYYY: row.endDate || null,
        notes: description,
        eventId: row.gcalEventId || null,
      });
      updateRow(row.id, { gcalEventId: result.id, syncedAt: new Date().toISOString() });
      toast.success(row.gcalEventId ? 'Calendar event updated' : 'Added to calendar');
    } catch (e) {
      console.error('[workback] sync failed:', e);
      toast.error(`Calendar sync failed: ${e.message || e}`);
    } finally {
      setSyncing(s => ({ ...s, [row.id]: false }));
    }
  };

  const syncAll = async () => {
    if (!accessToken) { toast.error('Connect Google Calendar first'); return; }
    const ready = normalized.filter(r => r.date && r.name?.trim());
    if (!ready.length) { toast.error('Nothing to sync — milestones need a date and a name'); return; }
    for (const row of ready) {
      // eslint-disable-next-line no-await-in-loop
      await syncOne(row);
    }
  };

  // Datalist of phases used so far in this project, plus the
  // suggestions, deduped — gives the user free-text + autocomplete.
  const phaseChoices = useMemo(() => {
    const set = new Set(PHASE_SUGGESTIONS);
    normalized.forEach(r => { if (r.phase) set.add(r.phase); });
    return Array.from(set);
  }, [normalized]);

  // Stable phase color (same color for the same phase across the
  // table, calendar, and PDF export).
  const phaseColors = useMemo(() => buildPhaseColorMap(normalized), [normalized]);

  const exportPdf = async () => {
    try {
      const { exportWorkbackPDF } = await import('../utils/pdfExport.js');
      await exportWorkbackPDF(project, normalized, { filename: `${(project?.name || 'workback')}-workback-schedule.pdf` });
      toast.success('Workback PDF downloaded');
    } catch (e) {
      console.error('[workback] pdf export failed:', e);
      toast.error(`PDF export failed: ${e.message || e}`);
    }
  };

  const exportXls = async () => {
    try {
      const { exportWorkbackXLSX } = await import('../utils/workbackXlsx.js');
      exportWorkbackXLSX(project, normalized, { filename: `${(project?.name || 'workback')}-workback-schedule.xlsx` });
      toast.success('Workback XLS downloaded');
    } catch (e) {
      console.error('[workback] xls export failed:', e);
      toast.error(`XLS export failed: ${e.message || e}`);
    }
  };

  const [sheetsBusy, setSheetsBusy] = useState(false);
  const exportSheets = async () => {
    // The user is already signed into Morgan with Google, but the Sheets API
    // needs a separate access token that expires ~hourly. Request it on demand
    // if we don't have a live one, and retry once if it turns out stale. The
    // internal view exports every row (like the PDF/XLS); the client portal has
    // its own filtered download.
    let token = accessToken;
    if (!token && requestCalendarAccess) { token = await requestCalendarAccess(); }
    if (!token) { toast.error('Google needs permission to create the Sheet. Approve the pop-up, then try again.'); return; }
    setSheetsBusy(true);
    try {
      const { exportWorkbackToSheets } = await import('../utils/drive.js');
      const run = async (t) => { const r = await exportWorkbackToSheets(t, project, normalized, project?.driveFolders); if (!r?.url) throw new Error('No sheet returned'); window.open(r.url, '_blank'); return r; };
      try { await run(token); }
      catch (e) {
        const msg = String(e?.message || e);
        if (/401|403|invalid|token|auth|expire/i.test(msg) && requestCalendarAccess) { const fresh = await requestCalendarAccess(); if (fresh) { await run(fresh); } else { throw e; } }
        else { throw e; }
      }
      toast.success('Workback exported to Google Sheets');
    } catch (e) {
      console.error('[workback] sheets export failed:', e);
      toast.error('Couldn’t export to Google Sheets — your Google access may have expired. Approve the pop-up and try again.');
    }
    setSheetsBusy(false);
  };

  // Share the workback with the client portal. Mirrors the Creative
  // section's share model: the section id 'workback' lives in
  // project.sentSectionIds; the portal renders it when present.
  const sharedWithClient = (project?.sentSectionIds || []).includes('workback');
  const toggleClientShare = () => {
    const set = new Set(project?.sentSectionIds || []);
    if (set.has('workback')) set.delete('workback'); else set.add('workback');
    updateProject({ sentSectionIds: Array.from(set) });
    toast.success(set.has('workback') ? 'Workback shared to the client portal' : 'Workback hidden from the client portal');
  };

  const cellInputStyle = {
    width: '100%', background: 'transparent', border: 'none',
    color: T.ink, fontSize: 12, fontFamily: T.sans, outline: 'none',
    padding: '4px 0',
  };
  const cellSelectStyle = {
    ...cellInputStyle, appearance: 'none', WebkitAppearance: 'none',
    cursor: 'pointer', paddingRight: 14,
  };
  const thStyle = {
    padding: '10px 10px',
    textAlign: 'left',
    fontSize: 9, fontWeight: 700, letterSpacing: '.10em',
    color: T.fadedInk, textTransform: 'uppercase',
    borderBottom: `1px solid ${T.faintRule}`,
    background: T.inkSoft3,
    whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '6px 10px', verticalAlign: 'middle',
    borderBottom: `1px solid ${T.faintRule}`,
    fontSize: 12, color: T.ink,
  };

  return (
    <div style={{
      marginBottom: 22,
      padding: '18px 20px 14px',
      borderRadius: T.rS,
      background: T.paper,
      border: `1px solid ${T.faintRule}`,
      borderLeft: `2px solid ${T.ink}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Workback Schedule</div>
          <div style={{ fontSize: 13, color: T.ink, fontFamily: T.sans }}>
            {eventDate
              ? <>Event: <strong style={{ fontWeight: 700 }}>{fmtNice(eventDateRaw)}</strong>{normalized.length > 0 && <span style={{ color: T.fadedInk, marginLeft: 8, fontSize: 11 }}>· {normalized.length} milestone{normalized.length === 1 ? '' : 's'}</span>}</>
              : <span style={{ color: T.fadedInk }}>Add an event date in Settings to anchor the countdown</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canEdit && normalized.length > 1 && (
            <button onClick={sortByDate} className="btn-pill" style={{ padding: '6px 14px', fontSize: 11 }}>
              ↑ Sort by date
            </button>
          )}
          {normalized.length > 0 && (
            <button onClick={exportPdf} className="btn-pill" style={{ padding: '6px 14px', fontSize: 11 }}>
              ↓ Export PDF
            </button>
          )}
          {normalized.length > 0 && (
            <button onClick={exportXls} className="btn-pill" style={{ padding: '6px 14px', fontSize: 11 }}>
              ↓ Export XLS
            </button>
          )}
          {normalized.length > 0 && (
            <button onClick={exportSheets} disabled={sheetsBusy} className="btn-pill" style={{ padding: '6px 14px', fontSize: 11, cursor: sheetsBusy ? 'wait' : 'pointer', opacity: sheetsBusy ? .6 : 1 }}>
              {sheetsBusy ? '…' : '↗ Google Sheets'}
            </button>
          )}
          {canEdit && normalized.length > 0 && (
            <button
              onClick={toggleClientShare}
              className="btn-pill"
              title={sharedWithClient ? 'Visible to the client in their portal — click to hide' : 'Share this workback with the client via their portal'}
              style={{
                padding: '6px 14px', fontSize: 11,
                background: sharedWithClient ? T.ink : 'transparent',
                color: sharedWithClient ? T.paper : T.ink,
                border: sharedWithClient ? 'none' : `1px solid ${T.ink}`,
              }}
            >
              {sharedWithClient ? '✓ Shared with client' : '↗ Share with client'}
            </button>
          )}
          {accessToken && canEdit && normalized.length > 0 && (
            <button onClick={syncAll} className="btn-pill" style={{ padding: '6px 14px', fontSize: 11 }}>
              ↺ Sync all to Calendar
            </button>
          )}
          {canEdit && (
            <button onClick={() => addRow()} className="btn-pill" style={{ padding: '6px 14px', fontSize: 11, background: T.ink, color: T.paper, border: 'none' }}>
              + Milestone
            </button>
          )}
        </div>
      </div>

      {normalized.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center', color: T.fadedInk, fontSize: 12, fontStyle: 'italic' }}>
          No milestones yet. Add the first key date working backward from the event.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <datalist id="workback-phases">
            {phaseChoices.map(p => <option key={p} value={p} />)}
          </datalist>
          <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontFamily: T.sans }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 36 }}></th>
                <th style={{ ...thStyle, width: 150 }}>Dates</th>
                <th style={{ ...thStyle, width: 150 }}>Phase</th>
                <th style={{ ...thStyle }}>Milestone</th>
                <th style={{ ...thStyle, width: 110 }}>Owner</th>
                <th style={{ ...thStyle, width: 140 }}>Status</th>
                <th style={{ ...thStyle, width: 80 }}>T-Day</th>
                <th style={{ ...thStyle, width: 130, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {normalized.map((row, idx) => {
                const d = parseDate(row.date);
                const delta = d && eventDate ? daysBetween(d, eventDate) : null;
                const isSyncing = !!syncing[row.id];
                const synced = !!row.gcalEventId;
                const expanded = expandedId === row.id;
                const isOver = overId === row.id;
                const isDragSource = dragId.current === row.id;
                const statusColor = STATUS_COLOR[row.status] || STATUS_COLOR['Not Started'];
                // Secondary line under the dates: how long it runs when it's
                // a range. Nothing at all for a single-day milestone.
                const span = spanDays(row.date, row.endDate);
                const rangeBad = span !== null && span < 1;
                const dateMeta = rangeBad
                  ? 'End is before start'
                  : (span !== null && span > 1 ? `${span} days` : '');
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      draggable={canEdit}
                      onDragStart={() => handleDragStart(row.id)}
                      onDragOver={(e) => handleDragOver(e, row.id)}
                      onDrop={() => handleDrop(row.id)}
                      style={{
                        background: isOver && !isDragSource ? T.goldSoft : (row.hiddenFromClient ? T.inkSoft3 : 'transparent'),
                        opacity: isDragSource ? .4 : 1,
                        cursor: canEdit ? 'grab' : 'default',
                      }}
                    >
                      <td style={{ ...tdStyle, color: T.fadedInk, fontFamily: T.mono, fontSize: 10, textAlign: 'center', cursor: canEdit ? 'grab' : 'default' }} title="Drag to reorder">⋮⋮</td>
                      <td style={{ ...tdStyle }}>
                        {/* Just the dates. A "Week of" line used to sit under
                            them and was consistently misread as the due date
                            itself. Multi-day milestones (event week, load-in)
                            carry their end date on the same cell, so a range is
                            visible and editable in the table, not buried in the
                            expanded panel. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <input
                            type="date"
                            value={toInput(row.date)}
                            onChange={(e) => updateRow(row.id, moveStart(row, fromInput(e.target.value)))}
                            disabled={!canEdit}
                            style={{ background: 'transparent', border: 'none', color: T.ink, fontSize: 12, fontWeight: 700, fontFamily: T.sans, padding: 0, outline: 'none', width: '100%' }}
                          />
                          {row.endDate ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 10, color: rangeBad ? T.alert : T.fadedInk, fontFamily: T.mono, flexShrink: 0 }}>→</span>
                              <input
                                type="date"
                                value={toInput(row.endDate)}
                                min={toInput(row.date) || undefined}
                                onChange={(e) => updateRow(row.id, { endDate: fromInput(e.target.value) })}
                                disabled={!canEdit}
                                style={{ background: 'transparent', border: 'none', color: rangeBad ? T.alert : T.ink, fontSize: 11, fontWeight: 600, fontFamily: T.sans, padding: 0, outline: 'none', width: '100%' }}
                              />
                              {canEdit && (
                                <button onClick={() => updateRow(row.id, { endDate: '' })} title="Remove end date — back to a single day" style={{ background: 'transparent', border: 'none', color: T.fadedInk, fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                              )}
                            </div>
                          ) : canEdit && row.date ? (
                            <button
                              onClick={() => updateRow(row.id, { endDate: row.date })}
                              title="Make this a multi-day range"
                              style={{ background: 'transparent', border: 'none', color: T.fadedInk, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: T.sans }}
                            >
                              + End date
                            </button>
                          ) : null}
                          <span style={{ fontSize: 10, color: rangeBad ? T.alert : T.fadedInk, fontFamily: T.mono }}>{dateMeta}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle }}>
                        {(() => {
                          const pc = phaseColor(row.phase, phaseColors);
                          return (
                            <input
                              list="workback-phases"
                              value={row.phase || ''}
                              onChange={(e) => updateRow(row.id, { phase: e.target.value })}
                              placeholder="Add phase"
                              disabled={!canEdit}
                              style={{
                                ...cellInputStyle,
                                background: row.phase ? pc.bg : 'transparent',
                                color: row.phase ? pc.fg : T.fadedInk,
                                fontWeight: row.phase ? 700 : 400,
                                fontSize: 10,
                                letterSpacing: '.04em',
                                textTransform: row.phase ? 'uppercase' : 'none',
                                borderRadius: 999,
                                padding: row.phase ? '3px 10px' : '4px 0',
                                border: row.phase ? `1px solid ${pc.fg}` : 'none',
                                textAlign: 'left',
                                width: 'auto',
                                maxWidth: '100%',
                              }}
                            />
                          );
                        })()}
                      </td>
                      <td style={{ ...tdStyle }}>
                        <input
                          value={row.name || ''}
                          onChange={(e) => updateRow(row.id, { name: e.target.value })}
                          placeholder="Milestone / Deliverable"
                          disabled={!canEdit}
                          style={{ ...cellInputStyle, fontWeight: 500 }}
                        />
                        {(row.annotation || row.intro || (row.items && row.items.length > 0)) && (
                          <button
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            style={{ background: 'none', border: 'none', color: T.fadedInk, fontSize: 10, padding: 0, cursor: 'pointer', fontFamily: T.sans, marginTop: 2 }}
                            title={expanded ? 'Hide detail' : 'Show detail'}
                          >
                            {expanded ? '▴ Hide detail' : `▾ ${(row.items || []).length} bullet${(row.items || []).length === 1 ? '' : 's'}${row.annotation || row.intro ? ' + notes' : ''}`}
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdStyle }}>
                        <select
                          value={row.owner || 'ES'}
                          onChange={(e) => updateRow(row.id, { owner: e.target.value })}
                          disabled={!canEdit}
                          style={cellSelectStyle}
                        >
                          {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td style={{ ...tdStyle }}>
                        <select
                          value={row.status || 'Not Started'}
                          onChange={(e) => updateRow(row.id, { status: e.target.value })}
                          disabled={!canEdit}
                          style={{
                            ...cellSelectStyle,
                            background: statusColor.bg,
                            color: statusColor.fg,
                            border: `1px solid ${statusColor.border}`,
                            borderRadius: 999,
                            padding: '3px 10px',
                            fontWeight: 700,
                            fontSize: 10,
                            letterSpacing: '.04em',
                            textTransform: 'uppercase',
                            width: 'auto',
                            maxWidth: 130,
                          }}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ ...tdStyle, color: T.fadedInk, fontFamily: T.mono, fontSize: 10 }}>
                        {delta === null ? '' : delta === 0 ? 'Event day' : delta > 0 ? `T-${delta}d` : `T+${Math.abs(delta)}d`}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          {accessToken && canEdit && (
                            <button
                              onClick={() => syncOne(row)}
                              disabled={isSyncing || !row.date || !row.name?.trim()}
                              title={synced ? 'Update calendar event' : 'Add to Google Calendar'}
                              style={{
                                background: synced ? T.goldSoft : 'transparent',
                                border: `1px solid ${synced ? T.gold : T.faintRule}`,
                                color: synced ? T.gold : T.fadedInk,
                                fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                                cursor: isSyncing ? 'wait' : 'pointer',
                                padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                                opacity: isSyncing ? .5 : 1,
                              }}
                            >
                              {isSyncing ? '…' : synced ? '✓' : '↗ Sync'}
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => updateRow(row.id, { hiddenFromClient: !row.hiddenFromClient })}
                              title={row.hiddenFromClient ? 'Internal only — hidden from the client view. Click to show to client.' : 'Shown to client. Click to keep internal only.'}
                              style={{
                                background: row.hiddenFromClient ? T.inkSoft2 : 'transparent',
                                border: `1px solid ${row.hiddenFromClient ? T.fadedInk : T.faintRule}`,
                                color: T.fadedInk,
                                fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                                cursor: 'pointer', padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                              }}
                            >
                              {row.hiddenFromClient ? '⊘ Internal' : 'Client'}
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => setExpandedId(expanded ? null : row.id)} title="Toggle detail" style={{ background: 'transparent', border: 'none', color: T.fadedInk, fontSize: 12, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
                              ✎
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => removeRow(row.id)} title="Delete milestone" style={{ background: 'transparent', border: 'none', color: T.fadedInk, fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr style={{ background: T.inkSoft3 }}>
                        <td colSpan={8} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.faintRule}` }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>End date (optional)</div>
                              <input
                                type="date"
                                value={toInput(row.endDate)}
                                onChange={(e) => updateRow(row.id, { endDate: fromInput(e.target.value) })}
                                disabled={!canEdit}
                                style={{ width: '100%', background: T.paper, border: `1px solid ${T.faintRule}`, borderRadius: T.rS, color: T.ink, fontSize: 12, fontFamily: T.mono, padding: '6px 8px', outline: 'none' }}
                              />
                              <div style={{ fontSize: 9, color: T.fadedInk, marginTop: 2 }}>For multi-day milestones (e.g. event week)</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Parenthetical note</div>
                              <input
                                value={row.annotation || ''}
                                onChange={(e) => updateRow(row.id, { annotation: e.target.value })}
                                placeholder='e.g. "72-hour review period"'
                                disabled={!canEdit}
                                style={{ width: '100%', background: T.paper, border: `1px solid ${T.faintRule}`, borderRadius: T.rS, color: T.ink, fontSize: 12, fontStyle: 'italic', fontFamily: T.sans, padding: '6px 8px', outline: 'none' }}
                              />
                            </div>
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Intro line (optional)</div>
                            <input
                              value={row.intro || ''}
                              onChange={(e) => updateRow(row.id, { intro: e.target.value })}
                              placeholder='e.g. "Presentation includes:"'
                              disabled={!canEdit}
                              style={{ width: '100%', background: T.paper, border: `1px solid ${T.faintRule}`, borderRadius: T.rS, color: T.ink, fontSize: 12, fontFamily: T.sans, padding: '6px 8px', outline: 'none' }}
                            />
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 6 }}>Bullets / sub-deliverables</div>
                            {(row.items || []).map((b, bi) => (
                              <div key={bi} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 0' }}>
                                <span style={{ fontSize: 11, color: T.fadedInk, fontFamily: T.mono }}>•</span>
                                <input
                                  value={b}
                                  onChange={(e) => updateBullet(row.id, bi, e.target.value)}
                                  placeholder="Deliverable"
                                  disabled={!canEdit}
                                  style={{ flex: 1, background: T.paper, border: `1px solid ${T.faintRule}`, borderRadius: T.rS, color: T.ink, fontSize: 12, fontFamily: T.sans, padding: '5px 8px', outline: 'none' }}
                                />
                                {canEdit && (
                                  <button onClick={() => removeBullet(row.id, bi)} title="Remove" style={{ background: 'transparent', border: 'none', color: T.fadedInk, fontSize: 12, cursor: 'pointer', padding: 2, lineHeight: 1, opacity: .5 }}>×</button>
                                )}
                              </div>
                            ))}
                            {canEdit && (
                              <button onClick={() => addBullet(row.id)} style={{ background: 'transparent', border: 'none', color: T.fadedInk, fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', padding: '6px 0', fontFamily: T.sans }}>
                                + Add bullet
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!accessToken && normalized.length > 0 && canEdit && (
        <div style={{ marginTop: 10, fontSize: 10, color: T.fadedInk, fontStyle: 'italic' }}>
          Connect Google Calendar to sync these milestones automatically.
        </div>
      )}
    </div>
  );
}
