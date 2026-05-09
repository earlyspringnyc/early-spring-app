import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from './_auth.js';

// Create or rotate a share token for a project. Returns the token to the
// caller; only the user who owns/can-edit the project (per RLS) can create.
//
// POST /api/share-create
// body: { projectId, expiresInDays?, rotate? }
// returns: { token, expiresAt }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limited = rateLimit(req, 30, 60000);
  if (limited) return res.status(429).json({ error: 'Too many requests' });

  const auth = await verifyAuth(req, res);
  if (!auth) return; // verifyAuth has already responded

  const { projectId, expiresInDays = 90, rotate = false } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || (!serviceKey && !anonKey)) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Use the user's JWT for the verification SELECT so RLS confirms they can
  // see the project. Fall back to service-role only for the final UPSERT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
  });

  // 1. Confirm caller can see the project (RLS)
  const { data: proj, error: projErr } = await userClient
    .from('projects')
    .select('id, org_id')
    .eq('id', projectId)
    .maybeSingle();
  if (projErr || !proj) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // 2. Generate a 32-byte (43-char base64url) token
  const buf = new Uint8Array(32);
  (globalThis.crypto || (await import('node:crypto'))).getRandomValues
    ? (globalThis.crypto || (await import('node:crypto'))).getRandomValues(buf)
    : (await import('node:crypto')).randomFillSync(buf);
  const token = Buffer.from(buf).toString('base64url');

  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  // 3. Insert (or rotate by revoking old + inserting new)
  const adminClient = createClient(supabaseUrl, serviceKey || anonKey);
  if (rotate) {
    await adminClient.from('project_shares').update({ revoked_at: new Date().toISOString() }).eq('project_id', projectId).is('revoked_at', null);
  }
  const { error: insErr } = await adminClient.from('project_shares').insert({
    token, project_id: projectId, expires_at: expiresAt, created_by: auth.user.id,
  });
  if (insErr) {
    console.error('[share-create] insert error:', insErr);
    return res.status(500).json({ error: 'Could not create share token' });
  }

  return res.status(200).json({ token, expiresAt });
}
