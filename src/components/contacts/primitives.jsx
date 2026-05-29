import { useState } from 'react';
import T from '../../theme/tokens.js';

// Pipeline-stage filter options used by the main toolbar AND by
// StatusBadge's label lookup. Kept together so adding a stage updates
// both surfaces at once.
export const STATUS_OPTIONS = [
  { id: 'all',      label: 'All' },
  { id: 'prospect', label: 'Prospects' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'active',   label: 'Active' },
  { id: 'past',     label: 'Past' },
  { id: 'vendor',   label: 'Vendors' },
  { id: 'press',    label: 'Press' },
];
export const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(s => [s.id, s.label]));

export function StatusBadge({ status }) {
  const map = {
    prospect: { color: T.ink70, bg: 'transparent', border: T.faintRule },
    pitching: { color: T.paper, bg: T.ink, border: T.ink },
    active:   { color: T.ink, bg: T.inkSoft, border: T.ink },
    past:     { color: T.fadedInk, bg: 'transparent', border: T.faintRule },
    vendor:   { color: T.ink70, bg: T.inkSoft2, border: T.faintRule },
    press:    { color: T.ink70, bg: 'transparent', border: T.faintRule },
  };
  const s = map[status] || map.prospect;
  return <span style={{
    display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999,
    fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
    color: s.color, background: s.bg, border: `1px solid ${s.border}`,
  }}>{STATUS_LABEL[status] || status}</span>;
}

export function ContactAvatar({ c, size = 32 }) {
  const initials = ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase();
  const [errored, setErrored] = useState(false);
  if (c.avatar_url && !errored) {
    return <img
      src={c.avatar_url}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size, height: size, borderRadius: '50%',
        objectFit: 'cover',
        border: `1px solid ${T.faintRule}`, background: T.inkSoft, flexShrink: 0,
      }}
    />;
  }
  return <div style={{
    width: size, height: size, borderRadius: '50%', background: T.inkSoft,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size < 36 ? 11 : 14, fontWeight: 700, color: T.ink,
    border: `1px solid ${T.faintRule}`, flexShrink: 0,
  }}>{initials || '?'}</div>;
}

// Company logo via Google's favicon service. Free, no auth, returns
// a square favicon at the requested size. Falls back to a sapphire
// initial-letter tile when the favicon doesn't exist for the domain.
export function CompanyLogo({ cluster, size = 36 }) {
  const domain = cluster.emailDomain || (cluster.contacts[0]?.company_url || '')
    .replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase() || null;
  const [errored, setErrored] = useState(false);
  const letter = (cluster.canonical || '?').charAt(0).toUpperCase();

  if (!domain || errored) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 6, background: T.inkSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size < 32 ? 13 : 16, fontWeight: 700, color: T.ink,
        border: `1px solid ${T.faintRule}`, flexShrink: 0,
      }}>{letter}</div>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size, height: size, borderRadius: 6, objectFit: 'cover',
        border: `1px solid ${T.faintRule}`, background: T.paper, flexShrink: 0,
      }}
    />
  );
}

export function relativeDays(iso) {
  if (!iso) return null;
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return diff + 'd ago';
  if (diff < 30) return Math.round(diff / 7) + 'w ago';
  if (diff < 365) return Math.round(diff / 30) + 'mo ago';
  return Math.round(diff / 365) + 'y ago';
}
