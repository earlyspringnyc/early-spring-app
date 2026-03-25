/* Fireflies.ai API integration
   Uses GraphQL API with user's API key to fetch and filter meetings */

const FF_API = 'https://api.fireflies.ai/graphql';

async function ffQuery(apiKey, query, variables = {}) {
  const res = await fetch(FF_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Fireflies API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'Fireflies query failed');
  return json.data;
}

// Fetch recent transcripts (up to 50)
export async function fetchRecentMeetings(apiKey, limit = 50) {
  const data = await ffQuery(apiKey, `
    query($limit: Int) {
      transcripts(limit: $limit) {
        id
        title
        date
        duration
        organizer_email
        participants
        meeting_attendees {
          displayName
          email
          name
        }
        summary {
          keywords
          action_items
          overview
          shorthand_bullet
        }
      }
    }
  `, { limit });
  return data?.transcripts || [];
}

// Filter meetings that are relevant to a project
export function filterRelevantMeetings(meetings, { clientEmails = [], projectName = '', clientName = '' }) {
  const emailSet = new Set(clientEmails.map(e => e.toLowerCase()).filter(Boolean));
  const searchTerms = [projectName, clientName].filter(Boolean).map(s => s.toLowerCase());

  return meetings.filter(m => {
    // Check if any attendee email matches a client contact
    const rawAttendees = Array.isArray(m.meeting_attendees) ? m.meeting_attendees : [];
    const rawParticipants = Array.isArray(m.participants) ? m.participants : [];
    const attendeeEmails = rawAttendees.map(a => (typeof a === 'string' ? a : a?.email || '').toLowerCase()).filter(Boolean);
    const participantEmails = rawParticipants.map(e => (typeof e === 'string' ? e : '').toLowerCase()).filter(Boolean);
    const allEmails = [...new Set([...attendeeEmails, ...participantEmails])];
    const hasClientAttendee = allEmails.some(e => emailSet.has(e));

    // Check if the meeting title contains the project or client name
    const titleLower = (m.title || '').toLowerCase();
    const titleMatch = searchTerms.some(term => term.length > 2 && titleLower.includes(term));

    return hasClientAttendee || titleMatch;
  });
}

// Convert Fireflies transcript to our meeting format
export function toMeetingFormat(ffMeeting) {
  const date = ffMeeting.date ? new Date(ffMeeting.date * 1000).toISOString().split('T')[0] : '';
  const time = ffMeeting.date ? new Date(ffMeeting.date * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
  const durationMin = ffMeeting.duration ? Math.round(ffMeeting.duration / 60) : 0;

  const rawAttendees = Array.isArray(ffMeeting.meeting_attendees) ? ffMeeting.meeting_attendees : [];
  const attendees = rawAttendees
    .map(a => (typeof a === 'string' ? a : a?.email || a?.displayName || a?.name || ''))
    .filter(Boolean);

  const summary = ffMeeting.summary || {};
  const rawActions = summary.action_items;
  const actionList = Array.isArray(rawActions) ? rawActions
    : typeof rawActions === 'string' ? rawActions.split('\n').map(s => s.trim()).filter(Boolean)
    : [];
  const actionItems = actionList.map((text, i) => ({
    id: `ff-${ffMeeting.id}-ai-${i}`,
    text: typeof text === 'string' ? text : String(text),
    done: false,
  }));

  const overviewText = typeof summary === 'string' ? summary
    : summary.overview || summary.shorthand_bullet || '';

  return {
    id: `ff-${ffMeeting.id}`,
    firefliesId: ffMeeting.id,
    title: ffMeeting.title || 'Untitled Meeting',
    date,
    time,
    duration: durationMin ? `${durationMin}m` : '',
    attendees,
    summary: overviewText,
    actionItems,
    isClientMeeting: true,
    source: 'fireflies',
  };
}

// Full sync: fetch, filter, convert
export async function syncFirefliesMeetings(apiKey, { clientEmails, projectName, clientName }) {
  const all = await fetchRecentMeetings(apiKey);
  const relevant = filterRelevantMeetings(all, { clientEmails, projectName, clientName });
  return relevant.map(toMeetingFormat);
}
