// One-shot backfill: pages through every contact in your RocketReach
// "My Contacts" list and writes profile_image_url into any matching
// CRM row whose avatar_url is currently null.
//
// Auth: either Bearer CRON_SECRET (cron / curl) or a Supabase user
// JWT (button in the UI). User-triggered so it works from inside
// Morgan without exposing the cron secret to the browser.
//
// Reuses the service-role client so writes bypass RLS — matched by
// rocketreach_profile_id first, then linkedin_url, then email.

import { verifyAuth, rateLimit } from '../_auth.js';

const RR_API_BASE = 'https://rocketreach.co/v1';
const MAX_PAGES = 50;       // up to 5,000 contacts per run
const PAGE_SIZE = 100;
const HARD_TIMEOUT_MS = 280000; // 280s — comfortably under Vercel Pro 300s

export default async function handler(req, res) {
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  // Allow either CRON_SECRET (cron / curl path) or Supabase JWT (UI button)
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  let authorized = false;
  if (cronSecret && auth === `Bearer ${cronSecret}`) authorized = true;
  if (!authorized) {
    const user = await verifyAuth(req);
    if (user) authorized = true;
  }
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey = process.env.ROCKETREACH_API_KEY;
  const userId = process.env.MORGAN_DEFAULT_USER_ID;
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !userId || !supaUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const startedAt = Date.now();
  const result = { fetched: 0, updated: 0, alreadyHad: 0, noMatch: 0, noImage: 0, pages: 0, errors: [] };

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
        result.errors.push({ kind: 'timeout', detail: `Stopped at page ${page} to stay under 5min budget` });
        break;
      }
      const url = `${RR_API_BASE}/user_contacts?num_results=${PAGE_SIZE}&page=${page}`;
      const r = await fetch(url, { headers: { 'Api-Key': apiKey, Accept: 'application/json' } });
      if (!r.ok) {
        result.errors.push({ kind: 'rr-fetch', page, status: r.status });
        break;
      }
      const json = await r.json().catch(() => ({}));
      const profiles = Array.isArray(json.results) ? json.results : (Array.isArray(json) ? json : []);
      if (profiles.length === 0) break;
      result.pages = page;
      result.fetched += profiles.length;

      for (const p of profiles) {
        try {
          const imgUrl = p.profile_image_url || p.profile_pic_url;
          if (!imgUrl) { result.noImage += 1; continue; }

          const existing = await findContact({ supaUrl, headers, userId, profile: p });
          if (!existing) { result.noMatch += 1; continue; }
          if (existing.avatar_url) { result.alreadyHad += 1; continue; }

          await patchContact({ supaUrl, headers, contactId: existing.id, avatar_url: imgUrl });
          result.updated += 1;
        } catch (e) {
          result.errors.push({ kind: 'row', profile_id: p?.profile_id, message: e.message || String(e) });
        }
      }

      // RocketReach returns null `next` on the last page
      if (!json.next) break;
    }
  } catch (e) {
    console.error('[backfill-avatars] fatal:', e);
    return res.status(500).json({ error: e.message || String(e), partial: result });
  }

  const ms = Date.now() - startedAt;
  console.log(`[backfill-avatars] done in ${ms}ms`, result);
  return res.status(200).json({ ok: true, took_ms: ms, ...result });
}

async function findContact({ supaUrl, headers, userId, profile }) {
  const enc = encodeURIComponent;
  // Match cascade: rr profile_id → linkedin_url → email
  const rrId = profile?.profile_id != null ? String(profile.profile_id) : null;
  if (rrId) {
    const r = await fetch(
      `${supaUrl}/rest/v1/contacts?select=id,avatar_url&user_id=eq.${userId}&rocketreach_profile_id=eq.${enc(rrId)}&limit=1`,
      { headers }
    );
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  const li = profile?.linkedin_url ? String(profile.linkedin_url).split('?')[0].replace(/\/$/, '').toLowerCase() : null;
  if (li) {
    const r = await fetch(
      `${supaUrl}/rest/v1/contacts?select=id,avatar_url&user_id=eq.${userId}&linkedin_url=eq.${enc(li)}&limit=1`,
      { headers }
    );
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  const email = bestEmail(profile);
  if (email) {
    const r = await fetch(
      `${supaUrl}/rest/v1/contacts?select=id,avatar_url&user_id=eq.${userId}&email=eq.${enc(email)}&limit=1`,
      { headers }
    );
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  return null;
}

function bestEmail(p) {
  const list = [
    p.current_work_email, p.recommended_email,
    ...(Array.isArray(p.emails) ? p.emails.map(e => typeof e === 'string' ? e : e?.email) : []),
  ].filter(Boolean);
  const v = list[0];
  return v ? String(v).toLowerCase().trim() : null;
}

async function patchContact({ supaUrl, headers, contactId, avatar_url }) {
  const enc = encodeURIComponent;
  const r = await fetch(`${supaUrl}/rest/v1/contacts?id=eq.${enc(contactId)}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ avatar_url }),
  });
  if (!r.ok) throw new Error(`PATCH ${r.status}: ${await r.text()}`);
}
