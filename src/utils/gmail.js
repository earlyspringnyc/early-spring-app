// Gmail thread lookup for a contact. Metadata-only (subject, date,
// from, to, snippet) — we never store bodies, just surface them in
// the contact's Communications tab on demand.
//
// Uses the user's Google OAuth access token (gmail.readonly scope
// — re-authorize after first deploy of this file). Falls back
// gracefully if the scope hasn't been granted.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function ffetch(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Header lookup helper — Gmail returns headers as { name, value } objects
function getHeader(headers, name) {
  const h = (headers || []).find(x => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || null;
}

// Parse "Name <email>" → { name, email }
function parseAddress(raw) {
  if (!raw) return { name: null, email: null };
  const m = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || null, email: m[2].toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}

// List threads to/from a given email. Returns up to `limit` recent
// threads with subject, date, snippet, and direction (in/out based
// on whether their address is in To/From).
export async function listGmailThreadsForEmail(accessToken, email, { limit = 20 } = {}) {
  if (!accessToken) throw new Error('Not signed in to Google');
  if (!email) return [];

  // Search query — both directions; Gmail handles dedup by thread
  const q = `from:${email} OR to:${email}`;
  const listUrl = `${GMAIL_API}/messages?q=${encodeURIComponent(q)}&maxResults=${limit}`;
  const list = await ffetch(listUrl, accessToken);
  const msgs = list.messages || [];
  if (!msgs.length) return [];

  // Fetch metadata for each message (subject, from, to, date, snippet)
  const results = await Promise.all(msgs.map(async m => {
    try {
      const detail = await ffetch(
        `${GMAIL_API}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        accessToken
      );
      const headers = detail.payload?.headers || [];
      const subject = getHeader(headers, 'Subject') || '(no subject)';
      const from = parseAddress(getHeader(headers, 'From'));
      const to = parseAddress(getHeader(headers, 'To'));
      const date = getHeader(headers, 'Date');
      const direction = (from.email === email.toLowerCase()) ? 'in' : 'out';
      return {
        id: m.id,
        threadId: m.threadId,
        subject,
        from, to, direction,
        date: date ? new Date(date).toISOString() : null,
        snippet: detail.snippet || '',
      };
    } catch (e) {
      return null;
    }
  }));

  return results.filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
}
