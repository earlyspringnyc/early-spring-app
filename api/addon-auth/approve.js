import { verifyAuth, rateLimit } from '../_auth.js';
import { supaServiceFetch, randomRefreshToken, sha256Hex } from './_util.js';

// Device-flow OAuth — step 3 (approval).
// Called from the Morgan settings UI when a signed-in user clicks
// Approve on a pending device. Takes the user_code, attaches their
// user_id to the row, mints a refresh_token, persists its hash, and
// stores the plaintext in refresh_token_once for the add-on's next
// poll to pick up (and only that next poll).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const userCode = (req.body?.user_code || '').toString().trim().toUpperCase();
  if (!userCode) return res.status(400).json({ error: 'user_code required' });

  try {
    // Look up pending row by user_code. Must still be pending and
    // not expired.
    const lookup = await supaServiceFetch(
      `/addon_devices?select=id,status,expires_at&user_code=eq.${encodeURIComponent(userCode)}&limit=1`,
    );
    const rows = await lookup.json().catch(() => []);
    const row = Array.isArray(rows) && rows[0];
    if (!row) return res.status(404).json({ error: 'Code not found' });
    if (row.status !== 'pending') return res.status(409).json({ error: `Code already ${row.status}` });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      // Best-effort flip to expired so the row reflects reality.
      await supaServiceFetch(`/addon_devices?id=eq.${row.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired' }),
      });
      return res.status(410).json({ error: 'Code expired' });
    }

    const refreshToken = randomRefreshToken();
    const refreshHash = sha256Hex(refreshToken);

    const patch = await supaServiceFetch(`/addon_devices?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        status: 'approved',
        approved_at: new Date().toISOString(),
        refresh_token_hash: refreshHash,
        refresh_token_once: refreshToken,
      }),
    });
    if (!patch.ok) {
      const text = await patch.text().catch(() => '');
      console.error('[addon-auth/approve] patch failed:', patch.status, text);
      return res.status(500).json({ error: 'Failed to approve' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[addon-auth/approve] error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
