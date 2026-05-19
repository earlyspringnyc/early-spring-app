import { useState, useEffect, useMemo, useCallback } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { LogOutI } from '../components/icons/index.js';
import { listContacts, updateContact } from '../lib/contacts.js';
import ContactDetailDrawer from '../components/ContactDetailDrawer.jsx';
import PrepBrief from './../components/PrepBrief.jsx';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal.jsx';

// Pipeline kanban view — same contact data as ContactsView, but
// columned by funnel stage. The whole reason this exists: when
// you walk into Monday, you want to see what's in the pipeline at
// a glance, not search through an alphabetical company list.
//
// Stage change happens via the contact detail drawer (existing
// status-pill toggles). Drag-and-drop is a v2 feature.

const COLUMNS = [
  { id: 'prospect', label: 'Prospect',  hint: 'Early stage — discovery / intros / cap calls' },
  { id: 'pitching', label: 'Pitching',  hint: 'RFP received, pitch in flight, awaiting decision' },
  { id: 'active',   label: 'Active',    hint: 'Awarded — production / delivery' },
  { id: 'past',     label: 'Past',      hint: 'Closed-won, closed-lost, ghosted' },
];

const TYPE_ICON = { brand: '◆', agency: '◇', vendor: '▣', internal: '●' };

function daysAgo(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function PipelineView({ user, onBack, onLogout, accessToken, projects = [] }) {
  const userId = user?.user_id || user?.id;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openContactId, setOpenContactId] = useState(null);
  const [prepBriefContact, setPrepBriefContact] = useState(null);
  const [scheduleContact, setScheduleContact] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setContacts(await listContacts({ limit: 1000 })); }
    catch (e) { console.error('[pipeline] load failed:', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Group contacts by status. Skip internal team + vendors —
  // they're not in the sales funnel.
  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(COLUMNS.map(c => [c.id, []]));
    for (const c of contacts) {
      if (c.contact_type === 'internal' || c.contact_type === 'vendor') continue;
      const s = COLUMNS.find(col => col.id === (c.status || 'prospect'))?.id || 'prospect';
      groups[s].push(c);
    }
    // Sort each column by last touch desc (recent first), then name.
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => {
        const da = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0;
        const db = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0;
        if (db !== da) return db - da;
        return (a.last_name || '').localeCompare(b.last_name || '');
      });
    }
    return groups;
  }, [contacts]);

  const openContact = useMemo(
    () => contacts.find(c => c.id === openContactId) || null,
    [contacts, openContactId]
  );

  // Optimistic status change — patches local state immediately,
  // commits to the DB in the background. If the request fails,
  // we re-load and the column snaps back.
  const setStatus = useCallback(async (contactId, status) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status } : c));
    try { await updateContact(contactId, { status }); }
    catch (e) { console.error('[pipeline] status update failed:', e); load(); }
  }, [load]);

  return (
    <div style={{ height: '100vh', overflow: 'auto', background: T.bg, color: T.ink, fontFamily: T.sans }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${T.faintRule}`, gap: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.ink70, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>← Dashboard</button>
        <ESWordmark/>
        <div style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.20em', textTransform: 'uppercase' }}>
          Pipeline
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: T.fadedInk }}>{user?.email}</span>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: T.fadedInk, cursor: 'pointer', padding: 4 }} title="Sign out"><LogOutI size={16}/></button>
        </div>
      </div>

      <div style={{ padding: '28px 32px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>Pipeline</h1>
          <p style={{ fontSize: 13, color: T.fadedInk, marginTop: 4 }}>
            {contacts.length} contacts · grouped by funnel stage · click a card to open + change stage
          </p>
        </div>

        {loading ? (
          <div style={{ color: T.fadedInk, fontStyle: 'italic', padding: 24 }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'flex-start' }}>
            {COLUMNS.map(col => {
              const items = byStatus[col.id] || [];
              return (
                <div key={col.id} style={{
                  background: T.inkSoft3, borderRadius: 12, padding: 14,
                  border: `1px solid ${T.faintRule}`,
                  minHeight: 200,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: '.16em', textTransform: 'uppercase' }}>
                      {col.label}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink70 }}>{items.length}</div>
                  </div>
                  <div style={{ fontSize: 10, color: T.fadedInk, marginBottom: 12, lineHeight: 1.4 }}>
                    {col.hint}
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {items.map(c => (
                      <PipelineCard
                        key={c.id}
                        contact={c}
                        onOpen={() => setOpenContactId(c.id)}
                        onPrep={() => setPrepBriefContact(c)}
                        onSchedule={() => setScheduleContact(c)}
                        canSchedule={!!accessToken}
                        onAdvance={() => {
                          // Quick-advance: click → moves to the next stage forward.
                          const idx = COLUMNS.findIndex(x => x.id === col.id);
                          const next = COLUMNS[idx + 1];
                          if (next) setStatus(c.id, next.id);
                        }}
                        canAdvance={COLUMNS.findIndex(x => x.id === col.id) < COLUMNS.length - 1}
                      />
                    ))}
                    {items.length === 0 && (
                      <div style={{ fontSize: 11, color: T.fadedInk, fontStyle: 'italic', padding: '12px 0', textAlign: 'center' }}>
                        — empty —
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openContact && (
        <ContactDetailDrawer
          contact={openContact}
          projects={projects}
          userId={userId}
          accessToken={accessToken}
          onClose={() => setOpenContactId(null)}
          onUpdate={updated => setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))}
          onDelete={id => setContacts(prev => prev.filter(c => c.id !== id))}
          onOpenPrepBrief={c => setPrepBriefContact(c)}
        />
      )}
      {prepBriefContact && (
        <PrepBrief contact={prepBriefContact} accessToken={accessToken} onClose={() => setPrepBriefContact(null)}/>
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

function PipelineCard({ contact: c, onOpen, onPrep, onAdvance, canAdvance, onSchedule, canSchedule }) {
  const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '(No name)';
  const days = daysAgo(c.last_contacted_at);
  const stale = days >= 14 && days !== Infinity;
  return (
    <div style={{
      background: T.paper, borderRadius: 8, padding: 12,
      border: `1px solid ${stale ? T.alert + '55' : T.faintRule}`,
      cursor: 'pointer',
    }}
      onClick={onOpen}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fullName}
        </div>
        {c.contact_type && TYPE_ICON[c.contact_type] && (
          <span title={c.contact_type} style={{ fontSize: 11, color: T.fadedInk, flexShrink: 0 }}>
            {TYPE_ICON[c.contact_type]}
          </span>
        )}
      </div>
      {c.company && (
        <div style={{ fontSize: 11, color: T.ink70, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.company}
        </div>
      )}
      <div style={{ fontSize: 10, color: stale ? T.alert : T.fadedInk, marginTop: 6 }}>
        {days === Infinity ? 'No touchpoint' : `Last touch ${days}d ago`}
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        <button
          type="button" onClick={(e) => { e.stopPropagation(); onPrep(); }}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700,
            background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
            letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: T.sans,
          }}
        >✦ Prep</button>
        {canSchedule && c.email && (
          <button
            type="button" onClick={(e) => { e.stopPropagation(); onSchedule(); }}
            style={{
              padding: '5px 10px', borderRadius: 999, fontSize: 11,
              background: 'transparent', color: T.ink70, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
              fontFamily: T.sans,
            }}
            title="Schedule a meeting with this contact"
          >📅</button>
        )}
        {canAdvance && (
          <button
            type="button" onClick={(e) => { e.stopPropagation(); onAdvance(); }}
            style={{
              padding: '5px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700,
              background: 'transparent', color: T.ink70, border: `1px solid ${T.faintRule}`, cursor: 'pointer',
              letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: T.sans,
            }}
            title="Move to next stage"
          >→</button>
        )}
      </div>
    </div>
  );
}

export default PipelineView;
