import { verifyAuth, rateLimit } from './_auth.js';

// GET /api/calendar-list?days=7
// Body alt: POST with { accessToken, days }
//
// Lists the signed-in user's upcoming Google Calendar events in
// chronological order. Mirrors the pattern in api/calendar.js
// (which creates events) — client passes the Google access token
// from their OAuth session, server proxies to Google with it.
//
// Returns: { events: [{ id, title, start, end, attendees[],
//   location, hangoutLink, htmlLink, status, organizer }] }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { accessToken, days = 7, maxResults = 25 } = req.body || {};
  if (!accessToken) {
    return res.status(400).json({ error: 'Missing accessToken' });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + Number(days) * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: horizon.toISOString(),
    singleEvents: 'true',         // expand recurring events
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: `Google ${response.status}`,
        detail: text.slice(0, 300),
      });
    }
    const data = await response.json();

    // Shape into a simpler payload — strip the Google bloat.
    const events = (data.items || []).map(e => ({
      id: e.id,
      title: e.summary || '(Untitled)',
      description: e.description || null,
      start: e.start?.dateTime || e.start?.date || null,
      end: e.end?.dateTime || e.end?.date || null,
      attendees: (e.attendees || [])
        .filter(a => !a.self) // exclude the signed-in user from the surfaced list
        .map(a => ({
          email: (a.email || '').toLowerCase(),
          name: a.displayName || null,
          responseStatus: a.responseStatus || null,
          organizer: !!a.organizer,
        })),
      organizer: e.organizer?.email || null,
      location: e.location || null,
      hangoutLink: e.hangoutLink || null,
      conferenceData: e.conferenceData?.entryPoints?.[0]?.uri || null,
      htmlLink: e.htmlLink || null,
      status: e.status || 'confirmed',
      // Skip all-day events (no .dateTime, only .date) — those are
      // usually personal stuff like birthdays, not work meetings.
      isAllDay: !e.start?.dateTime,
    }));

    return res.status(200).json({ events });
  } catch (e) {
    return res.status(502).json({ error: 'Calendar fetch failed', detail: e.message });
  }
}
