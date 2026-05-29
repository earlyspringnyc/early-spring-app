import { useState, useEffect, useMemo, useRef } from 'react';
import T from '../../theme/tokens.js';

// Cmd/Ctrl+K command palette. Filters across the loaded contacts and
// company clusters (CRM-scoped — not a global app search). Substring
// match across the obvious fields; no fuzzy matching yet.
function CommandPalette({ open, onClose, contacts, clusters, onOpenContact, onOpenCluster }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Defer so the input exists in the DOM before focus
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matchedClusters = clusters
      .filter(cl => {
        if (cl.isInternal) return false;
        const hay = `${cl.canonical || ''} ${(cl.aliases || []).join(' ')} ${cl.emailDomain || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 6);

    const matchedContacts = contacts
      .filter(c => {
        // `location` included so "new york" / "berlin" finds everyone
        // in that city; `tags` included so cross-cutting labels match.
        const tags = Array.isArray(c.tags) ? c.tags.join(' ') : '';
        const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''} ${c.location || ''} ${tags}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);

    return [
      ...matchedClusters.map(cl => ({ type: 'company', cluster: cl, key: `c-${cl.id}` })),
      ...matchedContacts.map(c => ({ type: 'contact', contact: c, key: `p-${c.id}` })),
    ];
  }, [query, clusters, contacts]);

  // Reset selection when results change so the highlight always points
  // at a valid row.
  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = results[activeIndex];
        if (!r) return;
        if (r.type === 'company') onOpenCluster(r.cluster);
        else if (r.type === 'contact') onOpenContact(r.contact);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, activeIndex, onClose, onOpenContact, onOpenCluster]);

  // Keep the active row scrolled into view as the user arrow-keys.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-cmdk-idx="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  const companies = results.filter(r => r.type === 'company');
  const contactsRes = results.filter(r => r.type === 'contact');

  // Map result→global index so Section + Row know which one is active.
  let runningIndex = 0;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      paddingTop: '12vh',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 640, maxWidth: '90vw',
        background: T.paper, borderRadius: 12,
        border: `1px solid ${T.faintRule}`, boxShadow: '0 24px 64px rgba(15,82,186,.18)',
        fontFamily: T.sans, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.faintRule}` }}>
          <span style={{ fontSize: 16, color: T.fadedInk }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search contacts and companies…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, color: T.ink, fontFamily: T.sans,
            }}
          />
          <span style={{
            fontSize: 10, color: T.fadedInk, padding: '2px 8px', borderRadius: 4,
            background: T.inkSoft, fontFamily: T.sans, letterSpacing: '.04em',
          }}>Esc</span>
        </div>

        <div ref={listRef} style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {!query.trim() && (
            <div style={{ padding: 24, textAlign: 'center', color: T.fadedInk, fontSize: 12, lineHeight: 1.6 }}>
              Type to search contacts and companies.
              <div style={{ marginTop: 6, fontSize: 11, opacity: .8 }}>↑↓ to navigate · Enter to open · Esc to close</div>
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>
              No matches for "{query.trim()}".
            </div>
          )}
          {companies.length > 0 && (
            <>
              <SectionHeader label={`Companies · ${companies.length}`} />
              {companies.map(r => {
                const idx = runningIndex++;
                return (
                  <ResultRow
                    key={r.key}
                    idx={idx}
                    isActive={idx === activeIndex}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => { onOpenCluster(r.cluster); onClose(); }}
                    icon="🏢"
                    title={r.cluster.canonical || '(unnamed)'}
                    meta={`${r.cluster.count} contact${r.cluster.count === 1 ? '' : 's'}${r.cluster.emailDomain ? ' · @' + r.cluster.emailDomain : ''}`}
                  />
                );
              })}
            </>
          )}
          {contactsRes.length > 0 && (
            <>
              <SectionHeader label={`Contacts · ${contactsRes.length}`} />
              {contactsRes.map(r => {
                const idx = runningIndex++;
                const c = r.contact;
                const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '(no name)';
                return (
                  <ResultRow
                    key={r.key}
                    idx={idx}
                    isActive={idx === activeIndex}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => { onOpenContact(r.contact); onClose(); }}
                    icon="👤"
                    title={name}
                    meta={[c.title, c.company, c.location, c.email].filter(Boolean).join(' · ')}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{
      padding: '8px 16px', fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
      color: T.fadedInk, background: T.inkSoft3, borderBottom: `1px solid ${T.faintRule}`,
      fontFamily: T.sans,
    }}>{label}</div>
  );
}

function ResultRow({ idx, isActive, onClick, onMouseEnter, icon, title, meta }) {
  return (
    <button
      type="button"
      data-cmdk-idx={idx}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '10px 16px',
        background: isActive ? T.inkSoft : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        fontFamily: T.sans, color: T.ink,
        borderBottom: `1px solid ${T.faintRule}`,
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {meta && (
          <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta}
          </div>
        )}
      </div>
    </button>
  );
}

export default CommandPalette;
