import { restFetch } from './db.js';

// Read audit_log rows. RLS scopes to the caller, so this returns
// only entries the signed-in user is allowed to see (currently
// their own actions — admins may see more once we layer org-wide
// policies in).
//
// Filters:
//   - table  → 'projects' | 'vendors' | 'contracts' | 'contacts' | 'companies'
//   - recordId → UUID for "history of one row"
//   - limit  → default 100
//
// Sort: newest first.

const enc = encodeURIComponent;

export async function listAuditLog({ table, recordId, limit = 100 } = {}) {
  let path = `/audit_log?select=*&order=at.desc&limit=${limit}`;
  if (table) path += `&table_name=eq.${enc(table)}`;
  if (recordId) path += `&record_id=eq.${enc(recordId)}`;
  return (await restFetch(path)) || [];
}

// Diff `before` and `after` jsonb blobs and return a list of
// changed fields. Used by the viewer to render "name: 'foo' → 'bar'"
// instead of dumping the whole row.
export function diffFields(before, after) {
  if (!before && !after) return [];
  if (!before) return Object.keys(after || {}).map(k => ({ key: k, from: null, to: after[k] }));
  if (!after)  return Object.keys(before || {}).map(k => ({ key: k, from: before[k], to: null }));
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  // Skip noisy timestamps that change on every save.
  const IGNORE = new Set(['updated_at', 'created_at', 'last_contacted_at']);
  for (const k of keys) {
    if (IGNORE.has(k)) continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push({ key: k, from: a, to: b });
  }
  return out;
}
