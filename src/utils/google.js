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
    const start = new Date(`${dateStr}T${time}:00`);
    const end = new Date(start.getTime() + durMinutes * 60000);
    endDate = end.toISOString().replace('Z', '');
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
    reminders: {
      useDefault: true,
    },
  };

  const res = await fetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, event }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create calendar event');
  }

  return await res.json();
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
