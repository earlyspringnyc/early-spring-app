// CSV import for contacts. Handles two source formats out of the box —
// RocketReach (current export) and LinkedIn Connections (export from
// linkedin.com/mypreferences/d/download-my-data). The output of both
// formats is a normalized contact row that goes through the same
// merge/dedup path on the way to the database.

// ------------------------------------------------------------
// CSV parsing — small, RFC-4180-ish, handles quoted commas and
// embedded newlines. Avoids the heavier `papaparse` dependency.
// ------------------------------------------------------------
export function parseCSV(text) {
  // Normalize line endings, strip BOM
  text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else { cell += ch; }
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1)
    .filter(r => r.some(c => (c || '').trim()))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
  return { headers, rows: dataRows };
}

// ------------------------------------------------------------
// Source detection. We sniff the header set to decide which
// adapter to use. Easy to extend with HubSpot, Pipedrive, etc.
// ------------------------------------------------------------
export function detectSource(headers) {
  const set = new Set(headers.map(h => h.toLowerCase()));
  // RocketReach export shape
  if (set.has('recommended email') && set.has('linkedin') && set.has('professional background summary')) {
    return 'rocketreach';
  }
  // LinkedIn Connections export shape (2024+)
  if ((set.has('connected on') || set.has('first name')) && set.has('url') && set.has('email address')) {
    return 'linkedin';
  }
  return 'generic';
}

// ------------------------------------------------------------
// Adapters — turn a raw CSV row into a normalized contact.
// Always emit the same shape so downstream merge code is one path.
// ------------------------------------------------------------
function normalizeRocketReach(r, importedAt) {
  return {
    first_name: r['First Name'] || splitName(r['Name']).first,
    last_name:  r['Last Name']  || splitName(r['Name']).last,
    email:      cleanEmail(r['Recommended Email']),
    title:      r['Title'] || null,
    company:    r['Employer'] || null,
    company_url: null,
    location:   r['Location'] || null,
    linkedin_url: cleanLinkedIn(r['LinkedIn']),
    bio:        r['Professional Background Summary'] || null,
    notes:      null,
    phone:      null,
    sources:    ['rocketreach'],
    linkedin_connected_at: null,
    _importedAt: importedAt,
  };
}

function normalizeLinkedIn(r, importedAt) {
  return {
    first_name: r['First Name'] || null,
    last_name:  r['Last Name']  || null,
    email:      cleanEmail(r['Email Address']),
    title:      r['Position'] || null,
    company:    r['Company'] || null,
    company_url: null,
    location:   r['Location'] || null,
    linkedin_url: cleanLinkedIn(r['URL']),
    bio:        null,
    notes:      null,
    phone:      null,
    sources:    ['linkedin'],
    linkedin_connected_at: parseLinkedInDate(r['Connected On']),
    _importedAt: importedAt,
  };
}

function normalizeGeneric(r, importedAt) {
  // Best-effort: pick whichever common header names exist.
  const get = (...keys) => {
    for (const k of keys) if (r[k] != null && r[k] !== '') return r[k];
    return null;
  };
  return {
    first_name: get('First Name', 'first_name', 'First') || splitName(get('Name', 'Full Name', 'name')).first,
    last_name:  get('Last Name', 'last_name', 'Last') || splitName(get('Name', 'Full Name', 'name')).last,
    email:      cleanEmail(get('Email', 'Email Address', 'Recommended Email', 'email')),
    title:      get('Title', 'Position', 'Job Title', 'title'),
    company:    get('Company', 'Employer', 'Organization', 'company'),
    company_url: get('Website', 'Company Website', 'company_url'),
    location:   get('Location', 'City', 'location'),
    linkedin_url: cleanLinkedIn(get('LinkedIn', 'URL', 'LinkedIn URL', 'linkedin')),
    bio:        get('Bio', 'Summary', 'Professional Background Summary', 'bio'),
    notes:      get('Notes', 'notes'),
    phone:      get('Phone', 'phone', 'Mobile'),
    sources:    ['manual'],
    linkedin_connected_at: parseLinkedInDate(get('Connected On')),
    _importedAt: importedAt,
  };
}

