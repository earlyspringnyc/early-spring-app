import { restFetch } from './db.js';

// CRUD for the prep_briefs table. Briefs keyed by (user_id,
// external_event_id) so the same Google Calendar event always
// surfaces the same in-progress brief, regardless of whose
// contact got resolved as primary attendee.
//
// Shape returned to UI:
//   { pickedStudies: string[], asks: string, news: object|null,
//     contact_id, event_title, event_start, event_end }

const enc = encodeURIComponent;

export async function getBriefForEvent(eventId) {
  if (!eventId) return null;
  const rows = await restFetch(
    `/prep_briefs?select=*&external_event_id=eq.${enc(eventId)}&limit=1`,
  );
  return rows && rows[0] ? rows[0] : null;
}

// Upsert: PostgREST does this via prefer=resolution=merge-duplicates
// when there's a unique index on (user_id, external_event_id).
export async function upsertBriefForEvent(userId, eventId, eventMeta, patch) {
  if (!userId || !eventId) throw new Error('userId + eventId required');
  const body = {
    user_id: userId,
    external_event_id: eventId,
    external_provider: 'google_calendar',
    contact_id: eventMeta?.contact_id || null,
    event_title: eventMeta?.title || null,
    event_start: eventMeta?.start || null,
    event_end: eventMeta?.end || null,
    event_attendees: eventMeta?.attendees || [],
    picked_studies: patch?.pickedStudies || [],
    asks: patch?.asks || '',
    news_cache: patch?.news || {},
  };
  const rows = await restFetch('/prep_briefs?select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}
