import { rateLimit } from '../_auth.js';
import { supaServiceFetch, sha256Hex, mintAddonJwt } from './_util.js';

// Device-flow OAuth — step 5 (token refresh).
// Add-on POSTs the stored refresh_token. We hash it, look up the
// matching approved row, mint a short-lived Supabase-compatible
// JWT bound to the device's user_id, and return it. The JWT is
// accepted by PostgREST + RLS as a normal user session, so the
// add-on can call /api/addon/* with Authorization: Bearer <JWT>.

const JWT_TTL_SECONDS = 3600;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const refreshToken = (req.body?.refresh_token || '').toString().trim();
  if (!refreshToken) return res.status(400).json({ error: 'refresh_token required' });

  try {
    const hash = sha256Hex(refreshToken);
    const lookup = await supaServiceFetch(
      `/addon_devices?select=id,user_id,status,revoked_at&refresh_token_hash=eq.${encodeURIComponent(hash)}&limit=1`,
    );
    const rows = await lookup.json().catch(() => []);
    const row = Array.isArray(rows) && rows[0];
    if (!row) return res.status(401).json({ error: 'invalid_refresh_token' });
    if (row.status !== 'approved' || row.revoked_at) return res.status(403).json({ error: 'revoked' });
    if (!row.user_id) return res.status(500).json({ error: 'device_missing_user' });

    const accessToken = mintAddonJwt(row.user_id, { ttlSeconds: JWT_TTL_SECONDS });

    // Best-effort bump last_used_at. Not critical if it fails.
    supaServiceFetch(`/addon_devices?id=eq.${row.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {});

    return res.status(200).json({ access_token: accessToken, expires_in: JWT_TTL_SECONDS, token_type: 'Bearer' });
  } catch (e) {
    console.error('[addon-auth/refresh] error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
