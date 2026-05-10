import { restFetch } from './db.js';

const enc = encodeURIComponent;

// Notes attached to a project. Used by the project view to surface
// both hand-written context and auto-pinned meeting summaries.
export async function listProjectNotes(projectId) {
  return await restFetch(
    `/project_notes?select=*,meetings(id,title,occurred_at,duration_minutes,external_url)&project_id=eq.${enc(projectId)}&order=created_at.desc&limit=200`
  ) || [];
}

export async function addProjectNote(userId, projectId, { content, source = 'manual', source_meeting_id = null }) {
  const body = { user_id: userId, project_id: projectId, content, source };
  if (source_meeting_id) body.source_meeting_id = source_meeting_id;
  const out = await restFetch('/project_notes?select=*', {
    method: 'POST', body,
  });
  return Array.isArray(out) ? out[0] : out;
}

export async function updateProjectNote(id, patch) {
  await restFetch(`/project_notes?id=eq.${enc(id)}`, {
    method: 'PATCH', body: patch, prefer: 'return=minimal',
  });
}

export async function deleteProjectNote(id) {
  await restFetch(`/project_notes?id=eq.${enc(id)}`, { method: 'DELETE' });
}

// Has this meeting already been saved to this project? Used to dim
// the "Save to project notes" button when there's already an entry.
export async function meetingAlreadySavedToProject(meetingId, projectId) {
  const rows = await restFetch(
    `/project_notes?select=id&project_id=eq.${enc(projectId)}&source_meeting_id=eq.${enc(meetingId)}&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}
