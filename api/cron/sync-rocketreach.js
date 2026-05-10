// Vercel cron — pulls "My Contacts" from RocketReach every 10 min and
// merges into the user's CRM. RocketReach doesn't fire webhooks for
// LinkedIn-extension saves, so polling is the realistic alternative.
//
// Reads first ~200 most recent contacts each run; existing rows merge
// in place via the same dedup-by-(linkedin_url, email) cascade the
// CSV importer uses, so re-running is cheap and idempotent.

const RR_API = 'https://api.rocketreach.co/api/v2';
const RR_CONTACTS_BASE = 'https://rocketreach.co/v1';

export default async function handler(req, res) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when
  // CRON_SECRET is set as an env var. Reject everything else so this
  // endpoint isn't free-fire.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const apiKey = process.env.ROCKETREACH_API_KEY;
  const userId = process.env.MORGAN_DEFAULT_USER_ID;
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !userId || !supaUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const startedAt = Date.now();
  const result = { fetched: 0, created: 0, merged: 0, skipped: 0, errors: [] };

  try {
    // Fetch up to 2 pages (200 most recent contacts) — covers very
    // active days while staying under the 10s Vercel function budget.
    const profiles = [];
    for (let page = 1; page <= 2; page++) {
      const list = await fetchRocketReachList(apiKey, page, 100);
      profiles.push(...list);
      if (list.length < 100) break;
    }
    result.fetched = profiles.length;

    for (const raw of profiles) {
      const contact = shapeProfile(raw);
      if (!contact || (!contact.first_name && !contact.email && !contact.linkedin_url)) {
        result.skipped += 1;
        continue;
      }
      try {
        const action = await upsertContact({ supaUrl, serviceKey, userId, contact });
        if (action === 'created') result.created += 1;
        else if (action === 'merged') result.merged += 1;
        else result.skipped += 1;
      } catch (e) {
        result.errors.push({ name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(), message: e.message || String(e) });
      }
    }
  } catch (e) {
    console.error('[cron-rr] sync failed:', e);
    return res.status(500).json({ error: e.message || String(e), partial: result });
  }

  const ms = Date.now() - startedAt;
  console.log(`[cron-rr] sync done in ${ms}ms`, result);
  return res.status(200).json({ ok: true, took_ms: ms, ...result });
}

// ----------------------------------------------------------------
async function fetchRocketReachList(apiKey, page, pageSize) {
  // Confirmed via DevTools on rocketreach.co/app/my-contacts: the
  // canonical "My Contacts" endpoint is /v1/user_contacts on the
  // rocketreach.co domain — NOT /api/v2/* on api.rocketreach.co.
  const url = `${RR_CONTACTS_BASE}/user_contacts?num_results=${pageSize}&page=${page}`;
  const res = await fetch(url, { headers: { 'Api-Key': apiKey, Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RocketReach user_contacts failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json.results) ? json.results
       : Array.isArray(json) ? json
       : [];
}

// ----------------------------------------------------------------
function shapeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  // Handle both /api/v2/person/lookup shape AND /v1/user_contacts shape
  // (the user_contacts list uses company_name/title and no linkedin_url).
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
    title:      p.current_title || p.title || p.most_recent_ended_exp_title || null,
    company:    p.current_employer || p.employer || p.company_name || p.most_recent_ended_exp_company_name || null,
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

// ----------------------------------------------------------------
async function upsertContact({ supaUrl, serviceKey, userId, contact }) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const enc = encodeURIComponent;

  let existing = null;
  if (contact.linkedin_url) {
    const r = await fetch(
      `${supaUrl}/rest/v1/contacts?select=*&user_id=eq.${userId}&linkedin_url=eq.${enc(contact.linkedin_url)}&limit=1`,
      { headers }
    );
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) existing = rows[0];
  }
  if (!existing && contact.email) {
    const r = await fetch(
      `${supaUrl}/rest/v1/contacts?select=*&user_id=eq.${userId}&email=eq.${enc(contact.email)}&limit=1`,
      { headers }
    );
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) existing = rows[0];
  }

  if (existing) {
    // Fill-only: Morgan is source of truth once a field has a value.
    // Background sync never overwrites user-edited (or previously-
    // synced) data. Explicit refresh button handles overwrites.
    const patch = {};
    ['first_name','last_name','email','title','company','company_url','location','linkedin_url','phone']
      .forEach(k => { if (contact[k] && !existing[k]) patch[k] = contact[k]; });
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
      return 'merged';
    }
    return 'skipped';
  }

  const r = await fetch(`${supaUrl}/rest/v1/contacts`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify({ ...contact, user_id: userId, status: 'prospect' }),
  });
  if (!r.ok) throw new Error(`INSERT failed: ${r.status} ${await r.text()}`);
  return 'created';
}
