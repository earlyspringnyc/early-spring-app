import { verifyAuth, rateLimit } from './_auth.js';

// Server-side proxy for the marketing site's capabilities content.
// Holds CAPABILITIES_API_KEY so it never ships to the browser.
// Vite env vars with VITE_ prefix get bundled into client JS, which
// would expose the key to anyone loading Morgan — so this stays as
// a server function and the client calls /api/capabilities here,
// which forwards to https://earlyspring.nyc/api/capabilities.

const UPSTREAM = 'https://earlyspring.nyc/api/capabilities';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.CAPABILITIES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CAPABILITIES_API_KEY not configured' });
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `Upstream ${upstream.status}`,
        detail: text.slice(0, 200),
      });
    }
    const data = await upstream.json();
    // Short edge cache — content rarely changes, but we still want
    // the user's "Refresh" button to feel responsive when it does.
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({
      error: 'Upstream fetch failed',
      detail: e.message || String(e),
    });
  }
}
