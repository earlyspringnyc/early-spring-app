import { rateLimit } from '../_auth.js';
import { supaServiceFetch, randomDeviceCode, randomUserCode } from './_util.js';

// Device-flow OAuth — step 1.
// The Gmail Add-on POSTs here when the user clicks "Connect to
// Morgan". We mint a pending device row, returning the codes the
// add-on will display and poll with. No auth required — the
// device_code itself is the credential for subsequent polling.

const POLL_INTERVAL_SECONDS = 3;
const EXPIRES_IN_SECONDS = 600;   // 10 min

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const label = (req.body?.device_label || 'Gmail Add-on').toString().slice(0, 80);
  const deviceCode = randomDeviceCode();
  const userCode = randomUserCode();
  const expiresAt = new Date(Date.now() + EXPIRES_IN_SECONDS * 1000).toISOString();

  try {
    const ins = await supaServiceFetch('/addon_devices', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        device_label: label,
        device_code: deviceCode,
        user_code: userCode,
        status: 'pending',
        expires_at: expiresAt,
      }),
    });
    if (!ins.ok) {
      const text = await ins.text().catch(() => '');
      console.error('[addon-auth/start] insert failed:', ins.status, text);
      return res.status(500).json({ error: 'Failed to create device' });
    }
  } catch (e) {
    console.error('[addon-auth/start] error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }

  const base = process.env.APP_BASE_URL || 'https://morgan.earlyspring.nyc';
  return res.status(200).json({
    device_code: deviceCode,
    user_code: userCode,
    verification_url: `${base}/settings?addon_code=${encodeURIComponent(userCode)}`,
    interval: POLL_INTERVAL_SECONDS,
    expires_in: EXPIRES_IN_SECONDS,
  });
}
