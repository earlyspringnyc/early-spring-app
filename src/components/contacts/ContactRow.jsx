import { useState } from 'react';
import T from '../../theme/tokens.js';
import { ContactAvatar, StatusBadge } from './primitives.jsx';

function ContactRow({ c, onClick, onRefresh, refreshing, onSchedule, canSchedule, awardedCount = 0, pitchingCount = 0 }) {
  const [hover, setHover] = useState(false);
  const canRefresh = !!(c.linkedin_url || c.email);
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '32px 2fr 1.6fr 1.4fr 1.2fr 1fr 56px',
      gap: 16, alignItems: 'center', padding: '12px 18px',
      borderBottom: `1px solid ${T.faintRule}`, cursor: 'pointer',
      transition: 'background .15s',
      background: hover ? T.inkSoft : 'transparent',
    }}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    >
      <ContactAvatar c={c} size={32}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {(c.first_name || '') + ' ' + (c.last_name || '')}
          </div>
          {awardedCount > 0 && (
            <span title={`${awardedCount} awarded project${awardedCount === 1 ? '' : 's'}`} style={{
              flexShrink: 0, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: T.ink, color: T.paper, letterSpacing: '.06em', textTransform: 'uppercase',
              fontFamily: T.sans, whiteSpace: 'nowrap',
            }}>✓ {awardedCount} awarded</span>
          )}
          {pitchingCount > 0 && (
            <span title={`${pitchingCount} project${pitchingCount === 1 ? '' : 's'} pitching`} style={{
              flexShrink: 0, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
              letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: T.sans, whiteSpace: 'nowrap',
            }}>◐ {pitchingCount} pitching</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.email || <i style={{ opacity: .55 }}>no email on file</i>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: T.ink70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || '—'}</div>
      <div style={{ fontSize: 12, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || '—'}</div>
      <div style={{ fontSize: 12, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.location || '—'}</div>
      <div><StatusBadge status={c.status || 'prospect'}/></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        {canSchedule && c.email && (
          <button
            onClick={e => { e.stopPropagation(); onSchedule?.(c); }}
            title="Schedule a meeting with this contact"
            style={{
              opacity: hover ? 1 : 0,
              transition: 'opacity .15s',
              width: 22, height: 22, borderRadius: '50%',
              background: 'transparent',
              border: `1px solid ${T.faintRule}`,
              color: T.ink70,
              fontSize: 11, fontFamily: T.sans, fontWeight: 600,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >📅</button>
        )}
        {canRefresh && (
          <button
            onClick={e => { e.stopPropagation(); onRefresh?.(c); }}
            title="Refresh from RocketReach"
            disabled={refreshing}
            style={{
              opacity: hover || refreshing ? 1 : 0,
              transition: 'opacity .15s',
              width: 22, height: 22, borderRadius: '50%',
              background: refreshing ? T.ink : 'transparent',
              border: `1px solid ${T.faintRule}`,
              color: refreshing ? T.paper : T.ink70,
              fontSize: 11, fontFamily: T.sans, fontWeight: 600,
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >↻</button>
        )}
        <span style={{ fontSize: 11, color: T.fadedInk }}>›</span>
      </div>
    </div>
  );
}

export default ContactRow;
