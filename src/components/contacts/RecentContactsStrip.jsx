import T from '../../theme/tokens.js';

// Surfaces the 10 most recently added contacts at the top of the
// page so freshly imported / Fireflies-auto-created people are
// visible without scrolling. Click a card to open the drawer.
function RecentContactsStrip({ contacts, onOpen }) {
  const recent = (contacts || [])
    .slice() // don't mutate
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 10);
  if (recent.length === 0) return null;
  return (
    <div style={{ marginTop: 18, marginBottom: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: '.10em',
          textTransform: 'uppercase',
        }}>
          Recent · last {recent.length} added
        </div>
        <div style={{ fontSize: 10, color: T.fadedInk, fontStyle: 'italic' }}>
          Newest first
        </div>
      </div>
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6,
        scrollbarWidth: 'thin',
      }}>
        {recent.map(c => {
          const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '(No name)';
          const initials = ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase();
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen?.(c.id)}
              title={`Added ${c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}`}
              style={{
                flex: '0 0 auto', minWidth: 200, maxWidth: 240,
                textAlign: 'left', cursor: 'pointer',
                padding: '10px 12px', borderRadius: 10,
                background: T.paper, border: `1px solid ${T.faintRule}`,
                display: 'flex', alignItems: 'center', gap: 10,
                fontFamily: T.sans, color: T.ink,
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; }}
            >
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" style={{
                  width: 32, height: 32, borderRadius: '50%', objectFit: 'cover',
                  border: `1px solid ${T.faintRule}`, flexShrink: 0,
                }}/>
              ) : (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: T.inkSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: T.ink, border: `1px solid ${T.faintRule}`,
                  flexShrink: 0,
                }}>{initials || '?'}</div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: T.ink,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{fullName}</div>
                <div style={{
                  fontSize: 10, color: T.fadedInk, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{c.company || c.title || c.email || ''}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default RecentContactsStrip;
