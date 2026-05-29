import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/contact-share-email
//   { to, contact: {first_name, last_name, email, phone, title, company,
//                   company_url, location, linkedin_url, bio, notes, tags},
//     message?, fromName? }
//
// Sends a self-contained HTML snapshot of a CRM contact card to the
// named recipient via Mailgun. The recipient gets clickable links
// (mailto:, tel:, LinkedIn URL, company website) directly in their
// inbox — no public web page or token, no auth.
//
// Following the invoice-reminder pattern: HTML is rendered server-side
// from a fixed template so the caller can't use this as a mail relay
// for arbitrary content. Only the optional `message` is user-supplied
// and it's HTML-escaped before insertion.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Normalize a URL for href use — prepend https:// when missing so an
// "earlyspring.nyc"-style domain becomes a working link.
function normalizeUrl(u) {
  if (!u) return null;
  const t = String(u).trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function contactCardHtml({ contact, message, fromName }) {
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '(no name)';
  const subtitle = [contact.title, contact.company].filter(Boolean).join(' · ');
  const linkedInHref = normalizeUrl(contact.linkedin_url);
  const websiteHref = normalizeUrl(contact.company_url);

  // Reusable row: label + value (value rendered as raw HTML so the
  // caller can pass <a>/<span>). All values are passed through esc()
  // first wherever they come from the user.
  const row = (label, valueHtml) => valueHtml ? `
    <tr>
      <td style="padding:8px 12px;border:1px solid rgba(15,82,186,.18);background:rgba(15,82,186,.05);font-weight:600;width:30%;font-size:12px;color:rgba(15,82,186,.7);letter-spacing:.04em;text-transform:uppercase;">${esc(label)}</td>
      <td style="padding:8px 12px;border:1px solid rgba(15,82,186,.18);font-size:13px;">${valueHtml}</td>
    </tr>` : '';

  const linkStyle = 'color:#0F52BA;text-decoration:underline;text-decoration-color:rgba(15,82,186,.3);';

  return `<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0F52BA;background:#fff;">
  <div style="max-width:600px;margin:0 auto;padding:32px 28px;">
    <p style="font-size:13px;line-height:1.6;margin:0 0 18px;color:rgba(15,82,186,.65);">
      ${esc(fromName || 'Someone')} shared a contact with you:
    </p>

    ${message ? `<div style="padding:12px 14px;margin:0 0 20px;border-left:3px solid rgba(15,82,186,.4);background:rgba(15,82,186,.04);border-radius:0 6px 6px 0;font-size:13px;line-height:1.55;color:rgba(15,82,186,.85);white-space:pre-wrap;">${esc(message)}</div>` : ''}

    <div style="border:1px solid rgba(15,82,186,.18);border-radius:10px;overflow:hidden;">
      <div style="padding:18px 20px;background:rgba(15,82,186,.04);border-bottom:1px solid rgba(15,82,186,.18);">
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#0F52BA;line-height:1.2;">
          ${esc(fullName)}
        </div>
        ${subtitle ? `<div style="font-size:13px;color:rgba(15,82,186,.7);margin-top:4px;">${esc(subtitle)}</div>` : ''}
      </div>

      <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0;">
        ${row('Email', contact.email ? `<a href="mailto:${esc(contact.email)}" style="${linkStyle}">${esc(contact.email)}</a>` : '')}
        ${row('Phone', contact.phone ? `<a href="tel:${esc(String(contact.phone).replace(/\s+/g, ''))}" style="${linkStyle}">${esc(contact.phone)}</a>` : '')}
        ${row('Title', contact.title ? esc(contact.title) : '')}
        ${row('Company', contact.company ? esc(contact.company) : '')}
        ${row('Website', websiteHref ? `<a href="${esc(websiteHref)}" target="_blank" rel="noopener" style="${linkStyle}">${esc(contact.company_url)}</a>` : '')}
        ${row('LinkedIn', linkedInHref ? `<a href="${esc(linkedInHref)}" target="_blank" rel="noopener" style="${linkStyle}">${esc(String(contact.linkedin_url).replace(/^https?:\/\/(www\.)?/i, ''))}</a>` : '')}
        ${row('Location', contact.location ? esc(contact.location) : '')}
      </table>

      ${contact.bio ? `<div style="padding:14px 20px;border-top:1px solid rgba(15,82,186,.18);font-size:12px;line-height:1.6;color:rgba(15,82,186,.75);white-space:pre-wrap;">${esc(contact.bio)}</div>` : ''}
      ${Array.isArray(contact.tags) && contact.tags.length ? `<div style="padding:12px 20px;border-top:1px solid rgba(15,82,186,.18);font-size:11px;color:rgba(15,82,186,.65);">Tags: ${contact.tags.map(t => esc(t)).join(' · ')}</div>` : ''}
    </div>

    <p style="font-size:11px;line-height:1.55;color:rgba(15,82,186,.55);margin:24px 0 0;text-align:center;">
      Shared from the Early Spring CRM · earlyspring.nyc
    </p>
  </div>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  // Same auth-when-configured pattern as invoice-reminder
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, contact, message, fromName } = req.body || {};
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
    return res.status(400).json({ error: 'Valid recipient email required' });
  }
  if (!contact || typeof contact !== 'object') {
    return res.status(400).json({ error: 'contact details required' });
  }
  if (message && String(message).length > 2000) {
    return res.status(400).json({ error: 'Message too long (2000 char max)' });
  }

  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN_EARLYSPRING || process.env.MAILGUN_DOMAIN;
  if (!key || !domain) return res.status(500).json({ error: 'Mailgun not configured' });

  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'a contact';
  // Subject reads as "Name, Company, Title" so the recipient sees at a
  // glance who's being introduced. Missing pieces are dropped instead
  // of leaving stray commas.
  const subject = [fullName, contact.company, contact.title].filter(Boolean).join(', ');
  const html = contactCardHtml({ contact, message, fromName });

  const params = new URLSearchParams();
  params.set('from', 'Early Spring <hi@earlyspring.nyc>');
  params.set('to', to);
  params.set('subject', subject);
  params.set('html', html);
  // Plain-text fallback so spam filters and text-only clients have something
  params.set('text', [
    `${fromName || 'Someone'} shared a contact with you.`,
    message ? `\n${message}\n` : '',
    `Name: ${fullName}`,
    contact.title ? `Title: ${contact.title}` : '',
    contact.company ? `Company: ${contact.company}` : '',
    contact.email ? `Email: ${contact.email}` : '',
    contact.phone ? `Phone: ${contact.phone}` : '',
    contact.linkedin_url ? `LinkedIn: ${contact.linkedin_url}` : '',
    contact.company_url ? `Website: ${contact.company_url}` : '',
    contact.location ? `Location: ${contact.location}` : '',
  ].filter(Boolean).join('\n'));

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
