import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/member-admin
//   body: { action, userId, orgId, password? }
//
// Actions:
//   - "reset_password" — generates a new random-suffix password and
//     resets the target user's auth password. Returns the new password.
//   - "revoke" — deletes the user's auth account entirely (cascade
//     drops their profile + project_members/project_clients).
//
// Caller must be admin/ep in the given org. Both actions are
// destructive enough that we re-check authorization on every call
// using the caller's JWT.

const ALLOWED_ACTIONS = new Set(['reset_password', 'revoke']);
const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const slug = (s) => String(s || 'team').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'team';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });

  const { action, userId, orgId } = req.body || {};
  if (!ALLOWED_ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  if (!orgId) return res.status(400).json({ error: 'Missing orgId' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) return res.status(500).json({ error: 'Server not configured' });

  // 1. Authorize caller: must be admin/ep in the target org.
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${callerToken}` } } });
  const { data: callerProfile } = await userClient
    .from('profiles')
    .select('role, organizations(name)')
    .eq('user_id', auth.id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!callerProfile || !['admin', 'ep'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Only admin / EP can manage members' });
  }
  const orgName = callerProfile.organizations?.name || 'team';

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 2. Verify the target user has a profile in this org. Prevents an
  //    admin in org A from yanking a user from org B.
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!targetProfile) return res.status(404).json({ error: 'Target user has no profile in this org' });

  // Don't let an admin nuke themselves accidentally — they should leave
  // the org via a different flow (not built yet).
  if (userId === auth.id) {
    return res.status(400).json({ error: 'Use a different account to manage your own membership' });
  }

  if (action === 'reset_password') {
    const password = `earlyspring${slug(orgName)}${randomDigits(4)}`;
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      console.error('[member-admin] reset_password failed:', error);
      return res.status(500).json({ error: 'Could not reset password' });
    }
    return res.status(200).json({ password });
  }

  if (action === 'revoke') {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error('[member-admin] revoke failed:', error);
      return res.status(500).json({ error: 'Could not revoke user' });
    }
    return res.status(200).json({ revoked: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
