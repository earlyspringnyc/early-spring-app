import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { updateContact } from '../lib/contacts.js';
import { getCapabilities } from '../lib/capabilities.js';
import { getSession } from '../lib/db.js';

// Concept menu — the pre-budget deliverable. You walk out of a
// cap call where the prospect said "send some ideas" without a
// budget number, and you reply with three concept tiers at three
// fee bands. The recipient anchors on what feels right; that
// becomes the foundation of the formal scope.
//
// Lives on contact.concept_menu. Shareable URL is signed and
// served from earlyspring.nyc/api/concept-menu so it looks like
// part of the site.

const SAVE_DEBOUNCE_MS = 800;

const DEFAULT_TIERS = () => ([
  { label: 'Lean',      title: '', concept: '', feeMin: '', feeMax: '', referenceSlug: '' },
  { label: 'Mid',       title: '', concept: '', feeMin: '', feeMax: '', referenceSlug: '' },
  { label: 'Ambitious', title: '', concept: '', feeMin: '', feeMax: '', referenceSlug: '' },
]);

function ConceptMenuBuilder({ contact, onClose }) {
  const initial = contact?.concept_menu || {};
  const [intro, setIntro] = useState(initial.intro || '');
  const [tiers, setTiers] = useState(() => {
    if (Array.isArray(initial.tiers) && initial.tiers.length === 3) return initial.tiers;
    return DEFAULT_TIERS();
  });
  const [capabilities, setCapabilities] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [shareUrl, setShareUrl] = useState(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const saveTimerRef = useRef(null);
  const skipFirstSaveRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    getCapabilities()
      .then(d => { if (!cancelled) setCapabilities(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced auto-save
  useEffect(() => {
    if (skipFirstSaveRef.current) { skipFirstSaveRef.current = false; return; }
    if (!contact?.id) return;
    setSaveStatus('saving');
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateContact(contact.id, {
          concept_menu: { intro, tiers, updated_at: new Date().toISOString() },
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (e) {
        console.error('[concept-menu] save failed:', e);
        setSaveStatus('idle');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimerRef.current);
  }, [intro, tiers, contact?.id]);

  const caseStudies = useMemo(
    () => (capabilities?.content || []).filter(p => p.kind === 'case-study'),
    [capabilities],
  );

  const updateTier = (i, patch) => {
    setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  };

  // Build a payload, sign on the server, get a shareable URL back.
  const buildLink = useCallback(async () => {
    if (!contact) return;
    setLinking(true); setLinkError(null);
    try {
      const session = await getSession();
      const company = contact.company || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      const forName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || undefined;
      const body = {
        company,
        for: forName,
        title: contact.title || undefined,
        intro,
        tiers,
      };
      const res = await fetch('/api/concept-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Sign failed: ${res.status}`);
      setShareUrl(data.url);
    } catch (e) {
      setLinkError(e.message || 'Could not generate link');
    } finally { setLinking(false); }
  }, [contact, intro, tiers]);

  if (!contact) return null;
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email;

  return (
    <div className="concept-menu-root" style={{
      position: 'fixed', inset: 0, zIndex: 260,
      background: T.paper, color: T.ink, fontFamily: T.sans,
      overflow: 'auto',
    }}>
      {/* Chrome */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2,
        background: T.paper, borderBottom: `1px solid ${T.faintRule}`,
        padding: '14px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.20em', textTransform: 'uppercase' }}>
          Concept Menu · {fullName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: T.fadedInk, minWidth: 64, textAlign: 'right' }}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}
          </span>
          {shareUrl ? (
            <a href={shareUrl} target="_blank" rel="noopener" style={primaryBtn}>↗ Open shareable menu</a>
          ) : (
            <button type="button" onClick={buildLink} disabled={linking} style={primaryBtn}>
              {linking ? 'Generating…' : '✦ Generate shareable link'}
            </button>
          )}
          <button type="button" onClick={onClose} style={chromeBtn}>Close</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 48px 96px' }}>
        {/* Masthead */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.fadedInk, letterSpacing: '.20em', textTransform: 'uppercase', marginBottom: 12 }}>
            Concept menu for
          </div>
          <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, color: T.ink, letterSpacing: '-0.025em', lineHeight: 1.0 }}>
            {contact.company || fullName}
          </h1>
          <div style={{ marginTop: 12, fontSize: 13, color: T.ink70 }}>
            Three concepts at three scales — pick the one that feels right and we'll build from there.
          </div>
        </div>

        {/* Intro */}
        <div style={{ marginBottom: 36 }}>
          <div style={smallLabel}>Intro paragraph · optional</div>
          <textarea
            value={intro}
            onChange={e => setIntro(e.target.value)}
            placeholder="Frame the brief. e.g. 'We loved the conversation about Lonely Planet's pilot tour. Here are three angles, each calibrated to a different ambition.'"
            style={{ ...input, minHeight: 80, marginTop: 8, resize: 'vertical', lineHeight: 1.55 }}
          />
        </div>

        {/* Three tier cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {tiers.map((t, i) => (
            <TierCard
              key={i}
              tier={t}
              onChange={patch => updateTier(i, patch)}
              caseStudies={caseStudies}
            />
          ))}
        </div>

        {linkError && (
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: T.alertSoft, border: `1px solid ${T.alert}33`, color: T.alert, fontSize: 12, lineHeight: 1.5 }}>
            {linkError}
          </div>
        )}

        {shareUrl && (
          <div style={{ marginTop: 24, padding: '14px 16px', borderRadius: 8, background: T.inkSoft, border: `1px solid ${T.faintRule}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.ink, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8 }}>
              ✓ Shareable link ready
            </div>
            <div style={{ fontSize: 11, color: T.ink70, wordBreak: 'break-all', lineHeight: 1.5 }}>
              {shareUrl}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <a href={shareUrl} target="_blank" rel="noopener" style={{ ...linkBtn, color: T.paper, background: T.ink, borderColor: T.ink }}>
                Open ↗
              </a>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(shareUrl).then(() => setSaveStatus('saved'))}
                style={linkBtn}
              >Copy link</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TierCard({ tier, onChange, caseStudies }) {
  return (
    <div style={{
      background: T.paper, borderRadius: 12, padding: 18,
      border: `1px solid ${T.faintRule}`,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <input
        value={tier.label}
        onChange={e => onChange({ label: e.target.value })}
        style={{ ...input, fontSize: 10, fontWeight: 700, color: T.ink, letterSpacing: '.16em', textTransform: 'uppercase', padding: '4px 8px', border: `1px solid ${T.faintRule}` }}
        placeholder="Tier label"
      />
      <input
        value={tier.title}
        onChange={e => onChange({ title: e.target.value })}
        placeholder="Concept title · e.g., The Cocktail Hour"
        style={{ ...input, fontSize: 18, fontWeight: 700, padding: '8px 10px', letterSpacing: '-0.012em' }}
      />
      <textarea
        value={tier.concept}
        onChange={e => onChange({ concept: e.target.value })}
        placeholder="One or two sentences. What is this version of the project?"
        style={{ ...input, minHeight: 110, resize: 'vertical', lineHeight: 1.55, fontSize: 13 }}
      />
      <div>
        <div style={smallLabel}>Fee range · USD</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <input
            type="number" min="0" step="1000"
            value={tier.feeMin}
            onChange={e => onChange({ feeMin: e.target.value })}
            placeholder="Min"
            style={input}
          />
          <span style={{ color: T.fadedInk, fontSize: 12 }}>—</span>
          <input
            type="number" min="0" step="1000"
            value={tier.feeMax}
            onChange={e => onChange({ feeMax: e.target.value })}
            placeholder="Max"
            style={input}
          />
        </div>
      </div>
      <div>
        <div style={smallLabel}>Reference past project · optional</div>
        <select
          value={tier.referenceSlug}
          onChange={e => onChange({ referenceSlug: e.target.value })}
          style={{ ...input, marginTop: 6, cursor: 'pointer' }}
        >
          <option value="">— none —</option>
          {caseStudies.map(cs => (
            <option key={cs.slug} value={cs.slug}>
              {cs.title} · {cs.subtitle}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const input = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: `1px solid ${T.faintRule}`, background: T.paper,
  fontSize: 13, fontFamily: T.sans, color: T.ink, outline: 'none',
};

const smallLabel = {
  fontSize: 9, fontWeight: 700, color: T.fadedInk,
  letterSpacing: '.12em', textTransform: 'uppercase',
};

const primaryBtn = {
  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: T.sans,
  background: T.ink, color: T.paper, border: 'none', cursor: 'pointer', letterSpacing: '.04em',
  textDecoration: 'none',
};

const chromeBtn = {
  padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', border: `1px solid ${T.faintRule}`, color: T.ink70, cursor: 'pointer',
};

const linkBtn = {
  padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
  textDecoration: 'none', cursor: 'pointer',
};

export default ConceptMenuBuilder;
