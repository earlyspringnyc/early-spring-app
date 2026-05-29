import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/notify-client-of-section
//   { projectId, sectionLabel, assetCount?, customMessage? }
//
// Emails every client linked to the project (via project_clients)
// letting them know there's new content to review in their portal.
// Triggered manually from the section detail view in CreativeV.
//
// The "sharing" itself happens via asset.status='sent' on the staff
// side — the client portal renders any section that contains at least
// one sent asset. This endpoint is purely the human ping, decoupled
// from the data state.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bodyHtml({ projectName, sectionLabel, assetCount, customMessage, fromName, portalUrl }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0F52BA;background:#fff;">
  <div style="max-width:560px;margin:0 auto;padding:32px 28px;">
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">Hi —</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
      New content is ready for your review on <strong>${esc(projectName)}</strong>.
    </p>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
      <tr><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;background:rgba(15,82,186,.05);font-weight:600;width:38%;">Section</td><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;">${esc(sectionLabel)}</td></tr>
      ${assetCount ? `<tr><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;background:rgba(15,82,186,.05);font-weight:600;">Items</td><td style="border:1px solid rgba(15,82,186,.18);padding:9px 11px;">${esc(String(assetCount))} ${assetCount === 1 ? 'item' : 'items'}</td></tr>` : ''}
    </table>
    ${customMessage ? `<p style="font-size:14px;line-height:1.6;margin:18px 0;white-space:pre-wrap;">${esc(customMessage)}</p>` : ''}
    <p style="font-size:14px;line-height:1.6;margin:18px 0;">
      Open the portal to leave feedback or approve / reject each item:
    </p>
    <p style="margin:18px 0 24px;">
      <a href="${esc(portalUrl)}" style="display:inline-block;padding:11px 22px;background:#0F52BA;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Open client portal &rarr;</a>
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">Thanks —<br/>${esc(fromName || 'Early Spring')}</p>
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

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });

  const { projectId, sectionLabel, assetCount, customMessage } = req.body || {};
  if (!projectId || !sectionLabel) {
    return res.status(400).json({ error: 'projectId + sectionLabel required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  const supa = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Look up project (for name) and any linked clients
  const { data: project, error: projErr } = await supa
    .from('projects').select('id,name,org_id').eq('id', projectId).maybeSingle();
  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });

  // project_clients holds the link rows. The user_id column points
  // at auth.users — we need their emails, which only the service role
  // can read from auth.users via the admin API.
  const { data: links } = await supa
    .from('project_clients').select('user_id').eq('project_id', projectId);
  if (!links || links.length === 0) {
    return res.status(400).json({ error: 'No client accounts linked to this project — invite a client first.' });
  }

  // Fetch emails via the auth admin API. Iterate so a missing user
  // doesn't kill the whole send.
  const emails = [];
  for (const link of links) {
    const { data: userRes } = await supa.auth.admin.getUserById(link.user_id);
    const email = userRes?.user?.email;
    if (email) emails.push(email);
  }
  if (emails.length === 0) {
    return res.status(400).json({ error: 'No usable client emails resolved' });
  }

  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN_EARLYSPRING || process.env.MAILGUN_DOMAIN;
  if (!key || !domain) return res.status(500).json({ error: 'Mailgun not configured' });

  const fromName = auth.user_metadata?.full_name || auth.user_metadata?.name || auth.email || 'Early Spring';
  const portalUrl = 'https://morgan.earlyspring.nyc/client';
  const subject = `Ready for review: ${sectionLabel} — ${project.name}`;
  const html = bodyHtml({ projectName: project.name, sectionLabel, assetCount, customMessage, fromName, portalUrl });

  // Send to each client separately so reply-to works individually
  const results = [];
  for (const to of emails) {
    const params = new URLSearchParams();
    params.set('from', 'Early Spring <hi@earlyspring.nyc>');
    params.set('to', to);
    params.set('subject', subject);
    params.set('html', html);
    if (auth.email) params.set('h:Reply-To', auth.email);
    try {
      const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`api:${key}`).toString('base64') },
        body: params,
      });
      results.push({ to, ok: r.ok, status: r.status });
    } catch (e) {
      results.push({ to, ok: false, error: e.message });
    }
  }

  const sent = results.filter(r => r.ok).length;
  if (sent === 0) return res.status(502).json({ error: 'All sends failed', results });
  return res.status(200).json({ sent, total: emails.length, results });
}
