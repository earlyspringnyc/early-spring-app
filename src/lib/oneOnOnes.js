import { restFetch } from './db.js';

const enc = encodeURIComponent;

// CRUD for the "1-on-1s" surface — internal notes per teammate
// (Louisa, Jennifer, etc.). Folder structure is members → notes.

export async function listMembers(userId) {
  if (!userId) return [];
  return await restFetch(
    `/one_on_one_members?select=*&user_id=eq.${enc(userId)}&order=created_at.asc`,
  ) || [];
}

export async function createMember(userId, fields) {
  if (!userId) throw new Error('userId required');
  const body = {
    user_id: userId,
    name: (fields.name || '').trim(),
    email: (fields.email || '').trim().toLowerCase(),
    role_label: fields.role_label ? String(fields.role_label).trim() : null,
  };
  if (!body.name || !body.email) throw new Error('Name + email required');
  const out = await restFetch('/one_on_one_members?select=*', {
    method: 'POST', body,
  });
  return Array.isArray(out) ? out[0] : out;
}

export async function updateMember(id, patch) {
  await restFetch(`/one_on_one_members?id=eq.${enc(id)}`, {
    method: 'PATCH', body: patch, prefer: 'return=minimal',
  });
}

export async function deleteMember(id) {
  await restFetch(`/one_on_one_members?id=eq.${enc(id)}`, { method: 'DELETE' });
}

// Notes for a member, newest first. Empty array when none.
export async function listNotes(memberId) {
  if (!memberId) return [];
  return await restFetch(
    `/one_on_one_notes?select=*&member_id=eq.${enc(memberId)}&order=note_date.desc,created_at.desc`,
  ) || [];
}

export async function createNote(userId, memberId, fields) {
  if (!userId || !memberId) throw new Error('userId + memberId required');
  const body = {
    user_id: userId,
    member_id: memberId,
    note_date: fields.note_date || new Date().toISOString().slice(0, 10),
    title: fields.title ? String(fields.title).trim() : null,
    body: fields.body || '',
  };
  const out = await restFetch('/one_on_one_notes?select=*', {
    method: 'POST', body,
  });
  return Array.isArray(out) ? out[0] : out;
}

export async function updateNote(id, patch) {
  const out = await restFetch(`/one_on_one_notes?id=eq.${enc(id)}&select=*`, {
    method: 'PATCH', body: { ...patch, updated_at: new Date().toISOString() },
  });
  return Array.isArray(out) ? out[0] : out;
}

export async function deleteNote(id) {
  await restFetch(`/one_on_one_notes?id=eq.${enc(id)}`, { method: 'DELETE' });
}

export async function markRecapSent(id) {
  await updateNote(id, { sent_at: new Date().toISOString() });
}

// Ask Claude to split a 1:1 note by project. Returns an array of
// { project_id, project_name, snippet } chunks. project_id is null
// for general (non-project) bullets. The caller then lets the user
// assign each chunk to a project (creates a project_notes entry).
export async function organizeNoteByProject(noteBody, projects) {
  if (!noteBody?.trim() || !projects?.length) return { chunks: [] };
  let authHeaders = { 'Content-Type': 'application/json' };
  try {
    const { getSession } = await import('./db.js');
    const s = await getSession();
    if (s?.access_token) authHeaders.Authorization = `Bearer ${s.access_token}`;
  } catch (e) {}
  const projectList = projects
    .map((p) => `- id: ${p.id} · name: ${p.name}${p.client ? ` (client: ${p.client})` : ''}`)
    .join('\n');
  const system = `You are organizing free-form 1:1 meeting notes into per-project sections. Given the user's list of active projects, split the note text into chunks where each chunk is about one project (or null for general/non-project items). Preserve the original wording exactly — only group, don't rewrite. Return ONLY a JSON object of the shape: {"chunks":[{"project_id":"<id-or-null>","snippet":"<verbatim text from the note>"}]}`;
  const userMsg = `My projects:\n${projectList}\n\n1:1 note text:\n${noteBody}`;
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`/api/chat ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { chunks: [] };
  try {
    const parsed = JSON.parse(match[0]);
    const projectsById = new Map(projects.map((p) => [p.id, p]));
    const chunks = (parsed.chunks || []).map((c) => ({
      project_id: c.project_id || null,
      project_name: c.project_id ? (projectsById.get(c.project_id)?.name || 'Unknown project') : null,
      snippet: c.snippet || '',
    })).filter((c) => c.snippet.trim());
    return { chunks };
  } catch (e) {
    return { chunks: [] };
  }
}

// ── Meeting <→ 1:1 member links ──────────────────────────────
// Auto-links happen via Postgres triggers (attendee-email match);
// these functions are for manual assign/unassign from the UI.
export async function linkMeetingToMember(userId, memberId, meetingId) {
  if (!userId || !memberId || !meetingId) throw new Error('userId + memberId + meetingId required');
  await restFetch('/one_on_one_meeting_links', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { user_id: userId, member_id: memberId, meeting_id: meetingId, source: 'manual' },
  });
}

export async function unlinkMeetingFromMember(memberId, meetingId) {
  await restFetch(
    `/one_on_one_meeting_links?member_id=eq.${enc(memberId)}&meeting_id=eq.${enc(meetingId)}`,
    { method: 'DELETE' },
  );
}

// All meetings linked to a 1:1 folder, with the embedded meeting
// row inlined for rendering. Newest first by occurred_at.
export async function listMeetingsForMember(memberId) {
  if (!memberId) return [];
  return await restFetch(
    `/one_on_one_meeting_links?select=id,source,created_at,meetings(*)&member_id=eq.${enc(memberId)}&order=created_at.desc&limit=200`,
  ) || [];
}

// All 1:1 members a given meeting is linked to (for the meetings
// detail panel "Assigned to" chip list).
export async function listMembersForMeeting(meetingId) {
  if (!meetingId) return [];
  return await restFetch(
    `/one_on_one_meeting_links?select=id,source,created_at,one_on_one_members(*)&meeting_id=eq.${enc(meetingId)}`,
  ) || [];
}

// Create an internal project note from a 1:1 chunk. Uses the
// project_notes table with internal=true so client portal queries
// (filter internal=false) never surface it.
export async function assignChunkToProject(userId, projectId, oneOnOneNoteId, snippet) {
  if (!userId || !projectId || !snippet) throw new Error('userId + projectId + snippet required');
  const out = await restFetch('/project_notes?select=*', {
    method: 'POST',
    body: {
      user_id: userId,
      project_id: projectId,
      content: snippet,
      source: 'one_on_one',
      source_one_on_one_id: oneOnOneNoteId || null,
      internal: true,
    },
  });
  return Array.isArray(out) ? out[0] : out;
}
