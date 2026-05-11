// Personal CRM data layer. Uses raw PostgREST (restFetch) to stay
// immune to the supabase-js auth-lock issue we hit earlier in this
// project. RLS scopes everything to auth.uid() — these calls don't
// need to pass user_id explicitly except on insert.

import { restFetch, getSession } from './db.js';
import { mergePatch } from '../utils/csvImport.js';

// ----------------------------------------------------------------
// RocketReach lookup — proxies through /api/rocketreach so the API
// key stays server-side. Accepts {linkedin_url, email, name, current_employer}.
// Returns a normalized profile in the same shape the CSV importer emits.
// ----------------------------------------------------------------
export async function rocketReachLookup(query) {
  const session = await getSession();
  const res = await fetch('/api/rocketreach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(query || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `RocketReach error: ${res.status}`);
  return data; // { ok, status, profile, raw }
}

// One-shot backfill: page through every contact in RocketReach and
// fill in avatar_url on matching CRM rows that don't have one yet.
// Server endpoint handles pagination + service-role writes.
export async function backfillAvatarsFromRocketReach() {
  const session = await getSession();
  const res = await fetch('/api/cron/backfill-avatars', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Backfill failed: ${res.status}`);
  return data;
}

// List "My Contacts" from RocketReach (the contacts saved via the
// browser extension or past lookups). Returns an array of profiles
// already shaped like our CSV importer's output, ready to feed into
// importContacts() for dedup + merge.
export async function listRocketReachContacts({ page = 1, page_size = 100 } = {}) {
  const session = await getSession();
  const res = await fetch('/api/rocketreach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ mode: 'list', page, page_size }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `RocketReach list error: ${res.status}`);
  return data; // { ok, endpoint, page, page_size, count, has_more, profiles }
}

// Pull every page of "My Contacts" from RocketReach and merge into
// the user's CRM via the same path the CSV importer uses. Stops when
// the API says has_more=false or after a hard cap (in case the API
// loops). Reports progress with onProgress(pageDone, contactsSeen).
export async function syncRocketReachContacts(userId, { onProgress, maxPages = 30 } = {}) {
  const all = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= maxPages) {
    const res = await listRocketReachContacts({ page });
    all.push(...(res.profiles || []));
    onProgress?.(page, all.length);
    hasMore = !!res.has_more;
    page += 1;
  }
  // Reuse the bulk importer — handles dedup-vs-existing, in-batch
  // duplicates, and unique-constraint stragglers via ignore-duplicates.
  const result = await importContacts(userId, all);
  return { fetched: all.length, ...result };
}

// Two-step re-enrich. The refresh button on a row now previews the
// diff before writing anything — so a user with hand-curated notes
// can see exactly what RocketReach would change and reject stale or
// regressive updates.
//
// 1. previewReenrich → fetches the fresh profile + computes the
//    overwrite patch. NOTHING is written.
// 2. applyReenrichPatch → writes the user-approved patch.
export async function previewReenrich(contact) {
  const query = {};
  if (contact.linkedin_url) query.linkedin_url = contact.linkedin_url;
  else if (contact.email)    query.email = contact.email;
  else throw new Error('Cannot re-enrich a contact without LinkedIn URL or email');
  const { profile } = await rocketReachLookup(query);
  if (!profile) throw new Error('No profile returned');
  const patch = mergePatch(contact, profile, { mode: 'overwrite' });
  return { profile, patch };
}

export async function applyReenrichPatch(contactId, patch) {
  if (!patch || !Object.keys(patch).length) return;
  await updateContact(contactId, patch);
}

// Legacy single-shot variant — kept for any callers that still want
// the old "lookup + apply" behavior. New UI uses the preview path.
export async function reenrichContact(contact) {
  const { profile, patch } = await previewReenrich(contact);
  if (Object.keys(patch).length) await applyReenrichPatch(contact.id, patch);
  return { patch, profile };
}

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

  // 2. Walk the input. Track LinkedIn/emails seen WITHIN this import so
  //    in-file duplicates don't both make it into the same insert batch
  //    (which would 409 on the unique constraint and fail the whole batch).
  const seenLinks = new Set();
  const seenEmails = new Set();
  const toInsert = [];
  const toMerge = []; // { id, patch }
  for (const row of normalizedRows) {
    const matchKey = row.linkedin_url?.toLowerCase();
    const emailKey = row.email?.toLowerCase();
    const match = (matchKey && byLinked.get(matchKey)) || (emailKey && byEmail.get(emailKey));

    if (match) {
      const patch = mergePatch(match, row);
      if (Object.keys(patch).length) toMerge.push({ id: match.id, patch });
      else result.skipped.push({ name: (row.first_name || '') + ' ' + (row.last_name || ''), reason: 'no changes' });
      continue;
    }

    // No DB match — but check if we already queued a row with the same
    // linkedin_url or email in this same import.
    if (matchKey && seenLinks.has(matchKey)) {
      result.skipped.push({ name: (row.first_name || '') + ' ' + (row.last_name || ''), reason: 'duplicate LinkedIn URL within file' });
      continue;
    }
    if (emailKey && seenEmails.has(emailKey)) {
      result.skipped.push({ name: (row.first_name || '') + ' ' + (row.last_name || ''), reason: 'duplicate email within file' });
      continue;
    }
    if (matchKey) seenLinks.add(matchKey);
    if (emailKey) seenEmails.add(emailKey);

    toInsert.push(stripImporterMeta({
      user_id: userId,
      ...row,
      status: row.status || 'prospect',
    }));
  }

  // 3. Insert in chunks of 100. Pass resolution=ignore-duplicates so any
  //    straggler unique-constraint conflicts (e.g., from a previous
  //    partial run) become silent skips instead of failing the batch.
  const CHUNK = 100;
  let done = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    try {
      await restFetch('/contacts', {
        method: 'POST', body: slice,
        prefer: 'return=minimal,resolution=ignore-duplicates',
      });
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
    `/contact_projects?select=role,created_at,projects(id,name)&contact_id=eq.${enc(contactId)}`
  ) || [];
}

// Reverse lookup — all contacts linked to a project, with their role.
// Used by the project view's contacts panel.
export async function listContactsForProject(projectId) {
  return await restFetch(
    `/contact_projects?select=role,created_at,contacts(*)&project_id=eq.${enc(projectId)}`
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
