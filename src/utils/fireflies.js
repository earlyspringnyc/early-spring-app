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
    const attendeeEmails = (m.meeting_attendees || []).map(a => (a.email || '').toLowerCase()).filter(Boolean);
    const participantEmails = (m.participants || []).map(e => (e || '').toLowerCase()).filter(Boolean);
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

  const attendees = (ffMeeting.meeting_attendees || [])
    .map(a => a.email || a.displayName || a.name)
    .filter(Boolean);

  const actionItems = (ffMeeting.summary?.action_items || []).map((text, i) => ({
    id: `ff-${ffMeeting.id}-ai-${i}`,
    text,
    done: false,
  }));

  return {
    id: `ff-${ffMeeting.id}`,
    firefliesId: ffMeeting.id,
    title: ffMeeting.title || 'Untitled Meeting',
    date,
    time,
    duration: durationMin ? `${durationMin}m` : '',
    attendees,
    summary: ffMeeting.summary?.overview || ffMeeting.summary?.shorthand_bullet || '',
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
