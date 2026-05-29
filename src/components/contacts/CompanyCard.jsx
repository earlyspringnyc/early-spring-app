import T from '../../theme/tokens.js';
import { CompanyLogo, StatusBadge, relativeDays } from './primitives.jsx';

function CompanyCard({ cluster, selected, onClick, pinned }) {
  const STAGE_ORDER = ['active', 'pitching', 'prospect', 'vendor', 'press', 'past'];
  const orderedStages = STAGE_ORDER.filter(s => cluster.stages.includes(s));
  const lastSeen = cluster.lastContactedAt
    ? relativeDays(cluster.lastContactedAt)
    : null;
  return (
    <div onClick={onClick} style={{
      padding: '16px 18px',
      border: `1px solid ${selected ? T.ink : T.faintRule}`,
      background: selected ? T.inkSoft2 : T.paper,
      borderRadius: 10, cursor: 'pointer',
      transition: 'all .18s',
      display: 'flex', flexDirection: 'column', gap: 10,
      fontFamily: T.sans,
    }}
    onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(15,82,186,.08)'; } }}
    onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CompanyLogo cluster={cluster} size={36}/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            {pinned && <span title="Pinned to top" style={{ fontSize: 12, lineHeight: 1, color: T.ink }}>📌</span>}
            <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '-.003em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cluster.canonical || <i style={{ opacity: .55, fontWeight: 400 }}>No company</i>}
            </span>
          </div>
          {cluster.aliases.length > 0 && (
            <div style={{ fontSize: 10, color: T.fadedInk, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Also: ${cluster.aliases.join(' · ')}`}>
              also: {cluster.aliases.join(' · ')}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.ink70, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {cluster.count}
        </div>
      </div>

      {orderedStages.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {orderedStages.map(s => <StatusBadge key={s} status={s}/>)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.fadedInk }}>
        <span>{cluster.count} contact{cluster.count === 1 ? '' : 's'}</span>
        <span>{lastSeen || '—'}</span>
      </div>
    </div>
  );
}

export default CompanyCard;
