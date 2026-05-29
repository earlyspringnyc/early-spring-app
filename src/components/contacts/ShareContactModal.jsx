import { useState, useMemo, useRef, useEffect } from 'react';
import T from '../../theme/tokens.js';
import { getSession } from '../../lib/db.js';

// Modal that sends a contact's card snapshot via email. The recipient
// receives a self-contained HTML email with clickable email/phone/
// LinkedIn/website links — no public web page, no token, no auth.
//
// `suggestions` is the full CRM contacts list — used to autocomplete
// the recipient email field as the user types (excluding the contact
// being shared, since you wouldn't email someone their own card).
function ShareContactModal({ contact, defaultFromName, suggestions = [], onClose }) {
  const [to, setTo] = useState('');
  const [fromName, setFromName] = useState(defaultFromName || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'success' | 'error', text }
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const toInputRef = useRef(null);

  // De-dupe by email (case-insensitive) and exclude the contact being
  // shared. Pre-compute a haystack per row for fast filtering.
  const candidatePool = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of suggestions || []) {
      const email = (c.email || '').trim().toLowerCase();
      if (!email) continue;
      if (contact?.id && c.id === contact.id) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
      out.push({
        id: c.id,
        email,
        name: name || email,
        company: c.company || '',
        hay: `${name} ${email} ${c.company || ''}`.toLowerCase(),
      });
    }
    return out;
  }, [suggestions, contact?.id]);

  const matches = useMemo(() => {
    const q = to.trim().toLowerCase();
    if (!q) return [];
    // If the user typed an exact email that's already in the list,
    // hide the dropdown — nothing to suggest.
    if (candidatePool.some(c => c.email === q)) return [];
    return candidatePool.filter(c => c.hay.includes(q)).slice(0, 6);
  }, [to, candidatePool]);

  useEffect(() => { setActiveIdx(0); }, [to]);

  const pickSuggestion = (s) => {
    setTo(s.email);
    setSuggestionsOpen(false);
    setActiveIdx(0);
    toInputRef.current?.focus();
  };

  const fullName = `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || '(no name)';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const canSend = validEmail && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setStatus(null);
    try {
      const session = await getSession();
      const res = await fetch('/api/contact-share-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          to: to.trim(),
          fromName: fromName.trim() || null,
          message: message.trim() || null,
          // Send only the public-ish fields, not notes/internal IDs.
          contact: {
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
            title: contact.title,
            company: contact.company,
            company_url: contact.company_url,
            linkedin_url: contact.linkedin_url,
            location: contact.location,
            bio: contact.bio,
            tags: contact.tags,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Send failed (${res.status})`);
      setStatus({ kind: 'success', text: `Sent to ${to.trim()}.` });
      // Auto-close after a beat so the user sees confirmation
      setTimeout(() => onClose(), 1100);
    } catch (e) {
      setStatus({ kind: 'error', text: e.message || 'Could not send' });
    } finally {
      setSending(false);
    }
  };

  const inp = {
    width: '100%', padding: '9px 11px', borderRadius: 6,
    border: `1px solid ${T.faintRule}`, background: T.paper,
    fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none',
  };
  const labelStyle = { fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 5, display: 'block' };

  return (
    <div onClick={() => !sending && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 250,
      background: 'rgba(15,82,186,.18)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: '95vw',
        background: T.paper, borderRadius: 12, padding: 24,
        border: `1px solid ${T.faintRule}`, boxShadow: '0 24px 64px rgba(15,82,186,.18)',
        fontFamily: T.sans,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: '-0.01em' }}>
              Share contact
            </h2>
            <div style={{ fontSize: 12, color: T.fadedInk, marginTop: 4 }}>
              Sends an email with <b style={{ color: T.ink70 }}>{fullName}</b>'s details and clickable links.
            </div>
          </div>
          <button onClick={() => !sending && onClose()} disabled={sending} style={{
            background: 'transparent', border: 'none', fontSize: 18, color: T.fadedInk,
            cursor: sending ? 'wait' : 'pointer', width: 28, height: 28,
          }}>×</button>
        </div>

        <div style={{ marginTop: 18, position: 'relative' }}>
          <label style={labelStyle}>Recipient email</label>
          <input
            ref={toInputRef}
            type="email"
            value={to}
            onChange={e => { setTo(e.target.value); setSuggestionsOpen(true); }}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => { setTimeout(() => setSuggestionsOpen(false), 150); }}
            onKeyDown={e => {
              const showing = suggestionsOpen && matches.length > 0;
              if (showing && e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx(i => Math.min(i + 1, matches.length - 1));
              } else if (showing && e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx(i => Math.max(i - 1, 0));
              } else if (showing && e.key === 'Enter') {
                e.preventDefault();
                pickSuggestion(matches[activeIdx]);
              } else if (e.key === 'Enter' && canSend) {
                send();
              } else if (e.key === 'Escape' && showing) {
                e.preventDefault();
                setSuggestionsOpen(false);
              }
            }}
            placeholder="colleague@example.com"
            autoFocus
            autoComplete="off"
            style={inp}
          />
          {suggestionsOpen && matches.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: T.paper, border: `1px solid ${T.faintRule}`, borderRadius: 6,
              boxShadow: '0 12px 32px rgba(15,82,186,.12)',
              zIndex: 10, maxHeight: 220, overflowY: 'auto',
            }}>
              {matches.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickSuggestion(m); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 8,
                    width: '100%', padding: '8px 12px', textAlign: 'left',
                    background: i === activeIdx ? T.inkSoft : 'transparent',
                    border: 'none', cursor: 'pointer', fontFamily: T.sans,
                    borderBottom: i === matches.length - 1 ? 'none' : `1px solid ${T.faintRule}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, flexShrink: 0 }}>{m.name}</span>
                  <span style={{ fontSize: 11, color: T.fadedInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {m.email}{m.company ? ` · ${m.company}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Your name (appears in subject + body)</label>
          <input
            type="text"
            value={fromName}
            onChange={e => setFromName(e.target.value)}
            placeholder="Kamil"
            style={inp}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Optional message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Quick note for the recipient — context, why you're sharing, etc."
            maxLength={2000}
            style={{ ...inp, minHeight: 84, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {status && (
          <div style={{
            marginTop: 14, padding: '9px 12px', borderRadius: 6, fontSize: 12, lineHeight: 1.5,
            background: status.kind === 'success' ? T.inkSoft : T.alertSoft,
            border: `1px solid ${status.kind === 'success' ? T.faintRule : T.alert + '33'}`,
            color: status.kind === 'success' ? T.ink : T.alert,
          }}>
            {status.text}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={() => !sending && onClose()}
            disabled={sending}
            style={{
              padding: '8px 16px', borderRadius: 8, cursor: sending ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: T.sans,
              background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
              opacity: sending ? .5 : 1,
            }}
          >Cancel</button>
          <button
            onClick={send}
            disabled={!canSend}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              fontSize: 12, fontWeight: 700, fontFamily: T.sans,
              background: T.ink, color: T.paper,
              cursor: canSend ? 'pointer' : 'default',
              opacity: canSend ? 1 : .4,
            }}
          >{sending ? 'Sending…' : '✉ Send'}</button>
        </div>
      </div>
    </div>
  );
}

export default ShareContactModal;
