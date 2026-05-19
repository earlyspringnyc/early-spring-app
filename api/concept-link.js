import { verifyAuth, rateLimit } from './_auth.js';
import { createHmac } from 'crypto';

// Generates an HMAC-signed shareable concept-menu URL pointing at
// earlyspring.nyc/api/concept-menu. Same signing pattern as the
// deck-link endpoint — secret never leaves the server, signature
// IS the access token.
//
// The tier payload is large enough that URL-encoded params get
// ugly fast — we base64url-encode the JSON into one compact `t`
// param and sign that alongside company / for / title.

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const ALLOWED_KEYS = ['company', 'for', 'title', 't'];

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
  const company = String(body.company || '').trim();
  if (!company) return res.status(400).json({ error: 'company is required' });

  // Filter tiers down to only the fields the public page renders.
  const tiers = Array.isArray(body.tiers) ? body.tiers.slice(0, 5).map(t => ({
    label: String(t?.label || '').slice(0, 40),
    title: String(t?.title || '').slice(0, 160),
    concept: String(t?.concept || '').slice(0, 800),
    feeMin: t?.feeMin ? Number(t.feeMin) : null,
    feeMax: t?.feeMax ? Number(t.feeMax) : null,
    referenceSlug: String(t?.referenceSlug || '').slice(0, 80),
  })) : [];
  const intro = String(body.intro || '').slice(0, 1200);

  const payload = JSON.stringify({ intro, tiers });
  const tParam = b64url(payload);

  const params = { company, t: tParam };
  if (body.for)   params.for = String(body.for);
  if (body.title) params.title = String(body.title);

  const canonical = canonicalize(params);
  const sig = createHmac('sha256', secret).update(canonical).digest('base64url');

  const urlParams = new URLSearchParams(params);
  urlParams.set('sig', sig);
  const url = `https://earlyspring.nyc/api/concept-menu?${urlParams.toString()}`;

  return res.status(200).json({ url });
}
