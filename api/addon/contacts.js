import { rateLimit } from '../_auth.js';
import { verifyAddonJwt, supaServiceFetch } from '../addon-auth/_util.js';

// CRM contact endpoints for the Gmail Add-on.
//   GET  /api/addon/contacts?email=foo@bar.com   → existing contact, or 404
//   POST /api/addon/contacts                     → create new contact
//
// Auth: add-on JWT (HS256, signed by our SUPABASE_JWT_SECRET, NOT a
// Supabase-issued token — see addon-auth/_util.js for why). We verify
// the signature locally, then use the service role for DB writes
// with explicit user_id filtering since service role bypasses RLS.

function authed(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const claims = verifyAddonJwt(token);
  if (!claims) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return claims.user_id;
}

export default async function handler(req, res) {
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });
  const userId = authed(req, res);
  if (!userId) return; // authed() already sent 401

  if (req.method === 'GET') {
    const email = (req.query?.email || '').toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const r = await supaServiceFetch(
        `/contacts?select=id,first_name,last_name,email,company,title,linkedin_url&user_id=eq.${encodeURIComponent(userId)}&email=eq.${encodeURIComponent(email)}&limit=1`,
      );
      const rows = await r.json().catch(() => []);
      if (!Array.isArray(rows) || !rows[0]) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ contact: rows[0] });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Lookup failed' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const first_name = body.first_name ? String(body.first_name).trim() : null;
    const last_name = body.last_name ? String(body.last_name).trim() : null;
    if (!email && !first_name && !last_name) {
      return res.status(400).json({ error: 'Need at least email or name' });
    }

    // Match the contacts table schema exactly — sources is a jsonb
    // array (not a singular string), and there's no contact_type
    // column. Status defaults to 'prospect' server-side if omitted.
    const payload = {
      user_id: userId,
      email,
      first_name,
      last_name,
      company: body.company ? String(body.company).trim() : null,
      title: body.title ? String(body.title).trim() : null,
      linkedin_url: body.linkedin_url ? String(body.linkedin_url).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      sources: ['gmail_addon'],
    };
    if (body.status) payload.status = String(body.status).trim();
    if (body.contact_type) payload.contact_type = String(body.contact_type).trim();

    try {
      // Dedupe: if a contact already exists with this email for this
      // user, return it instead of erroring on the unique index.
      if (email) {
        const existing = await supaServiceFetch(
          `/contacts?select=id,first_name,last_name,email,company,title,linkedin_url&user_id=eq.${encodeURIComponent(userId)}&email=eq.${encodeURIComponent(email)}&limit=1`,
        );
        const rows = await existing.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]) {
          return res.status(200).json({ contact: rows[0], deduped: true });
        }
      }

      const r = await supaServiceFetch(`/contacts?select=*`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return res.status(r.status).json({ error: text || 'Insert failed' });
      }
      const out = await r.json();
      const created = Array.isArray(out) ? out[0] : out;
      return res.status(200).json({ contact: created, deduped: false });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Create failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
