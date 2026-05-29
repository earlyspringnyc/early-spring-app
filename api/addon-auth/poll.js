import { rateLimit } from '../_auth.js';
import { supaServiceFetch } from './_util.js';

// Device-flow OAuth — step 4 (polling).
// Add-on POSTs the device_code at the cadence returned by /start.
// Responses:
//   202 — { status: 'pending' }      → keep polling
//   200 — { status: 'approved', refresh_token } → store + stop polling
//   410 — { status: 'expired' }      → restart the flow
//   404 — { error: 'unknown_device' }
// The refresh_token is returned exactly once; the column is nulled
// the moment we hand it back, so a stolen device_code can't replay
// a later poll to recover it.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const deviceCode = (req.body?.device_code || '').toString().trim();
  if (!deviceCode) return res.status(400).json({ error: 'device_code required' });

  try {
    const lookup = await supaServiceFetch(
      `/addon_devices?select=id,status,expires_at,refresh_token_once&device_code=eq.${encodeURIComponent(deviceCode)}&limit=1`,
    );
    const rows = await lookup.json().catch(() => []);
    const row = Array.isArray(rows) && rows[0];
    if (!row) return res.status(404).json({ error: 'unknown_device' });

    if (row.status === 'expired' || (row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now())) {
      if (row.status !== 'expired') {
        await supaServiceFetch(`/addon_devices?id=eq.${row.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'expired' }),
        });
      }
      return res.status(410).json({ status: 'expired' });
    }

    if (row.status === 'pending') {
      return res.status(202).json({ status: 'pending' });
    }

    if (row.status === 'approved') {
      const token = row.refresh_token_once;
      if (!token) {
        // Already consumed once. Honor as approved but don't leak.
        return res.status(200).json({ status: 'approved', refresh_token: null });
      }
      // Hand it back exactly once.
      await supaServiceFetch(`/addon_devices?id=eq.${row.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ refresh_token_once: null }),
      });
      return res.status(200).json({ status: 'approved', refresh_token: token });
    }

    if (row.status === 'revoked') {
      return res.status(403).json({ status: 'revoked' });
    }

    return res.status(500).json({ error: 'unexpected_status' });
  } catch (e) {
    console.error('[addon-auth/poll] error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
