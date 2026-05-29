import { rateLimit } from '../_auth.js';
import { verifyAddonJwt, supaServiceFetch } from '../addon-auth/_util.js';

// Project list for the Gmail Add-on's link-to-project picker.
// Uses our own JWT verification + service role with manual user_id
// filter — same pattern as the other addon endpoints. See
// api/addon/contacts.js for the auth rationale.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const claims = verifyAddonJwt(token);
  if (!claims) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const r = await supaServiceFetch(
      `/projects?select=id,name,client&user_id=eq.${encodeURIComponent(claims.user_id)}&order=updated_at.desc&limit=200`,
    );
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(r.status).json({ error: text || 'Failed to fetch projects' });
    }
    const projects = await r.json();
    return res.status(200).json({ projects: Array.isArray(projects) ? projects : [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
