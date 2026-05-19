import { restFetch } from './db.js';
import { normalizeCompany } from '../utils/companyDedup.js';

// CRUD for the companies metadata table. Keyed by normalized
// company name per user so a project.client of "Lonely Planet"
// resolves to the same row regardless of casing or suffix
// variation in any single contact's company field.

const enc = encodeURIComponent;

export async function getCompanyByName(name) {
  if (!name) return null;
  const norm = normalizeCompany(name);
  if (!norm) return null;
  const rows = await restFetch(
    `/companies?select=*&name_normalized=eq.${enc(norm)}&limit=1`,
  );
  return rows && rows[0] ? rows[0] : null;
}

// Upsert by (user_id, name_normalized). Use PostgREST's merge-
// duplicates Prefer so we don't need to round-trip a SELECT first.
export async function upsertCompany(userId, canonicalName, patch = {}) {
  if (!userId || !canonicalName) throw new Error('userId + canonicalName required');
  const norm = normalizeCompany(canonicalName);
  if (!norm) throw new Error('invalid company name');
  const body = {
    user_id: userId,
    name_canonical: canonicalName,
    name_normalized: norm,
    ...patch,
  };
  // on_conflict tells PostgREST which constraint to merge on —
  // without it, merge-duplicates defaults to the PK (id), misses
  // our (user_id, name_normalized) uniqueness, and 409s. Same fix
  // as contact_projects' linkContactToProject.
  const out = await restFetch('/companies?on_conflict=user_id,name_normalized&select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body,
  });
  return Array.isArray(out) ? out[0] : out;
}
