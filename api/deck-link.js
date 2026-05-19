import { verifyAuth, rateLimit } from './_auth.js';
import { createHmac } from 'crypto';

// Generates an HMAC-signed shareable deck URL pointing at
// earlyspring.nyc/api/deck. The secret never leaves the server;
// the client posts the deck params and gets back the signed URL.
//
// Canonicalization MUST match the verification in
// portfolio/api/deck.js: keys sorted alphabetically, each
// `key=value` joined with `&`, signed with HMAC-SHA256 then
// base64url-encoded.

const ALLOWED_KEYS = ['company', 'for', 'studies', 'title'];

function canonicalize(params) {
  const keys = Object.keys(params).filter(k => ALLOWED_KEYS.includes(k)).sort();
  return keys.map(k => `${k}=${params[k]}`).join('&');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const secret = process.env.DECK_SIGNING_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'DECK_SIGNING_SECRET not configured' });
  }

  const body = req.body || {};
  const params = {};
  for (const k of ALLOWED_KEYS) {
    const v = body[k];
    if (v != null && String(v).length > 0) params[k] = String(v);
  }
  if (!params.company) {
    return res.status(400).json({ error: 'company is required' });
  }

  // express-style URLSearchParams encoding so the value the
  // signer sees matches what Vercel's request parser will surface
  // on the verification side. (Both will URL-decode before
  // hashing — they receive the raw decoded values.)
  const canonical = canonicalize(params);
  const sig = createHmac('sha256', secret).update(canonical).digest('base64url');

  const urlParams = new URLSearchParams(params);
  urlParams.set('sig', sig);
  const url = `https://earlyspring.nyc/api/deck?${urlParams.toString()}`;

  return res.status(200).json({ url });
}
