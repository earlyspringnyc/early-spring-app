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

  const res = await fetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, event, conferenceDataVersion: 1 }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create calendar event');
  }

  return await res.json();
}

// Search contacts (people you've emailed)
export async function searchContacts(accessToken, query) {
  try {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, to, subject, htmlBody }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to send email');
  }

  return await res.json();
}
