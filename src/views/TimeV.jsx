import { useState, useEffect, useMemo, useCallback } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { TrashI } from '../components/icons/index.js';
import { Card, Metric } from '../components/primitives/index.js';
import { toast } from '../lib/toast.js';
import {
  listTimeEntriesForProject, createTimeEntry, updateTimeEntry,
  deleteTimeEntry, aggregateTimeEntries,
} from '../lib/timeEntries.js';

// Project-scoped time tracking. One row per logged time block —
// date, hours, optional rate, description. Rate nullable so the
// user can log "unbilled" hours (internal time) separately.
//
// RLS scopes reads to the viewer's own entries plus org admins.
// Rates default to the user's profile.default_hourly_rate when set.

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TimeV({ project, user, canEdit }) {
  const userId = user?.user_id || user?.id;
  const defaultRate = user?.default_hourly_rate ?? '';
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add-entry form state
  const [date, setDate] = useState(isoToday());
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState(defaultRate);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const rows = await listTimeEntriesForProject(project.id);
      setEntries(rows);
    } catch (e) {
      toast.error('Could not load time entries: ' + (e.message || 'unknown'));
    } finally { setLoading(false); }
  }, [project?.id]);
  useEffect(() => { reload(); }, [reload]);

  const totals = useMemo(() => aggregateTimeEntries(entries), [entries]);

  // Group entries by ISO date for a calendar-friendly readout.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const key = e.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const add = async () => {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) { toast.error('Hours must be a positive number.'); return; }
    if (h > 24) { toast.error('Max 24 hours per entry.'); return; }
    setSaving(true);
    try {
      const created = await createTimeEntry(userId, project.id, {
        date,
        hours: h,
        rate: rate === '' || rate == null ? null : Number(rate),
        description: description.trim() || null,
      });
      if (created) {
        setEntries(prev => [created, ...prev]);
        setHours(''); setDescription('');
        toast.success(`Logged ${h}h on ${date}`);
      }
    } catch (e) {
      toast.error('Could not save: ' + (e.message || 'unknown'));
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this time entry?')) return;
    try {
      await deleteTimeEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      toast.error('Delete failed: ' + (e.message || 'unknown'));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: T.cream, letterSpacing: '-0.01em' }}>Time</h1>
          <p style={{ fontSize: 13, color: T.dim, marginTop: 6 }}>
            Hours logged on this project, by date. Rates feed billable totals; leave blank for unbilled internal time.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', background: showAdd ? 'transparent' : T.ink,
              color: showAdd ? T.dim : T.brown, border: showAdd ? `1px solid ${T.border}` : 'none',
              borderRadius: T.rS, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans,
            }}
          >{showAdd ? 'Cancel' : '+ Log Time'}</button>
        )}
      </div>

      <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <Metric label="Total Hours" value={totals.totalHours.toFixed(2)}/>
        <Metric label="Billable" value={f0(totals.totalBilled)} color={T.gold}/>
        <Metric label="Unbilled Hrs" value={totals.unbilledHours.toFixed(2)} color={T.dim}/>
      </div>

      {showAdd && canEdit && (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Hours</label>
              <input type="number" step="0.25" min="0" max="24" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 2.5" style={{ ...inp, fontFamily: T.mono }}/>
            </div>
            <div>
              <label style={lbl}>Rate ($/hr · optional)</label>
              <input type="number" step="1" min="0" value={rate} onChange={e => setRate(e.target.value)} placeholder="leave blank if unbilled" style={{ ...inp, fontFamily: T.mono }}/>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Description (optional)</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What did you work on?" style={inp} onKeyDown={e => e.key === 'Enter' && add()}/>
          </div>
          <button onClick={add} disabled={saving || !hours} style={{
            padding: '9px 20px', background: hours ? T.ink : T.surface,
            color: hours ? T.paper : T.dim, border: 'none',
            borderRadius: T.rS, fontSize: 12, fontWeight: 700,
            cursor: hours && !saving ? 'pointer' : 'default', fontFamily: T.sans,
            opacity: saving ? .6 : 1,
          }}>{saving ? 'Saving…' : 'Save Entry'}</button>
        </Card>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: T.dim, fontSize: 12, fontStyle: 'italic' }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ padding: 30, border: `1px dashed ${T.border}`, borderRadius: T.rS, color: T.dim, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
          No time logged yet. Click <strong style={{ color: T.cream }}>+ Log Time</strong> to add your first entry.
        </div>
      ) : (
        <div className="scroll-table">
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '.6fr .6fr 2fr 1fr 1fr .3fr', padding: '12px 18px', borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              {['Date', 'Hours', 'Description', 'Rate', 'Billable', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '.1em', textAlign: i === 4 ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {grouped.map(([day, dayEntries]) => (
              <div key={day}>
                {dayEntries.map((e, idx) => {
                  const billable = e.rate != null ? Number(e.hours) * Number(e.rate) : null;
                  return (
                    <div key={e.id} style={{
                      display: 'grid', gridTemplateColumns: '.6fr .6fr 2fr 1fr 1fr .3fr',
                      padding: '10px 18px', alignItems: 'center',
                      borderBottom: `1px solid ${T.border}`,
                    }}>
                      <span style={{ fontSize: 12, color: T.dim, fontFamily: T.mono }}>{idx === 0 ? day : ''}</span>
                      <span style={{ fontSize: 13, color: T.cream, fontFamily: T.mono, fontWeight: 600 }}>{Number(e.hours).toFixed(2)}h</span>
                      <span style={{ fontSize: 13, color: T.cream }}>{e.description || <em style={{ color: T.dim }}>—</em>}</span>
                      <span style={{ fontSize: 12, color: T.dim, fontFamily: T.mono }}>{e.rate != null ? `$${Number(e.rate)}/h` : '—'}</span>
                      <span className="num" style={{ fontSize: 13, fontFamily: T.mono, fontWeight: 700, color: billable != null ? T.gold : T.dim, textAlign: 'right' }}>
                        {billable != null ? f$(billable) : '—'}
                      </span>
                      {canEdit && (
                        <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: .2, padding: 2, justifySelf: 'end' }}
                          onMouseEnter={ev => ev.currentTarget.style.opacity = 1}
                          onMouseLeave={ev => ev.currentTarget.style.opacity = .2}>
                          <TrashI size={11} color={T.neg}/>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

const lbl = {
  display: 'block', fontSize: 10, fontWeight: 600, color: T.dim,
  textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5,
};
const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 6,
  background: T.surface, border: `1px solid ${T.border}`,
  color: T.cream, fontSize: 13, fontFamily: 'inherit', outline: 'none',
};
