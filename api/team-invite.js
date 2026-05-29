import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/team-invite
//   body: { email, name?, role? }
//   returns: { email, password, alreadyExisted, orgId, role }
//
// Adds a teammate to the caller's current org. The teammate signs in
// at morgan.earlyspring.nyc with email + password (no Google required).
// Caller must be an admin or producer on the org to invite.
//
// Password is auto-generated: `earlyspring<orgnameslug><4digits>` —
// memorable for sharing verbally, but not trivially guessable.

const ALLOWED_ROLES = new Set(['admin', 'producer', 'agent', 'viewer', 'creative', 'finance', 'accounts', 'production', 'ep']);

const slug = (s) => String(s || 'team').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'team';
const sanitizeEmail = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s.includes('@') || s.length > 254) return null;
  return s;
};
const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });

  const { email: rawEmail, name, role: rawRole, orgId: rawOrgId } = req.body || {};
  const email = sanitizeEmail(rawEmail);
  if (!email) return res.status(400).json({ error: 'Invalid email' });
  const role = ALLOWED_ROLES.has(rawRole) ? rawRole : 'producer';

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Resolve which org the caller is inviting INTO. Default: their
  // active profile's org. Body can override (e.g. caller is a member
  // of multiple orgs and explicitly picks one).
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  // Fetch caller profile(s) — RLS gates this to themselves + their org.
  const { data: callerProfiles, error: callerErr } = await userClient
    .from('profiles')
    .select('id, org_id, role, organizations(id, name)')
    .eq('user_id', auth.id);
  if (callerErr || !callerProfiles?.length) {
    return res.status(403).json({ error: 'Caller has no profile in any org' });
  }
  const callerProfile = rawOrgId
    ? callerProfiles.find((p) => p.org_id === rawOrgId)
    : callerProfiles[0];
  if (!callerProfile) return res.status(403).json({ error: 'Caller not a member of that org' });

  // Only admin / producer / ep can invite. Read-only roles can't.
  if (!['admin', 'producer', 'ep'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'You do not have permission to invite teammates' });
  }

  const orgId = callerProfile.org_id;
  const orgName = callerProfile.organizations?.name || 'team';
  const password = `earlyspring${slug(orgName)}${randomDigits(4)}`;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Create (or fetch) the auth user.
  let userId = null;
  let alreadyExisted = false;

  const createRes = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name || '', invited_to_org: orgId, invited_as_role: role },
  });

  if (createRes.error) {
    const msg = String(createRes.error.message || '').toLowerCase();
    const isDup = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
    if (!isDup) {
      console.error('[team-invite] createUser error:', createRes.error);
      return res.status(500).json({ error: 'Could not create teammate account' });
    }
    const lookup = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = (lookup?.data?.users || []).find((u) => u.email?.toLowerCase() === email);
    if (!existing) return res.status(500).json({ error: 'Could not locate existing user by email' });
    userId = existing.id;
    alreadyExisted = true;
    // Reset password to the new one so the caller can re-share if needed.
    await admin.auth.admin.updateUserById(userId, { password });
  } else {
    userId = createRes.data.user.id;
  }

  // 2. Profile row in the org with the requested role (only if missing).
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!existingProfile) {
    const { error: profErr } = await admin.from('profiles').insert({
      user_id: userId,
      org_id: orgId,
      email,
      name: name || email,
      role,
    });
    if (profErr) {
      console.error('[team-invite] profile insert error:', profErr);
      return res.status(500).json({ error: 'Could not create teammate profile' });
    }
  } else if (existingProfile.role !== role) {
    // Existing member, update role if caller asked for a different one.
    await admin.from('profiles').update({ role }).eq('id', existingProfile.id);
  }

  return res.status(200).json({
    email,
    password,
    alreadyExisted,
    orgId,
    role,
    orgName,
  });
}
