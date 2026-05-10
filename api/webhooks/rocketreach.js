// RocketReach webhook receiver. RocketReach POSTs here every time a
// LookupProfile / LookupProfileAndCompany / BulkLookup completes — which
// covers every contact saved via the LinkedIn browser extension.
//
// Real-time push, no polling. Each event runs through the same shape
// + dedup logic the CSV importer uses, so a profile saved here merges
// cleanly with the rest of the CRM.

import { createHmac, timingSafeEqual } from 'crypto';

// Disable Vercel's auto JSON body parser — we need the raw bytes for
// HMAC signature verification (re-stringifying loses whitespace).
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Read raw body
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'Could not read body' });
  }

  // 2. Verify HMAC signature if a webhook secret is set.
  // Diagnostic mode: when ROCKETREACH_WEBHOOK_DEBUG=1 we log + return
  // the headers so we can see what RocketReach actually sends.
  const secret = process.env.ROCKETREACH_WEBHOOK_SECRET;
  const debug = process.env.ROCKETREACH_WEBHOOK_DEBUG === '1';

  if (debug) {
    console.error('[rr-webhook] DEBUG headers:', JSON.stringify(req.headers, null, 2));
    console.error('[rr-webhook] DEBUG body:', rawBody);
  }

  // RocketReach (at least on this plan) does NOT sign webhooks — their
  // test request comes in with no x-...-signature header at all. So
  // verification has to be soft: when a signature header IS present we
  // verify against the secret; when it's absent we accept the request
  // and rely on the URL itself being the shared secret (it isn't
  // published anywhere).
  const sig =
    req.headers['x-rocketreach-signature'] ||
    req.headers['x-webhook-signature'] ||
    req.headers['x-hub-signature-256'] ||
    req.headers['x-signature'] ||
    req.headers['signature'] ||
    '';

  if (secret && sig) {
    const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedB64 = createHmac('sha256', secret).update(rawBody).digest('base64');
    const cleaned = String(sig).replace(/^sha256=/, '').trim();
    const ok =
      (cleaned && safeEqual(cleaned, expectedHex)) ||
      (cleaned && cleaned === expectedB64);
    if (!ok) {
      console.error('[rr-webhook] signature present but mismatched', {
        provided_length: cleaned.length,
        expected_hex_length: expectedHex.length,
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // 3. Parse payload
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

  // RocketReach payload shapes vary by endpoint. Try the common
  // wrappers in order so we don't need a separate handler per event.
  const profileRaw =
    payload?.profile ||
    payload?.data?.profile ||
    payload?.data ||
    payload;

  const profile = shapeProfile(profileRaw);
  if (!profile || (!profile.first_name && !profile.email && !profile.linkedin_url)) {
    return res.status(200).json({ ok: true, skipped: 'empty profile' });
  }

  // 4. Upsert into Supabase via service-role (bypasses RLS).
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.MORGAN_DEFAULT_USER_ID;
  if (!supaUrl || !serviceKey || !userId) {
    return res.status(500).json({ error: 'Server not configured (missing service key or user id)' });
  }

  try {
    const result = await upsertContact({ supaUrl, serviceKey, userId, contact: profile });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[rr-webhook] upsert failed:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
  catch (e) { return false; }
}

// Same shape the lookup proxy + CSV importer produce, so dedup logic
// stays identical across all entry points.
function shapeProfile(p) {
  if (!p || typeof p !== 'object') return null;
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

// Mini upsert: SELECT by linkedin_url then email, then either PATCH or
// INSERT. We can't use PostgREST upsert() directly because our unique
// indexes are on lower(linkedin_url) / lower(email) — partial functional
// indexes that ON CONFLICT can't infer without an explicit constraint
// name. SELECT-then-write keeps the logic in one tier.
async function upsertContact({ supaUrl, serviceKey, userId, contact }) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  let existing = null;
  if (contact.linkedin_url) {
    const r = await fetch(
      `${supaUrl}/rest/v1/contacts?select=*&user_id=eq.${userId}&linkedin_url=eq.${encodeURIComponent(contact.linkedin_url)}&limit=1`,
      { headers }
    );
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length) existing = rows[0];
  }
  if (!existing && contact.email) {
    const r = await fetch(
      `${supaUrl}/rest/v1/contacts?select=*&user_id=eq.${userId}&email=eq.${encodeURIComponent(contact.email)}&limit=1`,
      { headers }
    );
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length) existing = rows[0];
  }

  if (existing) {
    const patch = {};
    ['first_name','last_name','email','title','company','company_url','location','linkedin_url','phone']
      .forEach(k => { if (contact[k] && contact[k] !== existing[k]) patch[k] = contact[k]; });
    if (!existing.bio && contact.bio) patch.bio = contact.bio;
    const sources = Array.from(new Set([...(existing.sources || []), 'rocketreach']));
    if (sources.length !== (existing.sources || []).length) patch.sources = sources;

    if (Object.keys(patch).length) {
      const r = await fetch(`${supaUrl}/rest/v1/contacts?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`PATCH failed: ${r.status} ${await r.text()}`);
    }
    return { action: 'merged', id: existing.id };
  }

  const r = await fetch(`${supaUrl}/rest/v1/contacts`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ ...contact, user_id: userId, status: 'prospect' }),
  });
  if (!r.ok) throw new Error(`INSERT failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return { action: 'created', id: rows?.[0]?.id };
}
