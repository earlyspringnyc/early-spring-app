import { useState, useEffect, useRef } from 'react';
import T from '../../theme/tokens.js';

const btnGhost = {
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
};

function ToolbarMenu({ syncing, backfillingAvatars, onSyncRocketReach, onBackfillAvatars, onImportCSV }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const item = (label, onClick, opts = {}) => (
    <button onClick={() => { setOpen(false); onClick(); }} disabled={opts.disabled} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      padding: '10px 14px', textAlign: 'left',
      background: 'transparent', border: 'none', cursor: opts.disabled ? 'wait' : 'pointer',
      fontSize: 12, fontWeight: 500, fontFamily: T.sans, color: T.ink,
      opacity: opts.disabled ? .5 : 1,
    }}
    onMouseEnter={e => { if (!opts.disabled) e.currentTarget.style.background = T.inkSoft; }}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontSize: 13 }}>{opts.icon}</span>
      <span>{label}</span>
      {opts.desc && <span style={{ marginLeft: 'auto', fontSize: 10, color: T.fadedInk, fontWeight: 400 }}>{opts.desc}</span>}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6,
        opacity: (syncing || backfillingAvatars) ? .85 : 1,
      }}>
        {syncing ? 'Syncing…' : backfillingAvatars ? 'Backfilling…' : '⋯ More'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
          minWidth: 240,
          background: T.paper, border: `1px solid ${T.faintRule}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(15,82,186,.15)',
          padding: '4px 0', overflow: 'hidden',
        }}>
          {item('Sync RocketReach now', onSyncRocketReach, { icon: '↻', desc: syncing ? 'running' : 'auto every 2 min', disabled: syncing })}
          {item('Backfill missing photos', onBackfillAvatars, { icon: '📷', desc: 'from RocketReach', disabled: backfillingAvatars })}
          <div style={{ height: 1, background: T.faintRule, margin: '4px 0' }}/>
          {item('Import CSV', onImportCSV, { icon: '↑' })}
        </div>
      )}
    </div>
  );
}

export default ToolbarMenu;
