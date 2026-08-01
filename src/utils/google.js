// Get Supabase session token for API auth
async function getAuthToken() {
  try {
    const { getSession } = await import('../lib/db.js');
    const session = await getSession();
    return session?.access_token || null;
  } catch (e) { return null; }
}

// Create a Google Calendar event
export async function createCalendarEvent(accessToken, meeting) {
  // Parse date from MM/DD/YYYY format
  const parts = meeting.date ? meeting.date.split('/') : [];
  let startDate, endDate;

  if (parts.length === 3) {
    const dateStr = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    const time = meeting.time || '09:00';
    startDate = `${dateStr}T${time}:00`;

    // Calculate end time from duration
    const durMatch = (meeting.duration || '30m').match(/(\d+\.?\d*)(m|h)/);
    const durMinutes = durMatch ? (durMatch[2] === 'h' ? parseFloat(durMatch[1]) * 60 : parseInt(durMatch[1])) : 30;
    // Calculate end time by adding minutes to the time string directly
    const [startH, startM] = time.split(':').map(Number);
    const totalMin = startH * 60 + startM + durMinutes;
    const endH = Math.floor(totalMin / 60);
    const endM = totalMin % 60;
    endDate = `${dateStr}T${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}:00`;
  } else {
    // Fallback to today
    const now = new Date();
    startDate = now.toISOString().replace('Z', '');
    endDate = new Date(now.getTime() + 30 * 60000).toISOString().replace('Z', '');
  }

  const event = {
    summary: meeting.title,
    location: meeting.location || '',
    description: meeting.agenda || '',
    start: {
      dateTime: startDate,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDate,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    attendees: (meeting.attendees || []).map(email => ({ email: email.trim() })),
    conferenceData: {
      createRequest: {
        requestId: 'es-' + Date.now(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: true,
    },
  };

  const authToken = await getAuthToken();
  const res = await fetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ accessToken, event, conferenceDataVersion: 1 }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create calendar event');
  }

  return await res.json();
}

// All-day Google Calendar event (workback milestones, key dates).
// Uses Google's `date` shape (YYYY-MM-DD) instead of `dateTime`, so
// the event sits as a header strip on the day rather than a timed
// block. Pass an existing eventId to patch; omit to create.
export async function upsertAllDayCalendarEvent(accessToken, { title, dateMMDDYYYY, endDateMMDDYYYY, notes, eventId, colorId }) {
  if (!accessToken) throw new Error('No access token');
  const parts = (dateMMDDYYYY || '').split('/');
  if (parts.length !== 3) throw new Error('Invalid date');
  const dateStr = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  // Google requires end.date to be the day AFTER the last inclusive day.
  // For multi-day events (e.g. event runs Sep 10–11), the caller supplies
  // the LAST inclusive day and we bump it by 1 here.
  let lastInclusive = `${dateStr}T00:00:00`;
  if (endDateMMDDYYYY) {
    const ep = endDateMMDDYYYY.split('/');
    if (ep.length === 3) lastInclusive = `${ep[2]}-${ep[0].padStart(2,'0')}-${ep[1].padStart(2,'0')}T00:00:00`;
  }
  const endDateObj = new Date(lastInclusive);
  endDateObj.setDate(endDateObj.getDate() + 1);
  const endStr = endDateObj.toISOString().slice(0, 10);
  const event = {
    summary: title,
    description: notes || '',
    start: { date: dateStr },
    end: { date: endStr },
    ...(colorId ? { colorId } : {}),
    reminders: { useDefault: true },
  };
  const authToken = await getAuthToken();
  const res = await fetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ accessToken, event, eventId: eventId || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Calendar request failed (${res.status})`);
  }
  return await res.json();
}

// List upcoming Google Calendar events. Goes through the
// /api/calendar-list proxy so the user's Google token doesn't
// need to be exposed beyond the request body.
export async function listUpcomingEvents(accessToken, { days = 7, maxResults = 25 } = {}) {
  if (!accessToken) return { events: [] };
  const authToken = await getAuthToken();
  const res = await fetch('/api/calendar-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ accessToken, days, maxResults }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Calendar list failed: ${res.status}`);
  }
  return await res.json();
}

// Search contacts (people you've emailed)
export async function searchContacts(accessToken, query) {
  try {
    const authToken = await getAuthToken();
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
      body: JSON.stringify({ accessToken, query }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.contacts || [];
  } catch (e) {
    return [];
  }
}

// Send an email via Gmail API
export async function sendEmail(accessToken, to, subject, htmlBody) {
  const authToken = await getAuthToken();
  const res = await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ accessToken, to, subject, htmlBody }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to send email');
  }

  return await res.json();
}

// Send an email via Gmail API WITH a file attachment.
//   attachment: { filename, mimeType, dataBase64 }  (dataBase64 is
//   raw base64, no data: prefix)
//
// Builds a multipart/mixed MIME message client-side and posts via
// the /api/email-attachment proxy. Capped at 24MB raw → ~32MB
// base64-encoded so we stay under Gmail's 35MB request limit.
export async function sendEmailWithAttachment(accessToken, to, subject, htmlBody, attachment) {
  if (!attachment?.dataBase64) throw new Error('attachment.dataBase64 required');
  const rawBytes = Math.floor(attachment.dataBase64.length * 0.75);
  if (rawBytes > 24 * 1024 * 1024) {
    throw new Error(`Attachment too large (${(rawBytes / 1024 / 1024).toFixed(1)}MB). Gmail caps at ~25MB.`);
  }
  const authToken = await getAuthToken();
  const res = await fetch('/api/email-attachment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ accessToken, to, subject, htmlBody, attachment }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send email with attachment');
  }
  return await res.json();
}
