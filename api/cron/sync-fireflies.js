// Vercel cron — pulls Fireflies transcripts into the Meeting Library
// and auto-classifies based on attendee emails. Client/prospect calls
// get linked to their CRM contact via meeting_contacts; internal /
// brainstorms / vendor stuff stay in the library, tagged but
// un-linked, so the CRM contact profile doesn't drown in noise.

const FF_API = 'https://api.fireflies.ai/graphql';

// Team emails — if EVERY attendee is in this set, the meeting is
// internal. Configure via env to keep team membership server-side.
function getTeamEmails() {
  const raw = process.env.MORGAN_TEAM_EMAILS || '';
  return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.FIREFLIES_API_KEY;
  const userId = process.env.MORGAN_DEFAULT_USER_ID;
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !userId || !supaUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured (missing FIREFLIES_API_KEY, MORGAN_DEFAULT_USER_ID, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_URL)' });
  }

  const startedAt = Date.now();
  const result = { fetched: 0, created: 0, merged: 0, linkedToContacts: 0, errors: [] };

  try {
    // Pull the most recent 50 transcripts. Cron runs every 5 min so
    // we don't need a deep fetch; a busy day might have ~10 meetings.
    const transcripts = await fetchFireflies(apiKey, 50);
    result.fetched = transcripts.length;

    // Bulk-fetch existing CRM contacts so we can attribute by email.
    const contactEmailToId = await buildContactEmailMap({ supaUrl, serviceKey, userId });
    const teamEmails = getTeamEmails();

    for (const t of transcripts) {
      try {
        const meeting = shapeMeeting(t);
        if (!meeting) { result.errors.push({ kind: 'shape', id: t?.id }); continue; }

        const { classification, matchedContactIds } =
          classifyMeeting(meeting.attendees, contactEmailToId, teamEmails);
        meeting.classification = classification;

        const action = await upsertMeeting({ supaUrl, serviceKey, userId, meeting });
        if (action.id) {
          if (action.created) result.created += 1; else result.merged += 1;
          if (matchedContactIds.length) {
            const linked = await linkContacts({ supaUrl, serviceKey, userId, meetingId: action.id, contactIds: matchedContactIds });
            result.linkedToContacts += linked;
          }
        }
      } catch (e) {
        console.error('[cron-ff] meeting failed:', e);
        result.errors.push({ kind: 'meeting', id: t?.id, message: e.message || String(e) });
      }
    }
  } catch (e) {
    console.error('[cron-ff] sync failed:', e);
    return res.status(500).json({ error: e.message || String(e), partial: result });
  }

  const ms = Date.now() - startedAt;
  console.log(`[cron-ff] sync done in ${ms}ms`, result);
  return res.status(200).json({ ok: true, took_ms: ms, ...result });
}

// ----------------------------------------------------------------
async function fetchFireflies(apiKey, limit) {
  const query = `
    query($limit: Int) {
      transcripts(limit: $limit) {
        id
        title
        date
        duration
        organizer_email
        participants
        meeting_attendees { displayName email name }
        summary { keywords action_items overview shorthand_bullet }
        transcript_url
      }
    }`;
  const res = await fetch(FF_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables: { limit } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fireflies API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'Fireflies query failed');
  return json.data?.transcripts || [];
}

