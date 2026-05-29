import { rateLimit } from '../_auth.js';
import { verifyAddonJwt, supaServiceFetch } from '../addon-auth/_util.js';

// Link an existing contact to a project. The unique constraint on
// contact_projects(contact_id, project_id, role) means re-linking
// the same triplet is a no-op (we use Prefer: resolution=ignore-
// duplicates so the call is idempotent).

const VALID_ROLES = new Set(['point_of_contact', 'rfp_sender', 'champion', 'team_member']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const claims = verifyAddonJwt(token);
  if (!claims) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  const contact_id = body.contact_id;
  const project_id = body.project_id;
  const role = VALID_ROLES.has(body.role) ? body.role : 'point_of_contact';
  if (!contact_id || !project_id) return res.status(400).json({ error: 'contact_id + project_id required' });

  try {
    const r = await supaServiceFetch(`/contact_projects`, {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify({ user_id: claims.user_id, contact_id, project_id, role }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(r.status).json({ error: text || 'Link failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
