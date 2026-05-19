import { useState, useEffect, useMemo, useCallback } from 'react';
import T from '../theme/tokens.js';
import { listUpcomingEvents } from '../utils/google.js';
import { listContacts } from '../lib/contacts.js';

// Upcoming meetings widget — pulls the user's next 7 days of
// Google Calendar events. For each event, tries to resolve the
// first non-internal attendee to a CRM contact by email, and
// surfaces a "Prep brief" affordance that opens the existing
// contact-anchored brief.
//
// Lives on the home dashboard so the first thing you see in the
// morning is what you're walking into today + tomorrow.

const TEAM_DOMAINS = new Set(['earlyspring.nyc']);

function UpcomingMeetings({ accessToken, onOpenPrepBrief }) {
  const [events, setEvents] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load events + CRM contacts in parallel. Contacts are needed
  // to resolve attendee emails to CRM rows.
  const load = useCallback(async () => {
    if (!accessToken) {
      setEvents([]); setLoading(false); return;
    }
    setLoading(true); setError(null);
    try {
      const [evRes, crmRes] = await Promise.all([
        listUpcomingEvents(accessToken, { days: 7, maxResults: 25 }),
        listContacts({ limit: 1000 }),
      ]);
      const filtered = (evRes.events || [])
        .filter(e => !e.isAllDay)                         // skip all-day events
        .filter(e => (e.attendees || []).length > 0);      // need an attendee
      setEvents(filtered);
      setContacts(crmRes || []);
    } catch (e) {
      console.error('[upcoming] load failed:', e);
      setError(e.message || 'Could not load calendar');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  // Build an email → contact lookup once.
  const contactByEmail = useMemo(() => {
    const m = new Map();
    for (const c of contacts) {
      if (c.email) m.set(c.email.toLowerCase(), c);
    }
    return m;
  }, [contacts]);

  // For each event, pick the "primary" attendee — the first
  // non-internal attendee that's also in the CRM. Falls back to
  // the first non-internal attendee if no CRM match exists.
  const eventRows = useMemo(() => {
    if (!events) return [];
    return events.map(e => {
      const external = (e.attendees || [])
        .filter(a => a.email && !TEAM_DOMAINS.has(a.email.split('@')[1] || ''));
      let primaryContact = null;
      let primaryAttendee = external[0] || (e.attendees || [])[0] || null;
      for (const a of external) {
        const hit = contactByEmail.get(a.email);
        if (hit) { primaryContact = hit; primaryAttendee = a; break; }
      }
      return { event: e, primaryAttendee, primaryContact };
    });
  }, [events, contactByEmail]);

  if (!accessToken) {
    return (
      <div style={empty}>
        Sign in with Google (and grant calendar access) to see your upcoming meetings here.
      </div>
    );
  }

  if (loading && events === null) {
    return <div style={empty}>Loading your calendar…</div>;
  }

  if (error) {
    return (
      <div style={{ ...empty, color: T.alert }}>
        {error}. Try refreshing — or sign out + back in to re-grant calendar access.
      </div>
    );
  }

  if (!eventRows.length) {
    return <div style={empty}>Nothing on the calendar in the next 7 days. (Or none with external attendees.)</div>;
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={kicker}>
          ✦ Upcoming · next 7 days
          <span style={{ marginLeft: 10, color: T.fadedInk, fontWeight: 400, letterSpacing: '.04em', textTransform: 'none' }}>
            · {eventRows.length} meeting{eventRows.length === 1 ? '' : 's'}
          </span>
        </div>
        <button onClick={load} type="button" style={refreshBtn}>↻ Refresh</button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {eventRows.map(row => (
          <EventRow
            key={row.event.id}
            event={row.event}
            primaryAttendee={row.primaryAttendee}
            primaryContact={row.primaryContact}
            onPrep={() => onOpenPrepBrief?.(row.primaryContact, row.event)}
          />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event, primaryAttendee, primaryContact, onPrep }) {
  const start = event.start ? new Date(event.start) : null;
  const fmtDay = start ? start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const fmtTime = start ? start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const isToday = start && (start.toDateString() === new Date().toDateString());

  const attendeeCount = (event.attendees || []).length;
  const displayName = primaryContact
    ? `${primaryContact.first_name || ''} ${primaryContact.last_name || ''}`.trim() || primaryContact.email
    : (primaryAttendee?.name || primaryAttendee?.email || 'No primary attendee');

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '110px 1fr auto auto',
      alignItems: 'center', gap: 14,
      padding: '12px 14px', borderRadius: 10,
      background: T.paper, border: `1px solid ${isToday ? T.ink : T.faintRule}`,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? T.ink : T.fadedInk, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          {isToday ? 'Today' : fmtDay}
        </div>
        <div style={{ fontSize: 13, color: T.ink, fontWeight: 600, marginTop: 2 }}>
          {fmtTime}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
        </div>
        <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {primaryContact ? (
            <>
              <b style={{ color: T.ink70, fontWeight: 600 }}>{displayName}</b>
              {primaryContact.company && <span> · {primaryContact.company}</span>}
              {attendeeCount > 1 && <span> + {attendeeCount - 1}</span>}
            </>
          ) : (
            <>
              {displayName}
              {attendeeCount > 1 && <span> + {attendeeCount - 1}</span>}
              <span style={{ marginLeft: 8, fontStyle: 'italic', color: T.fadedInk }}>· no CRM match</span>
            </>
          )}
        </div>
      </div>
      <div>
        {event.hangoutLink || event.conferenceData ? (
          <a href={event.hangoutLink || event.conferenceData} target="_blank" rel="noopener" style={joinBtn}>
            Join ↗
          </a>
        ) : <span/>}
      </div>
      <div>
        {primaryContact ? (
          <button onClick={onPrep} type="button" style={prepBtn}>
            ✦ Prep brief
          </button>
        ) : (
          <span style={{ ...prepBtn, background: T.inkSoft2, color: T.fadedInk, cursor: 'not-allowed' }} title="No CRM contact matches the attendees yet">
            Prep brief
          </span>
        )}
      </div>
    </div>
  );
}

// ─── styles ─────────────────────────────────────────

const empty = {
  padding: '16px 18px', borderRadius: 10,
  background: T.inkSoft2, border: `1px dashed ${T.faintRule}`,
  fontSize: 12, color: T.fadedInk, fontStyle: 'italic',
  fontFamily: T.sans, marginBottom: 24, lineHeight: 1.55,
};

const kicker = {
  fontSize: 11, fontWeight: 700, color: T.ink,
  letterSpacing: '.10em', textTransform: 'uppercase',
  fontFamily: T.sans,
};

const refreshBtn = {
  padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600,
  background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
  cursor: 'pointer', fontFamily: T.sans,
};

const joinBtn = {
  padding: '6px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600,
  background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
  textDecoration: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

const prepBtn = {
  padding: '6px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700,
  background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.08em',
};

export default UpcomingMeetings;
