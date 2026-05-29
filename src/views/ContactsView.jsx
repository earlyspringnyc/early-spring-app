import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { LogOutI } from '../components/icons/index.js';
import {
  listContacts, deleteContact,
  previewReenrich, applyReenrichPatch, syncRocketReachContacts,
  backfillAvatarsFromRocketReach,
} from '../lib/contacts.js';
import { clusterByCompany, normalizeCompany } from '../utils/companyDedup.js';
import ContactDetailDrawer from '../components/ContactDetailDrawer.jsx';
import PrepBrief from '../components/PrepBrief.jsx';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal.jsx';

// CRM sub-components — extracted from this view for legibility.
import { STATUS_OPTIONS } from '../components/contacts/primitives.jsx';
import CompanyCard from '../components/contacts/CompanyCard.jsx';
import CompanyDetail from '../components/contacts/CompanyDetail.jsx';
import ImportWizard from '../components/contacts/ImportWizard.jsx';
import NewContactModal from '../components/contacts/NewContactModal.jsx';
import RefreshPreviewModal from '../components/contacts/RefreshPreviewModal.jsx';
import RecentContactsStrip from '../components/contacts/RecentContactsStrip.jsx';
import StatsCards from '../components/contacts/StatsCards.jsx';
import ToolbarMenu from '../components/contacts/ToolbarMenu.jsx';
import CommandPalette from '../components/contacts/CommandPalette.jsx';

const btnSolid = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 700, fontFamily: T.sans,
  background: T.ink, color: T.paper,
};
const btnGhost = {
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: T.sans,
  background: 'transparent', color: T.ink, border: `1px solid ${T.faintRule}`,
};

