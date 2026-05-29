import { useMemo } from 'react';
import T from '../theme/tokens.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { Card } from '../components/primitives/index.js';
import { STATUS_COLORS, STATUS_LABELS } from '../constants/index.js';
import { taskColor } from './CalendarView.jsx';
import { categoriesLabel } from '../utils/taskCategories.js';

// Layout knobs — tuned for legibility at a glance on a wide monitor.
const TASK_COL_W = 220;
const ROW_H = 44;
const BAR_H = 26;
const HEADER_H = 36;
const MIN_PX_PER_DAY = 16;
const TODAY_GOLD = '#F0B849';

function GanttChart({ tasks, completedTaskIds }) {
  const dated = useMemo(() => tasks.filter((t) => parseD(t.startDate)), [tasks]);

  // No dated tasks → empty state matching the rest of the dark app shell.
  if (dated.length === 0) {
    return (
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ textAlign: 'center', color: T.dim, fontSize: 13 }}>
          Add start dates to tasks to see the Gantt chart.
        </div>
      </Card>
    );
  }

  // Compute date range with a small visual buffer either side.
  const { minD, maxD, totalDays, weeks, todayLeftPct } = useMemo(() => {
    const all = [];
    dated.forEach((t) => {
      all.push(parseD(t.startDate));
      all.push(parseD(t.endDate) || parseD(t.startDate));
    });
    const minD = new Date(Math.min(...all));
    const maxD = new Date(Math.max(...all));
    minD.setDate(minD.getDate() - 3);
    maxD.setDate(maxD.getDate() + 3);
    const totalDays = Math.max(daysBetween(minD, maxD), 7);
    const weeks = [];
    let cur = new Date(minD);
    while (cur <= maxD) {
      weeks.push(new Date(cur));
      cur.setDate(cur.getDate() + 7);
    }
    const today = new Date();
    const todayLeftPct = ((daysBetween(minD, today) / totalDays) * 100);
    return { minD, maxD, totalDays, weeks, todayLeftPct };
  }, [dated]);

  const todayVisible = todayLeftPct >= 0 && todayLeftPct <= 100;
  const trackMinPx = Math.max(totalDays * MIN_PX_PER_DAY, 500);

  return (
    <Card style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
      {/* Title row */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.cream, letterSpacing: '-0.01em' }}>Project Gantt</span>
        <span style={{ fontSize: 11, color: T.dim, fontFamily: T.mono }}>{fmtShort(minD)} → {fmtShort(maxD)}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.dim }}>{dated.length} dated</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: TASK_COL_W + trackMinPx, position: 'relative' }}>

          {/* Date header — week tick marks + today label */}
          <div style={{
            display: 'flex',
            borderBottom: `1px solid ${T.border}`,
            height: HEADER_H,
            position: 'sticky', top: 0,
            background: T.surface,
            zIndex: 2,
          }}>
            <div style={{
              width: TASK_COL_W,
              flexShrink: 0,
              padding: '0 18px',
              display: 'flex', alignItems: 'center',
              fontSize: 10, fontWeight: 700,
              color: T.dim,
              letterSpacing: '.10em', textTransform: 'uppercase',
              borderRight: `1px solid ${T.border}`,
            }}>
              Task
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              {weeks.map((w, i) => {
                const left = (daysBetween(minD, w) / totalDays) * 100;
                return (
                  <div key={i} style={{
                    position: 'absolute', left: `${left}%`, top: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    paddingLeft: 4,
                  }}>
                    <span style={{
                      fontSize: 10, color: T.dim, fontFamily: T.mono,
                      whiteSpace: 'nowrap',
                    }}>{fmtShort(w)}</span>
                  </div>
                );
              })}
              {todayVisible && (
                <span style={{
                  position: 'absolute',
                  left: `${todayLeftPct}%`,
                  top: 4,
                  transform: 'translateX(-50%)',
                  fontSize: 9, fontWeight: 700,
                  color: TODAY_GOLD,
                  letterSpacing: '.10em', textTransform: 'uppercase',
                  background: T.surface,
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  zIndex: 3,
                }}>Today</span>
              )}
            </div>
          </div>

          {/* Task rows */}
          {dated.map((t, ri) => {
            const start = parseD(t.startDate);
            const end = parseD(t.endDate) || start;
            const left = (daysBetween(minD, start) / totalDays) * 100;
            const width = Math.max(((daysBetween(start, end) + 1) / totalDays) * 100, 1.4);
            const tc = taskColor(t);
            const clientDone = completedTaskIds?.has?.(t.id);
            const isDone = t.status === 'done' || clientDone;
            const isBlocked = t.status === 'roadblocked';
            const isProgress = t.status === 'progress';
            // Bar fill: status drives intensity. Done = soft ghost, blocked = warning rule, progress = ink70, todo = ink at slightly lower opacity.
            const barBg = isDone ? T.inkSoft : isBlocked ? '#9A1A1A' : isProgress ? T.ink : T.ink70;
            const barOpacity = isDone ? 0.55 : 1;
            const barTextColor = isDone ? T.fadedInk : T.paper;
            const statusLabel = STATUS_LABELS[t.status] || '';
            const statusColor = STATUS_COLORS[t.status] || T.dim;
            const dateLabel = end > start
              ? `${fmtShort(start)} → ${fmtShort(end)}`
              : fmtShort(start);

            return (
              <div key={t.id || ri} style={{
                display: 'flex',
                alignItems: 'stretch',
                borderBottom: `1px solid ${T.border}`,
                height: ROW_H,
                position: 'relative',
              }}>
                {/* Left task label column with category accent stripe */}
                <div style={{
                  width: TASK_COL_W,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 14px 0 0',
                  borderRight: `1px solid ${T.border}`,
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <div style={{
                    width: 4,
                    alignSelf: 'stretch',
                    background: tc.fg,
                    opacity: isDone ? 0.35 : 0.9,
                  }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDone ? T.dim : T.cream,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textDecoration: isDone ? 'line-through' : 'none',
                      lineHeight: 1.25,
                    }}>{t.name}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      {(() => { const cl = categoriesLabel(t); return cl ? (
                        <span style={{
                          fontSize: 10,
                          color: T.dim,
                          fontStyle: 'italic',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1,
                          minWidth: 0,
                        }}>{cl}</span>
                      ) : null; })()}
                      {statusLabel && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: statusColor,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}>{statusLabel}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bar track with week gridlines + today line */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {/* Subtle week gridlines */}
                  {weeks.map((w, i) => {
                    const gridLeft = (daysBetween(minD, w) / totalDays) * 100;
                    return (
                      <div key={i} style={{
                        position: 'absolute',
                        left: `${gridLeft}%`,
                        top: 0, bottom: 0,
                        width: 1,
                        background: T.border,
                        opacity: 0.4,
                        pointerEvents: 'none',
                      }} />
                    );
                  })}

                  {/* Today vertical line */}
                  {todayVisible && (
                    <div style={{
                      position: 'absolute',
                      left: `${todayLeftPct}%`,
                      top: 0, bottom: 0,
                      width: 1.5,
                      background: TODAY_GOLD,
                      opacity: 0.8,
                      pointerEvents: 'none',
                      zIndex: 1,
                    }} />
                  )}

                  {/* Bar */}
                  <div style={{
                    position: 'absolute',
                    left: `${left}%`,
                    width: `${width}%`,
                    top: (ROW_H - BAR_H) / 2,
                    height: BAR_H,
                    borderRadius: 4,
                    background: barBg,
                    opacity: barOpacity,
                    boxShadow: isDone ? 'none' : `0 1px 2px rgba(15,82,186,.18)`,
                    border: isDone ? `1px solid ${T.border}` : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    overflow: 'hidden',
                    transition: 'all .2s ease',
                  }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: barTextColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontFamily: T.sans,
                      letterSpacing: '.01em',
                    }}>
                      {dateLabel}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default GanttChart;
