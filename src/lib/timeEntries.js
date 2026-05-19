import { restFetch } from './db.js';

// CRUD for time entries. RLS handles per-user scoping so we don't
// need user_id in selects — the policy filters server-side.

const enc = encodeURIComponent;

export async function listTimeEntriesForProject(projectId, { limit = 500 } = {}) {
  if (!projectId) return [];
  return await restFetch(
    `/time_entries?select=*&project_id=eq.${enc(projectId)}&order=date.desc,created_at.desc&limit=${limit}`,
  ) || [];
}

export async function listTimeEntriesForUser({ limit = 500 } = {}) {
  return await restFetch(
    `/time_entries?select=*,projects(id,name,client)&order=date.desc,created_at.desc&limit=${limit}`,
  ) || [];
}

export async function createTimeEntry(userId, projectId, fields) {
  const body = {
    user_id: userId,
    project_id: projectId,
    date: fields.date,
    hours: Number(fields.hours) || 0,
    rate: fields.rate != null && fields.rate !== '' ? Number(fields.rate) : null,
    description: fields.description || null,
  };
  const out = await restFetch('/time_entries?select=*', { method: 'POST', body });
  return Array.isArray(out) ? out[0] : out;
}

export async function updateTimeEntry(id, patch) {
  await restFetch(`/time_entries?id=eq.${enc(id)}`, {
    method: 'PATCH', body: patch, prefer: 'return=minimal',
  });
}

export async function deleteTimeEntry(id) {
  await restFetch(`/time_entries?id=eq.${enc(id)}`, { method: 'DELETE' });
}

// Aggregate helper. Returns { totalHours, totalBilled, unbilledHours }.
export function aggregateTimeEntries(rows) {
  let totalHours = 0;
  let totalBilled = 0;
  let unbilledHours = 0;
  for (const r of rows || []) {
    const h = Number(r.hours) || 0;
    totalHours += h;
    if (r.rate != null) totalBilled += h * (Number(r.rate) || 0);
    else unbilledHours += h;
  }
  return { totalHours, totalBilled, unbilledHours };
}
