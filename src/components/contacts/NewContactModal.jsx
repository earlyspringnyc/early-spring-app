import { useState } from 'react';
import T from '../../theme/tokens.js';
import { rocketReachLookup, createContact } from '../../lib/contacts.js';
import { getCompanyByName, upsertCompany } from '../../lib/companies.js';
import { deriveCompanyWebsiteFromEmail } from '../../utils/companyDedup.js';

const NEW_TYPE_OPTIONS = [
  { id: '',         label: 'Type…' },
  { id: 'brand',    label: 'Brand' },
  { id: 'agency',   label: 'Agency' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'agent',    label: 'Agent' },
  { id: 'press',    label: 'Press' },
  { id: 'internal', label: 'Internal (me / team)' },
];
const NEW_STATUS_OPTIONS = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'active',   label: 'Active' },
  { id: 'past',     label: 'Past' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'press',    label: 'Press' },
];

// Hoisted outside the modal so its identity is stable across
// re-renders. Defining it inside the parent made React remount every
// <input> on each keystroke, which stole focus back to the autoFocus
// field — the cursor would jump out of email into first name.
function NCField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </div>
  );
}

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

function NewContactModal({ userId, onClose, onCreated }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    title: '', company: '', location: '', linkedin_url: '',
    contact_type: '', status: 'prospect',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lookupUrl, setLookupUrl] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState(null);
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onLookup = async () => {
    const url = lookupUrl.trim();
    if (!url) return;
    setLookingUp(true); setError(null); setLookupNote(null);
    try {
      // RocketReach accepts a LinkedIn URL or an email
      const isUrl = url.includes('linkedin.com') || url.startsWith('http');
      const isEmail = url.includes('@') && !isUrl;
      const body = isUrl ? { linkedin_url: url } : isEmail ? { email: url } : { name: url };
      const { profile, status } = await rocketReachLookup(body);
      if (!profile || (!profile.first_name && !profile.email && !profile.linkedin_url)) {
        setLookupNote(status === 'queued' || status === 'searching'
          ? 'RocketReach is still searching — wait a moment and try again.'
          : 'No matching profile found. Fill in the fields manually.');
        return;
      }
      // Pre-fill empty form fields from the looked-up profile
      setForm(prev => ({
        first_name: prev.first_name || profile.first_name || '',
        last_name:  prev.last_name  || profile.last_name  || '',
        email:      prev.email      || profile.email      || '',
        phone:      prev.phone      || profile.phone      || '',
        title:      prev.title      || profile.title      || '',
        company:    prev.company    || profile.company    || '',
        location:   prev.location   || profile.location   || '',
        linkedin_url: prev.linkedin_url || profile.linkedin_url || '',
        contact_type: prev.contact_type,
        status: prev.status,
        // Attach the RocketReach profile_id so dedup picks it up
        rocketreach_profile_id: profile.rocketreach_profile_id || null,
        avatar_url: profile.avatar_url || null,
        bio: profile.bio || null,
      }));
      setLookupNote('Pre-filled from RocketReach. Edit anything before saving.');
    } catch (e) {
      setError(e.message || 'Lookup failed');
    } finally { setLookingUp(false); }
  };

  const canSave = (form.first_name.trim() || form.last_name.trim() || form.email.trim()) && !saving;

  const onSave = async () => {
    setSaving(true); setError(null);
    try {
      const body = { ...form, sources: ['manual'] };
      // Trim + null-out empty strings so DB doesn't store ""
      Object.keys(body).forEach(k => {
        if (typeof body[k] === 'string') {
          const t = body[k].trim();
          body[k] = t === '' ? null : t;
        }
      });
      // Lowercase email for unique-index match
      if (body.email) body.email = body.email.toLowerCase();
      // Lowercase linkedin url for the same reason
      if (body.linkedin_url) body.linkedin_url = body.linkedin_url.toLowerCase().split('?')[0].replace(/\/$/, '');
      const created = await createContact(userId, body);
      if (!created) throw new Error('No contact returned');

      // Best-effort: create/refresh the companies row so the new
      // contact's company gets a metadata card. Website is filled
      // from the email domain (skipping personal providers like
      // gmail) but only if no existing row already has a website,
      // so we never clobber something the user set by hand.
      if (body.company) {
        try {
          const existing = await getCompanyByName(body.company);
          const derivedWebsite = deriveCompanyWebsiteFromEmail(body.email);
          const patch = {};
          if (derivedWebsite && !existing?.website) patch.website = derivedWebsite;
          await upsertCompany(userId, body.company, patch);
        } catch (companyErr) {
          // Don't fail the contact creation — log and move on.
          console.warn('[new-contact] auto-create company failed:', companyErr?.message);
        }
      }

      onCreated?.(created);
      onClose();
    } catch (e) {
      setError(e.message || 'Could not create');
    } finally { setSaving(false); }
  };

  const inp = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: `1px solid ${T.faintRule}`, background: T.paper,
    fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none',
  };
  const Field = NCField;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 600, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, padding: 28,
        border: `1px solid ${T.faintRule}`, boxShadow: T.shadow, fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.01em' }}>New contact</h2>
          <button onClick={onClose} disabled={saving} style={{ background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk, cursor: saving ? 'wait' : 'pointer', width: 28, height: 28 }}>×</button>
        </div>

        {/* Quick-lookup from LinkedIn URL (or email / name) — pre-fills
            the form via RocketReach. Skips this row if you already
            know everything and want to type manually. */}
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: T.inkSoft2, border: `1px solid ${T.faintRule}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, marginBottom: 6 }}>
            🚀 Paste a LinkedIn URL to autofill
          </div>
          <div style={{ fontSize: 10, color: T.fadedInk, marginBottom: 8, lineHeight: 1.45 }}>
            Pulls name, email, title, company, location, photo via RocketReach. Email or just a name also work.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={lookupUrl}
              onChange={e => setLookupUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && lookupUrl.trim() && !lookingUp) onLookup(); }}
              placeholder="https://linkedin.com/in/… (or email, or name)"
              autoFocus
              style={{ ...inp, flex: 1 }}
            />
            <button onClick={onLookup} disabled={!lookupUrl.trim() || lookingUp} style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
              background: T.ink, color: T.paper, border: 'none',
              cursor: (lookupUrl.trim() && !lookingUp) ? 'pointer' : 'default',
              opacity: (lookupUrl.trim() && !lookingUp) ? 1 : .4,
            }}>{lookingUp ? 'Looking up…' : 'Lookup'}</button>
          </div>
          {lookupNote && (
            <div style={{ marginTop: 8, fontSize: 10, color: T.ink70, lineHeight: 1.4 }}>{lookupNote}</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
          <Field label="First name"><input value={form.first_name} onChange={e => update('first_name', e.target.value)} style={inp}/></Field>
          <Field label="Last name"><input value={form.last_name} onChange={e => update('last_name', e.target.value)} style={inp}/></Field>
          <Field label="Email"><input value={form.email} onChange={e => update('email', e.target.value)} placeholder="name@company.com" style={inp}/></Field>
          <Field label="Phone"><input value={form.phone} onChange={e => update('phone', e.target.value)} style={inp}/></Field>
          <Field label="Title"><input value={form.title} onChange={e => update('title', e.target.value)} style={inp}/></Field>
          <Field label="Company"><input value={form.company} onChange={e => update('company', e.target.value)} style={inp}/></Field>
          <Field label="Location"><input value={form.location} onChange={e => update('location', e.target.value)} style={inp}/></Field>
          <Field label="LinkedIn URL"><input value={form.linkedin_url} onChange={e => update('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" style={inp}/></Field>
          <Field label="Type">
            <select value={form.contact_type} onChange={e => update('contact_type', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {NEW_TYPE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e => update('status', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {NEW_STATUS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 11, color: T.fadedInk, lineHeight: 1.55 }}>
          At least one of first name, last name, or email is required. Anything else is optional — add later from the contact detail drawer.
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancel</button>
          <button onClick={onSave} disabled={!canSave} style={{ ...btnSolid, opacity: canSave ? 1 : .4, cursor: canSave ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : 'Add contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewContactModal;
