import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/share-revoke   body: { projectId } — revokes all active tokens.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const limited = rateLimit(req, 30, 60000);
  if (limited) return res.status(429).json({ error: 'Too many requests' });
  const auth = await verifyAuth(req, res);
  if (!auth) return;

  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl) return res.status(500).json({ error: 'Server not configured' });

  // RLS check — caller must see the project to revoke it
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
  });
  const { data: proj } = await userClient.from('projects').select('id').eq('id', projectId).maybeSingle();
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  const adminClient = createClient(supabaseUrl, serviceKey || anonKey);
  const { error } = await adminClient
    .from('project_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .is('revoked_at', null);
  if (error) {
    console.error('[share-revoke] error:', error);
    return res.status(500).json({ error: 'Could not revoke' });
  }
  return res.status(200).json({ revoked: true });
}