// ------------------------------------------------------------
// Cleanup helpers
// ------------------------------------------------------------
function splitName(full) {
  if (!full) return { first: null, last: null };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function cleanEmail(e) {
  if (!e) return null;
  const v = String(e).trim().toLowerCase();
  return v.includes('@') ? v : null;
}

function cleanLinkedIn(u) {
  if (!u) return null;
  let v = String(u).trim();
  if (!v) return null;
  // Strip trailing slash + query string for stable dedup match
  v = v.split('?')[0].replace(/\/$/, '');
  // LinkedIn sometimes exports URLs without protocol
  if (!v.startsWith('http')) v = 'https://' + v;
  // Lowercase for stable comparison — LinkedIn URLs are case-insensitive
  // and the DB unique index is on lower(linkedin_url). Storing in a
  // single canonical case keeps in-batch and DB dedup aligned.
  return v.toLowerCase();
}

function parseLinkedInDate(s) {
  if (!s) return null;
  // LinkedIn export uses "DD MMM YYYY" e.g. "12 Mar 2024"
  const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  const m = String(s).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const monthIdx = months[m[2].slice(0, 3).toLowerCase()];
  if (monthIdx == null) return null;
  const d = new Date(Date.UTC(parseInt(m[3], 10), monthIdx, parseInt(m[1], 10)));
  return d.toISOString();
}

// ------------------------------------------------------------
// Public: parse + normalize in one call.
// Returns { source, count, contacts, warnings }.
// ------------------------------------------------------------
export function parseContactsCSV(text) {
  const { headers, rows } = parseCSV(text);
  const source = detectSource(headers);
  const importedAt = new Date().toISOString();
  const adapter =
    source === 'rocketreach' ? normalizeRocketReach
    : source === 'linkedin' ? normalizeLinkedIn
    : normalizeGeneric;

  const contacts = rows.map(r => adapter(r, importedAt));
  const warnings = [];
  // Dedup hint: in-file duplicates (by linkedin_url, then email)
  const liSeen = new Map();
  const emSeen = new Map();
  contacts.forEach((c, i) => {
    if (c.linkedin_url) {
      const k = c.linkedin_url.toLowerCase();
      if (liSeen.has(k)) warnings.push(`Row ${i + 2}: duplicate LinkedIn URL of row ${liSeen.get(k) + 2}`);
      else liSeen.set(k, i);
    }
    if (c.email) {
      const k = c.email.toLowerCase();
      if (emSeen.has(k)) warnings.push(`Row ${i + 2}: duplicate email of row ${emSeen.get(k) + 2}`);
      else emSeen.set(k, i);
    }
  });

  return { source, headers, count: contacts.length, contacts, warnings };
}

// ------------------------------------------------------------
// Merge helper for re-imports. Given an existing row + a new
// import row, produce the patch to apply. Rules:
// — most-recent-wins for editable fields (LinkedIn likely fresher)
// — bio is set if existing is null, otherwise preserved
// — sources accumulate
// — linkedin_connected_at preferred from import if existing is null
// — never overwrite user-authored notes / tags / status
// ------------------------------------------------------------
export function mergePatch(existing, incoming) {
  const patch = {};
  const fillIfChanged = (k) => {
    if (incoming[k] != null && incoming[k] !== '' && incoming[k] !== existing[k]) {
      patch[k] = incoming[k];
    }
  };
  ['first_name', 'last_name', 'email', 'title', 'company', 'company_url',
    'location', 'linkedin_url', 'phone'].forEach(fillIfChanged);

  if (!existing.bio && incoming.bio) patch.bio = incoming.bio;
  if (!existing.linkedin_connected_at && incoming.linkedin_connected_at) {
    patch.linkedin_connected_at = incoming.linkedin_connected_at;
  }
  // sources — accumulate unique
  const merged = Array.from(new Set([...(existing.sources || []), ...(incoming.sources || [])]));
  if (merged.length !== (existing.sources || []).length) patch.sources = merged;

  return patch;
}
