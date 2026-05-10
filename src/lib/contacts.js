// Personal CRM data layer. Uses raw PostgREST (restFetch) to stay
// immune to the supabase-js auth-lock issue we hit earlier in this
// project. RLS scopes everything to auth.uid() — these calls don't
// need to pass user_id explicitly except on insert.

import { restFetch } from './db.js';
import { mergePatch } from '../utils/csvImport.js';

const enc = encodeURIComponent;

// ----------------------------------------------------------------
// Read
// ----------------------------------------------------------------
export async function listContacts({ status, search, limit = 1000 } = {}) {
  let path = `/contacts?select=*&order=last_contacted_at.desc.nullslast,created_at.desc&limit=${limit}`;
  if (status && status !== 'all') path += `&status=eq.${enc(status)}`;
  if (search) {
    const q = `%${search.trim()}%`;
    // PostgREST OR across multiple text columns
    path += `&or=(first_name.ilike.${enc(q)},last_name.ilike.${enc(q)},email.ilike.${enc(q)},company.ilike.${enc(q)},title.ilike.${enc(q)})`;
  }
  return await restFetch(path) || [];
}

export async function getContact(id) {
  const rows = await restFetch(`/contacts?select=*&id=eq.${enc(id)}&limit=1`);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function listContactsByLinkedInOrEmail({ linkedin_urls = [], emails = [] }) {
  // Used by the importer to look up existing contacts in bulk.
  const urls = Array.from(new Set(linkedin_urls.filter(Boolean).map(s => s.toLowerCase())));
  const ems = Array.from(new Set(emails.filter(Boolean).map(s => s.toLowerCase())));
  const found = [];
  // Chunk to keep URL length sane (PostgREST `in.(...)` works fine but
  // long URLs flake on some proxies). 50 per query.
  const chunk = (arr, n) => arr.length ? Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n)) : [];
  for (const c of chunk(urls, 50)) {
    const list = c.map(v => `"${v}"`).join(',');
    const rows = await restFetch(`/contacts?select=*&linkedin_url=in.(${enc(list)})`) || [];
    found.push(...rows);
  }
  for (const c of chunk(ems, 50)) {
    const list = c.map(v => `"${v}"`).join(',');
    const rows = await restFetch(`/contacts?select=*&email=in.(${enc(list)})`) || [];
    found.push(...rows);
  }
  // De-dupe by id
  const seen = new Set();
  return found.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}

// ----------------------------------------------------------------
// Mutate
// ----------------------------------------------------------------
export async function createContact(userId, fields) {
  const body = stripImporterMeta({ user_id: userId, ...fields });
  const out = await restFetch('/contacts?select=*', { method: 'POST', body });
  return Array.isArray(out) ? out[0] : out;
}

export async function updateContact(id, patch) {
  const body = stripImporterMeta(patch);
  await restFetch(`/contacts?id=eq.${enc(id)}`, {
    method: 'PATCH', body, prefer: 'return=minimal',
  });
}

export async function deleteContact(id) {
  await restFetch(`/contacts?id=eq.${enc(id)}`, { method: 'DELETE' });
}

// ----------------------------------------------------------------
// Bulk import — used by the CSV wizard. Returns
// { created: n, merged: n, skipped: [{row, reason}], errors: [] }
// Reports progress via the optional onProgress callback.
// ----------------------------------------------------------------
export async function importContacts(userId, normalizedRows, { onProgress } = {}) {
  const result = { created: 0, merged: 0, skipped: [], errors: [] };

  // 1. Bulk-lookup existing rows that might match (LinkedIn URL or email)
  const existing = await listContactsByLinkedInOrEmail({
    linkedin_urls: normalizedRows.map(r => r.linkedin_url).filter(Boolean),
    emails: normalizedRows.map(r => r.email).filter(Boolean),
  });
  const byLinked = new Map();
  const byEmail = new Map();
  existing.forEach(c => {
    if (c.linkedin_url) byLinked.set(c.linkedin_url.toLowerCase(), c);
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
  });

  // 2. Walk the input. Insert in batches; merge updates one-by-one
  //    (simpler RLS handling than bulk PATCH-by-id).
  const toInsert = [];
  const toMerge = []; // { id, patch }
  for (const row of normalizedRows) {
    const matchKey = row.linkedin_url?.toLowerCase();
    const emailKey = row.email?.toLowerCase();
    const match = (matchKey && byLinked.get(matchKey)) || (emailKey && byEmail.get(emailKey));

    if (match) {
      const patch = mergePatch(match, row);
      if (Object.keys(patch).length) toMerge.push({ id: match.id, patch });
      else result.skipped.push({ name: row.first_name + ' ' + row.last_name, reason: 'no changes' });
    } else {
      toInsert.push(stripImporterMeta({
        user_id: userId,
        ...row,
        status: row.status || 'prospect',
      }));
    }
  }

  // 3. Insert in chunks of 100 (PostgREST handles ~10k bytes per request comfortably)
  const CHUNK = 100;
  let done = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    try {
      // Use Prefer: return=minimal — we don't need the inserted rows back
      await restFetch('/contacts', { method: 'POST', body: slice, prefer: 'return=minimal' });
      result.created += slice.length;
    } catch (e) {
      result.errors.push({ kind: 'insert', message: e.message || String(e), batchSize: slice.length });
    }
    done += slice.length;
    onProgress?.(done, toInsert.length + toMerge.length);
  }

  // 4. Apply merges sequentially
  for (const { id, patch } of toMerge) {
    try {
      await updateContact(id, patch);
      result.merged += 1;
    } catch (e) {
      result.errors.push({ kind: 'merge', id, message: e.message || String(e) });
    }
    done += 1;
    onProgress?.(done, toInsert.length + toMerge.length);
  }

  return result;
}

// ----------------------------------------------------------------
// Project linking
// ----------------------------------------------------------------
export async function linkContactToProject(userId, contactId, projectId, role = 'point_of_contact') {
  await restFetch('/contact_projects?select=*', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { user_id: userId, contact_id: contactId, project_id: projectId, role },
  });
}

export async function unlinkContactFromProject(contactId, projectId, role) {
  let path = `/contact_projects?contact_id=eq.${enc(contactId)}&project_id=eq.${enc(projectId)}`;
  if (role) path += `&role=eq.${enc(role)}`;
  await restFetch(path, { method: 'DELETE' });
}

export async function listProjectsForContact(contactId) {
  return await restFetch(
    `/contact_projects?select=role,created_at,projects(id,name,stage)&contact_id=eq.${enc(contactId)}`
  ) || [];
}

// ----------------------------------------------------------------
// Interactions
// ----------------------------------------------------------------
export async function listInteractions(contactId) {
  return await restFetch(
    `/contact_interactions?select=*&contact_id=eq.${enc(contactId)}&order=occurred_at.desc&limit=100`
  ) || [];
}

export async function addInteraction(userId, contactId, fields) {
  const body = { user_id: userId, contact_id: contactId, ...fields };
  const out = await restFetch('/contact_interactions?select=*', { method: 'POST', body });
  return Array.isArray(out) ? out[0] : out;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function stripImporterMeta(obj) {
  // Drop client-only fields like _importedAt before sending to PostgREST.
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    out[k] = v;
  }
  return out;
}
