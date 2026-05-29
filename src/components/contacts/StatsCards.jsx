import { useMemo } from 'react';
import T from '../../theme/tokens.js';

// 1. Active pitches → list of pitching-status contacts with company
// 2. Top companies → top 4 clusters by contact count
// 3. Going cold → contacts not touched in 90+ days
// 4. Total → quick orientation
function StatsCards({ contacts, clusters, onFilter, onPickCompany }) {
  const stats = useMemo(() => {
    const pitching = contacts.filter(c => (c.status || 'prospect') === 'pitching');
    const active = contacts.filter(c => (c.status || 'prospect') === 'active');
    const ninetyDaysAgo = Date.now() - 90 * 86400000;
    const goingCold = contacts.filter(c => {
      const stage = c.status || 'prospect';
      if (stage === 'past' || stage === 'vendor') return false;
      if (!c.last_contacted_at) return false; // no signal — don't count
      return new Date(c.last_contacted_at).getTime() < ninetyDaysAgo;
    });
    // Filter out independent (Freelance / Self-Employed) AND internal
    // (your own team) contacts from priority surfaces — neither are
    // real prospects.
    const realContacts = contacts.filter(c => c.contact_type !== 'internal');
    return {
      total: realContacts.length,
      companyCount: clusters.filter(cl => !cl.isInternal && !cl.isUnassigned).length,
      pitching: pitching.slice(0, 4),
      pitchingTotal: pitching.length,
      active: active.length,
      topCompanies: clusters.filter(cl => !cl.isIndependent && !cl.isInternal && !cl.isUnassigned).slice(0, 4),
      goingCold: goingCold.length,
    };
  }, [contacts, clusters]);

  const baseCard = {
    padding: '14px 16px', borderRadius: 10,
    border: `1px solid ${T.faintRule}`, background: T.paper,
    transition: 'all .18s', cursor: 'pointer', fontFamily: T.sans,
    minHeight: 132, display: 'flex', flexDirection: 'column',
  };
  const label = { fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.ink70, marginBottom: 8 };
  const bigValue = { fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: '-.018em', lineHeight: 1 };
  const sub = { fontSize: 11, color: T.fadedInk, marginTop: 6 };
  const listRow = { display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8, padding: '2px 0' };

  const hover = on => e => {
    e.currentTarget.style.borderColor = on ? T.ink : T.faintRule;
    e.currentTarget.style.transform = on ? 'translateY(-1px)' : 'none';
    e.currentTarget.style.boxShadow = on ? '0 6px 18px rgba(15,82,186,.06)' : 'none';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20, marginBottom: 4 }}>
      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => onFilter('all')}>
        <div style={label}>Total</div>
        <div style={bigValue}>{stats.total}</div>
        <div style={sub}>across {stats.companyCount} compan{stats.companyCount === 1 ? 'y' : 'ies'}</div>
      </div>

      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => onFilter('pitching')}>
        <div style={label}>Active pitches <span style={{ color: T.ink, fontWeight: 800 }}>{stats.pitchingTotal}</span></div>
        {stats.pitching.length === 0 ? (
          <div style={{ ...sub, marginTop: 4 }}>No active pitches.</div>
        ) : (
          <div style={{ marginTop: 4 }}>
            {stats.pitching.map(c => (
              <div key={c.id} style={listRow}>
                <span style={{ color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {c.company || '—'}
                </span>
                <span style={{ color: T.fadedInk, whiteSpace: 'nowrap' }}>
                  {(c.first_name || '') + (c.last_name ? ' ' + c.last_name[0] + '.' : '')}
                </span>
              </div>
            ))}
            {stats.pitchingTotal > stats.pitching.length && (
              <div style={{ ...sub, marginTop: 6 }}>+ {stats.pitchingTotal - stats.pitching.length} more</div>
            )}
          </div>
        )}
      </div>

      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>
        <div style={label}>Top companies</div>
        {stats.topCompanies.length === 0 ? (
          <div style={{ ...sub, marginTop: 4 }}>No companies yet.</div>
        ) : (
          <div style={{ marginTop: 4 }}>
            {stats.topCompanies.map(cl => (
              <div key={cl.canonical} style={listRow}
                onClick={e => { e.stopPropagation(); onPickCompany(cl.canonical); }}>
                <span style={{ color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {cl.canonical || <i style={{ opacity: .55 }}>No company</i>}
                </span>
                <span style={{ color: T.fadedInk, fontWeight: 600, whiteSpace: 'nowrap' }}>{cl.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={baseCard} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>
        <div style={label}>Going cold</div>
        <div style={bigValue}>{stats.goingCold}</div>
        <div style={sub}>no contact in 90+ days{stats.goingCold === 0 ? '' : ' · follow up'}</div>
      </div>
    </div>
  );
}

export default StatsCards;
