import { createClient } from '@supabase/supabase-js';
import { verifyAuth, rateLimit } from '../_auth.js';

// Import a talent roster from a StaffConnect presentation URL into
// the project_wardrobe table for a given project.
//
// The presentation page (presentation.php?id=...) embeds a JSON
// `var data = {...}` object containing every user id + headshot URL.
// Each user's individual showcase page (showcase.php?user_id=...)
// embeds the same kind of JSON with their full profile — sizes,
// shipping address, email, phone, etc. So we don't need a headless
// browser; plain fetch + regex is enough.
//
// What this does, for the given { url, project_id }:
//   1. Fetch the presentation HTML, parse the talent roster.
//   2. For each talent, fetch their showcase HTML, parse the profile
//      fields ([pe:N] dictionary).
//   3. Download the largest headshot, upload to the wardrobe-headshots
//      Supabase Storage bucket.
//   4. Insert a project_wardrobe row per talent.
//
// Idempotent on source_staff_id: re-running the same import skips
// talent that already exist in this project.

const SHOWCASE_FIELD_MAP = {
  fname: 'pe:1',
  lname: 'pe:2',
  email: 'pe:5',
  phone: 'pe:7',
  addr1: 'pe:8',
  addr2: 'pe:9',
  city: 'pe:10',
  state: 'pe:11',
  zip: 'pe:12',
  height: 'pe:24',
  shirt: 'pe:26',
  waist: 'pe:105',
  shoe: 'pe:107',
  build: 'pe:109',
};

function pickReplacement(replacements, key) {
  const v = replacements?.[`[${key}]`];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function extractDataObject(html) {
  // The pages all have:  var data = {...};
  // We greedy-match to the closing `};` followed by either a newline
  // or the next `data.type =` line.
  const m = html.match(/var data = (\{[\s\S]*?\});\s*(?:data\.type|<\/script>)/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    console.error('[import] failed to parse data JSON:', e.message);
    return null;
  }
}

function composeAddress(p) {
  const parts = [p.addr1, p.addr2, [p.city, p.state, p.zip].filter(Boolean).join(', ')].filter(Boolean);
  return parts.join('\n');
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Morgan/1.0' },
  });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return await res.text();
}

async function fetchBinary(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 Morgan/1.0' },
  });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const ct = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: ct };
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  maxDuration: 300,  // 40 sequential talent fetches + headshot downloads can take 1-2min
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { url, project_id } = req.body || {};
  if (typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ error: 'url required' });
  }
  if (typeof project_id !== 'string' || !project_id) {
    return res.status(400).json({ error: 'project_id required' });
  }

  // Sanity-check the URL is a StaffConnect presentation. We're not
  // generic-scraping the internet from a Vercel function.
  let parsed;
  try { parsed = new URL(url); } catch (e) {
    return res.status(400).json({ error: 'bad url' });
  }
  if (!/staffconnect-app\.com$/.test(parsed.hostname)) {
    return res.status(400).json({ error: 'only staffconnect-app.com URLs are supported' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase service role not configured' });
  }
  const supa = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // 1) Fetch presentation, extract talent roster + tenant origin
    console.log('[import] fetching presentation:', url);
    const presHtml = await fetchText(url);
    const presData = extractDataObject(presHtml);
    if (!presData || !Array.isArray(presData.users)) {
      return res.status(422).json({ error: 'could not parse talent roster from presentation' });
    }
    const tenantOrigin = `https://${parsed.hostname}`;
    const cardId = presData?.meta?.card_id || 19;

    // 2) Find what's already imported so we skip duplicates
    const { data: existing } = await supa
      .from('project_wardrobe')
      .select('source_staff_id')
      .eq('project_id', project_id);
    const existingIds = new Set((existing || []).map(r => r.source_staff_id).filter(Boolean));

    // 3) Determine starting sort_order
    const { data: maxRow } = await supa
      .from('project_wardrobe')
      .select('sort_order')
      .eq('project_id', project_id)
      .order('sort_order', { ascending: false })
      .limit(1);
    let nextSort = (maxRow?.[0]?.sort_order ?? -1) + 1;

    const results = { imported: 0, skipped: 0, errors: [], roster_size: presData.users.length };

    // 4) For each talent: fetch their showcase, parse fields, download
    //    headshot, insert row. Serial to be polite to the upstream.
    for (const u of presData.users) {
      const staffId = String(u.id);
      if (existingIds.has(staffId)) {
        results.skipped++;
        continue;
      }
      try {
        const showcaseUrl = `${tenantOrigin}/showcase.php?user_id=${staffId}&type=card&card_id=${cardId}`;
        const html = await fetchText(showcaseUrl);
        const data = extractDataObject(html);
        if (!data) {
          results.errors.push({ id: staffId, name: u.name, error: 'no profile JSON' });
          continue;
        }
        const r = data.replacements || {};
        const p = {};
        for (const [k, key] of Object.entries(SHOWCASE_FIELD_MAP)) {
          p[k] = pickReplacement(r, key);
        }
        const fullName = [p.fname || u.fname || '', p.lname || u.lname || ''].filter(Boolean).join(' ').trim()
          || u.display || u.name || 'Unnamed';
        const address = composeAddress(p);

        // Headshot — prefer the largest photo from the showcase, then
        // fall back to the presentation thumb.
        let headshotPath = null;
        const photo = (data.photos && data.photos[0]) || null;
        const headshotUrl = photo?.path || u.large_thumb || u.thumb;
        if (headshotUrl) {
          try {
            const { buf, contentType } = await fetchBinary(headshotUrl);
            const ext = contentType.includes('png') ? 'png' : 'jpg';
            const objectKey = `${project_id}/${staffId}.${ext}`;
            const { error: upErr } = await supa.storage
              .from('wardrobe-headshots')
              .upload(objectKey, buf, { contentType, upsert: true });
            if (upErr) throw upErr;
            headshotPath = objectKey;
          } catch (e) {
            console.warn(`[import] headshot upload failed for ${staffId}:`, e.message || e);
          }
        }

        const row = {
          project_id,
          user_id: user.id,
          name: fullName,
          headshot_path: headshotPath,
          source_staff_id: staffId,
          source_url: showcaseUrl,
          waist_size: p.waist || null,
          shoe_size: p.shoe || null,
          shirt_size: p.shirt || null,
          shipping_address: address || null,
          phone: p.phone || null,
          email: p.email || null,
          notes: p.height ? `Height: ${p.height}${p.build ? ` · Build: ${p.build}` : ''}` : null,
          sort_order: nextSort++,
        };

        const { error: insErr } = await supa.from('project_wardrobe').insert(row);
        if (insErr) {
          results.errors.push({ id: staffId, name: fullName, error: insErr.message });
        } else {
          results.imported++;
        }
      } catch (e) {
        results.errors.push({ id: staffId, name: u.name, error: e.message || String(e) });
      }
    }

    return res.status(200).json(results);
  } catch (e) {
    console.error('[import] threw:', e?.message || e);
    return res.status(500).json({ error: e.message || 'import failed' });
  }
}
