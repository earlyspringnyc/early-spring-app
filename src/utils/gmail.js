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

// Decode a base64url-encoded MIME part as UTF-8 text. Gmail uses
// base64url (no padding, - and _ instead of + and /).
function decodeB64Url(data) {
  if (!data) return '';
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) { return ''; }
}

// Walk the MIME payload tree and return the first matching mimeType
// body it finds. Gmail nests multipart/alternative inside
// multipart/mixed etc., so this has to recurse.
function findPart(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload;
  for (const p of payload.parts || []) {
    const hit = findPart(p, mimeType);
    if (hit) return hit;
  }
  return null;
}

// Crude HTML→text: drop scripts/styles, replace block tags with
// newlines, strip remaining tags, collapse whitespace. Good enough
// for feeding email bodies to an LLM.
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|li|tr|h\d|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// Fetch a full Gmail message body. Prefers text/plain, falls back to
// stripped text/html. Caller passes a `maxChars` cap so a huge thread
// doesn't blow the LLM context window.
export async function getGmailMessageBody(accessToken, messageId, { maxChars = 3000 } = {}) {
  if (!accessToken) throw new Error('Not signed in to Google');
  if (!messageId) return '';
  const detail = await ffetch(`${GMAIL_API}/messages/${messageId}?format=full`, accessToken);
  const payload = detail.payload;
  // If the whole message is single-part text the data sits on payload.body.
  let text = '';
  if (payload?.mimeType === 'text/plain' && payload.body?.data) {
    text = decodeB64Url(payload.body.data);
  } else {
    const plain = findPart(payload, 'text/plain');
    if (plain) text = decodeB64Url(plain.body.data);
    if (!text) {
      const html = findPart(payload, 'text/html');
      if (html) text = htmlToText(decodeB64Url(html.body.data));
    }
  }
  text = text.replace(/\r\n/g, '\n').trim();
  if (text.length > maxChars) text = text.slice(0, maxChars) + `\n[…truncated, ${text.length - maxChars} more chars]`;
  return text;
}
