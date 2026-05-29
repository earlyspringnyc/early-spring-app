import { useState, useEffect } from 'react';
import T from '../../theme/tokens.js';

const FIELD_LABELS = {
  first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Phone',
  title: 'Title', company: 'Company', company_url: 'Company URL',
  location: 'Location', linkedin_url: 'LinkedIn', avatar_url: 'Photo',
};

const btnSolid = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 700, fontFamily: T.sans,
  background: T.ink, color: T.paper,
};
const btnGhost = {
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
};

function RefreshPreviewModal({ contact, patch, onCancel, onApply, applying }) {
  const fields = Object.keys(FIELD_LABELS).filter(k => k in patch);
  const noChanges = fields.length === 0;
  // Per-row selection: default = all checked. User can uncheck a row
  // to keep that field's current value.
  const [selected, setSelected] = useState(() => new Set(fields));
  // Reset selection when patch changes (re-opening the modal on a new contact)
  useEffect(() => { setSelected(new Set(fields)); /* eslint-disable-next-line */ }, [Object.keys(patch).sort().join(',')]);

  const toggleField = (k) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const setAll = (on) => setSelected(on ? new Set(fields) : new Set());
  const selectedCount = selected.size;

  // Render the value cell — image thumbnail for photo, text otherwise
  const renderValue = (k, value, isCurrent) => {
    if (k === 'avatar_url' && value) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={value} alt="" style={{
            width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
            border: `1px solid ${T.faintRule}`,
            opacity: isCurrent ? .5 : 1, filter: isCurrent ? 'grayscale(1)' : 'none',
          }}/>
          <span style={{ fontSize: 10, color: isCurrent ? T.fadedInk : T.ink70, wordBreak: 'break-all' }}>
            {value.length > 40 ? value.slice(0, 40) + '…' : value}
          </span>
        </div>
      );
    }
    if (!value) return <i style={{ opacity: .55, fontWeight: 400 }}>empty</i>;
    return value;
  };

  const buildFilteredPatch = () => {
    const out = {};
    for (const k of selected) out[k] = patch[k];
    return out;
  };

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 720, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, padding: 28,
        border: `1px solid ${T.faintRule}`, boxShadow: T.shadow, fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 6 }}>Review refresh</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.012em' }}>
              {(contact.first_name || '') + ' ' + (contact.last_name || '')}
            </h2>
            <div style={{ fontSize: 12, color: T.fadedInk, marginTop: 2 }}>
              From RocketReach. Tick only the fields you want to update — others stay as they are.
            </div>
          </div>
          <button onClick={onCancel} disabled={applying} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: applying ? 'wait' : 'pointer', width: 28, height: 28 }}>×</button>
        </div>

        {noChanges ? (
          <div style={{
            marginTop: 18, padding: '18px 16px', borderRadius: 10,
            background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
            fontSize: 13, color: T.ink, lineHeight: 1.55,
          }}>
            <b>Nothing to update.</b> RocketReach's data matches what you already have in Morgan.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 18, marginBottom: 6, display: 'flex', gap: 8 }}>
              <button onClick={() => setAll(true)} disabled={applying} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70, cursor: 'pointer',
              }}>Select all</button>
              <button onClick={() => setAll(false)} disabled={applying} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70, cursor: 'pointer',
              }}>Clear all</button>
            </div>
            <div style={{ border: `1px solid ${T.faintRule}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '28px 110px 1fr 1fr',
                gap: 16, padding: '10px 14px',
                background: T.inkSoft2, borderBottom: `1px solid ${T.faintRule}`,
                fontSize: 9, fontWeight: 700, color: T.ink70, letterSpacing: '.10em', textTransform: 'uppercase',
              }}>
                <div></div><div>Field</div><div>Current</div><div>New</div>
              </div>
              {fields.map(k => {
                const checked = selected.has(k);
                return (
                  <label key={k} style={{
                    display: 'grid', gridTemplateColumns: '28px 110px 1fr 1fr',
                    gap: 16, padding: '12px 14px',
                    borderBottom: `1px solid ${T.faintRule}`, alignItems: 'center',
                    cursor: 'pointer', background: checked ? T.paper : T.inkSoft2,
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleField(k)}
                      disabled={applying}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0F52BA' }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 600, color: checked ? T.ink70 : T.fadedInk }}>{FIELD_LABELS[k]}</div>
                    <div style={{ fontSize: 12, color: contact[k] ? T.fadedInk : T.ink25, textDecoration: (contact[k] && checked) ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                      {renderValue(k, contact[k], true)}
                    </div>
                    <div style={{ fontSize: 12, color: checked ? T.ink : T.fadedInk, fontWeight: checked ? 500 : 400, wordBreak: 'break-word' }}>
                      {renderValue(k, patch[k], false)}
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 8,
          background: T.inkSoft2, border: `1px solid ${T.faintRule}`,
          fontSize: 11, color: T.ink70, lineHeight: 1.6,
        }}>
          <b style={{ color: T.ink }}>Untouched no matter what you pick:</b> your notes, tags, status, and any field not listed above. Only the ticked rows would change.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} disabled={applying} style={{ ...btnGhost, opacity: applying ? .5 : 1 }}>Cancel</button>
          {!noChanges && (
            <button onClick={() => onApply(buildFilteredPatch())} disabled={applying || selectedCount === 0} style={{
              ...btnSolid,
              opacity: (applying || selectedCount === 0) ? .5 : 1,
              cursor: (applying || selectedCount === 0) ? 'default' : 'pointer',
            }}>
              {applying ? 'Applying…' : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RefreshPreviewModal;