function ContactsView({ user, onBack, onLogout, accessToken, projects = [], onOpenMeetings, onOpenPipeline, onOpenProject }) {
  const userId = user?.user_id || user?.id;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [backfillingAvatars, setBackfillingAvatars] = useState(false);
  // Preview state for the per-row refresh confirmation modal
  const [refreshPreview, setRefreshPreview] = useState(null); // { contact, patch }
  const [applyingRefresh, setApplyingRefresh] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd/Ctrl+K opens the global search palette. Capture phase so we
  // beat Chrome's built-in tab-search / address-bar shortcut, which
  // otherwise intercepts the keypress before our listener sees it.
  // Match by both `key` and `code` so non-US keyboard layouts work.
  useEffect(() => {
    const onKey = (e) => {
      const isK = e.key === 'k' || e.key === 'K' || e.code === 'KeyK';
      if ((e.metaKey || e.ctrlKey) && isK && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listContacts({ limit: 1000 });
      setContacts(rows);
    } catch (e) {
      console.error('[contacts] load failed:', e.message || e);
    } finally { setLoading(false); }
  }, []);

  const onBackfillAvatars = useCallback(async () => {
    if (backfillingAvatars) return;
    setBackfillingAvatars(true);
    setSyncStatus('Backfilling profile photos from RocketReach…');
    try {
      const r = await backfillAvatarsFromRocketReach();
      setSyncStatus(`Photos backfilled. ${r.updated} updated · ${r.alreadyHad} already had one · ${r.noImage} no photo on file · ${r.noMatch} no CRM match.`);
      await reload();
    } catch (e) {
      setSyncStatus('Backfill failed: ' + (e.message || 'unknown'));
    } finally {
      setBackfillingAvatars(false);
      setTimeout(() => setSyncStatus(''), 10000);
    }
  }, [backfillingAvatars, reload]);

  useEffect(() => { reload(); }, [reload]);

  // Auto-sync from RocketReach on first visit so the list reflects any
  // contacts you saved via the LinkedIn extension since you were last
  // here. Runs once per session — the cron handles ongoing background
  // sync. The button stays as a manual force-refresh.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current || !userId) return;
    autoSyncedRef.current = true;
    onSyncRocketReachSilent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onSyncRocketReachSilent = useCallback(async () => {
    try {
      const result = await syncRocketReachContacts(userId);
      if ((result.created || 0) > 0 || (result.merged || 0) > 0) {
        await reload();
      }
    } catch (e) {
      // Silent — the manual sync button is there if anything's wrong
      console.warn('[contacts] auto-sync failed:', e?.message || e);
    }
  }, [userId, reload]);

  const onSyncRocketReach = useCallback(async () => {
    if (syncing) return;
    setSyncing(true); setSyncStatus('Fetching from RocketReach…');
    try {
      const result = await syncRocketReachContacts(userId, {
        onProgress: (page, seen) => setSyncStatus(`Fetched page ${page} · ${seen} contacts`),
      });
      setSyncStatus(`Synced. ${result.created} new, ${result.merged} merged${result.skipped?.length ? `, ${result.skipped.length} skipped` : ''}.`);
      await reload();
    } catch (e) {
      setSyncStatus('Sync failed: ' + (e.message || 'unknown'));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus(''), 6000);
    }
  }, [userId, syncing, reload]);

  // Two-step refresh: fetch + preview, then user confirms apply.
  const onRefreshContact = useCallback(async (contact) => {
    setRefreshingId(contact.id);
    try {
      const { patch } = await previewReenrich(contact);
      // Always open the preview so the user gets explicit feedback —
      // even when there's nothing to change, the modal will say so.
      setRefreshPreview({ contact, patch });
    } catch (e) {
      alert('Refresh failed: ' + (e.message || 'unknown'));
    } finally { setRefreshingId(null); }
  }, []);

  // Drawer-initiated enrich. Same flow as the per-row ↻ button but
  // accepts an override (e.g. a freshly-pasted LinkedIn URL) so
  // sparse contacts — known only by email from a meeting attendee —
  // can be hydrated without leaving the drawer. Throws so the drawer
  // can surface lookup failures inline instead of via alert().
  const onEnrichFromDrawer = useCallback(async (contact, override) => {
    const { patch } = await previewReenrich(contact, override);
    setRefreshPreview({ contact, patch });
  }, []);

  const onApplyRefresh = useCallback(async (selectedPatch) => {
    if (!refreshPreview) return;
    const { contact, patch } = refreshPreview;
    const effective = selectedPatch || patch; // fall back to full if not supplied
    if (!effective || !Object.keys(effective).length) { setRefreshPreview(null); return; }
    setApplyingRefresh(true);
    try {
      await applyReenrichPatch(contact.id, effective);
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, ...effective } : c));
      setRefreshPreview(null);
    } catch (e) {
      alert('Could not apply changes: ' + (e.message || 'unknown'));
    } finally { setApplyingRefresh(false); }
  }, [refreshPreview]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(c => {
      if (filter !== 'all' && (c.status || 'prospect') !== filter) return false;
      if (!q) return true;
      const tags = Array.isArray(c.tags) ? c.tags.join(' ') : '';
      const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''} ${c.location || ''} ${tags}`.toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, filter, search]);

  // Cluster filtered contacts into companies. Dedup logic in
  // companyDedup.js — normalizes names (Volvo Cars vs Volvo Car USA)
  // and merges by email domain. Recomputed on every render so newly
  // synced contacts automatically join the right cluster.
  // Default order is by count (used by stats panel for "top companies").
  const clusters = useMemo(() => clusterByCompany(filtered), [filtered]);
  // Main grid uses alphabetical order — easier to scan when you know
  // who you're looking for. Stats panel still highlights priorities
  // (top by count, active pitches, going cold) above the grid.
  const clustersAlpha = useMemo(() =>
    [...clusters].sort((a, b) => {
      // Push the Unassigned catch-all to the end of the A–Z list too.
      if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
      return (a.canonical || '').toLowerCase().localeCompare((b.canonical || '').toLowerCase());
    }),
    [clusters]
  );

  // Keep the selected company by stable cluster id (NOT canonical
  // name) — multiple clusters can share the same canonical when
  // contacts have no company set, so name-based selection would
  // always collapse them onto the first match. The id is derived
  // from contact ids, so it survives re-renders.
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const selectedCluster = useMemo(
    () => clusters.find(cl => cl.id === selectedClusterId) || null,
    [clusters, selectedClusterId]
  );

  // Pinned companies. Persisted in localStorage per browser.
  //
  // Pin identity is a multi-token problem. A cluster's canonical
  // name can flip between renders (when contact counts tie, the
  // tiebreaker is longest variant — unstable). Email domains can
  // be missing. So we pin by ALL identifying tokens at once
  // (domain + normalized canonical + every normalized alias), and
  // match if ANY of the cluster's current tokens is in the set.
  //
  // This survives:
  //   · canonical flipping between "Lonely Planet" and "lonelyplanet.com"
  //   · new contacts joining the cluster
  //   · merges/splits as the cluster evolves
  const PIN_KEY = `es_pinned_companies_${userId || 'anon'}`;
  const [pinnedKeys, setPinnedKeys] = useState(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
  });
  const clusterTokens = useCallback((cluster) => {
    if (!cluster) return [];
    const tokens = [];
    if (cluster.emailDomain) tokens.push(`domain:${cluster.emailDomain}`);
    const variants = [cluster.canonical, ...(cluster.aliases || [])].filter(Boolean);
    for (const v of variants) {
      const norm = normalizeCompany(v);
      if (norm) tokens.push(`name:${norm}`);
    }
    return tokens;
  }, []);
  const isPinned = useCallback((cluster) => {
    const tokens = clusterTokens(cluster);
    // Match new prefixed tokens
    if (tokens.some(t => pinnedKeys.has(t))) return true;
    // Backward-compat: earlier versions stored bare normalized names
    // without the "name:" prefix. Match those too so legacy pins
    // keep working until the user toggles them (which migrates).
    const legacy = normalizeCompany(cluster?.canonical || '');
    return !!legacy && pinnedKeys.has(legacy);
  }, [clusterTokens, pinnedKeys]);
  const togglePin = useCallback((cluster) => {
    const tokens = clusterTokens(cluster);
    if (!tokens.length) return;
    setPinnedKeys(prev => {
      const next = new Set(prev);
      // Also clean up the legacy bare-name key if present
      const legacy = normalizeCompany(cluster?.canonical || '');
      const currentlyPinned = tokens.some(t => next.has(t)) || (legacy && next.has(legacy));
      if (currentlyPinned) {
        tokens.forEach(t => next.delete(t));
        if (legacy) next.delete(legacy);
      } else {
        tokens.forEach(t => next.add(t));
      }
      try { localStorage.setItem(PIN_KEY, JSON.stringify([...next])); } catch (e) {}
      return next;
    });
  }, [PIN_KEY, clusterTokens]);
  // 412 cards is too many to render or scan. Default to top 10 by
  // contact count (priorities), with a "Show all" toggle that expands
  // to the full A–Z list. A live search query bypasses the limit —
  // when you're hunting for something specific, see everything that
  // matches.
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const TOP_COUNT = 10;
  // Detail drawer state — open a contact by id, drawer reads/updates
  // and lifts changes back into the local list so the UI stays fresh.
  const [openContactId, setOpenContactId] = useState(null);
  const [prepBriefContactId, setPrepBriefContactId] = useState(null);
  const [scheduleContact, setScheduleContact] = useState(null);
  const openContact = useMemo(
    () => contacts.find(c => c.id === openContactId) || null,
    [contacts, openContactId]
  );
  const prepBriefContact = useMemo(
    () => contacts.find(c => c.id === prepBriefContactId) || null,
    [contacts, prepBriefContactId]
  );

  const counts = useMemo(() => {
    const by = { all: contacts.length };
    contacts.forEach(c => { const s = c.status || 'prospect'; by[s] = (by[s] || 0) + 1; });
    return by;
  }, [contacts]);

  return (
    <div style={{ height: '100vh', background: T.bg, fontFamily: T.sans, overflow: 'auto' }}>
      <div style={{ height: 1, background: T.faintRule }}/>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '36px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={onBack} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 0, fontSize: 14, color: T.fadedInk, fontFamily: T.sans,
            }}>← Dashboard</button>
            <ESWordmark height={14} color={T.ink}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onOpenPipeline && (
              <button onClick={onOpenPipeline} style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', border: `1px solid ${T.faintRule}`, borderRadius: 999,
                color: T.ink, cursor: 'pointer', transition: 'all .18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.inkSoft; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; }}
              >Pipeline</button>
            )}
            {onOpenMeetings && (
              <button onClick={onOpenMeetings} style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600, fontFamily: T.sans,
                background: 'transparent', border: `1px solid ${T.faintRule}`, borderRadius: 999,
                color: T.ink, cursor: 'pointer', transition: 'all .18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.inkSoft; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; }}
              >Meetings</button>
            )}
            <span style={{ fontSize: 11, color: T.fadedInk }}>{user?.name || user?.email || ''}</span>
            <button onClick={onLogout} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: `1px solid ${T.faintRule}`, borderRadius: 999,
              cursor: 'pointer', padding: '5px 12px',
              fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
              color: T.fadedInk, fontFamily: T.sans,
            }}><LogOutI size={11} color="currentColor"/>Sign Out</button>
          </div>
        </div>

        {/* Page heading */}
        <div style={{ marginBottom: 8, marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: T.ink, marginBottom: 14 }}>CRM · Personal</div>
          <h1 style={{ fontSize: 'clamp(34px,5.4vw,56px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.022em', lineHeight: 1, margin: 0 }}>Contacts</h1>
          <div style={{ fontSize: 13, color: T.fadedInk, marginTop: 4 }}>
            {loading ? 'Loading…' : `${counts.all} contact${counts.all === 1 ? '' : 's'}`}
          </div>
        </div>

        {/* Priorities — stats above the company grid */}
        {!loading && contacts.length > 0 && (
          <StatsCards
            contacts={contacts}
            clusters={clusters}
            onFilter={(f) => setFilter(f)}
            onPickCompany={(canonical) => {
              const cl = clusters.find(c => c.canonical === canonical);
              if (cl) setSelectedClusterId(cl.id);
              setTimeout(() => {
                const el = document.querySelector('[data-company-detail]');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 50);
            }}
          />
        )}

        {/* Recent contacts strip — the 10 most recently added.
            Sits above the company grid so freshly-imported or
            -created contacts are immediately visible without
            scrolling through the alphabetical company list. */}
        {!loading && contacts.length > 0 && (
          <RecentContactsStrip
            contacts={contacts}
            onOpen={(id) => setOpenContactId(id)}
          />
        )}

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', flexWrap: 'wrap',
          borderTop: `1px solid ${T.faintRule}`, borderBottom: `1px solid ${T.faintRule}`,
        }}>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: T.inkSoft2 }}>
            <span style={{ fontSize: 12, color: T.fadedInk }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter the grid by name, company, email, title…"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: T.ink, fontFamily: T.sans }}/>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Open global search (⌘K / Ctrl+K)"
              style={{
                fontSize: 10, color: T.fadedInk, padding: '3px 8px', borderRadius: 4,
                background: T.paper, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
                fontFamily: T.sans, letterSpacing: '.04em',
              }}
            >⌘K</button>
          </div>
          {STATUS_OPTIONS.map(s => {
            const active = filter === s.id;
            const c = s.id === 'all' ? counts.all : counts[s.id] || 0;
            return <button key={s.id} onClick={() => setFilter(s.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
              fontSize: 11, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer',
              background: active ? T.ink : 'transparent',
              color: active ? T.paper : T.ink70,
              border: `1px solid ${active ? T.ink : T.faintRule}`,
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}>{s.label} <span style={{ opacity: .7, fontSize: 10 }}>{c}</span></button>;
          })}
          <ToolbarMenu
            syncing={syncing}
            backfillingAvatars={backfillingAvatars}
            onSyncRocketReach={onSyncRocketReach}
            onBackfillAvatars={onBackfillAvatars}
            onImportCSV={() => setShowImport(true)}
          />
          <button onClick={() => setShowNewContact(true)} style={btnSolid}>＋ New contact</button>
        </div>

        {/* Companies grid */}
        <div style={{ marginTop: 20 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12 }}>Loading contacts…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.fadedInk, fontSize: 12, border: `1px dashed ${T.faintRule}`, borderRadius: 10 }}>
              {contacts.length === 0
                ? <>No contacts yet. <button onClick={() => setShowImport(true)} style={{ ...btnGhost, padding: '6px 14px' }}>Import a CSV</button> to get started.</>
                : 'No contacts match this filter.'}
            </div>
          ) : (
            <>
              {(() => {
                const searching = search.trim().length > 0;
                const showingAll = showAllCompanies || searching;
                // Pinned clusters always come first regardless of mode.
                const pinned = clusters.filter(isPinned);
                // Top 10 by count when collapsed — exclude independent
                // (freelance, self-employed, etc.) AND internal (your
                // own team) AND already-pinned clusters since we
                // surface pinned ones first.
                const topCompanies = clusters.filter(cl =>
                  !cl.isIndependent && !cl.isInternal && !cl.isUnassigned && !isPinned(cl)
                );
                const remainingAlpha = clustersAlpha.filter(cl => !isPinned(cl));
                const visible = showingAll
                  ? [...pinned, ...remainingAlpha]
                  : [...pinned, ...topCompanies.slice(0, TOP_COUNT)];
                const hidden = clustersAlpha.length - visible.length;
                const independentCount = clusters.filter(cl => cl.isIndependent)
                  .reduce((n, cl) => n + cl.count, 0);
                return (
                  <>
                    <div style={{ fontSize: 11, color: T.fadedInk, marginBottom: 12 }}>
                      {showingAll
                        ? <>{clustersAlpha.length} compan{clustersAlpha.length === 1 ? 'y' : 'ies'} · {filtered.length} contact{filtered.length === 1 ? '' : 's'} · A–Z</>
                        : <>Top {visible.length} of {topCompanies.length} compan{topCompanies.length === 1 ? 'y' : 'ies'} · ranked by contact count{independentCount > 0 ? ` · ${independentCount} independent contact${independentCount === 1 ? '' : 's'} hidden` : ''}</>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                      {visible.map(cl => {
                        const isSelected = selectedClusterId === cl.id;
                        return (
                          <Fragment key={cl.id}>
                            <CompanyCard
                              cluster={cl}
                              selected={isSelected}
                              pinned={isPinned(cl)}
                              onClick={() => {
                                const nextId = isSelected ? null : cl.id;
                                setSelectedClusterId(nextId);
                                if (nextId) {
                                  // Inline detail renders on the row right
                                  // below this card; scroll only if it
                                  // ends up off-screen.
                                  setTimeout(() => {
                                    const el = document.querySelector('[data-company-detail]');
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                  }, 50);
                                }
                              }}
                            />
                            {isSelected && selectedCluster && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <CompanyDetail
                                  cluster={selectedCluster}
                                  userId={userId}
                                  onClose={() => setSelectedClusterId(null)}
                                  onRefreshContact={onRefreshContact}
                                  refreshingId={refreshingId}
                                  onOpenContact={(id) => setOpenContactId(id)}
                                  onOpenProject={onOpenProject}
                                  pinned={isPinned(selectedCluster)}
                                  onTogglePin={() => togglePin(selectedCluster)}
                                  onScheduleMeeting={(c) => setScheduleContact(c)}
                                  canSchedule={!!accessToken}
                                  deletingCompany={deletingCompany}
                                  onDeleteCompany={async () => {
                                    const n = selectedCluster.contacts.length;
                                    const name = selectedCluster.canonical || 'No company';
                                    if (!confirm(`Delete all ${n} contact${n === 1 ? '' : 's'} at "${name}"? This can't be undone.`)) return;
                                    setDeletingCompany(true);
                                    try {
                                      await Promise.all(selectedCluster.contacts.map(c => deleteContact(c.id)));
                                      const idsToRemove = new Set(selectedCluster.contacts.map(c => c.id));
                                      setContacts(prev => prev.filter(c => !idsToRemove.has(c.id)));
                                      setSelectedClusterId(null);
                                    } catch (e) {
                                      alert('Delete failed: ' + (e.message || 'unknown'));
                                    } finally { setDeletingCompany(false); }
                                  }}
                                />
                              </div>
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                    {!showingAll && hidden > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <button onClick={() => setShowAllCompanies(true)} style={{
                          padding: '8px 18px', borderRadius: 999,
                          background: 'transparent', border: `1px solid ${T.faintRule}`,
                          color: T.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
                          transition: 'all .18s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.inkSoft; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; }}
                        >Show all {clusters.length} companies (A–Z)</button>
                      </div>
                    )}
                    {showingAll && !searching && clusters.length > TOP_COUNT && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <button onClick={() => setShowAllCompanies(false)} style={{
                          padding: '8px 18px', borderRadius: 999,
                          background: 'transparent', border: `1px solid ${T.faintRule}`,
                          color: T.fadedInk, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
                        }}>Collapse to top {TOP_COUNT}</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}

        </div>

        {syncStatus && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: T.inkSoft, border: `1px solid ${T.faintRule}`, color: T.ink, fontSize: 12, fontWeight: 500 }}>
            {syncStatus}
          </div>
        )}
        <div style={{ marginTop: 16, padding: '14px 18px', borderRadius: 10, border: `1px dashed ${T.faintRule}`, color: T.fadedInk, fontSize: 12, lineHeight: 1.55 }}>
          <b style={{ color: T.ink }}>Company dedup.</b> Variants like "Volvo Cars" / "Volvo Car USA" and "Mattel" / "Mattel, Inc." merge automatically based on name normalization + email-domain matching. New contacts join the right cluster on the next render — no manual cleanup needed.
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        contacts={contacts}
        clusters={clusters}
        onOpenContact={(c) => setOpenContactId(c.id)}
        onOpenCluster={(cl) => {
          // Make sure the picked cluster is actually visible in the
          // grid (so the inline detail renders): clear search/filter
          // and expand to the full A–Z list.
          setSearch('');
          setFilter('all');
          setShowAllCompanies(true);
          setSelectedClusterId(cl.id);
          setTimeout(() => {
            const el = document.querySelector('[data-company-detail]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }}
      />

      {showImport && <ImportWizard userId={userId} onClose={() => setShowImport(false)} onComplete={reload}/>}
      {showNewContact && (
        <NewContactModal
          userId={userId}
          onClose={() => setShowNewContact(false)}
          onCreated={(c) => {
            setContacts(prev => [c, ...prev]);
            setOpenContactId(c.id);
          }}
        />
      )}
      {refreshPreview && (
        <RefreshPreviewModal
          contact={refreshPreview.contact}
          patch={refreshPreview.patch}
          applying={applyingRefresh}
          onCancel={() => !applyingRefresh && setRefreshPreview(null)}
          onApply={onApplyRefresh}
        />
      )}
      {openContact && (
        <ContactDetailDrawer
          contact={openContact}
          projects={projects}
          allContacts={contacts}
          userId={userId}
          userName={user?.name || user?.email}
          accessToken={accessToken}
          onClose={() => setOpenContactId(null)}
          onUpdate={(updated) => {
            setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
          }}
          onDelete={(id) => {
            setContacts(prev => prev.filter(c => c.id !== id));
          }}
          onEnrich={onEnrichFromDrawer}
          onOpenPrepBrief={(c) => setPrepBriefContactId(c.id)}
          onOpenProject={onOpenProject}
        />
      )}
      {prepBriefContact && (
        <PrepBrief
          contact={prepBriefContact}
          accessToken={accessToken}
          onClose={() => setPrepBriefContactId(null)}
        />
      )}
      {scheduleContact && (
        <ScheduleMeetingModal
          contact={scheduleContact}
          accessToken={accessToken}
          onClose={() => setScheduleContact(null)}
          onScheduled={() => {
            const now = new Date().toISOString();
            setContacts(prev => prev.map(c => c.id === scheduleContact.id ? { ...c, last_contacted_at: now } : c));
          }}
        />
      )}
    </div>
  );
}

export default ContactsView;
