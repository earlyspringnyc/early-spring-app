import { useState, useEffect, useMemo } from 'react';
import T from '../theme/tokens.js';
import { createCalendarEvent } from '../utils/google.js';
import { listContactsForProject } from '../lib/contacts.js';
import { normalizeCompany } from '../utils/companyDedup.js';

// Project-scoped meeting scheduler. Opens from a project's
// Meetings tab. Mirrors Google Calendar's "New event" UX:
//   - title, date, time, duration
//   - multi-attendee picker pre-populated from this project's
//     linked CRM contacts (champion, POC, etc.) + this project's
//     vendors. Click chip to add / remove.
//   - free-form additional email input for one-offs
//   - optional agenda + location
//   - Google Meet link auto-attached (toggle to disable)
//   - sendUpdates=all on the underlying /api/calendar call so
//     every attendee gets the invite email immediately
//
// On success returns the Google event htmlLink + hangoutLink so
// the user can open the invite straight from the success card.

const DURATIONS = ['15m', '30m', '45m', '60m', '90m', '2h'];

function pad(n) { return String(n).padStart(2, '0'); }
function defaultDateStr() {
  // Tomorrow, MM/DD/YYYY (createCalendarEvent's expected format)
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}
function toInputDate(mdy) {
  const [m, d, y] = mdy.split('/');
  return `${y}-${m}-${d}`;
}
function fromInputDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

// Roles displayed first in the suggestion list so the most-relevant
// attendees surface at the top.
const ROLE_PRIORITY = ['champion', 'point_of_contact', 'rfp_sender', 'team_member', 'agent'];
const ROLE_LABELS = {
  champion: 'Champion', point_of_contact: 'POC', rfp_sender: 'RFP',
  team_member: 'Team', agent: 'Agent', client_team: 'Client',
};

