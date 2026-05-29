import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from '../_auth.js';

// POST /api/members/heal-orphan-clients
//   body: { orgId }
//   returns: { healed: number, orphans: [{user_id, email, name, projects: [...]}] }
//
// Walks project_clients for projects in the given org, finds any
// client user_ids that don't have a matching profile row in this
// org, and creates one (role='client'). This makes Members lists
// resilient to any client-invite flow that left orphans behind
// (which is what stranded Leslie Pitts + Wynn Mitchell originally).
//
// Caller must be staff (admin/ep/producer) in the org. Idempotent
// — if everyone already has a profile, healed=0 and the call is a
// no-op.

const STAFF_ROLES = new Set(['admin', 'ep', 'producer', 'finance', 'accounts']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });

  const { orgId } = req.body || {};
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  // Authorize: caller must be staff in this org. Uses their JWT, not
  // service role, so RLS still applies to the lookup.
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: `Bearer ${callerToken}` } } });
  const { data: callerProfile, error: callerErr } = await userClient
    .from('profiles')
    .select('role')
    .eq('user_id', auth.id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (callerErr || !callerProfile || !STAFF_ROLES.has(callerProfile.role)) {
    return res.status(403).json({ error: 'Only staff can heal client profiles' });
  }

  const admin = createClient(supaUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Every project_clients row for projects in this org.
  const { data: links, error: linkErr } = await admin
    .from('project_clients')
    .select('user_id, projects!inner(id, name, org_id)')
    .eq('projects.org_id', orgId);
  if (linkErr) {
    console.error('[heal-orphans] link query failed:', linkErr);
    return res.status(500).json({ error: 'Could not list client links' });
  }

  const userIds = Array.from(new Set((links || []).map((l) => l.user_id).filter(Boolean)));
  if (!userIds.length) return res.status(200).json({ healed: 0, orphans: [] });

  // 2. Which of these already have a profile in this org?
  const { data: existing } = await admin
    .from('profiles')
    .select('user_id')
    .eq('org_id', orgId)
    .in('user_id', userIds);
  const hasProfile = new Set((existing || []).map((p) => p.user_id));
  const orphanIds = userIds.filter((uid) => !hasProfile.has(uid));
  if (!orphanIds.length) return res.status(200).json({ healed: 0, orphans: [] });

  // 3. Look up email + name for orphans via the auth admin API.
  // listUsers pages by 1000; in practice orgs won't have >1000 clients.
  const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const usersById = new Map((usersPage?.users || []).map((u) => [u.id, u]));

  // 4. Build profile rows + insert.
  const rowsToInsert = [];
  const orphans = [];
  for (const uid of orphanIds) {
    const u = usersById.get(uid);
    if (!u?.email) continue;
    const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email;
    rowsToInsert.push({ user_id: uid, org_id: orgId, email: u.email, name, role: 'client' });
    const projectsForUser = (links || [])
      .filter((l) => l.user_id === uid)
      .map((l) => ({ id: l.projects?.id, name: l.projects?.name }))
      .filter((p) => p.id);
    orphans.push({ user_id: uid, email: u.email, name, projects: projectsForUser });
  }

  if (!rowsToInsert.length) return res.status(200).json({ healed: 0, orphans: [] });

  const { error: insertErr } = await admin.from('profiles').insert(rowsToInsert);
  if (insertErr) {
    console.error('[heal-orphans] insert failed:', insertErr);
    return res.status(500).json({ error: 'Heal insert failed' });
  }

  return res.status(200).json({ healed: rowsToInsert.length, orphans });
}
