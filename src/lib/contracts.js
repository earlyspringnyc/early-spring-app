import { restFetch } from './db.js';

// CRUD for contracts. One row per project (for v1) — multiple
// contracts per project later via removing the dedup logic.
// Share token is generated server-side on first "send"; it
// goes into the public URL path component on earlyspring.nyc.

const enc = encodeURIComponent;

export async function getContractForProject(projectId) {
  if (!projectId) return null;
  const rows = await restFetch(
    `/contracts?select=*&project_id=eq.${enc(projectId)}&order=created_at.desc&limit=1`,
  );
  return rows && rows[0] ? rows[0] : null;
}

export async function createContract(userId, projectId, filledFields = {}, opts = {}) {
  const body = {
    user_id: userId,
    project_id: projectId,
    filled_fields: filledFields,
    status: 'draft',
  };
  // Optional: list of variable IDs the client can edit on the public
  // signing page (legal address, billing email, etc.). Defaults to []
  // server-side, so callers that don't care can omit it.
  if (Array.isArray(opts.clientFillableFields)) {
    body.client_fillable_fields = opts.clientFillableFields;
  }
  const out = await restFetch('/contracts?select=*', {
    method: 'POST', body,
  });
  return Array.isArray(out) ? out[0] : out;
}

export async function updateContract(id, patch) {
  await restFetch(`/contracts?id=eq.${enc(id)}`, {
    method: 'PATCH', body: patch, prefer: 'return=minimal',
  });
}

// Rotate (or assign for the first time) a share token. The token
// itself isn't sensitive — it's the URL path that the recipient
// uses — but rotating it instantly invalidates any in-flight link.
function randomToken() {
  // 24 url-safe bytes ≈ 128 bits of entropy. Plenty for a deck-style
  // unguessable URL.
  const arr = new Uint8Array(24);
  (globalThis.crypto || window.crypto).getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function sendContract(id) {
  const token = randomToken();
  const now = new Date().toISOString();
  await updateContract(id, {
    share_token: token,
    status: 'sent',
    sent_at: now,
  });
  return token;
}

// Mark a contract back to draft and rotate the token so any
// in-flight link 404s.
export async function revokeContract(id) {
  await updateContract(id, {
    status: 'revoked',
    share_token: null,
  });
}