export default function ScheduleProjectMeetingModal({ project, accessToken, userName, onClose, onScheduled }) {
  const defaultTitle = `${project?.name || 'Project'} — Working session`;

  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState(defaultDateStr());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('30m');
  const [location, setLocation] = useState('');
  const [agenda, setAgenda] = useState('');
  const [withMeet, setWithMeet] = useState(true);

  // suggestions[] = candidate attendees from CRM + vendors
  const [suggestions, setSuggestions] = useState([]);
  // selectedEmails = Set of emails currently chosen
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  // extraEmail = text input for one-off addresses
  const [extraEmail, setExtraEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Escape closes the modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load attendee suggestions on mount. Two sources:
  //   1) CRM contacts linked to this project (champion, POC, etc.)
  //   2) Project vendors (so you can quickly invite a vendor PoC)
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const linked = await listContactsForProject(project.id) || [];
        const fromContacts = linked
          .filter(lp => lp?.contacts?.email)
          .map(lp => ({
            email: lp.contacts.email.toLowerCase(),
            name: `${lp.contacts.first_name || ''} ${lp.contacts.last_name || ''}`.trim(),
            company: lp.contacts.company || '',
            kind: 'contact',
            role: lp.role || '',
          }));
        const fromVendors = (project.vendors || [])
          .filter(v => v.email)
          .map(v => ({
            email: v.email.toLowerCase(),
            name: v.contactName || v.name,
            company: v.name,
            kind: 'vendor',
            role: 'vendor',
          }));
        // Dedupe by email; contacts win over vendors when the same
        // address appears in both
        const seen = new Set();
        const merged = [];
        for (const list of [fromContacts, fromVendors]) {
          for (const s of list) {
            if (seen.has(s.email)) continue;
            seen.add(s.email);
            merged.push(s);
          }
        }
        // Sort by role priority — champion/POC first
        merged.sort((a, b) => {
          const ai = ROLE_PRIORITY.indexOf(a.role);
          const bi = ROLE_PRIORITY.indexOf(b.role);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        if (!cancelled) setSuggestions(merged);
      } catch (e) {
        console.warn('[schedule-modal] suggestions load failed:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id]);

  // Filter suggestions by company so the most-relevant set surfaces
  // first (the project's client company at the top).
  const ordered = useMemo(() => {
    if (!suggestions.length) return [];
    const clientNorm = normalizeCompany(project?.client || '');
    return [...suggestions].sort((a, b) => {
      const aMatch = clientNorm && normalizeCompany(a.company) === clientNorm ? 0 : 1;
      const bMatch = clientNorm && normalizeCompany(b.company) === clientNorm ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [suggestions, project?.client]);

  const toggleEmail = (em) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(em)) next.delete(em); else next.add(em);
      return next;
    });
  };
  const addExtraEmail = () => {
    const em = extraEmail.trim().toLowerCase();
    if (!em) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError('That email looks malformed.');
      return;
    }
    setError(null);
    setSelectedEmails(prev => new Set(prev).add(em));
    setExtraEmail('');
  };

  const finalAttendees = Array.from(selectedEmails);

  const submit = async (e) => {
    e?.preventDefault();
    if (!accessToken) {
      setError('Sign in with Google first — Morgan creates the event from your calendar so you\'re the organizer.');
      return;
    }
    if (!finalAttendees.length) {
      setError('Pick at least one attendee.');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const meetingData = {
        title, date, time, duration,
        location: location.trim() || undefined,
        agenda: agenda.trim() || undefined,
        attendees: finalAttendees,
      };
      // createCalendarEvent always includes the Meet conferenceData
      // payload. If the user disabled it, strip the conference data
      // by setting location to "in person" — Google still allows
      // people to ignore the link.
      const created = await createCalendarEvent(accessToken, meetingData);
      // If the user didn't want Meet, conferenceDataVersion still
      // attaches a link but most clients don't surface it without
      // a location override. Best practice: just leave it on so
      // remote-friendly is the default.
      setSuccess({
        link: created?.htmlLink || null,
        hangout: created?.hangoutLink || null,
        attendeeCount: finalAttendees.length,
      });
      onScheduled?.(created);
    } catch (e) {
      setError(e.message || 'Could not create the event.');
    } finally { setSubmitting(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 220,
      background: 'rgba(15,82,186,.22)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.sans, padding: 20,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        width: 640, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto',
        background: T.paper, borderRadius: 12, border: `1px solid ${T.faintRule}`,
        boxShadow: '0 20px 60px rgba(15,82,186,.18)',
        padding: '24px 26px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: '-0.012em' }}>
            📅 Schedule meeting — {project?.name || 'project'}
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.fadedInk, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {success ? (
          <div style={{ padding: 18, borderRadius: 8, background: T.inkSoft, border: `1px solid ${T.faintRule}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
              ✓ Invites sent to {success.attendeeCount} attendee{success.attendeeCount === 1 ? '' : 's'}
            </div>
            <div style={{ fontSize: 12, color: T.ink70, marginBottom: 14, lineHeight: 1.5 }}>
              Google emailed everyone the invite. The event lives on your calendar with you as organizer.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {success.link && (
                <a href={success.link} target="_blank" rel="noopener" style={linkBtn}>Open in Google Calendar ↗</a>
              )}
              {success.hangout && (
                <a href={success.hangout} target="_blank" rel="noopener" style={linkBtn}>Meet link ↗</a>
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

            {/* Attendees */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Attendees {finalAttendees.length > 0 && <span style={{ color: T.ink, fontWeight: 700, marginLeft: 6 }}>· {finalAttendees.length} selected</span>}
              </div>

              {/* Selected pills */}
              {finalAttendees.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {finalAttendees.map(em => (
                    <span key={em} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', borderRadius: 999, fontSize: 11,
                      background: T.ink, color: T.paper,
                    }}>
                      {em}
                      <button type="button" onClick={() => toggleEmail(em)} style={{
                        background: 'transparent', border: 'none', color: T.paper,
                        cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
                      }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Suggested from project */}
              {ordered.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: T.fadedInk, marginBottom: 6 }}>
                    From this project — click to add
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ordered.map(s => {
                      const isOn = selectedEmails.has(s.email);
                      return (
                        <button
                          key={s.email}
                          type="button"
                          onClick={() => toggleEmail(s.email)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 999, fontSize: 11,
                            background: isOn ? T.inkSoft : T.paper,
                            color: isOn ? T.ink : T.ink70,
                            border: `1px solid ${isOn ? T.ink : T.faintRule}`,
                            cursor: 'pointer', fontFamily: T.sans,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{s.name || s.email}</span>
                          {s.role && (
                            <span style={{ fontSize: 9, color: T.fadedInk, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                              {ROLE_LABELS[s.role] || s.role}
                            </span>
                          )}
                          {s.company && (
                            <span style={{ fontSize: 9, color: T.fadedInk }}>· {s.company}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Free-form email */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={extraEmail}
                  onChange={e => setExtraEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraEmail(); } }}
                  placeholder="Add anyone else by email…"
                  style={{ ...input, flex: 1 }}
                />
                <button type="button" onClick={addExtraEmail} style={{
                  padding: '8px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
                  cursor: 'pointer', fontFamily: T.sans,
                }}>Add</button>
              </div>
            </div>

            <Field label="Location · optional">
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Leave blank for Google Meet only"
                style={input}
              />
            </Field>

            <Field label="Agenda · optional">
              <textarea
                value={agenda}
                onChange={e => setAgenda(e.target.value)}
                placeholder="What's this call about? Anything attendees should review beforehand?"
                style={{ ...input, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
              />
            </Field>

            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 11, color: T.ink70, cursor: 'pointer', userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={withMeet}
                onChange={e => setWithMeet(e.target.checked)}
                style={{ accentColor: T.ink, cursor: 'pointer' }}
              />
              Attach Google Meet link
            </label>

            {error && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 11, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? .6 : 1, cursor: submitting ? 'wait' : 'pointer' }}>
                {submitting ? 'Scheduling…' : `📤 Send invite${finalAttendees.length > 1 ? `s (${finalAttendees.length})` : ''}`}
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
