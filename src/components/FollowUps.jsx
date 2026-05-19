import { useState, useEffect, useMemo, useCallback } from 'react';
import T from '../theme/tokens.js';
import { listContacts } from '../lib/contacts.js';

// Follow-ups widget — the ghosting killer. Surfaces contacts in
// active funnel stages (prospect / pitching / active) whose last
// touch is older than a stage-specific threshold.
//
// Thresholds are tuned to roughly match how long a real RFP or
// pitch conversation goes quiet before it's time to nudge:
//   prospect   → 5  days
//   pitching   → 10 days
//   active     → 14 days
//
// Past, vendor, press, internal contacts are ignored — they're
// not in a sales-cadence-relevant state.

const THRESHOLDS = {
  prospect: 5,
  pitching: 10,
  active: 14,
};
const TRACKED = new Set(Object.keys(THRESHOLDS));

const STATUS_LABEL = {
  prospect: 'Prospect',
  pitching: 'Pitching',
  active: 'Active',
};

function daysAgo(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function FollowUps({ onOpenContact }) {
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await listContacts({ limit: 1000 });
      setContacts(all || []);
    } catch (e) {
      setError(e.message || 'Could not load contacts');
      setContacts([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Compute who needs follow-up, sorted by days-stale descending.
  const due = useMemo(() => {
    if (!contacts) return [];
    const out = [];
    for (const c of contacts) {
      const status = c.status || 'prospect';
      if (!TRACKED.has(status)) continue;
      if (c.contact_type === 'internal') continue;
      const days = daysAgo(c.last_contacted_at);
      const threshold = THRESHOLDS[status];
      if (days < threshold) continue;
      out.push({ contact: c, status, days });
    }
    return out.sort((a, b) => b.days - a.days);
  }, [contacts]);

  if (contacts === null) {
    return <div style={empty}>Loading follow-ups…</div>;
  }
  if (error) {
    return <div style={{ ...empty, color: T.alert }}>{error}</div>;
  }
  if (!due.length) {
    return <div style={empty}>Inbox zero — nothing past its follow-up threshold. Nice.</div>;
  }

  const shown = expanded ? due : due.slice(0, 5);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={kicker}>
          ⚠ Follow-ups due
          <span style={{ marginLeft: 10, color: T.fadedInk, fontWeight: 400, letterSpacing: '.04em', textTransform: 'none' }}>
            · {due.length} contact{due.length === 1 ? '' : 's'} going cold
          </span>
        </div>
        <button onClick={load} type="button" style={refreshBtn}>↻ Refresh</button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {shown.map(row => (
          <FollowUpRow key={row.contact.id} row={row} onOpen={() => onOpenContact?.(row.contact.id)} />
        ))}
      </div>
      {due.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(x => !x)}
          style={{
            marginTop: 10, background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: T.ink70, fontFamily: T.sans,
            padding: '6px 0', letterSpacing: '.04em',
          }}
        >
          {expanded ? '↑ Show top 5' : `↓ Show all ${due.length}`}
        </button>
      )}
    </div>
  );
}

function FollowUpRow({ row, onOpen }) {
  const { contact: c, status, days } = row;
  const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '(No name)';
  // Severity escalates the longer they've been quiet — visual
  // weight cues you to triage worst first.
  const overdueBy = days - THRESHOLDS[status];
  const severity = overdueBy >= 14 ? 'high' : overdueBy >= 7 ? 'med' : 'low';
  const accent = severity === 'high' ? T.alert : severity === 'med' ? T.ink : T.ink70;

  const nudgeLabel = (() => {
    if (days >= 28) return 'Going dark · maybe park them';
    if (days >= 14) return 'Final nudge';
    if (days >= 7)  return 'Second nudge';
    return 'First nudge';
  })();

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        textAlign: 'left', cursor: 'pointer', width: '100%',
        display: 'grid', gridTemplateColumns: '14px 1fr auto auto',
        alignItems: 'center', gap: 14,
        padding: '12px 14px', borderRadius: 10,
        background: T.paper, border: `1px solid ${T.faintRule}`,
        borderLeft: `3px solid ${accent}`,
        fontFamily: T.sans, color: T.ink,
      }}
    >
      <span/>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fullName}
          {c.company && <span style={{ color: T.fadedInk, fontWeight: 400 }}> · {c.company}</span>}
        </div>
        <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 3 }}>
          {STATUS_LABEL[status]} · last touched {days === Infinity ? 'never' : `${days}d ago`}
          {c.last_contacted_at && (
            <> · {new Date(c.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
          )}
        </div>
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: accent,
        letterSpacing: '.10em', textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {nudgeLabel}
      </div>
      <span style={{ fontSize: 14, color: T.fadedInk }}>→</span>
    </button>
  );
}

const empty = {
  padding: '16px 18px', borderRadius: 10,
  background: T.inkSoft2, border: `1px dashed ${T.faintRule}`,
  fontSize: 12, color: T.fadedInk, fontStyle: 'italic',
  fontFamily: T.sans, marginBottom: 24, lineHeight: 1.55,
};

const kicker = {
  fontSize: 11, fontWeight: 700, color: T.ink,
  letterSpacing: '.10em', textTransform: 'uppercase',
  fontFamily: T.sans,
};

const refreshBtn = {
  padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600,
  background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
  cursor: 'pointer', fontFamily: T.sans,
};

export default FollowUps;
