import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/invoice-reminder
//   { to, invoice: { number, amount, dueDate, sentDate, projectName, clientName, paymentInstructions } }
//
// Sends a polite collections-reminder email to the named recipient
// via Mailgun. The HTML body is template-driven server-side — the
// caller doesn't supply HTML — so signed-in users can't use this
// as a generic mail relay.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function daysOverdueOf(s) {
  if (!s) return null;
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(s))) {
    d = new Date(String(s) + (String(s).length === 10 ? 'T00:00:00' : ''));
  } else {
    const m = String(s).split('/');
    if (m.length === 3) d = new Date(+m[2], +m[0] - 1, +m[1]);
  }
  if (!d || isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function reminderHtml({ invoice, fromName }) {
  const overdue = daysOverdueOf(invoice.dueDate);
  const tonePhrase = overdue == null
    ? "the invoice referenced below is on its way to its due date"
    : overdue <= 7
      ? "the invoice referenced below is past its due date"
      : overdue <= 30
        ? `the invoice referenced below is now ${overdue} days past due`
        : `the invoice referenced below is significantly past due (${overdue} days)`;
  const amt = Number(invoice.amount) || 0;
  return `<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0F52BA;background:#fff;">
  <div style="max-width:560px;margin:0 auto;padding:32px 28px;">
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">Hi —</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
      Quick reminder that ${esc(tonePhrase)} for <strong>${esc(invoice.projectName || 'our project together')}</strong>.
    </p>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
      <tr><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;background:rgba(15,82,186,.05);font-weight:600;width:38%;">Invoice</td><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;">${esc(invoice.number || '—')}</td></tr>
      <tr><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;background:rgba(15,82,186,.05);font-weight:600;">Amount</td><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;font-weight:700;">$${amt.toLocaleString()}</td></tr>
      ${invoice.dueDate ? `<tr><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;background:rgba(15,82,186,.05);font-weight:600;">Due</td><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;">${esc(invoice.dueDate)}${overdue != null && overdue > 0 ? ` <span style="color:#C53030;">(${overdue} days ago)</span>` : ''}</td></tr>` : ''}
      ${invoice.sentDate ? `<tr><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;background:rgba(15,82,186,.05);font-weight:600;">Sent</td><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;">${esc(invoice.sentDate)}</td></tr>` : ''}
    </table>
    ${invoice.paymentInstructions ? `<p style="font-size:13px;line-height:1.6;margin:14px 0;white-space:pre-wrap;">${esc(invoice.paymentInstructions)}</p>` : ''}
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
      If it's already been paid, ignore this and please send the remittance details so I can match it on our side. Otherwise let me know if anything's blocked.
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">Thanks —<br/>${esc(fromName || 'Kamil')}</p>
    <p style="font-size:11px;line-height:1.55;color:rgba(15,82,186,.55);margin:24px 0 0;">
      Early Spring NYC · 385 Van Brunt St, Floor 2 · Brooklyn, NY 11231<br/>
      hi@earlyspring.nyc · earlyspring.nyc
    </p>
  </div>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, invoice, fromName } = req.body || {};
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
    return res.status(400).json({ error: 'Valid recipient email required' });
  }
  if (!invoice || typeof invoice !== 'object') {
    return res.status(400).json({ error: 'invoice details required' });
  }

  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN_EARLYSPRING || process.env.MAILGUN_DOMAIN;
  if (!key || !domain) return res.status(500).json({ error: 'Mailgun not configured' });

  const subject = `Reminder: invoice ${invoice.number || ''} for ${invoice.projectName || 'our project'}`;
  const html = reminderHtml({ invoice, fromName });

  const params = new URLSearchParams();
  params.set('from', 'Early Spring <hi@earlyspring.nyc>');
  params.set('to', to);
  params.set('subject', subject);
  params.set('html', html);

  try {
    const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`api:${key}`).toString('base64') },
      body: params,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `Mailgun ${r.status}`, detail: detail.slice(0, 200) });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Mailgun fetch failed', detail: e.message });
  }
}
