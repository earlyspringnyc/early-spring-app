import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/google-refresh
// Exchanges the user's stored Google refresh_token for a fresh
// access_token. Used by the staff app's sbAuth.refreshToken() when
// the Supabase session's provider_token has expired (~1 hour).
//
// Storage: google_refresh_tokens table, one row per user. RLS lets
// users see only their own row; the service role inside this handler
// bypasses RLS to do the upsert when the frontend signs in.
//
// Returns: { access_token, expires_in }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleClientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!supabaseUrl || !serviceKey || !googleClientId || !googleSecret) {
    return res.status(500).json({ error: 'Server not configured (missing GOOGLE_CLIENT_SECRET, GOOGLE_CLIENT_ID, or Supabase env vars)' });
  }

  // Optional: caller can POST { refresh_token } to seed the table on
  // initial sign-in. The frontend captures provider_refresh_token from
  // the Supabase session once and forwards it here.
  const incomingRefresh = (req.body && typeof req.body.refresh_token === 'string') ? req.body.refresh_token.trim() : null;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let refreshToken = incomingRefresh;

  if (incomingRefresh) {
    // Persist for future refreshes. Upsert so re-sign-ins overwrite.
    const { error: upErr } = await admin
      .from('google_refresh_tokens')
      .upsert({ user_id: auth.id, refresh_token: incomingRefresh, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (upErr) console.warn('[google-refresh] persist failed:', upErr.message);
  } else {
    const { data, error } = await admin
      .from('google_refresh_tokens')
      .select('refresh_token')
      .eq('user_id', auth.id)
      .maybeSingle();
    if (error || !data?.refresh_token) {
      return res.status(404).json({ error: 'No refresh token on file — sign in with Google again to grant offline access.' });
    }
    refreshToken = data.refresh_token;
  }

  // Exchange refresh_token for a new access_token at Google's token endpoint.
  const params = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  let tokenRes;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach Google token endpoint' });
  }

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    // 400 invalid_grant means the refresh token was revoked or expired —
    // user needs to re-sign-in with consent. Surface that distinctly so
    // the client can prompt re-auth instead of silently failing.
    if (tokenRes.status === 400 && /invalid_grant/.test(text)) {
      // Clear the stale token so we don't keep retrying with it.
      await admin.from('google_refresh_tokens').delete().eq('user_id', auth.id).catch(() => {});
      return res.status(401).json({ error: 'reauth_required', message: 'Sign in with Google again to renew calendar/Gmail access.' });
    }
    return res.status(502).json({ error: 'Google token refresh failed', detail: text.slice(0, 300) });
  }

  const body = await tokenRes.json();
  return res.status(200).json({
    access_token: body.access_token,
    expires_in: body.expires_in,
    scope: body.scope || '',
  });
}
