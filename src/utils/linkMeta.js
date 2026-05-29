// Best-effort link-name extraction for the "paste a link, we name
// it for you" UX in CreativeV and ExpV. Two strategies, tried in
// order:
//   1. Parse a slugged name from the URL itself (Figma, Canva,
//      Loom share URLs all embed the human-readable name in the
//      path).
//   2. For Google Drive / Docs / Sheets / Slides, fetch the file
//      name from the Drive REST API using the user's access token.
//
// Returns a name or null. Callers fall back to whatever default
// they want when this returns null.

const slugToTitle = (s) => {
  if (!s) return null;
  return decodeURIComponent(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// Pull doc/file id from any Google URL form we've seen in the wild.
export function extractGoogleId(url) {
  if (!url) return null;
  // /document/d/<id>, /spreadsheets/d/<id>, /presentation/d/<id>, /file/d/<id>
  const dPath = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (dPath) return dPath[1];
  // ?id=<id> on Drive open URLs
  const qid = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return qid ? qid[1] : null;
}

// Common URL-terminator words that look like slugs but aren't
// human-readable names. Picking these out of the path was the
// source of "Edit" / "View" / "Preview" auto-names.
const BAD_LAST_SEGMENTS = new Set([
  'edit', 'view', 'viewform', 'preview', 'share', 'watch', 'embed',
  'present', 'open', 'play', 'download', 'index', 'home', 'new', 'create',
  'd', 'file', 'design', 'proto', 'board', 'document', 'spreadsheet',
  'presentation', 'folders', 'folder',
]);

// Parse a readable name straight from the URL when the platform
// puts one there. No network call.
export function extractLinkNameFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);

    // Google URLs have no readable name in the path (just the doc
    // ID + an "edit"/"view"/"preview" terminator). Don't try to
    // parse a slug — rely on fetchGoogleDocName (Drive API) or
    // a label fallback in the caller.
    if (host.includes('google.com')) return null;

    // Figma: /file/<id>/<Slug> or /design/<id>/<Slug> or /proto/<id>/<Slug>
    if (host.endsWith('figma.com') && parts.length >= 3) {
      const idIdx = parts.findIndex((p) => ['file', 'design', 'proto', 'board'].includes(p));
      if (idIdx >= 0 && parts[idIdx + 2]) return slugToTitle(parts[idIdx + 2]);
    }
    // Canva: /design/<id>/<Slug>/view
    if (host.includes('canva.com') && parts.length >= 3) {
      const idIdx = parts.findIndex((p) => p === 'design');
      if (idIdx >= 0 && parts[idIdx + 2]) return slugToTitle(parts[idIdx + 2]);
    }
    // Notion: /<slug>-<id> at the path end
    if ((host.includes('notion.so') || host.includes('notion.site')) && parts.length) {
      const last = parts[parts.length - 1];
      const slug = last.replace(/-[a-f0-9]{8,}$/i, '');
      if (slug && !BAD_LAST_SEGMENTS.has(slug.toLowerCase())) return slugToTitle(slug);
    }
    // Generic fallback: last path segment if it's not a known
    // terminator word and looks human-readable (not a long opaque
    // ID).
    if (parts.length) {
      const lastRaw = parts[parts.length - 1].replace(/\.[a-z0-9]{2,5}$/i, '');
      const lower = lastRaw.toLowerCase();
      if (lastRaw && /[a-z]{3,}/i.test(lastRaw)
          && !/^[a-z0-9-]{20,}$/i.test(lastRaw)
          && !BAD_LAST_SEGMENTS.has(lower)
          && !/^[0-9]+$/.test(lastRaw)) {
        return slugToTitle(lastRaw);
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Hit the Drive REST API for the canonical file name. Requires a
// Google access token with drive.readonly (or broader) — Morgan's
// OAuth flow already requests that. Returns null on any failure
// (no token, 403, file not shared with the requester, etc.) so the
// caller can gracefully fall back.
export async function fetchGoogleDocName(url, accessToken) {
  if (!accessToken) return null;
  const id = extractGoogleId(url);
  if (!id) return null;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.name || null;
  } catch (e) { return null; }
}

// One-shot helper: prefers Drive API name, falls back to URL slug.
// Use this from any "paste a link" form to auto-fill the name.
export async function deriveLinkName(url, accessToken) {
  if (!url) return null;
  const u = url.toLowerCase();
  const isGoogle = u.includes('docs.google.com') || u.includes('drive.google.com');
  if (isGoogle) {
    const live = await fetchGoogleDocName(url, accessToken);
    if (live) return live;
  }
  return extractLinkNameFromUrl(url);
}