// Robust Fireflies date parser. Their API can return:
//   — ISO string ("2025-08-01T12:00:00Z")
//   — Unix milliseconds (1722513600000)
//   — Unix seconds (1722513600)
// Anything > 1e12 is assumed to already be ms (year 33658+ in seconds
// would be required to ambiguate, so this is safe for centuries).
function parseFFDate(d) {
  if (d == null) return null;
  if (typeof d === 'string') {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  if (typeof d === 'number' && Number.isFinite(d)) {
    const ms = d > 1e12 ? d : d * 1000;
    const dt = new Date(ms);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

function shapeMeeting(t) {
  if (!t || !t.id) return null;
  const occurredAt = parseFFDate(t.date);
  if (!occurredAt) return null;

  const rawAtt = Array.isArray(t.meeting_attendees) ? t.meeting_attendees : [];
  const attendees = rawAtt.map(a => ({
    name: a?.displayName || a?.name || null,
    email: typeof a?.email === 'string' ? a.email.toLowerCase().trim() : null,
  }));
  // Add organizer if not already in list
  if (t.organizer_email && !attendees.some(a => a.email === t.organizer_email.toLowerCase())) {
    attendees.push({ name: null, email: t.organizer_email.toLowerCase().trim() });
  }
  // Fall through to participants array (sometimes RR returns email-only strings)
  if (Array.isArray(t.participants)) {
    for (const p of t.participants) {
      if (typeof p === 'string' && p.includes('@')) {
        const e = p.toLowerCase().trim();
        if (!attendees.some(a => a.email === e)) attendees.push({ name: null, email: e });
      }
    }
  }

  const s = t.summary || {};
  const overview = typeof s === 'string' ? s : (s.overview || s.shorthand_bullet || '');
  const rawActions = s.action_items;
  const actionItems = Array.isArray(rawActions) ? rawActions
    : typeof rawActions === 'string' ? rawActions.split('\n').map(x => x.trim()).filter(Boolean)
    : [];

  return {
    source: 'fireflies',
    external_id: t.id,
    external_url: t.transcript_url || `https://app.fireflies.ai/view/${t.id}`,
    pdf_url: null,
    title: t.title || 'Untitled Meeting',
    occurred_at: occurredAt,
    duration_minutes: t.duration ? Math.round(t.duration / 60) : null,
    attendees,
    summary: overview || null,
    action_items: actionItems,
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
  };
}

function classifyMeeting(attendees, contactEmailToId, teamEmails) {
  const emails = (attendees || []).map(a => a?.email).filter(Boolean);
  if (!emails.length) return { classification: 'uncategorized', matchedContactIds: [] };

  // Build the matched-contacts set first
  const matchedContactIds = [];
  for (const e of emails) {
    const id = contactEmailToId.get(e);
    if (id && !matchedContactIds.includes(id)) matchedContactIds.push(id);
  }

  // Outside emails = emails not on the team. If at least one is a CRM
  // contact, that's an external meeting → 'client' (we use the
  // umbrella term; UI can refine via the contact's own status).
  const externalEmails = emails.filter(e => !teamEmails.has(e));
  if (matchedContactIds.length > 0) {
    return { classification: 'client', matchedContactIds };
  }
  // No CRM match
  if (externalEmails.length === 0) {
    return { classification: 'internal', matchedContactIds: [] };
  }
  return { classification: 'uncategorized', matchedContactIds: [] };
}

// ----------------------------------------------------------------
async function buildContactEmailMap({ supaUrl, serviceKey, userId }) {
  // Page through contacts. Each page = 1000 max; we'll usually have
  // well under that, but build for scale.
  const map = new Map();
  let page = 0;
  const PAGE = 1000;
  for (;;) {
    const url = `${supaUrl}/rest/v1/contacts?select=id,email&user_id=eq.${userId}&email=not.is.null&offset=${page * PAGE}&limit=${PAGE}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`Contact list failed: ${res.status}`);
    const rows = await res.json();
    for (const r of rows) {
      if (r.email) map.set(r.email.toLowerCase(), r.id);
    }
    if (rows.length < PAGE) break;
    page += 1;
  }
  return map;
}

async function upsertMeeting({ supaUrl, serviceKey, userId, meeting }) {
  const headers = {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json',
  };
  const enc = encodeURIComponent;

  // Look up by external_id
  const lookup = await fetch(
    `${supaUrl}/rest/v1/meetings?select=id,user_classification,notes,tags&user_id=eq.${userId}&source=eq.${enc(meeting.source)}&external_id=eq.${enc(meeting.external_id)}&limit=1`,
    { headers }
  );
  const rows = await lookup.json().catch(() => []);
  const existing = Array.isArray(rows) && rows.length ? rows[0] : null;

  if (existing) {
    // Fill-only merge: don't overwrite user-authored notes, tags, or
    // their classification override. Refresh summary/action items
    // from Fireflies in case they were edited on Fireflies' end.
    const patch = {
      title: meeting.title,
      occurred_at: meeting.occurred_at,
      duration_minutes: meeting.duration_minutes,
      attendees: meeting.attendees,
      summary: meeting.summary,
      action_items: meeting.action_items,
      keywords: meeting.keywords,
      external_url: meeting.external_url,
      classification: meeting.classification, // auto value updates; user_classification stays
    };
    const r = await fetch(`${supaUrl}/rest/v1/meetings?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`Meeting PATCH failed: ${r.status} ${await r.text()}`);
    return { id: existing.id, created: false };
  }

  const r = await fetch(`${supaUrl}/rest/v1/meetings`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, ...meeting }),
  });
  if (!r.ok) throw new Error(`Meeting INSERT failed: ${r.status} ${await r.text()}`);
  const out = await r.json();
  return { id: out?.[0]?.id, created: true };
}

async function linkContacts({ supaUrl, serviceKey, userId, meetingId, contactIds }) {
  const headers = {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json',
    Prefer: 'return=minimal,resolution=ignore-duplicates',
  };
  const rows = contactIds.map(cid => ({
    user_id: userId, meeting_id: meetingId, contact_id: cid, match_type: 'auto-email',
  }));
  const r = await fetch(`${supaUrl}/rest/v1/meeting_contacts`, {
    method: 'POST', headers, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Contact link failed: ${r.status} ${await r.text()}`);
  return rows.length;
}
