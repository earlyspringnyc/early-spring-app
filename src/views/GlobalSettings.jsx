import { useState, useEffect, useCallback, useMemo } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { restFetch, getTeamMembers } from '../lib/db.js';
import { ROLE_LABELS, PROJECT_BYPASS_ROLES, ORG_SURFACES, defaultSurfacesForRole } from '../constants/index.js';

// Section keys must match the view IDs in ProjectView's setView.
// Order matches the project sidebar (Side.jsx) so the Access UI reads
// naturally.
const PROJECT_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'budget', label: 'Budget' },
  { id: 'timeline', label: 'Production' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'creative', label: 'Creative' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'ai', label: 'ES AI' },
  { id: 'contract', label: 'Contract' },
  { id: 'pnl', label: 'Finance' },
  { id: 'ros', label: 'Run of Show' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'time', label: 'Time' },
  { id: 'export', label: 'Client View' },
];

// Global Settings hub — entry from the dashboard's settings pill.
// Four sections: Members, Appearance, Organization, Integrations.

const SECTIONS = [
  { id: 'members', label: 'Members' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'organization', label: 'Organization' },
  { id: 'integrations', label: 'Integrations' },
];

// Roles you can invite into the org. Admin + EP bypass per-project
// membership; everyone else needs explicit access in project_members.
const INVITABLE_ROLES = ['producer', 'agent', 'admin', 'creative', 'finance', 'accounts', 'production', 'viewer'];

