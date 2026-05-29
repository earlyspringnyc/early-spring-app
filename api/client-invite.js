import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/client-invite
//   body: { projectId, email, name? }
//   returns: { email, password, alreadyExisted, projectId, orgId }
//
// Provisions a client login for a specific project:
//   1. Verifies the caller is staff on the project's org (RLS read).
//   2. Generates a deterministic password `earlyspring<sanitized-project-name>`.
//      (User opted into a memorable format over a random secret — see
//       the matching note in the invite modal.)
//   3. Creates (or fetches) a Supabase auth user with that email + password.
//   4. Adds a profile row scoped to the project's org with role='client'.
//   5. Links the user to the project via project_clients.
//
// Email delivery is left to the caller — the frontend sends the actual
// invite email via the staff member's Gmail using the existing flow.

const sanitizeForPassword = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40);

const sanitizeEmail = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s.includes('@') || s.length > 254) return null;
  return s;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });

  const { projectId, email: rawEmail, name } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });
  const email = sanitizeEmail(rawEmail);
  if (!email) return res.status(400).json({ error: 'Invalid email' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // 1. Verify caller can see the project (RLS-gated).
  //    Use the caller's JWT so org-scope is enforced — we never let the
  //    service key approve access by itself.
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: project, error: projErr } = await userClient
    .from('projects')
    .select('id, org_id, name, client, data')
    .eq('id', projectId)
    .maybeSingle();
  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });

  // 2. Build the password using the client name (falls back to project
  //    name if the project has no client set, then to 'client' as a
  //    last resort). Memorable for the staff member sharing the password.
  const passwordRoot = sanitizeForPassword(project.client)
    || sanitizeForPassword(project.name)
    || 'client';
  const password = `earlyspring${passwordRoot}`;

  // 3. Create or fetch the auth user. Admin API requires service role.
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = null;
  let alreadyExisted = false;

  // Try create first; if email exists, look up the existing user instead.
  const createRes = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,  // Skip the confirmation step — clients log in directly.
    user_metadata: {
      full_name: name || '',
      is_client: true,
      invited_for_project: projectId,
    },
  });

  if (createRes.error) {
    const msg = String(createRes.error.message || '').toLowerCase();
    const isDup = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
    if (!isDup) {
      console.error('[client-invite] createUser error:', createRes.error);
      return res.status(500).json({ error: 'Could not create client account' });
    }
    // Find existing user by email. listUsers is paginated; for a known
    // address the first match within the first page is enough for sane
    // org sizes — fall back to filtering if needed.
    const lookup = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = (lookup?.data?.users || []).find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (!existing) {
      return res.status(500).json({ error: 'Could not locate existing client user' });
    }
    userId = existing.id;
    alreadyExisted = true;
    // Reset password to the current project-derived one so the caller
    // can re-share without manual intervention.
    await adminClient.auth.admin.updateUserById(userId, { password });
  } else {
    userId = createRes.data.user.id;
  }

  // 4. Ensure a profile row exists for this user in the project's org.
  //    role='client' so the tightened project_select_staff policy excludes them.
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', project.org_id)
    .maybeSingle();
  if (!existingProfile) {
    const { error: profErr } = await adminClient.from('profiles').insert({
      user_id: userId,
      org_id: project.org_id,
      email,
      name: name || email,
      role: 'client',
    });
    if (profErr) {
      console.error('[client-invite] profile insert error:', profErr);
      return res.status(500).json({ error: 'Could not create client profile' });
    }
  }

  // 5. Link the user to this specific project. Unique constraint makes this idempotent.
  const { error: linkErr } = await adminClient
    .from('project_clients')
    .upsert({
      project_id: projectId,
      user_id: userId,
      invited_by: auth.id,
    }, { onConflict: 'project_id,user_id' });
  if (linkErr) {
    console.error('[client-invite] link error:', linkErr);
    return res.status(500).json({ error: 'Could not link client to project' });
  }

  return res.status(200).json({
    email,
    password,
    alreadyExisted,
    projectId,
    orgId: project.org_id,
    projectName: project.name,
    clientName: project.client,
  });
}
