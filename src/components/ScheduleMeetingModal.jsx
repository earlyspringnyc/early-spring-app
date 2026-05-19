import { useState, useEffect } from 'react';
import T from '../theme/tokens.js';
import { createCalendarEvent } from '../utils/google.js';

// Schedule-meeting modal — opens from a contact drawer. Creates a
// real Google Calendar event with the contact's email as an
// attendee, returns a confirmation + a link to the event. Bumps
// contact.last_contacted_at on success since reaching out *is* a
// touchpoint.
//
// Times are in the user's local timezone (Intl).

const DURATIONS = ['15m', '30m', '45m', '60m', '90m'];

function pad(n) { return String(n).padStart(2, '0'); }
function defaultDateStr() {
  // Tomorrow, in MM/DD/YYYY format (what createCalendarEvent expects).
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

// HTML <input type="date"> expects YYYY-MM-DD. We use that for the
// picker UX and convert to MM/DD/YYYY before sending.
function toInputDate(mdy) {
  const [m, d, y] = mdy.split('/');
  return `${y}-${m}-${d}`;
}
function fromInputDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function ScheduleMeetingModal({ contact, accessToken, userName, onClose, onScheduled }) {
  const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email;
  const defaultTitle = `${userName || 'Kamil'} × ${contactName}`;

  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState(defaultDateStr());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('30m');
  const [location, setLocation] = useState('');
  const [agenda, setAgenda] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!contact.email) { setError('This contact has no email — add one before scheduling.'); return; }
    if (!accessToken)   { setError('Sign in with Google to enable calendar access.'); return; }
    setSubmitting(true); setError(null);
    try {
      const created = await createCalendarEvent(accessToken, {
        title, date, time, duration,
        location: location.trim() || undefined,
        agenda: agenda.trim() || undefined,
        attendees: [contact.email],
      });
      setSuccess({
        link: created?.htmlLink || null,
        hangout: created?.hangoutLink || null,
      });
      onScheduled?.(created);
    } catch (e) {
      setError(e.message || 'Could not create the event');
    } finally { setSubmitting(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 220,
      background: 'rgba(15,82,186,.22)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.sans,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        width: 520, maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, border: `1px solid ${T.faintRule}`,
        boxShadow: '0 20px 60px rgba(15,82,186,.18)',
        padding: '24px 26px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: '-0.012em' }}>
            📅 Schedule a meeting
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: T.fadedInk, marginBottom: 18, lineHeight: 1.5 }}>
          Sends a Google Calendar invite to <b style={{ color: T.ink70 }}>{contact.email || '(no email)'}</b>. Includes a Google Meet link.
        </div>

        {success ? (
          <div style={{ padding: 18, borderRadius: 8, background: T.inkSoft, border: `1px solid ${T.faintRule}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
              ✓ Invite sent to {contact.email}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {success.link && (
                <a href={success.link} target="_blank" rel="noopener" style={linkBtn}>
                  Open in Google Calendar ↗
                </a>
              )}
              {success.hangout && (
                <a href={success.hangout} target="_blank" rel="noopener" style={linkBtn}>
                  Meet link ↗
                </a>
              )}
              <button type="button" onClick={onClose} style={{ ...linkBtn, marginLeft: 'auto' }}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <Field label="Title">
              <input value={title} onChange={e => setTitle(e.target.value)} required style={input}/>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr', gap: 10 }}>
              <Field label="Date">
                <input
                  type="date"
                  value={toInputDate(date)}
                  onChange={e => setDate(fromInputDate(e.target.value))}
                  required style={input}
                />
              </Field>
              <Field label="Time">
                <input type="time" value={time} onChange={e => setTime(e.target.value)} required style={input}/>
              </Field>
              <Field label="Duration">
                <select value={duration} onChange={e => setDuration(e.target.value)} style={input}>
                  {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Location · optional">
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Leave blank for Google Meet"
                style={input}
              />
            </Field>
            <Field label="Agenda · optional">
              <textarea
                value={agenda}
                onChange={e => setAgenda(e.target.value)}
                placeholder="What's this call about? Anything they should look at beforehand?"
                style={{ ...input, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
              />
            </Field>

            {error && (
              <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 11, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? .6 : 1, cursor: submitting ? 'wait' : 'pointer' }}>
                {submitting ? 'Scheduling…' : '📤 Send invite'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const input = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: `1px solid ${T.faintRule}`, background: T.paper,
  fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none',
};

const primaryBtn = {
  padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: T.sans,
  background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
  letterSpacing: '.04em',
};

const ghostBtn = {
  padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.ink70, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
};

const linkBtn = {
  padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
  textDecoration: 'none', cursor: 'pointer',
};

export default ScheduleMeetingModal;