export default function GlobalSettings({ user, orgId, organizations, toggleTheme, themeMode, accessToken, requestCalendarAccess, onBack, onViewAs }) {
  // Land on the Integrations tab automatically when the user arrives
  // via the Gmail Add-on approval link (?addon_code=XXXX-XXXX).
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('addon_code');
      return code ? 'integrations' : 'members';
    } catch (e) { return 'members'; }
  });

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.cream, fontFamily: T.sans }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: `1px solid ${T.faintRule}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.dim, fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans, padding: 0 }} onMouseEnter={(e) => (e.currentTarget.style.color = T.cream)} onMouseLeave={(e) => (e.currentTarget.style.color = T.dim)}>
            ← Dashboard
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.cream, margin: 0, letterSpacing: '-0.02em' }}>Settings</h1>
        </div>
        <ESWordmark height={14} color={T.cream} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 65px)' }}>
        {/* Side nav */}
        <nav style={{ borderRight: `1px solid ${T.faintRule}`, padding: '24px 12px' }}>
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 14px', borderRadius: T.rS,
              background: activeSection === s.id ? T.inkSoft : 'transparent',
              border: 'none', cursor: 'pointer',
              color: activeSection === s.id ? T.ink : T.dim,
              fontSize: 13, fontWeight: activeSection === s.id ? 700 : 500, fontFamily: T.sans,
              transition: 'all .15s',
            }} onMouseEnter={(e) => { if (activeSection !== s.id) { e.currentTarget.style.background = T.inkSoft2; e.currentTarget.style.color = T.cream; } }}
              onMouseLeave={(e) => { if (activeSection !== s.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.dim; } }}>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={{ padding: 'clamp(24px,3vw,40px)', overflow: 'auto' }}>
          {activeSection === 'members' && <MembersSection user={user} orgId={orgId} organizations={organizations} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess} onViewAs={onViewAs} />}
          {activeSection === 'appearance' && <AppearanceSection toggleTheme={toggleTheme} themeMode={themeMode} />}
          {activeSection === 'organization' && <OrganizationSection orgId={orgId} organizations={organizations} />}
          {activeSection === 'integrations' && <IntegrationsSection accessToken={accessToken} requestCalendarAccess={requestCalendarAccess} orgId={orgId} user={user} />}
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Members
// ─────────────────────────────────────────────────────────────────────
function MembersSection({ user, orgId, organizations, accessToken, requestCalendarAccess, onViewAs }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessMember, setAccessMember] = useState(null);  // staff member for the Access modal
  const [clientMember, setClientMember] = useState(null);  // client member for the Client Access modal
  const [adminBusy, setAdminBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('producer');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteError, setInviteError] = useState('');

  // Per-invite project grants. Map of projectId → { included:true, sections:null|{...} }.
  // Picker only matters when the role does NOT bypass per-project gates.
  const [orgProjects, setOrgProjects] = useState([]);
  const [invitePicks, setInvitePicks] = useState({});
  const roleBypasses = PROJECT_BYPASS_ROLES.has(inviteRole);

  // Org-wide surface picks for the invite. Initialised from the role
  // default; bypass roles see everything regardless so the picker is hidden.
  const [inviteSurfaces, setInviteSurfaces] = useState(() => {
    const defaults = defaultSurfacesForRole('producer');
    return ORG_SURFACES.reduce((acc, s) => ({ ...acc, [s.id]: defaults.has(s.id) }), {});
  });
  // Re-derive defaults when the role changes — only if the admin hasn't
  // started customising. Heuristic: if every key matches some role's
  // defaults, treat as untouched and overwrite. Otherwise leave alone.
  useEffect(() => {
    const defaults = defaultSurfacesForRole(inviteRole);
    setInviteSurfaces(ORG_SURFACES.reduce((acc, s) => ({ ...acc, [s.id]: defaults.has(s.id) }), {}));
  }, [inviteRole]);
  const toggleInviteSurface = (sid) => setInviteSurfaces((prev) => ({ ...prev, [sid]: !prev[sid] }));

  // Email sending state
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  const orgName = useMemo(() => (organizations || []).find((o) => o.id === orgId)?.name || 'this org', [organizations, orgId]);

  // { [client_user_id]: [{ id, name }] } — projects each client has
  // portal access to, fetched once after the members list loads so
  // we can render them inline as chips next to each client row.
  const [clientProjectsByUserId, setClientProjectsByUserId] = useState({});
  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    // Best-effort heal: backfill any client profiles missing for
    // project_clients rows in this org. Fires before the load so
    // the freshly-healed clients show up in the very same render.
    // Fails silently — Members still loads if heal errors out.
    try {
      const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const token = sbKey ? JSON.parse(localStorage.getItem(sbKey))?.access_token : null;
      if (token) {
        await fetch('/api/members/heal-orphan-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orgId }),
        }).catch(() => {});
      }
    } catch (e) {}
    try {
      const rows = await getTeamMembers(orgId);
      setMembers(rows);
      // Bulk-fetch project_clients for everyone with role='client' so
      // each client row can show the projects they can see, without
      // an N+1 cascade.
      const clientIds = rows.filter((m) => m.role === 'client').map((m) => m.user_id).filter(Boolean);
      if (clientIds.length) {
        const inList = clientIds.map((id) => `"${id}"`).join(',');
        const links = await restFetch(`/project_clients?select=user_id,projects(id,name)&user_id=in.(${encodeURIComponent(inList)})`);
        const map = {};
        (links || []).forEach((l) => {
          if (!l.projects) return;
          if (!map[l.user_id]) map[l.user_id] = [];
          map[l.user_id].push({ id: l.projects.id, name: l.projects.name });
        });
        setClientProjectsByUserId(map);
      } else {
        setClientProjectsByUserId({});
      }
    }
    catch (e) { console.warn('[settings] team members load failed:', e?.message); }
    finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { reload(); }, [reload]);

  // Load org projects once so the invite picker has something to show.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    restFetch(`/projects?select=id,name,client&org_id=eq.${orgId}&order=created_at.desc`)
      .then((rows) => { if (!cancelled) setOrgProjects(rows || []); })
      .catch((e) => console.warn('[settings] org projects load failed:', e?.message));
    return () => { cancelled = true; };
  }, [orgId]);

  const toggleInvitePick = (pid) => {
    setInvitePicks((prev) => {
      const next = { ...prev };
      if (next[pid]) delete next[pid];
      else next[pid] = { sections: null };
      return next;
    });
  };
  const setInviteAllProjects = () => {
    setInvitePicks(orgProjects.reduce((acc, p) => ({ ...acc, [p.id]: { sections: null } }), {}));
  };

  const submitInvite = async () => {
    setInviteError('');
    setEmailSent(false);
    setEmailError('');
    if (!inviteEmail.trim().includes('@')) { setInviteError('Enter a valid email.'); return; }
    // For non-bypass roles, require at least one picked project so the
    // teammate isn't created and then immediately invisible to themselves.
    if (!roleBypasses && Object.keys(invitePicks).length === 0) {
      setInviteError('Pick at least one project this teammate should see.');
      return;
    }
    setInviting(true);
    try {
      const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const token = sbKey ? JSON.parse(localStorage.getItem(sbKey))?.access_token : null;
      if (!token) { setInviteError('Sign in first.'); setInviting(false); return; }

      const res = await fetch('/api/team-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), name: inviteName.trim() || undefined, role: inviteRole, orgId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setInviteError(e.error || 'Could not invite teammate');
        return;
      }
      const data = await res.json();

      // Resolve the freshly-created profile so we can write
      // project_members grants AND the org_permissions JSON. RLS keeps
      // this lookup scoped to the caller's org.
      let targetUserId = null;
      let targetProfileId = null;
      try {
        const profiles = await restFetch(`/profiles?select=id,user_id&email=eq.${encodeURIComponent(data.email)}&org_id=eq.${orgId}&limit=1`);
        targetUserId = profiles?.[0]?.user_id || null;
        targetProfileId = profiles?.[0]?.id || null;
      } catch (e) {}

      // Per-project grants. Bypass roles skip this — admin/ep see
      // every project regardless of project_members rows.
      const grantedProjects = [];
      if (!roleBypasses && targetUserId) {
        try {
          const rows = Object.entries(invitePicks).map(([pid, v]) => ({
            project_id: pid, user_id: targetUserId, sections: v.sections || null,
          }));
          if (rows.length) {
            await restFetch('/project_members?on_conflict=project_id,user_id', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=minimal',
              body: rows,
            });
            rows.forEach((r) => {
              const proj = orgProjects.find((p) => p.id === r.project_id);
              if (proj) grantedProjects.push(proj);
            });
          }
        } catch (e) { console.warn('[invite] project grants failed:', e?.message); }
      }

      // Org-wide surface grants. Skipped for bypass roles (admin/ep
      // always see everything regardless of this column).
      const grantedSurfaces = [];
      if (!roleBypasses && targetProfileId) {
        try {
          await restFetch(`/profiles?id=eq.${targetProfileId}`, {
            method: 'PATCH',
            body: { org_permissions: inviteSurfaces },
          });
          ORG_SURFACES.forEach((s) => { if (inviteSurfaces[s.id]) grantedSurfaces.push(s); });
        } catch (e) { console.warn('[invite] org_permissions failed:', e?.message); }
      }

      setInviteResult({ ...data, grantedProjects, grantedSurfaces });
      reload();
    } catch (e) { setInviteError(e.message || 'Network error'); }
    finally { setInviting(false); }
  };

  // Send the credentials via Gmail using the staff member's connected
  // Google account. Branded teamInviteEmailHtml mirrors the rest of
  // the system's email language.
  const sendInviteEmail = async () => {
    if (!inviteResult) return;
    setEmailSending(true); setEmailError(''); setEmailSent(false);
    try {
      let token = accessToken;
      if (!token) { try { token = localStorage.getItem('es_google_token'); } catch (e) {} }
      if (!token && requestCalendarAccess) { try { token = await requestCalendarAccess(); } catch (e) {} }
      if (!token) { setEmailError('Sign into Google to send invites via your Gmail.'); return; }

      const { sendEmail } = await import('../utils/google.js');
      const { teamInviteEmailHtml } = await import('../utils/emailTemplates.js');
      const html = teamInviteEmailHtml({
        orgName,
        recipientName: inviteName.trim() || (inviteResult.email.split('@')[0]),
        roleLabel: ROLE_LABELS[inviteResult.role] || inviteResult.role,
        email: inviteResult.email,
        password: inviteResult.password,
        loginUrl: 'https://morgan.earlyspring.nyc',
        projectList: (inviteResult.grantedProjects || []).map((p) => p.name),
        inviterName: user?.name || '',
        message: '',
      });
      await sendEmail(token, inviteResult.email, `Your ${orgName} access — Morgan login`, html);
      setEmailSent(true);
    } catch (e) {
      setEmailError(e.message || 'Send failed');
    } finally { setEmailSending(false); }
  };

  const closeInviteResult = () => {
    setInviteResult(null);
    setInviteEmail('');
    setInviteName('');
    setInviteRole('producer');
    setInvitePicks({});
    setEmailSent(false);
    setEmailError('');
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.cream, letterSpacing: '-0.02em', margin: 0 }}>Members of {orgName}</h2>
      <p style={{ fontSize: 13, color: T.dim, lineHeight: 1.55, marginTop: 6 }}>
        Add teammates by email — they'll get a memorable password and can sign in at morgan.earlyspring.nyc without Google.
      </p>

      {/* Invite form */}
      <div style={{ marginTop: 24, padding: 20, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface }}>
        {!inviteResult ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 14 }}>Invite a teammate</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Email *</label>
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="louisa@early.nyc" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Name (optional)</label>
                <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Louisa Lane" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                </select>
              </div>
            </div>

            {/* Project picker — only for non-bypass roles. Admin / EP
                automatically see every project so we skip this step. */}
            {!roleBypasses && (
              <div style={{ marginBottom: 14, padding: 14, background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rS }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Projects they'll see *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={setInviteAllProjects} style={{ padding: '4px 10px', background: 'transparent', color: T.dim, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>All</button>
                    <button type="button" onClick={() => setInvitePicks({})} style={{ padding: '4px 10px', background: 'transparent', color: T.dim, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>None</button>
                  </div>
                </div>
                {orgProjects.length === 0 ? (
                  <div style={{ fontSize: 12, color: T.dim }}>No projects in this org yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                    {orgProjects.map((p) => {
                      const on = !!invitePicks[p.id];
                      return (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.inkSoft : 'transparent', borderRadius: T.rS, cursor: 'pointer' }}>
                          <input type="checkbox" checked={on} onChange={() => toggleInvitePick(p.id)} style={{ accentColor: T.ink, cursor: 'pointer' }} />
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.cream, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            {p.client && <span style={{ fontSize: 10, color: T.dim, display: 'block' }}>{p.client}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
                  All sections of each picked project are granted by default. Fine-tune from "Manage access" after creating.
                </p>
              </div>
            )}
            {roleBypasses && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 12, color: T.dim }}>
                {ROLE_LABELS[inviteRole]}s automatically see every project in {orgName}, plus every org-wide surface (CRM, Books, etc).
              </div>
            )}

            {/* Org-wide surfaces picker — CRM, Books, Pipeline, etc.
                Only shown for non-bypass roles. Defaults seeded from the
                role's traditional access so the simple case is one click. */}
            {!roleBypasses && (
              <div style={{ marginBottom: 14, padding: 14, background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rS }}>
                <label style={{ ...labelStyle, marginBottom: 10 }}>Org-wide surfaces they'll see</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 6 }}>
                  {ORG_SURFACES.map((s) => {
                    const on = !!inviteSurfaces[s.id];
                    return (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.inkSoft : 'transparent', borderRadius: T.rS, cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => toggleInviteSurface(s.id)} style={{ accentColor: T.ink, cursor: 'pointer', marginTop: 2 }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: T.cream, display: 'block' }}>{s.label}</span>
                          <span style={{ fontSize: 10, color: T.dim, display: 'block', marginTop: 2, lineHeight: 1.4 }}>{s.desc}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {inviteError && <div style={{ fontSize: 12, color: T.neg, fontWeight: 600, marginBottom: 10 }}>{inviteError}</div>}
            <button onClick={submitInvite} disabled={inviting || !inviteEmail.trim()} style={primaryBtn(inviting || !inviteEmail.trim())}>
              {inviting ? 'Creating…' : 'Create teammate'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.pos, marginBottom: 14 }}>
              {inviteResult.alreadyExisted ? 'Existing account updated' : 'Teammate created'} — credentials below.
            </div>
            <div style={{ display: 'grid', gap: 8, padding: '14px 16px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rS }}>
              <Row label="Login URL" value="https://morgan.earlyspring.nyc" mono />
              <Row label="Email" value={inviteResult.email} mono />
              <Row label="Password" value={inviteResult.password} mono />
              <Row label="Role" value={ROLE_LABELS[inviteResult.role] || inviteResult.role} />
            </div>

            {/* Preview: what they'll see when they sign in */}
            <div style={{ marginTop: 14, padding: '14px 16px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rS, display: 'grid', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 8 }}>Projects</div>
                {PROJECT_BYPASS_ROLES.has(inviteResult.role) ? (
                  <div style={{ fontSize: 12, color: T.cream, lineHeight: 1.55 }}>Every project in {orgName} — {ROLE_LABELS[inviteResult.role]}s bypass per-project gates.</div>
                ) : (inviteResult.grantedProjects || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: T.neg }}>None granted. They'll see an empty dashboard.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.cream, lineHeight: 1.6 }}>
                    {(inviteResult.grantedProjects || []).map((p) => (
                      <li key={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 8 }}>Org-wide surfaces</div>
                {PROJECT_BYPASS_ROLES.has(inviteResult.role) ? (
                  <div style={{ fontSize: 12, color: T.cream, lineHeight: 1.55 }}>All of them — CRM, Pipeline, Meetings, Books, Activity, Reporting.</div>
                ) : (inviteResult.grantedSurfaces || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: T.dim }}>None — they'll only see projects, no top-bar pills.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.cream, lineHeight: 1.6 }}>
                    {(inviteResult.grantedSurfaces || []).map((s) => <li key={s.id}>{s.label}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={sendInviteEmail} disabled={emailSending || emailSent} style={primaryBtn(emailSending || emailSent)}>
                {emailSending ? 'Sending…' : emailSent ? 'Email sent' : 'Send invite email'}
              </button>
              <button onClick={() => navigator.clipboard?.writeText(`Login: https://morgan.earlyspring.nyc\nEmail: ${inviteResult.email}\nPassword: ${inviteResult.password}`)} style={secondaryBtn()}>Copy credentials</button>
              <button onClick={closeInviteResult} style={secondaryBtn()}>Done</button>
            </div>
            {emailError && <div style={{ marginTop: 10, fontSize: 12, color: T.neg, fontWeight: 600 }}>{emailError}</div>}
            {emailSent && <div style={{ marginTop: 10, fontSize: 12, color: T.pos, fontWeight: 600 }}>Invite emailed to {inviteResult.email}.</div>}
          </>
        )}
      </div>

      {/* Member list — split into staff (admin/producer/agent/etc.)
          and clients. Clients get their own controls (view linked
          projects, reset password, revoke). */}
      {(() => {
        const staffList = members.filter((m) => m.role !== 'client');
        const clientList = members.filter((m) => m.role === 'client');

        const callAdmin = async (action, targetUserId) => {
          try {
            const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
            const token = sbKey ? JSON.parse(localStorage.getItem(sbKey))?.access_token : null;
            if (!token) { alert('Sign in first.'); return null; }
            setAdminBusy(true);
            const res = await fetch('/api/member-admin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action, userId: targetUserId, orgId }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { alert(body.error || 'Action failed'); return null; }
            return body;
          } finally { setAdminBusy(false); }
        };

        const onResetPassword = async (m) => {
          if (!confirm(`Reset password for ${m.name || m.email}? They'll need the new one to sign in.`)) return;
          const out = await callAdmin('reset_password', m.user_id);
          if (out?.password) {
            const text = `Login: https://morgan.earlyspring.nyc${m.role === 'client' ? '/client' : ''}\nEmail: ${m.email}\nPassword: ${out.password}`;
            navigator.clipboard?.writeText(text);
            alert(`New password: ${out.password}\n\nCopied to clipboard.`);
          }
        };
        const onRevoke = async (m) => {
          if (!confirm(`Permanently revoke ${m.name || m.email}? Their account, profile, and all access will be removed. This cannot be undone.`)) return;
          const out = await callAdmin('revoke', m.user_id);
          if (out?.revoked) { reload(); }
        };

        // Build a view-as identity by fetching the target's project_member
        // rows + freshly-read org_permissions, then hand it to App.jsx.
        // We package everything client-side so the preview doesn't need
        // any further round-trips — App.jsx just filters from this.
        const onView = async (m) => {
          try {
            const memRows = await restFetch(`/project_members?select=project_id,sections&user_id=eq.${m.user_id}`);
            const target = {
              user_id: m.user_id,
              id: m.user_id,
              name: m.name || '',
              email: m.email || '',
              role: m.role,
              org_id: orgId,
              org_permissions: m.org_permissions || null,
              projectMemberRows: memRows || [],
            };
            onViewAs?.(target);
          } catch (e) { alert(`Could not start preview: ${e.message || e}`); }
        };

        return (
          <>
            {/* Staff */}
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 12 }}>
                Team {loading ? '· loading…' : `· ${staffList.length}`}
              </div>
              <div style={{ display: 'grid', gap: 0, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                {staffList.map((m, idx) => {
                  const bypass = PROJECT_BYPASS_ROLES.has(m.role);
                  const isMe = m.user_id === (user?.user_id || user?.id);
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto auto auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderTop: idx === 0 ? 'none' : `1px solid ${T.border}`, background: T.surface }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.cream }}>{m.name || m.email}</div>
                        <div style={{ fontSize: 11, color: T.dim, marginTop: 2, fontFamily: T.mono }}>{m.email}</div>
                      </div>
                      <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>
                        {ROLE_LABELS[m.role] || m.role}
                      </div>
                      <div>
                        {bypass ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.06em', textTransform: 'uppercase' }}>All projects</span>
                        ) : (
                          <button onClick={() => setAccessMember(m)} style={{ padding: '5px 12px', background: 'transparent', color: T.cream, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>
                            Manage access
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {!isMe && (
                          <>
                            <button onClick={() => onView(m)} style={{ padding: '5px 12px', background: T.goldSoft, color: T.gold, border: `1px solid ${T.gold}55`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>View as</button>
                            <button onClick={() => onResetPassword(m)} disabled={adminBusy} style={{ padding: '5px 12px', background: 'transparent', color: T.dim, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Reset PW</button>
                            <button onClick={() => onRevoke(m)} disabled={adminBusy} style={{ padding: '5px 12px', background: 'transparent', color: T.neg, border: `1px solid ${T.neg}`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Revoke</button>
                          </>
                        )}
                      </div>
                      <div>{isMe && <span style={{ fontSize: 10, fontWeight: 700, color: T.gold, letterSpacing: '.06em', textTransform: 'uppercase' }}>You</span>}</div>
                    </div>
                  );
                })}
                {!loading && staffList.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: T.dim, fontSize: 13 }}>No teammates yet.</div>
                )}
              </div>
            </div>

            {/* Clients */}
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 12 }}>
                Client portal accounts {loading ? '· loading…' : `· ${clientList.length}`}
              </div>
              <p style={{ fontSize: 12, color: T.dim, lineHeight: 1.55, marginTop: 0, marginBottom: 12 }}>
                Provisioned via Invite Client to Portal from any project's Client tab.
              </p>
              <div style={{ display: 'grid', gap: 0, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                {clientList.map((m, idx) => {
                  const accessible = clientProjectsByUserId[m.user_id] || [];
                  return (
                    <div key={m.id} style={{ padding: '12px 16px', borderTop: idx === 0 ? 'none' : `1px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto auto auto', gap: 12, alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.cream }}>{m.name || m.email}</div>
                          <div style={{ fontSize: 11, color: T.dim, marginTop: 2, fontFamily: T.mono }}>{m.email}</div>
                        </div>
                        <button onClick={() => setClientMember(m)} style={{ padding: '5px 12px', background: 'transparent', color: T.cream, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Manage</button>
                        <button onClick={() => onResetPassword(m)} disabled={adminBusy} style={{ padding: '5px 12px', background: 'transparent', color: T.dim, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Reset PW</button>
                        <button onClick={() => onRevoke(m)} disabled={adminBusy} style={{ padding: '5px 12px', background: 'transparent', color: T.neg, border: `1px solid ${T.neg}`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Revoke</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase' }}>Access:</span>
                        {accessible.length === 0 ? (
                          <span style={{ fontSize: 11, color: T.dim, fontStyle: 'italic' }}>No projects yet</span>
                        ) : accessible.map((p) => (
                          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: T.inkSoft2, color: T.ink, border: `1px solid ${T.faintRule}`, fontFamily: T.sans }}>{p.name}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!loading && clientList.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: T.dim, fontSize: 13 }}>No client accounts yet.</div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {accessMember && <AccessModal member={accessMember} orgId={orgId} onClose={() => setAccessMember(null)} />}
      {clientMember && <ClientAccessModal member={clientMember} onClose={() => setClientMember(null)} onChanged={reload} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Access modal — per-project + per-section grants for a single member.
//
// Reads project_members rows for this user, presents every org project
// with a checkbox. Checking expands an inline grid of section toggles
// (defaulting to all-on). Updates write via PostgREST; RLS gates this
// to admin/ep/producer in the org.
// ─────────────────────────────────────────────────────────────────────
function AccessModal({ member, orgId, onClose }) {
  const [projects, setProjects] = useState([]);
  const [memberships, setMemberships] = useState({});  // { [project_id]: { id, sections } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Org-wide surface permissions from profiles.org_permissions. Loaded
  // alongside project memberships so a single modal manages both.
  const [surfacePerms, setSurfacePerms] = useState(() => {
    const defaults = defaultSurfacesForRole(member.role);
    return ORG_SURFACES.reduce((acc, s) => ({ ...acc, [s.id]: defaults.has(s.id) }), {});
  });

  // Initial load — projects in this org + member's existing memberships
  // + their org_permissions JSON if set.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [projRows, memRows, profRows] = await Promise.all([
          restFetch(`/projects?select=id,name,client&org_id=eq.${orgId}&order=created_at.desc`),
          restFetch(`/project_members?select=id,project_id,sections&user_id=eq.${member.user_id}`),
          restFetch(`/profiles?select=org_permissions&user_id=eq.${member.user_id}&org_id=eq.${orgId}&limit=1`),
        ]);
        if (cancelled) return;
        setProjects(projRows || []);
        const map = {};
        (memRows || []).forEach((r) => { map[r.project_id] = { id: r.id, sections: r.sections }; });
        setMemberships(map);
        const stored = profRows?.[0]?.org_permissions;
        if (stored && typeof stored === 'object') {
          // Merge stored permissions over the role default so any new
          // surface added in code defaults to ON for legacy profiles.
          const defaults = defaultSurfacesForRole(member.role);
          setSurfacePerms(ORG_SURFACES.reduce((acc, s) => ({
            ...acc, [s.id]: stored[s.id] ?? defaults.has(s.id),
          }), {}));
        }
      } catch (e) { console.warn('[access modal] load failed:', e?.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [member.user_id, orgId, member.role]);

  const toggleSurface = async (sid) => {
    const next = { ...surfacePerms, [sid]: !surfacePerms[sid] };
    setSurfacePerms(next);
    setSaving(true);
    try {
      // Find the target profile in this org and PATCH org_permissions.
      const profRows = await restFetch(`/profiles?select=id&user_id=eq.${member.user_id}&org_id=eq.${orgId}&limit=1`);
      const profId = profRows?.[0]?.id;
      if (profId) {
        await restFetch(`/profiles?id=eq.${profId}`, { method: 'PATCH', body: { org_permissions: next } });
      }
    } catch (e) {
      // Revert on failure
      setSurfacePerms(surfacePerms);
      alert(`Could not update: ${e.message || e}`);
    } finally { setSaving(false); }
  };

  const hasAccess = (pid) => !!memberships[pid];
  const sectionsFor = (pid) => {
    const m = memberships[pid];
    if (!m) return null;
    return m.sections || null;  // null = all
  };
  const isSectionOn = (pid, sec) => {
    const s = sectionsFor(pid);
    if (s === null || s === undefined) return true;  // no override = all on
    return s[sec] !== false;
  };

  const toggleAccess = async (pid) => {
    const existing = memberships[pid];
    setSaving(true);
    try {
      if (existing) {
        await restFetch(`/project_members?id=eq.${existing.id}`, { method: 'DELETE' });
        setMemberships((prev) => { const n = { ...prev }; delete n[pid]; return n; });
      } else {
        const inserted = await restFetch('/project_members', {
          method: 'POST',
          body: { project_id: pid, user_id: member.user_id, sections: null },
        });
        const row = Array.isArray(inserted) ? inserted[0] : inserted;
        if (row) setMemberships((prev) => ({ ...prev, [pid]: { id: row.id, sections: row.sections } }));
      }
    } catch (e) { alert(`Could not update: ${e.message || e}`); }
    finally { setSaving(false); }
  };

  const toggleSection = async (pid, sec) => {
    const existing = memberships[pid];
    if (!existing) return;
    const current = existing.sections || {};
    // If sections is null (all-on), expand it to an explicit object
    // first so we can flip one off without losing the others.
    const expanded = existing.sections
      ? { ...current }
      : PROJECT_SECTIONS.reduce((acc, s) => ({ ...acc, [s.id]: true }), {});
    expanded[sec] = !isSectionOn(pid, sec);
    // If every section is now true, collapse back to null (all-on).
    const allOn = PROJECT_SECTIONS.every((s) => expanded[s.id] !== false);
    const next = allOn ? null : expanded;
    setSaving(true);
    // Optimistic update
    setMemberships((prev) => ({ ...prev, [pid]: { ...existing, sections: next } }));
    try {
      await restFetch(`/project_members?id=eq.${existing.id}`, {
        method: 'PATCH',
        body: { sections: next },
      });
    } catch (e) {
      alert(`Could not update: ${e.message || e}`);
      // Revert on failure
      setMemberships((prev) => ({ ...prev, [pid]: existing }));
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,82,186,.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', background: T.bg, border: `1px solid ${T.borderGlow}`, borderRadius: T.r, boxShadow: '0 24px 80px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase' }}>Access</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.cream, marginTop: 2 }}>{member.name || member.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 24px' }}>
          {/* Org-wide surfaces — same picker as the invite form so the
              admin can tighten or loosen access after the fact. */}
          <div style={{ marginBottom: 18, padding: 14, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 10 }}>Org-wide surfaces</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 6 }}>
              {ORG_SURFACES.map((s) => {
                const on = !!surfacePerms[s.id];
                return (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.inkSoft : 'transparent', borderRadius: T.rS, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                    <input type="checkbox" checked={on} disabled={saving} onChange={() => toggleSurface(s.id)} style={{ accentColor: T.ink, cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.cream }}>{s.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: T.dim, fontSize: 13 }}>Loading…</div>
          ) : projects.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: T.dim, fontSize: 13 }}>No projects in this org yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {projects.map((p) => {
                const access = hasAccess(p.id);
                return (
                  <div key={p.id} style={{ border: `1px solid ${T.border}`, borderRadius: T.rS, background: T.surface, padding: '12px 14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={access} disabled={saving} onChange={() => toggleAccess(p.id)} style={{ accentColor: T.ink, cursor: 'pointer' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.cream, display: 'block' }}>{p.name}</span>
                        {p.client && <span style={{ fontSize: 11, color: T.dim, marginTop: 2, display: 'block' }}>{p.client}</span>}
                      </span>
                      {access && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: sectionsFor(p.id) === null ? T.pos : T.gold, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                          {sectionsFor(p.id) === null ? 'All sections' : 'Limited'}
                        </span>
                      )}
                    </label>

                    {access && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Sections</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 6 }}>
                          {PROJECT_SECTIONS.map((s) => {
                            const on = isSectionOn(p.id, s.id);
                            return (
                              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: on ? T.cream : T.dim }}>
                                <input type="checkbox" checked={on} disabled={saving} onChange={() => toggleSection(p.id, s.id)} style={{ accentColor: T.ink, cursor: 'pointer' }} />
                                {s.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: T.dim }}>
            {saving ? 'Saving…' : Object.keys(memberships).length === 0 ? 'No project access yet' : `${Object.keys(memberships).length} project${Object.keys(memberships).length === 1 ? '' : 's'}`}
          </span>
          <button onClick={onClose} style={primaryBtn(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Client Access modal — read-only list of which projects this client
// is linked to via project_clients, with a per-row remove button.
// ─────────────────────────────────────────────────────────────────────
function ClientAccessModal({ member, onClose, onChanged }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // project_clients RLS lets the staff caller see all rows for
        // projects in their org. We embed the project name/client so
        // the list reads clearly.
        const rows = await restFetch(`/project_clients?select=id,project_id,invited_at,last_seen_at,project:projects(id,name,client)&user_id=eq.${member.user_id}&order=invited_at.desc`);
        if (!cancelled) setLinks(rows || []);
      } catch (e) { console.warn('[client access] load failed:', e?.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [member.user_id]);

  const removeLink = async (linkId) => {
    if (!confirm('Remove this client from this project? They will lose portal access to it.')) return;
    setBusy(true);
    try {
      await restFetch(`/project_clients?id=eq.${linkId}`, { method: 'DELETE' });
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      onChanged?.();
    } catch (e) { alert(`Could not remove: ${e.message || e}`); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,82,186,.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'hidden', background: T.bg, border: `1px solid ${T.borderGlow}`, borderRadius: T.r, boxShadow: '0 24px 80px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase' }}>Client portal access</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.cream, marginTop: 2 }}>{member.name || member.email}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: T.mono, marginTop: 2 }}>{member.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 24px' }}>
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: T.dim, fontSize: 13 }}>Loading…</div>
          ) : links.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: T.dim, fontSize: 13 }}>
              No project links. Invite them again from a project's Client tab.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {links.map((l) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', border: `1px solid ${T.border}`, borderRadius: T.rS, background: T.surface, padding: '12px 14px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.cream }}>{l.project?.name || 'Unknown project'}</div>
                    {l.project?.client && <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{l.project.client}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
                    {l.last_seen_at ? `Seen ${new Date(l.last_seen_at).toLocaleDateString()}` : 'Never opened'}
                  </span>
                  <button onClick={() => removeLink(l.id)} disabled={busy} style={{ padding: '5px 12px', background: 'transparent', color: T.neg, border: `1px solid ${T.neg}`, borderRadius: T.rS, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', fontFamily: T.sans, opacity: busy ? 0.5 : 1 }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={primaryBtn(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Appearance
// ─────────────────────────────────────────────────────────────────────
function AppearanceSection({ toggleTheme, themeMode }) {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.cream, letterSpacing: '-0.02em', margin: 0 }}>Appearance</h2>
      <p style={{ fontSize: 13, color: T.dim, lineHeight: 1.55, marginTop: 6 }}>How Morgan looks for you. Stored per browser.</p>

      <div style={{ marginTop: 24, padding: 20, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 12 }}>Theme</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['light', 'Light (paper)'], ['dark', 'Dark (ink)']].map(([k, l]) => (
            <button key={k} onClick={() => { if (themeMode !== k) toggleTheme(); }} style={{
              padding: '12px 22px', borderRadius: T.rS,
              border: `1px solid ${themeMode === k ? T.ink : T.border}`,
              background: themeMode === k ? T.ink : 'transparent',
              color: themeMode === k ? T.paper : T.cream,
              fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              cursor: themeMode === k ? 'default' : 'pointer',
              fontFamily: T.sans, transition: 'all .15s',
            }}>{l}</button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, marginTop: 14, marginBottom: 0 }}>
          Switching reloads the page so all surfaces pick up the new tokens cleanly.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Organization
// ─────────────────────────────────────────────────────────────────────
// Persisted to localStorage `es_org` — read by emailTemplates / exports
// for the branded "Prepared in Morgan" footer + signatures.
function OrganizationSection({ orgId, organizations }) {
  const orgRow = useMemo(() => (organizations || []).find((o) => o.id === orgId), [organizations, orgId]);

  const [form, setForm] = useState(() => {
    try { return JSON.parse(localStorage.getItem('es_org') || '{}') || {}; } catch (e) { return {}; }
  });
  const [saved, setSaved] = useState(false);

  const updateField = (k, v) => { setForm((prev) => ({ ...prev, [k]: v })); setSaved(false); };

  const save = () => {
    try { localStorage.setItem('es_org', JSON.stringify(form)); setSaved(true); setTimeout(() => setSaved(false), 2400); } catch (e) {}
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.cream, letterSpacing: '-0.02em', margin: 0 }}>Organization</h2>
      <p style={{ fontSize: 13, color: T.dim, lineHeight: 1.55, marginTop: 6 }}>
        These appear in branded emails, PDF footers, and the client portal.
      </p>

      <div style={{ marginTop: 24, padding: 24, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Display name</label>
            <input value={form.name || orgRow?.name || ''} onChange={(e) => updateField('name', e.target.value)} placeholder="Early Spring" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input value={form.website || ''} onChange={(e) => updateField('website', e.target.value)} placeholder="earlyspring.nyc" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Mailing address</label>
          <input value={form.address || ''} onChange={(e) => updateField('address', e.target.value)} placeholder="385 Van Brunt St, Floor 2, Brooklyn NY 11231" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Logo URL (optional)</label>
          <input value={form.logo || ''} onChange={(e) => updateField('logo', e.target.value)} placeholder="https://… (data URL or hosted image)" style={inputStyle} />
          <p style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, marginTop: 6 }}>If set, used in branded email headers instead of the Early Spring wordmark.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} style={primaryBtn(false)}>Save</button>
          {saved && <span style={{ fontSize: 12, color: T.pos, fontWeight: 600 }}>Saved.</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Integrations
// ─────────────────────────────────────────────────────────────────────
function IntegrationsSection({ accessToken, requestCalendarAccess, orgId, user }) {
  const [reconnecting, setReconnecting] = useState(false);

  const reconnectGoogle = async () => {
    setReconnecting(true);
    try {
      // requestCalendarAccess routes through sbAuth.refreshToken which
      // triggers OAuth re-consent if no refresh token is on file.
      await requestCalendarAccess?.();
    } catch (e) {}
    setReconnecting(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.cream, letterSpacing: '-0.02em', margin: 0 }}>Integrations</h2>
      <p style={{ fontSize: 13, color: T.dim, lineHeight: 1.55, marginTop: 6 }}>
        Connected services Morgan uses to send emails, sync meetings, and pull data.
      </p>

      <div style={{ marginTop: 24, display: 'grid', gap: 14 }}>
        {/* Google */}
        <div style={{ padding: 20, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.cream }}>Google</div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>
              Gmail send + Calendar + Drive + Contacts. {accessToken ? 'Currently connected.' : 'Not connected.'}
            </div>
          </div>
          <button onClick={reconnectGoogle} disabled={reconnecting} style={secondaryBtn()}>
            {reconnecting ? 'Reconnecting…' : accessToken ? 'Reconnect' : 'Connect Google'}
          </button>
        </div>

        {/* Gmail Add-on — device-flow OAuth approval + device list */}
        <GmailAddonRow user={user} />

        {/* Fireflies — read from localStorage for now (per-project keys remain) */}
        <FirefliesRow />

        {/* Slack — env-var based today, surface status only */}
        <div style={{ padding: 20, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.cream }}>Slack</div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>
              Pings on project stage transitions. Webhook is configured server-side via the SLACK_WEBHOOK_URL env var on Vercel.
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase' }}>Server-side</span>
        </div>
      </div>
    </div>
  );
}

// Gmail Add-on connection management.
// Two responsibilities:
//   1. If the user arrived here via ?addon_code=XXXX-XXXX (the
//      verification URL the add-on opens after the user clicks
//      "Connect to Morgan"), prompt them to approve that pending
//      device. POSTs to /api/addon-auth/approve which mints the
//      refresh token the add-on then polls for.
//   2. Show a list of devices already approved for this user, with
//      a Revoke button per row.
function GmailAddonRow({ user }) {
  const userId = user?.user_id || user?.id;
  const [pendingCode, setPendingCode] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('addon_code'); }
    catch (e) { return null; }
  });
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [approveStatus, setApproveStatus] = useState('');

  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const loadDevices = useCallback(async () => {
    if (!userId) return;
    setLoadingDevices(true);
    try {
      const rows = await restFetch(
        `/addon_devices?select=id,device_label,approved_at,last_used_at,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.approved&order=approved_at.desc&limit=20`,
      );
      setDevices(rows || []);
    } catch (e) {
      console.warn('[addon] device list failed:', e);
      setDevices([]);
    } finally { setLoadingDevices(false); }
  }, [userId]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const approve = async () => {
    if (!pendingCode || approving) return;
    setApproving(true); setApproveError(''); setApproveStatus('');
    try {
      const { getSession } = await import('../lib/db.js');
      const s = await getSession();
      const jwt = s?.access_token;
      if (!jwt) throw new Error('Not signed in to Supabase');
      const res = await fetch('/api/addon-auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ user_code: pendingCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setApproveStatus('Approved. You can close this tab and return to Gmail.');
      // Clear the URL param so a page refresh doesn't re-prompt.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('addon_code');
        window.history.replaceState({}, '', url.toString());
      } catch (e) {}
      setPendingCode(null);
      loadDevices();
    } catch (e) {
      setApproveError(e.message || String(e));
    } finally { setApproving(false); }
  };

  const cancel = () => {
    setPendingCode(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('addon_code');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {}
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this connection? The add-on will need to reconnect.')) return;
    try {
      await restFetch(`/addon_devices?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { status: 'revoked', revoked_at: new Date().toISOString() },
      });
      loadDevices();
    } catch (e) {
      alert(`Failed to revoke: ${e.message || e}`);
    }
  };

  const fmtTime = (iso) => {
    if (!iso) return 'never';
    try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return iso; }
  };

  return (
    <div style={{ padding: 20, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.cream }}>Gmail Add-on</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>
            Connect Morgan inside Gmail so you can add senders to your CRM with one click.
          </div>
        </div>
      </div>

      {pendingCode && (
        <div style={{ padding: 14, border: `1px solid ${T.borderGlow || T.gold}`, borderRadius: T.rS, background: 'rgba(240,184,73,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.gold, letterSpacing: '.08em', textTransform: 'uppercase' }}>Approve connection</div>
          <div style={{ fontSize: 12, color: T.cream, marginTop: 6, lineHeight: 1.5 }}>
            Your Gmail Add-on is requesting access to Morgan as <strong>{user?.email || 'you'}</strong>.
          </div>
          <div style={{ fontSize: 10, color: T.dim, marginTop: 4, fontFamily: T.mono }}>Code: {pendingCode}</div>
          {approveStatus && <div style={{ fontSize: 12, color: T.pos, marginTop: 8 }}>{approveStatus}</div>}
          {approveError && <div style={{ fontSize: 12, color: '#c53030', marginTop: 8 }}>{approveError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={approve} disabled={approving} style={primaryBtn(approving)}>{approving ? 'Approving…' : 'Approve'}</button>
            <button onClick={cancel} disabled={approving} style={secondaryBtn()}>Cancel</button>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Connected devices
        </div>
        {loadingDevices ? (
          <div style={{ fontSize: 12, color: T.dim }}>Loading…</div>
        ) : devices.length === 0 ? (
          <div style={{ fontSize: 12, color: T.dim, fontStyle: 'italic' }}>No connected devices yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {devices.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${T.faintRule}`, borderRadius: T.rS, background: T.inkSoft2 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.cream }}>{d.device_label || 'Unnamed device'}</div>
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 2, fontFamily: T.mono }}>
                    approved {fmtTime(d.approved_at)} · last used {fmtTime(d.last_used_at)}
                  </div>
                </div>
                <button onClick={() => revoke(d.id)} style={{ ...secondaryBtn(), padding: '6px 12px', fontSize: 10 }}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FirefliesRow() {
  const [key, setKey] = useState(() => { try { return localStorage.getItem('es_fireflies_key') || ''; } catch (e) { return ''; } });
  const [saved, setSaved] = useState(false);
  const save = () => { try { localStorage.setItem('es_fireflies_key', key); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch (e) {} };
  return (
    <div style={{ padding: 20, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.cream }}>Fireflies</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>Default API key used to sync transcripts when a project doesn't have its own key set.</div>
        </div>
        {saved && <span style={{ fontSize: 11, color: T.pos, fontWeight: 600 }}>Saved.</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={key} onChange={(e) => { setKey(e.target.value); setSaved(false); }} placeholder="ff_…" type="password" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={save} style={secondaryBtn()}>Save</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared style helpers
// ─────────────────────────────────────────────────────────────────────
const labelStyle = { display: 'block', fontSize: 10, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.bg, color: T.cream, fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' };
const primaryBtn = (disabled) => ({ padding: '10px 22px', background: T.ink, color: T.paper, border: 'none', borderRadius: T.rS, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontFamily: T.sans });
const secondaryBtn = () => ({ padding: '9px 18px', background: 'transparent', color: T.cream, border: `1px solid ${T.border}`, borderRadius: T.rS, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans });

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: T.cream, fontFamily: mono ? T.mono : T.sans, wordBreak: 'break-all', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
