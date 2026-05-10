// Company deduplication. Computed at display time so new contacts
// added via any path (CSV import, RocketReach sync, RocketReach
// webhook, future manual entry) automatically join the right cluster
// without a DB migration or per-row rewrite.
//
// Layer 1 — Name normalization: lowercase, strip punctuation, drop
// common corporate suffixes (Inc, LLC, Ltd, USA, Cars, Group, etc.)
// so "Mattel, Inc." and "Mattel" collapse, and "Volvo Cars" /
// "Volvo Car USA" both reduce to "volvo".
//
// Layer 2 — Email domain: contacts sharing a non-personal email
// domain (@volvocars.com, @patagonia.com) are unioned into the same
// cluster regardless of how their company field is spelled. Personal
// domains (gmail / yahoo / hotmail / icloud / aol / me / live /
// proton / fastmail) are skipped so freelancers don't all fuse.

const SUFFIX_RE = /\b(inc|llc|ltd|co|corp|corporation|company|companies|group|holdings|partners|partnership|usa|uk|us|na|north\s+america|cars?|limited|gmbh|s\.?a\.?|ag|plc|pty)\b/gi;

// Values that aren't really a company — freelancers, self-employed,
// retired, "looking", etc. We still cluster them (so individual rows
// don't sprawl) but flag the cluster as independent so the UI can
// keep them out of the "top companies" priority view.
const INDEPENDENT_TERMS = new Set([
  'freelance', 'freelancer', 'self employed', 'self-employed',
  'independent', 'independent contractor', 'consultant', 'consulting',
  'retired', 'unemployed', 'looking', 'open to work', 'student',
  'n a', 'na', 'none', 'unknown',
]);

export function isIndependentCompany(canonical) {
  return INDEPENDENT_TERMS.has(normalizeCompany(canonical));
}
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'me.com', 'aol.com', 'live.com', 'protonmail.com', 'proton.me',
  'fastmail.com', 'mac.com', 'msn.com', 'comcast.net',
]);

export function normalizeCompany(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[.,&'’]/g, ' ')
    .replace(SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function emailDomain(email) {
  if (!email) return null;
  const m = String(email).toLowerCase().match(/@([\w.-]+)/);
  if (!m) return null;
  const d = m[1];
  if (PERSONAL_DOMAINS.has(d)) return null;
  return d;
}

// Group contacts into company clusters.
// Returns: [{ canonical, aliases[], contacts[], count, stages[], emailDomain, lastContactedAt }]
// Sorted by count descending, then last-contacted descending.
export function clusterByCompany(contacts) {
  if (!Array.isArray(contacts) || !contacts.length) return [];

  // Union-find by normalized name OR email domain. We use two passes:
  // first build buckets keyed by name; second pass merges buckets that
  // share an email domain.
  const byName = new Map();              // normName -> bucketId
  const byDomain = new Map();            // domain -> bucketId
  const buckets = new Map();             // bucketId -> { contactIds: Set }
  let nextId = 1;

  const ensureBucket = id => { if (!buckets.has(id)) buckets.set(id, { contactIds: new Set() }); return buckets.get(id); };
  const unionInto = (intoId, fromId) => {
    if (intoId === fromId) return;
    const into = ensureBucket(intoId);
    const from = ensureBucket(fromId);
    from.contactIds.forEach(cid => into.contactIds.add(cid));
    buckets.delete(fromId);
    // Re-point any maps that referenced fromId
    for (const [k, v] of byName) if (v === fromId) byName.set(k, intoId);
    for (const [k, v] of byDomain) if (v === fromId) byDomain.set(k, intoId);
  };

  for (const c of contacts) {
    const norm = normalizeCompany(c.company);
    const dom = emailDomain(c.email);
    // If neither key is available, treat as its own cluster (e.g.,
    // contacts with no company AND only a personal email)
    const nameKey = norm || `__nocompany_${c.id}`;

    let bucketId = byName.get(nameKey);
    if (!bucketId && dom && byDomain.has(dom)) bucketId = byDomain.get(dom);
    if (!bucketId) { bucketId = nextId++; }

    byName.set(nameKey, bucketId);
    if (dom) {
      const existing = byDomain.get(dom);
      if (existing && existing !== bucketId) {
        // Merge the two clusters that this contact bridges
        unionInto(bucketId, existing);
      }
      byDomain.set(dom, bucketId);
    }
    ensureBucket(bucketId).contactIds.add(c.id);
  }

  // Materialize clusters
  const out = [];
  for (const [, { contactIds }] of buckets) {
    const group = contacts.filter(c => contactIds.has(c.id));
    if (!group.length) continue;

    // Canonical name: most-common raw company, tie-break by longest
    const variants = [...new Set(group.map(c => c.company).filter(Boolean))];
    const counts = variants.map(v => ({ v, n: group.filter(c => c.company === v).length }));
    counts.sort((a, b) => b.n - a.n || b.v.length - a.v.length);
    const canonical = counts[0]?.v || '(No company)';
    const aliases = variants.filter(v => v !== canonical);

    const stages = [...new Set(group.map(c => c.status || 'prospect'))];
    const lastContactedAt = group
      .map(c => c.last_contacted_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

    out.push({
      canonical,
      aliases,
      contacts: group,
      count: group.length,
      stages,
      emailDomain: [...new Set(group.map(c => emailDomain(c.email)).filter(Boolean))][0] || null,
      lastContactedAt,
      isIndependent: isIndependentCompany(canonical),
    });
  }

  out.sort((a, b) => b.count - a.count || ((new Date(b.lastContactedAt || 0)) - (new Date(a.lastContactedAt || 0))));
  return out;
}
