import { verifyAuth, rateLimit } from './_auth.js';

// Server-side proxy for RocketReach lookups so the API key never
// leaves Vercel. Single endpoint that handles both first-time lookup
// (paste a LinkedIn URL → enriched profile) and re-enrich of an
// existing contact (refresh title/company/location from a saved
// linkedin_url or email).
//
// Body: { linkedin_url?, email?, name?, current_employer? }
// Returns: { ok, status, profile?, raw? }

const RR_API = 'https://api.rocketreach.co/api/v2';
// RocketReach can return "queued" or "searching" when a profile isn't
// yet in their cache. We poll up to this many times before giving up.
const MAX_POLLS = 6;
const POLL_DELAY_MS = 2500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  // Auth-gate (skip when Supabase isn't configured locally)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.ROCKETREACH_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RocketReach API key not configured' });

  const body = req.body || {};
  const params = new URLSearchParams();
  let hasInput = false;
  if (body.linkedin_url) { params.set('linkedin_url', String(body.linkedin_url).trim()); hasInput = true; }
  if (body.email)        { params.set('email',        String(body.email).trim().toLowerCase()); hasInput = true; }
  if (body.name)         { params.set('name',         String(body.name).trim()); hasInput = true; }
  if (body.current_employer) { params.set('current_employer', String(body.current_employer).trim()); hasInput = true; }
  if (!hasInput) return res.status(400).json({ error: 'Provide linkedin_url, email, or name + current_employer' });

  try {
    // Initial lookup
    let lookup = await rrFetch(`/person/lookup?${params.toString()}`, apiKey);
    if (!lookup.ok) return res.status(lookup.status).json({ error: lookup.error || 'RocketReach error' });

    // Poll until status is complete or we time out
    let polls = 0;
    while (lookup.json?.status && lookup.json.status !== 'complete' && polls < MAX_POLLS) {
      const id = lookup.json?.id;
      if (!id) break;
      await new Promise(r => setTimeout(r, POLL_DELAY_MS));
      lookup = await rrFetch(`/person/checkStatus?ids=${id}`, apiKey);
      // checkStatus returns an array; normalize to single object
      if (Array.isArray(lookup.json)) lookup.json = lookup.json[0];
      polls++;
    }

    const profile = lookup.json || {};
    return res.status(200).json({
      ok: true,
      status: profile.status || 'complete',
      profile: shapeProfile(profile),
      raw: profile,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}

async function rrFetch(path, apiKey) {
  const res = await fetch(RR_API + path, {
    method: 'GET',
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    return { ok: false, status: res.status, error: json?.detail || json?.message || text || res.statusText };
  }
  return { ok: true, status: res.status, json };
}

// Normalize RocketReach's response into the same shape our CSV
// importer emits, so the client can use one merge path.
function shapeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  // Pick best email — current_work_email > recommended_email > first verified
  const email =
    p.current_work_email ||
    p.recommended_email ||
    pickEmail(p.emails) ||
    pickEmail(p.work_emails) ||
    pickEmail(p.personal_emails) ||
    null;
  return {
    first_name: p.first_name || splitName(p.name).first || null,
    last_name:  p.last_name  || splitName(p.name).last  || null,
    email:      email ? String(email).trim().toLowerCase() : null,
    title:      p.current_title || p.title || null,
    company:    p.current_employer || p.employer || null,
    company_url: p.current_employer_domain ? `https://${p.current_employer_domain}` : (p.employer_website || null),
    location:   p.location || p.city || null,
    linkedin_url: p.linkedin_url ? String(p.linkedin_url).split('?')[0].replace(/\/$/, '').toLowerCase() : null,
    bio:        p.bio || p.description || null,
    phone:      pickPhone(p.phones) || null,
    sources:    ['rocketreach'],
  };
}

function splitName(full) {
  if (!full) return { first: null, last: null };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function pickEmail(list) {
  if (!Array.isArray(list) || !list.length) return null;
  // Prefer entries flagged with grade A/B + smtp_valid; fall back to first
  const ranked = list
    .map(e => ({ email: typeof e === 'string' ? e : e?.email, grade: typeof e === 'object' ? e?.grade : null, valid: typeof e === 'object' ? e?.smtp_valid : null }))
    .filter(e => e.email);
  ranked.sort((a, b) => {
    const va = (a.valid === 'valid' ? 2 : 0) + (a.grade === 'A' ? 2 : a.grade === 'B' ? 1 : 0);
    const vb = (b.valid === 'valid' ? 2 : 0) + (b.grade === 'A' ? 2 : b.grade === 'B' ? 1 : 0);
    return vb - va;
  });
  return ranked[0]?.email || null;
}

function pickPhone(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const first = list[0];
  return typeof first === 'string' ? first : (first?.number || null);
}
