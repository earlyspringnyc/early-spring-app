import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/slack-notify
//   { text: string, type?: string }
//
// Auth-gated server-side proxy to the SLACK_WEBHOOK_URL. Required
// because the webhook URL is a secret and shouldn't ship to the
// browser. Clients call this when an interesting event happens
// (project awarded, client invoice paid, etc.) — server forwards
// to Slack. Silently no-ops if the webhook isn't configured.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  // Require auth — only signed-in Morgan users can fire Slack notifs.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  if (text.length > 2000) return res.status(400).json({ error: 'text too long' });

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    // Treat as a successful no-op so callers don't surface noise to
    // the user when Slack just isn't configured.
    return res.status(200).json({ ok: true, skipped: 'no_webhook_configured' });
  }

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'Slack webhook failed', detail: detail.slice(0, 200) });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Slack fetch failed', detail: e.message });
  }
}
