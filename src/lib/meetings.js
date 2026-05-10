// Meeting Library data layer. Same shape pattern as src/lib/contacts.js
// — uses raw PostgREST so it's immune to the supabase-js auth-lock
// issue. RLS scopes to auth.uid() so calls don't need user_id in
// queries.

import { restFetch } from './db.js';

const enc = encodeURIComponent;

export async function listMeetings({ classification, search, limit = 200, offset = 0 } = {}) {
  let path = `/meetings?select=*,meeting_contacts(contact_id,match_type,contacts(id,first_name,last_name,company,email))&order=occurred_at.desc&limit=${limit}&offset=${offset}`;
  if (classification && classification !== 'all') {
    // Prefer user_classification when set, fall back to auto. PostgREST
    // doesn't do COALESCE in filters, so we OR both conditions.
    path += `&or=(user_classification.eq.${enc(classification)},and(user_classification.is.null,classification.eq.${enc(classification)}))`;
  }
  if (search) {
    const q = `%${search.trim()}%`;
    path += `&or=(title.ilike.${enc(q)},summary.ilike.${enc(q)},notes.ilike.${enc(q)})`;
  }
  return await restFetch(path) || [];
}

export async function getMeeting(id) {
  const rows = await restFetch(
    `/meetings?select=*,meeting_contacts(contact_id,match_type,contacts(*))&id=eq.${enc(id)}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateMeeting(id, patch) {
  await restFetch(`/meetings?id=eq.${enc(id)}`, {
    method: 'PATCH', body: patch, prefer: 'return=minimal',
  });
}

export async function deleteMeeting(id) {
  await restFetch(`/meetings?id=eq.${enc(id)}`, { method: 'DELETE' });
}

// Manual link/unlink — the cron auto-links by email, but the user can
// override after the fact (e.g., a meeting where the contact attended
// from a personal Gmail not on file in the CRM).
export async function linkMeetingToContact(userId, meetingId, contactId) {
  await restFetch('/meeting_contacts', {
    method: 'POST',
    prefer: 'return=minimal,resolution=ignore-duplicates',
    body: { user_id: userId, meeting_id: meetingId, contact_id: contactId, match_type: 'manual' },
  });
}

export async function unlinkMeetingFromContact(meetingId, contactId) {
  await restFetch(
    `/meeting_contacts?meeting_id=eq.${enc(meetingId)}&contact_id=eq.${enc(contactId)}`,
    { method: 'DELETE' }
  );
}

// Set user's classification override. Pass null/empty to clear.
export async function setUserClassification(meetingId, classification) {
  await updateMeeting(meetingId, { user_classification: classification || null });
}

// Effective classification: user override beats auto.
export function effectiveClassification(meeting) {
  return meeting?.user_classification || meeting?.classification || 'uncategorized';
}

// Meetings linked to a specific contact via meeting_contacts.
export async function listMeetingsForContact(contactId) {
  const rows = await restFetch(
    `/meeting_contacts?select=match_type,meetings(*)&contact_id=eq.${enc(contactId)}`
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .map(r => ({ ...r.meetings, _match_type: r.match_type }))
    .filter(m => m && m.id)
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}
