import { useState, useEffect, useMemo } from 'react';
import T from '../theme/tokens.js';
import { getCapabilities } from '../lib/capabilities.js';

// Capabilities Deck — customer-facing deliverable built from the
// picked case studies in a contact's prep brief.
//
// Cover puts the COMPANY in massive type ("Prepared for Lonely
// Planet") because the deck is built for the prospect's
// organization, not just one individual. The contact's name lives
// in the page footer on every spread so the personalization stays
// visible without dominating.
//
// /about copy is lifted verbatim from earlyspring.nyc/about — three
// modules (Why / What / Who) — so the deck reads in the same voice
// as the website. Case study spreads expand each picked study with
// hero image + ask/insight/solution/result and link back to the
// full case study on earlyspring.nyc.
//
// Saving as PDF: browser print → "Save as PDF" produces a clean
// multi-page document with proper page breaks. The interactive
// shareable URL piece comes next.

const fmtMonthYear = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function CapabilitiesDeck({ contact, pickedSlugs, onClose }) {
  const [capabilities, setCapabilities] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCapabilities()
      .then(d => { if (!cancelled) setCapabilities(d); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickedStudies = useMemo(() => {
    if (!capabilities) return [];
    const set = new Set(pickedSlugs || []);
    return (capabilities.content || []).filter(p => p.kind === 'case-study' && set.has(p.slug));
  }, [capabilities, pickedSlugs]);

  if (!contact) return null;

  const about = capabilities?.about;
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
  const today = new Date();
  // Recipient line that lives in the footer of every page.
  const footerLine = `Prepared for ${fullName || contact.email || 'you'}${contact.company ? ` · ${contact.company}` : ''} · ${fmtMonthYear(today)}`;
  // The huge cover headline is the company. Fall back to the
  // contact name only if no company is on file.
  const coverTarget = contact.company || fullName || '—';

  return (
    <div className="caps-deck-root" style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: T.paper, color: T.ink, fontFamily: T.sans,
      overflow: 'auto',
    }}>
      <style>{`
        @media print {
          .caps-deck-chrome { display: none !important; }
          .caps-deck-root { position: static !important; overflow: visible !important; }
          .caps-deck-page { page-break-after: always; min-height: auto !important; }
          .caps-deck-page:last-child { page-break-after: auto; }
        }
      `}</style>

      {/* Chrome */}
      <div className="caps-deck-chrome" style={{
        position: 'sticky', top: 0, zIndex: 2,
        background: T.paper, borderBottom: `1px solid ${T.faintRule}`,
        padding: '14px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.20em', textTransform: 'uppercase' }}>
          Capabilities · Early Spring
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => window.print()} style={chromeBtn}>↓ Save as PDF</button>
          <button type="button" onClick={onClose} style={chromeBtn}>Close</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 48, color: T.alert }}>Could not load deck content: {error}</div>
      )}
      {!error && !capabilities && (
        <div style={{ padding: 48, color: T.fadedInk, fontStyle: 'italic' }}>Loading…</div>
      )}

      {capabilities && about && (
        <>
          {/* ─── Cover ─────────────────────────────────────── */}
          <Page footerLine={footerLine} pageNum={null}>
            <div style={{ marginTop: 8 }}>
              <div style={kickerStyle}>Engineering Serendipity</div>
              <div style={{ marginTop: 4, fontSize: 12, color: T.fadedInk, letterSpacing: '.04em' }}>
                A research and strategy led experiential studio — Brooklyn, since 2019.
              </div>
            </div>

            <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '.24em', textTransform: 'uppercase', marginBottom: 28 }}>
                Prepared for
              </div>
              <h1 style={{
                margin: 0,
                fontSize: 'clamp(96px, 14vw, 200px)', fontWeight: 800, color: T.ink,
                letterSpacing: '-0.045em', lineHeight: .88, wordBreak: 'break-word',
              }}>
                {coverTarget}
              </h1>
              {fullName && contact.company && (
                <div style={{ marginTop: 28, fontSize: 22, color: T.ink70, letterSpacing: '-0.012em' }}>
                  for the consideration of <b style={{ color: T.ink }}>{fullName}</b>{contact.title ? `, ${contact.title}` : ''}
                </div>
              )}
              <div style={{ marginTop: 36, height: 2, background: T.ink, width: 120 }}/>
              <div style={{ marginTop: 18, fontSize: 14, color: T.fadedInk, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {fmtMonthYear(today)} · Early Spring NYC
              </div>
            </div>
          </Page>

          {/* ─── About modules — one spread, three blocks ─── */}
          <Page footerLine={footerLine} pageNum="01">
            <div style={kickerStyle}>{about.hero?.kicker || '02 / About'}</div>
            <h2 style={pageHeadlineStyle}>{about.hero?.title || 'Engineering Serendipity since 2019.'}</h2>

            <div style={{ marginTop: 80, display: 'grid', gap: 56 }}>
              {(about.modules || []).map((m, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '180px 1fr', gap: 48,
                  paddingTop: i === 0 ? 0 : 36,
                  borderTop: i === 0 ? 'none' : `1px solid ${T.faintRule}`,
                }}>
                  <div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: '.16em',
                      textTransform: 'uppercase',
                    }}>{m.num}</div>
                  </div>
                  <div>
                    <h3 style={{
                      margin: 0, fontSize: 36, fontWeight: 700, color: T.ink,
                      letterSpacing: '-0.022em', lineHeight: 1.05,
                    }}>{m.title}</h3>
                    <p style={{
                      margin: '20px 0 0', fontSize: 18, color: T.ink70,
                      lineHeight: 1.55, letterSpacing: '-0.005em',
                    }}>{m.copy}</p>
                    {m.pullQuote && (
                      <blockquote style={{
                        margin: '28px 0 0 0', paddingLeft: 22,
                        borderLeft: `3px solid ${T.ink}`,
                        fontStyle: 'italic', fontSize: 24, color: T.ink, lineHeight: 1.35,
                        letterSpacing: '-0.012em',
                      }}>
                        “{m.pullQuote}”
                      </blockquote>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Page>

          {/* ─── Capabilities — three columns ─────────────── */}
          <Page footerLine={footerLine} pageNum="02">
            <div style={kickerStyle}>{about.capabilities?.kicker || '02 / What We Do'}</div>
            <h2 style={pageHeadlineStyle}>{about.capabilities?.heading || 'End-to-end. Anywhere.'}</h2>

            <div style={{ marginTop: 80, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
              {(about.capabilities?.groups || []).map(g => (
                <div key={g.title}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '.10em',
                    textTransform: 'uppercase', paddingBottom: 14, borderBottom: `1.5px solid ${T.ink}`,
                  }}>{g.title}</div>
                  <ul style={{ margin: '20px 0 0', padding: 0, listStyle: 'none' }}>
                    {(g.items || []).map(it => (
                      <li key={it} style={{
                        fontSize: 17, color: T.ink70, padding: '8px 0',
                        lineHeight: 1.45, letterSpacing: '-0.005em',
                        borderBottom: `1px solid ${T.faintRule}`,
                      }}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Page>

          {/* ─── Clients marquee (quiet proof) ────────────── */}
          {about.clientsMarquee?.length > 0 && (
            <Page footerLine={footerLine} pageNum="03">
              <div style={kickerStyle}>Selected clients</div>
              <h2 style={pageHeadlineStyle}>Brands we've worked with.</h2>
              <div style={{
                marginTop: 64, display: 'flex', flexWrap: 'wrap', gap: '12px 28px',
                fontSize: 24, color: T.ink, letterSpacing: '-0.015em', lineHeight: 1.4,
              }}>
                {about.clientsMarquee.map((c, i) => (
                  <span key={c} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 28 }}>
                    {c}
                    {i < about.clientsMarquee.length - 1 && (
                      <span style={{ color: T.faintRule, fontSize: 24 }}>·</span>
                    )}
                  </span>
                ))}
              </div>
            </Page>
          )}

          {/* ─── Picked case studies ─────────────────────── */}
          {pickedStudies.length === 0 && (
            <Page footerLine={footerLine}>
              <div style={{ margin: 'auto 0', fontSize: 16, color: T.fadedInk, fontStyle: 'italic', textAlign: 'center' }}>
                No case studies were picked. Go back to the brief and select a few.
              </div>
            </Page>
          )}

          {pickedStudies.map((s, i) => (
            <Page key={s.slug} footerLine={footerLine} pageNum={String(i + 4).padStart(2, '0')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={kickerStyle}>Case study · {String(i + 1).padStart(2, '0')} / {String(pickedStudies.length).padStart(2, '0')}</div>
                <div style={{ fontSize: 11, color: T.fadedInk, letterSpacing: '.16em', textTransform: 'uppercase' }}>
                  {s.category || s.client}
                </div>
              </div>
              <h2 style={{ ...pageHeadlineStyle, fontSize: 'clamp(48px, 6.5vw, 88px)' }}>{s.headline || s.title}</h2>
              {s.subtitle && (
                <div style={{
                  marginTop: 18, fontSize: 22, color: T.ink70,
                  letterSpacing: '-0.012em', lineHeight: 1.35,
                }}>
                  {s.subtitle}
                </div>
              )}

              {s.image && (
                <div style={{
                  marginTop: 48, width: '100%', aspectRatio: '16 / 9',
                  background: `url(${s.image}) center / cover no-repeat`,
                  borderRadius: 6, border: `1px solid ${T.faintRule}`,
                }}/>
              )}

              <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '40px 48px' }}>
                {s.ask && <CaseStudyBlock label="The Ask" body={s.ask}/>}
                {s.insight && <CaseStudyBlock label="The Insight" body={s.insight}/>}
                {s.solution && <CaseStudyBlock label="The Solution" body={s.solution}/>}
                {s.result && <CaseStudyBlock label="The Result" body={s.result}/>}
              </div>

              {s.pullQuote && (
                <blockquote style={{
                  marginTop: 48, padding: '28px 0',
                  borderTop: `1px solid ${T.faintRule}`, borderBottom: `1px solid ${T.faintRule}`,
                  fontStyle: 'italic', fontSize: 26, color: T.ink, lineHeight: 1.35,
                  letterSpacing: '-0.015em',
                }}>
                  “{s.pullQuote}”
                </blockquote>
              )}

              {s.liveUrl && (
                <div style={{ marginTop: 36, fontSize: 13, color: T.fadedInk, letterSpacing: '.04em' }}>
                  Full case study at <a href={s.liveUrl} target="_blank" rel="noopener" style={{ color: T.ink, textDecorationColor: T.ink25 }}>
                    {s.liveUrl.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
            </Page>
          ))}

          {/* ─── Closing ────────────────────────────────────── */}
          <Page footerLine={footerLine}>
            <div style={{ marginTop: 8 }}>
              <div style={kickerStyle}>Let's talk</div>
            </div>
            <div style={{ margin: 'auto 0' }}>
              <h2 style={{ ...pageHeadlineStyle, fontSize: 'clamp(56px, 9vw, 128px)', marginTop: 0 }}>
                Ready to engineer<br/>some serendipity?
              </h2>
              <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 56, fontSize: 16, color: T.ink70, lineHeight: 1.6 }}>
                <div>
                  <div style={smallLabelStyle}>Studio</div>
                  <div style={{ marginTop: 14, color: T.ink70 }}>
                    {about.organization?.address?.street}<br/>
                    {about.organization?.address?.city}, {about.organization?.address?.state} {about.organization?.address?.zip}
                  </div>
                </div>
                <div>
                  <div style={smallLabelStyle}>Contact</div>
                  <div style={{ marginTop: 14 }}>
                    <a href={`mailto:${about.organization?.email}`} style={{ color: T.ink, textDecoration: 'none' }}>
                      {about.organization?.email}
                    </a><br/>
                    {about.organization?.phone}
                  </div>
                </div>
                <div>
                  <div style={smallLabelStyle}>Online</div>
                  <div style={{ marginTop: 14, color: T.ink70 }}>
                    earlyspring.nyc<br/>
                    @earlyspringnyc
                  </div>
                </div>
              </div>
            </div>
          </Page>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function Page({ children, footerLine, pageNum }) {
  return (
    <section className="caps-deck-page" style={{
      minHeight: '100vh', boxSizing: 'border-box',
      padding: '88px 96px 72px',
      display: 'flex', flexDirection: 'column',
      borderBottom: `1px solid ${T.faintRule}`,
      position: 'relative',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {/* Per-page footer — recipient acknowledgment lives here. */}
      <div style={{
        marginTop: 48, paddingTop: 18, borderTop: `1px solid ${T.faintRule}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 11, color: T.fadedInk, letterSpacing: '.04em',
      }}>
        <span>{footerLine}</span>
        {pageNum && (
          <span style={{ letterSpacing: '.12em' }}>{pageNum}</span>
        )}
      </div>
    </section>
  );
}

function CaseStudyBlock({ label, body }) {
  return (
    <div>
      <div style={smallLabelStyle}>{label}</div>
      <p style={{
        margin: '14px 0 0', fontSize: 17, color: T.ink70,
        lineHeight: 1.55, letterSpacing: '-0.003em',
      }}>{body}</p>
    </div>
  );
}

// ─── Shared style fragments ──────────────────────────────────

const kickerStyle = {
  fontSize: 12, fontWeight: 700, color: T.ink,
  letterSpacing: '.24em', textTransform: 'uppercase',
};

const smallLabelStyle = {
  fontSize: 11, fontWeight: 700, color: T.ink,
  letterSpacing: '.18em', textTransform: 'uppercase',
  paddingBottom: 10, borderBottom: `1.5px solid ${T.ink}`,
};

const pageHeadlineStyle = {
  margin: 0, marginTop: 18,
  fontSize: 'clamp(56px, 8vw, 104px)', fontWeight: 800, color: T.ink,
  letterSpacing: '-0.03em', lineHeight: .95,
};

const chromeBtn = {
  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70,
  cursor: 'pointer',
};

export default CapabilitiesDeck;
