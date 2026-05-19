import { getSession } from './db.js';

// Fire-and-forget Slack notification from the browser. Hits the
// auth-gated /api/slack-notify proxy so the SLACK_WEBHOOK_URL stays
// server-side. No-ops if no webhook is configured. Failures are
// logged but never thrown — Slack is non-critical infrastructure.

export async function notifySlack(text) {
  if (!text) return;
  try {
    const session = await getSession().catch(() => null);
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    await fetch('/api/slack-notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.warn('[slack] notify failed:', e?.message);
  }
}
