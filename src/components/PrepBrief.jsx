import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { getCapabilities, clearCapabilitiesCache } from '../lib/capabilities.js';
import { updateContact } from '../lib/contacts.js';
import { listMeetingsForContact, effectiveClassification } from '../lib/meetings.js';
import { getSession } from '../lib/db.js';
import { listGmailThreadsForEmail } from '../utils/gmail.js';
import { getBriefForEvent, upsertBriefForEvent } from '../lib/prepBriefs.js';
import CapabilitiesDeck from './CapabilitiesDeck.jsx';

// Prep Brief — full-screen, print-ready briefing for an upcoming
// call with a specific contact. Editorial layout (paper canvas,
// sapphire accent, TWK Lausanne, hairline rules). Persists user
// selections + asks on contact.brief_data so the brief survives
// reloads and evolves with the relationship.
//
// Sections:
//   1. Who you're meeting (contact bio + photo + title/company)
//   2. Recent meetings (everything in Fireflies with this contact)
//   3. Case studies to reference (picker from /api/capabilities)
//   4. Your asks (free-form)
//
// Company news section is a placeholder for now — wired up by the
// Claude web-search route in a follow-up.

const SAVE_DEBOUNCE_MS = 800;

// Relative-date helper for the news-fetched-at label.
function formatRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function PrepBrief({ contact, onClose, accessToken, event, userId }) {
  // If the brief is anchored to a calendar event, load/save state
  // from the prep_briefs table (per-event). Otherwise fall back
  // to the contact-anchored brief_data jsonb (same picks bleed
  // across all meetings with this contact).
  const eventMode = !!event?.id;
  const initialBrief = eventMode ? {} : (contact?.brief_data || {});
  const [pickedStudies, setPickedStudies] = useState(
    () => new Set(initialBrief.pickedStudies || []),
  );
  const [asks, setAsks] = useState(initialBrief.asks || '');
  const [capabilities, setCapabilities] = useState(null);
  const [capError, setCapError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [priorMeetings, setPriorMeetings] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [showDeck, setShowDeck] = useState(false);
  const [gmailThreads, setGmailThreads] = useState(null);
  const [gmailError, setGmailError] = useState(null);
  // Cached company-news summary lives on contact.brief_data.news.
  // Loaded once from the contact, displayed; refresh button calls
  // /api/news (Claude + web search) to regenerate.
  const [news, setNews] = useState(() => initialBrief.news || null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);
  const saveTimerRef = useRef(null);
  const skipFirstSaveRef = useRef(true);

  // Hydrate event-anchored brief from prep_briefs on mount. If a
  // row exists for this event, repopulate picks/asks/news so the
  // brief picks up exactly where the user left off — even if they
  // close the modal and re-open it later.
  useEffect(() => {
    if (!eventMode) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await getBriefForEvent(event.id);
        if (cancelled || !row) return;
        setPickedStudies(new Set(row.picked_studies || []));
        setAsks(row.asks || '');
        setNews(row.news_cache && Object.keys(row.news_cache).length ? row.news_cache : null);
        // Skip the auto-save fire that would otherwise trigger on
        // these setStates — we just hydrated, not edited.
        skipFirstSaveRef.current = true;
      } catch (e) {
        console.warn('[prep-brief] event-anchored hydrate failed:', e.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [eventMode, event?.id]);

  // Fetch case studies + about content from earlyspring.nyc (via
  // Morgan's gated proxy). Module-cached so re-opens are instant.
  useEffect(() => {
    let cancelled = false;
    getCapabilities()
      .then(d => { if (!cancelled) setCapabilities(d); })
      .catch(e => {
        if (!cancelled) {
          console.error('[prep-brief] capabilities fetch failed:', e);
          setCapError(e.message || 'Could not load capabilities');
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Load this contact's meeting history. Used for "recent meetings"
  // so you can walk into the call with the prior thread loaded.
  useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await listMeetingsForContact(contact.id);
        if (!cancelled) setPriorMeetings(all || []);
      } catch (e) {
        console.error('[prep-brief] prior meetings load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [contact?.id]);

  // Load the most recent Gmail threads with this contact. Same
  // pattern as the contact drawer's Gmail tab; just embeds the
  // top 5 so you can see the latest exchange before the call.
  useEffect(() => {
    setGmailThreads(null); setGmailError(null);
    if (!accessToken || !contact?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listGmailThreadsForEmail(accessToken, contact.email, { limit: 5 });
        if (!cancelled) setGmailThreads(rows || []);
      } catch (e) {
        if (!cancelled) {
          console.warn('[prep-brief] gmail load failed:', e.message || e);
          setGmailError(e.message || 'Gmail load failed');
          setGmailThreads([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, contact?.email]);

  // Debounced auto-save. Event mode → prep_briefs upsert keyed
  // by external_event_id. Contact mode → contact.brief_data jsonb.
  useEffect(() => {
    if (skipFirstSaveRef.current) { skipFirstSaveRef.current = false; return; }
    if (!contact?.id && !eventMode) return;
    setSaveStatus('saving');
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const patch = {
          pickedStudies: [...pickedStudies],
          asks,
          ...(news ? { news } : {}),
        };
        if (eventMode) {
          await upsertBriefForEvent(userId, event.id, {
            contact_id: contact?.id || null,
            title: event.title,
            start: event.start,
            end: event.end,
            attendees: event.attendees,
          }, patch);
        } else {
          const next = { ...(contact.brief_data || {}), ...patch };
          await updateContact(contact.id, { brief_data: next });
        }
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (e) {
        console.error('[prep-brief] save failed:', e);
        setSaveStatus('idle');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedStudies, asks]);

  const fetchNews = useCallback(async () => {
    const company = contact?.company || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim();
    if (!company) { setNewsError('No company on this contact yet.'); return; }
    setNewsLoading(true); setNewsError(null);
    try {
      const session = await getSession();
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ company }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `News fetch failed: ${res.status}`);
      setNews(data); // { text, sources, fetched_at, company }
    } catch (e) {
      setNewsError(e.message || 'News fetch failed');
    } finally { setNewsLoading(false); }
  }, [contact]);

  const togglePick = useCallback((slug) => {
    setPickedStudies(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }, []);

  const onRefreshContent = async () => {
    setRefreshing(true);
    clearCapabilitiesCache();
    try {
      const d = await getCapabilities({ force: true });
      setCapabilities(d);
      setCapError(null);
    } catch (e) {
      setCapError(e.message || 'Refresh failed');
    } finally { setRefreshing(false); }
  };

  const caseStudies = useMemo(
    () => (capabilities?.content || []).filter(p => p.kind === 'case-study'),
    [capabilities],
  );
  const pickedList = useMemo(
    () => caseStudies.filter(cs => pickedStudies.has(cs.slug)),
    [caseStudies, pickedStudies],
  );

  // Shareable URL — fetched from Morgan's /api/deck-link, which
  // signs the params with DECK_SIGNING_SECRET (server-side only)
  // and returns a URL pointing at earlyspring.nyc/api/deck. The
  // signature means the URL works for anyone who has it, but
  // can't be forged by guessing — randos can't mint deck links.
  const [shareableUrl, setShareableUrl] = useState(null);
  const [shareError, setShareError] = useState(null);
  useEffect(() => {
    setShareableUrl(null);
    setShareError(null);
    if (!contact || pickedList.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await getSession();
        const body = {
          company: contact.company || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          for: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || undefined,
          title: contact.title || undefined,
          studies: pickedList.map(cs => cs.slug).join(','),
        };
        const res = await fetch('/api/deck-link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Sign failed: ${res.status}`);
        if (!cancelled) setShareableUrl(data.url);
      } catch (e) {
        if (!cancelled) setShareError(e.message || 'Could not generate link');
      }
    })();
    return () => { cancelled = true; };
  }, [contact, pickedList]);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!contact) return null;

  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '(No name)';
  const initials = ((contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')).toUpperCase();

  return (
    <div className="prep-brief-root" style={{
      position: 'fixed', inset: 0, zIndex: 250,
      background: T.paper, color: T.ink, fontFamily: T.sans,
      overflow: 'auto',
    }}>
      <style>{`
        @media print {
          .prep-brief-chrome { display: none !important; }
          .prep-brief-root { position: static !important; overflow: visible !important; }
          .prep-brief-section { page-break-inside: avoid; }
        }
      `}</style>

      {/* Chrome — header bar with kicker, save state, actions */}
      <div className="prep-brief-chrome" style={{
        position: 'sticky', top: 0, zIndex: 2,
        background: T.paper, borderBottom: `1px solid ${T.faintRule}`,
        padding: '14px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.20em', textTransform: 'uppercase' }}>
          Prep Brief · Early Spring
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: T.fadedInk, minWidth: 64, textAlign: 'right' }}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}
          </span>
          <button type="button" onClick={onRefreshContent} disabled={refreshing} title="Re-pull case studies from earlyspring.nyc" style={chromeBtn(refreshing)}>
            {refreshing ? '…' : '↻ Refresh content'}
          </button>
          <button type="button" onClick={() => window.print()} style={chromeBtn(false)}>Print</button>
          {shareableUrl && (
            <a
              href={shareableUrl} target="_blank" rel="noopener"
              title="Open the customer-facing deck — same design as earlyspring.nyc, shareable URL, print to save as PDF"
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
                background: T.ink, color: T.paper, border: 'none', textDecoration: 'none',
                cursor: 'pointer', letterSpacing: '.04em',
              }}
            >✦ Open shareable deck · {pickedList.length} ↗</a>
          )}
          {!shareableUrl && (
            <span
              title="Pick at least one case study below to generate a deck"
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
                background: T.inkSoft2, color: T.fadedInk, cursor: 'not-allowed', letterSpacing: '.04em',
              }}
            >✦ Open shareable deck</span>
          )}
          <button type="button" onClick={onClose} style={chromeBtn(false)}>Close</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '64px 48px 96px' }}>
        {/* Masthead — the contact */}
        <div className="prep-brief-section" style={{ marginBottom: 56, display: 'flex', gap: 28, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            {contact.avatar_url ? (
              <img src={contact.avatar_url} alt="" style={{
                width: 96, height: 96, borderRadius: '50%', objectFit: 'cover',
                border: `1px solid ${T.faintRule}`,
              }}/>
            ) : (
              <div style={{
                width: 96, height: 96, borderRadius: '50%', background: T.inkSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 700, color: T.ink, border: `1px solid ${T.faintRule}`,
              }}>{initials || '?'}</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.fadedInk, letterSpacing: '.20em', textTransform: 'uppercase', marginBottom: 10 }}>
              Brief for
            </div>
            <h1 style={{
              margin: 0, fontSize: 44, fontWeight: 700, color: T.ink,
              letterSpacing: '-0.02em', lineHeight: 1.05, wordBreak: 'break-word',
            }}>
              {fullName}
            </h1>
            <div style={{ marginTop: 10, fontSize: 14, color: T.ink70 }}>
              {contact.title && <span>{contact.title}</span>}
              {contact.title && contact.company && <span> · </span>}
              {contact.company && <span>{contact.company}</span>}
            </div>
            {contact.email && (
              <div style={{ marginTop: 2, fontSize: 12, color: T.fadedInk }}>{contact.email}</div>
            )}
          </div>
        </div>

        {/* Section: Bio */}
        {contact.bio && (
          <Section label="Background">
            <p style={{ margin: 0, fontSize: 14, color: T.ink70, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {contact.bio.length > 800 ? contact.bio.slice(0, 800) + '…' : contact.bio}
            </p>
          </Section>
        )}

        {/* Section: Company news — Claude with web search */}
        {(contact.company || news) && (
          <Section label={`Company news${news?.fetched_at ? ` · ${formatRelative(news.fetched_at)}` : ''}`}>
            {news?.text ? (
              <>
                <p style={{ margin: 0, fontSize: 14, color: T.ink70, lineHeight: 1.65 }}>
                  {news.text}
                </p>
                {news.sources?.length > 0 && (
                  <div style={{ marginTop: 14, fontSize: 11, color: T.fadedInk }}>
                    Sources:{' '}
                    {news.sources.slice(0, 5).map((s, i) => (
                      <span key={s.url}>
                        {i > 0 && ' · '}
                        <a href={s.url} target="_blank" rel="noopener" style={{ color: T.ink70, textDecorationColor: T.faintRule }}>
                          {s.title || new URL(s.url).hostname}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button" onClick={fetchNews} disabled={newsLoading}
                    style={{
                      padding: '6px 12px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                      background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
                      cursor: newsLoading ? 'wait' : 'pointer', fontFamily: T.sans,
                    }}
                  >{newsLoading ? 'Refreshing…' : '↻ Refresh news'}</button>
                </div>
              </>
            ) : (
              <div>
                <p style={{ margin: 0, fontSize: 12, color: T.fadedInk, fontStyle: 'italic', lineHeight: 1.55 }}>
                  No news pulled yet. Claude will search the last ~60 days for {contact.company || 'this contact'} and summarize.
                </p>
                <button
                  type="button" onClick={fetchNews} disabled={newsLoading || !contact.company}
                  style={{
                    marginTop: 12, padding: '8px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: T.ink, color: T.paper, border: 'none', cursor: contact.company && !newsLoading ? 'pointer' : 'not-allowed',
                    opacity: contact.company && !newsLoading ? 1 : 0.5,
                    fontFamily: T.sans, letterSpacing: '.04em',
                  }}
                  title={!contact.company ? 'Add a company first' : 'Fetch recent news via Claude'}
                >{newsLoading ? 'Searching the web…' : '✦ Fetch company news'}</button>
              </div>
            )}
            {newsError && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 11, lineHeight: 1.5 }}>
                {newsError}
              </div>
            )}
          </Section>
        )}

        {/* Section: Recent meetings */}
        <Section label={`Recent meetings${priorMeetings.length ? ` · ${priorMeetings.length}` : ''}`}>
          {priorMeetings.length === 0 ? (
            <Empty>No Fireflies recordings linked to this contact yet. They'll show up here once a call has been transcribed.</Empty>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {priorMeetings.slice(0, 5).map(m => {
                const cls = effectiveClassification(m);
                return (
                  <li key={m.id} style={{
                    padding: '10px 0', borderBottom: `1px solid ${T.faintRule}`,
                    fontSize: 13, color: T.ink70, lineHeight: 1.5,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 600, color: T.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.title || 'Untitled meeting'}
                      </div>
                      <div style={{ fontSize: 11, color: T.fadedInk, whiteSpace: 'nowrap' }}>
                        {m.occurred_at ? new Date(m.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        {m.duration_minutes ? ` · ${m.duration_minutes}m` : ''}
                        {cls && ` · ${cls}`}
                      </div>
                    </div>
                    {m.summary && (
                      <div style={{ marginTop: 6, fontSize: 12, color: T.fadedInk, lineHeight: 1.55, maxHeight: 56, overflow: 'hidden' }}>
                        {m.summary.split('\n').slice(0, 2).join(' · ').slice(0, 240)}
                      </div>
                    )}
                  </li>
                );
              })}
              {priorMeetings.length > 5 && (
                <li style={{ paddingTop: 10, fontSize: 11, color: T.fadedInk, fontStyle: 'italic' }}>
                  + {priorMeetings.length - 5} more in the Meetings library
                </li>
              )}
            </ul>
          )}
        </Section>

        {/* Section: Recent emails — only when Gmail token + email present */}
        {accessToken && contact.email && (
          <Section label={`Recent emails${Array.isArray(gmailThreads) && gmailThreads.length ? ` · top ${gmailThreads.length}` : ''}`}>
            {gmailThreads === null && <Empty>Loading from Gmail…</Empty>}
            {gmailError && <Empty>Couldn't load Gmail: {gmailError}. Sign out + back in to re-grant the read scope.</Empty>}
            {gmailThreads && gmailThreads.length === 0 && !gmailError && (
              <Empty>No Gmail threads with {contact.email} yet.</Empty>
            )}
            {gmailThreads && gmailThreads.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {gmailThreads.map(t => (
                  <li key={t.id} style={{
                    padding: '10px 0', borderBottom: `1px solid ${T.faintRule}`,
                    fontSize: 13, color: T.ink70, lineHeight: 1.5,
                  }}>
                    <a
                      href={`https://mail.google.com/mail/u/0/#all/${t.threadId}`}
                      target="_blank" rel="noopener"
                      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 600, color: T.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: t.direction === 'in' ? T.ink70 : T.fadedInk, flexShrink: 0 }}>
                            {t.direction === 'in' ? '↙' : '↗'}
                          </span>
                          {t.subject || '(no subject)'}
                        </div>
                        <div style={{ fontSize: 11, color: T.fadedInk, whiteSpace: 'nowrap' }}>
                          {t.date ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                        </div>
                      </div>
                      {t.snippet && (
                        <div style={{ marginTop: 4, fontSize: 12, color: T.fadedInk, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.snippet}
                        </div>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* Section: Case studies */}
        <Section label={`Case studies to reference · ${pickedList.length} picked`}>
          {capError && (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 12, lineHeight: 1.55 }}>
              Couldn't load content: {capError}. Try the "↻ Refresh content" button.
            </div>
          )}
          {!capError && !capabilities && <Empty>Loading case studies from earlyspring.nyc…</Empty>}
          {capabilities && caseStudies.length === 0 && <Empty>No case studies returned from the endpoint.</Empty>}
          {caseStudies.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {caseStudies.map(cs => (
                <CaseStudyCard
                  key={cs.slug}
                  study={cs}
                  picked={pickedStudies.has(cs.slug)}
                  onToggle={() => togglePick(cs.slug)}
                />
              ))}
            </div>
          )}
          {pickedList.length > 0 && (
            <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 8, background: T.inkSoft, border: `1px solid ${T.faintRule}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.ink, letterSpacing: '.16em', textTransform: 'uppercase' }}>
                  ✓ Picked for this call · {pickedList.length}
                </div>
                {shareableUrl && (
                  <a
                    href={shareableUrl} target="_blank" rel="noopener"
                    style={{
                      padding: '6px 14px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: T.sans,
                      background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: '.08em', textDecoration: 'none',
                    }}
                  >✦ Open shareable deck ↗</a>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                {pickedList.map(cs => (
                  <div key={cs.slug} style={{ fontSize: 12, color: T.ink70, padding: '3px 0' }}>
                    · <b style={{ color: T.ink }}>{cs.title}</b> — {cs.subtitle}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: T.fadedInk, fontStyle: 'italic' }}>
                A shareable URL using the live earlyspring.nyc design — about modules and the actual case study pages. Send the link directly; recipient can print to PDF.
              </div>
            </div>
          )}
        </Section>

        {/* Section: Asks */}
        <Section label="Your asks · what you want from this call">
          <textarea
            value={asks}
            onChange={e => setAsks(e.target.value)}
            placeholder={'Three things you want from this conversation. Be specific. e.g.,\n1. Understand their Q3 timing\n2. Get an intro to their head of brand\n3. Surface the budget range'}
            style={{
              width: '100%', minHeight: 160, padding: '14px 16px',
              border: `1px solid ${T.faintRule}`, borderRadius: 8, background: T.inkSoft2,
              fontSize: 14, fontFamily: T.sans, color: T.ink, outline: 'none', resize: 'vertical',
              lineHeight: 1.55,
            }}
          />
        </Section>

        <div style={{ marginTop: 64, paddingTop: 24, borderTop: `1px solid ${T.faintRule}`, fontSize: 10, color: T.fadedInk, fontStyle: 'italic' }}>
          Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Early Spring
        </div>
      </div>

      {showDeck && (
        <CapabilitiesDeck
          contact={contact}
          pickedSlugs={[...pickedStudies]}
          onClose={() => setShowDeck(false)}
        />
      )}
    </div>
  );
}

// ─── Reusable bits ────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <section className="prep-brief-section" style={{ marginBottom: 48 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: T.ink, letterSpacing: '.20em',
        textTransform: 'uppercase', marginBottom: 18,
        paddingBottom: 10, borderBottom: `1px solid ${T.faintRule}`,
      }}>
        {label}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      padding: '18px 0', fontSize: 12, fontStyle: 'italic',
      color: T.fadedInk, lineHeight: 1.55,
    }}>{children}</div>
  );
}

function CaseStudyCard({ study, picked, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        textAlign: 'left', cursor: 'pointer',
        padding: 16, borderRadius: 10,
        border: `1px solid ${picked ? T.ink : T.faintRule}`,
        background: picked ? T.inkSoft : T.paper,
        fontFamily: T.sans, color: T.ink,
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'border-color .15s, background .15s, box-shadow .15s',
        boxShadow: picked ? `inset 0 0 0 1px ${T.ink}` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.16em', textTransform: 'uppercase' }}>
          {study.category || study.client}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color: picked ? T.ink : T.fadedInk,
        }}>{picked ? '✓ Picked' : '+ Add'}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, lineHeight: 1.25, letterSpacing: '-0.005em' }}>
        {study.title}
      </div>
      <div style={{ fontSize: 12, color: T.ink70, lineHeight: 1.5 }}>
        {study.subtitle}
      </div>
    </button>
  );
}

function chromeBtn(disabled) {
  return {
    padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
    background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
    cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .5 : 1,
  };
}

export default PrepBrief;
