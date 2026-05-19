import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/email-attachment
//   { accessToken, to, subject, htmlBody, attachment: { filename, mimeType, dataBase64 } }
//
// Sends an email with one file attachment via Gmail's user-scoped
// send endpoint. Built server-side because the multipart MIME
// assembly involves chunking long base64 strings, which is finicky
// in the browser and bloats the page bundle.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { accessToken, to, subject, htmlBody, attachment } = req.body || {};
  if (!accessToken || !to || !subject || !attachment?.dataBase64) {
    return res.status(400).json({ error: 'Missing accessToken / to / subject / attachment.dataBase64' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
    return res.status(400).json({ error: 'Invalid recipient email' });
  }
  const filename = String(attachment.filename || 'attachment').replace(/[\r\n"]/g, '');
  const mimeType = String(attachment.mimeType || 'application/octet-stream').replace(/[\r\n]/g, '');
  // Defense in depth: don't ferry a request that would blow past
  // Gmail's ~35MB cap.
  if (attachment.dataBase64.length > 32 * 1024 * 1024) {
    return res.status(413).json({ error: 'Attachment too large' });
  }

  // Build multipart/mixed MIME. Gmail expects the whole envelope
  // base64url-encoded under `raw`. Subject is RFC 2047-encoded so
  // non-ASCII chars don't mojibake (same fix as contract-send).
  const encodedSubject = `=?utf-8?B?${Buffer.from(String(subject), 'utf-8').toString('base64')}?=`;
  const boundary = '----es-mime-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  // Wrap base64 attachment data at 76 chars/line (RFC 2045).
  const wrapped = String(attachment.dataBase64).replace(/(.{76})/g, '$1\r\n');

  const parts = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    String(htmlBody || ''),
    ``,
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    wrapped,
    ``,
    `--${boundary}--`,
  ];
  const mime = parts.join('\r\n');
  const encoded = Buffer.from(mime).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    const gm = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!gm.ok) {
      const detail = await gm.text().catch(() => '');
      return res.status(gm.status).json({ error: `Gmail ${gm.status}`, detail: detail.slice(0, 300) });
    }
    const data = await gm.json();
    return res.status(200).json({ ok: true, id: data?.id || null });
  } catch (e) {
    return res.status(502).json({ error: 'Gmail send failed', detail: e.message });
  }
}
