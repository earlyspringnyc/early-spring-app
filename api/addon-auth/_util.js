import crypto from 'crypto';

// Service-role REST client. We use the raw PostgREST API rather than
// supabase-js so we can be explicit about which key signs each call —
// auth endpoints run with the service role so they can read/write
// addon_devices regardless of the (possibly absent) user JWT.
export function supaServiceFetch(path, init = {}) {
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) throw new Error('Supabase server env not configured');
  return fetch(`${supaUrl}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

export function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// Random UUID for the device_code (unguessable polling key).
export function randomDeviceCode() {
  return crypto.randomUUID();
}

// Short, human-friendly code shown to the user during approval.
// Avoid 0/O and 1/I/L confusion. 8 chars, displayed as XXXX-XXXX.
export function randomUserCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[buf[i] % alphabet.length];
    if (i === 3) out += '-';
  }
  return out;
}

// 32-byte url-safe refresh token. Returned to the add-on exactly once
// (via poll); only its sha256 hash is persisted.
export function randomRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Mint a short-lived JWT for the add-on. We sign with our own secret
// (SUPABASE_JWT_SECRET, retained as the env var name for now — the
// value is just a random HMAC key, NOT tied to Supabase's JWT secret
// since their auth server only verifies asymmetric keys now).
// Verification happens via verifyAddonJwt below; we never call out
// to Supabase to validate these. Endpoints that need DB access use
// the service role key with explicit user_id filtering.
export function mintAddonJwt(userId, { ttlSeconds = 3600 } = {}) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: userId, iat: now, exp: now + ttlSeconds };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const data = `${b64(header)}.${b64(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// Verify an add-on JWT. Returns { user_id } on success, null on any
// failure (bad format, bad signature, expired). Constant-time compare
// on the signature to avoid timing attacks.
export function verifyAddonJwt(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) return null;
    const [h, p, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!payload?.sub) return null;
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { user_id: payload.sub };
  } catch (e) {
    return null;
  }
}
