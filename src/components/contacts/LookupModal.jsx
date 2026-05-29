import { useState } from 'react';
import T from '../../theme/tokens.js';
import { rocketReachLookup, createContact } from '../../lib/contacts.js';

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

// Read-only labelled cell — used to render looked-up profile fields.
function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function LookupModal({ userId, onClose, onCreated }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  const lookup = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null); setProfile(null);
    try {
      const isLinkedIn = q.includes('linkedin.com');
      const isEmail = q.includes('@') && !isLinkedIn;
      const body = isLinkedIn ? { linkedin_url: q } : isEmail ? { email: q } : { name: q };
      const { profile, status } = await rocketReachLookup(body);
      if (!profile || (!profile.first_name && !profile.email && !profile.linkedin_url)) {
        setError(status === 'queued' || status === 'searching'
          ? 'RocketReach is still searching — try again in a minute.'
          : 'No matching profile found.');
      } else {
        setProfile(profile);
      }
    } catch (e) {
      setError(e.message || 'Lookup failed');
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const created = await createContact(userId, { ...profile, status: 'prospect' });
      onCreated?.(created);
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, padding: 28,
        border: `1px solid ${T.faintRule}`, boxShadow: T.shadow, fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.01em' }}>Lookup a contact</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: 'pointer', width: 28, height: 28 }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: T.ink70, lineHeight: 1.5, marginBottom: 14 }}>
          Paste a <b>LinkedIn URL</b>, an <b>email</b>, or a <b>name</b> — RocketReach finds the rest.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
            placeholder="https://linkedin.com/in/… or sarah@brand.com"
            autoFocus
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${T.faintRule}`, background: T.inkSoft2,
              color: T.ink, fontSize: 13, fontFamily: T.sans, outline: 'none',
            }}
          />
          <button onClick={lookup} disabled={loading || !query.trim()} style={{
            ...btnSolid, opacity: loading || !query.trim() ? .5 : 1,
            cursor: loading || !query.trim() ? 'default' : 'pointer',
          }}>{loading ? 'Looking up…' : 'Lookup'}</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: T.alertSoft, border: `1px solid ${T.alert}33`, borderRadius: 8, color: T.alert, fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {profile && (
          <div style={{ border: `1px solid ${T.faintRule}`, borderRadius: 10, padding: 18, background: T.inkSoft2, marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
              {(profile.first_name || '') + ' ' + (profile.last_name || '')}
            </div>
            <div style={{ fontSize: 12, color: T.ink70, marginBottom: 12 }}>
              {profile.title ? <b>{profile.title}</b> : null}{profile.title && profile.company ? ' · ' : ''}{profile.company || ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
              {profile.email && <Field label="Email" value={profile.email}/>}
              {profile.phone && <Field label="Phone" value={profile.phone}/>}
              {profile.location && <Field label="Location" value={profile.location}/>}
              {profile.linkedin_url && <Field label="LinkedIn" value={profile.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}/>}
              {profile.company_url && <Field label="Company URL" value={profile.company_url.replace(/^https?:\/\/(www\.)?/, '')}/>}
            </div>
            {profile.bio && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.faintRule}`, fontSize: 12, color: T.ink70, lineHeight: 1.55 }}>
                {profile.bio.length > 280 ? profile.bio.slice(0, 280) + '…' : profile.bio}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={loading} style={btnGhost}>Cancel</button>
          {profile && (
            <button onClick={save} disabled={loading} style={{ ...btnSolid, opacity: loading ? .5 : 1 }}>
              {loading ? 'Saving…' : 'Add to CRM →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LookupModal;
