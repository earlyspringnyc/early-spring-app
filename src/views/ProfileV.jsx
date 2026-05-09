import { useState, useRef, useEffect, useCallback } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { ROLES, ROLE_LABELS, ROLE_COLORS, PERMISSION_LABELS } from '../constants/index.js';
import { PlusI, TrashI } from '../components/icons/index.js';
import { Card } from '../components/primitives/index.js';
import { getStoredUsers, saveUsers } from '../utils/storage.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { getTeamMembers, inviteTeamMember as dbInvite, updateTeamMember as dbUpdateMember, removeTeamMember as dbRemoveMember, getPendingInvitations, revokeInvitation } from '../lib/db.js';

function ProfileV({ user, updateProject, project, onUpdateUser, orgId }) {
  const isAdmin = user?.role === 'admin';
  const[org,setOrg]=useState(()=>{try{return JSON.parse(localStorage.getItem("es_org"))||{name:"",logo:"",address:"",website:""}}catch(e){return{name:"",logo:"",address:"",website:""}}});
  const updateOrg=(updates)=>{const next={...org,...updates};setOrg(next);try{localStorage.setItem("es_org",JSON.stringify(next))}catch(e){}};
  const orgLogoRef=useRef(null);
  const handleOrgLogo=(e)=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>updateOrg({logo:ev.target.result});reader.readAsDataURL(file)};
  const usesSupa = isSupabaseConfigured();
  const [team, setTeam] = useState(usesSupa ? [] : getStoredUsers);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteError, setInviteError] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invRole, setInvRole] = useState("producer");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarRef = useRef(null);

  const loadTeam = useCallback(async () => {
    if (!usesSupa || !orgId) return;
    const members = await getTeamMembers(orgId);
    setTeam(members);
    const invites = await getPendingInvitations(orgId);
    setPendingInvites(invites);
  }, [usesSupa, orgId]);

  useEffect(() => { loadTeam() }, [loadTeam]);

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarUploading(true);
    const reader = new FileReader();
    reader.onload = ev => {
      const avatar = ev.target.result;
      if (!usesSupa) {
        const updated = team.map(u => u.id === user?.id ? { ...u, avatar } : u);
        setTeam(updated);
        saveUsers(updated);
      }
      if (onUpdateUser) onUpdateUser({ ...user, avatar });
      try { const u = JSON.parse(localStorage.getItem("es_user") || "{}"); localStorage.setItem("es_user", JSON.stringify({ ...u, avatar })); } catch (e) {}
      setAvatarUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const addTeamMember = async () => {
    if (!invEmail.trim()) return;
    setInviteError(null);
    if (usesSupa && orgId) {
      const result = await dbInvite(orgId, invEmail.trim(), invRole, user?.id);
      if (result?.error) { setInviteError(result.error); return; }
      setInvEmail(""); setInvName(""); setInvRole("producer"); setShowInvite(false);
      await loadTeam();
    } else {
      if (!invName.trim()) return;
      const perms = invRole === "admin"
        ? { budget: true, timeline: true, vendors: true, pnl: true, docs: true, ros: true, client: true, ai: true, settings: true }
        : invRole === "producer"
        ? { budget: true, timeline: true, vendors: true, pnl: true, docs: true, ros: true, client: false, ai: true, settings: false }
        : { budget: false, timeline: false, vendors: false, pnl: false, docs: false, ros: false, client: true, ai: false, settings: false };
      const u = { id: uid(), email: invEmail.trim(), name: invName.trim(), role: invRole, avatar: "", permissions: perms };
      const updated = [...team, u];
      setTeam(updated); saveUsers(updated);
      setInvEmail(""); setInvName(""); setInvRole("producer"); setShowInvite(false);
    }
  };

  const removeTeamMember = async (id) => {
    if (id === user?.id) return;
    if (usesSupa) { await dbRemoveMember(id); await loadTeam(); }
    else { const updated = team.filter(u => u.id !== id); setTeam(updated); saveUsers(updated); }
  };

  const updateTeamRole = async (id, role) => {
    const perms = role === "admin"
      ? { budget: true, timeline: true, vendors: true, pnl: true, docs: true, ros: true, client: true, ai: true, settings: true }
      : role === "producer"
      ? { budget: true, timeline: true, vendors: true, pnl: true, docs: true, ros: true, client: false, ai: true, settings: false }
      : { budget: false, timeline: false, vendors: false, pnl: false, docs: false, ros: false, client: true, ai: false, settings: false };
    if (usesSupa) { await dbUpdateMember(id, { role, permissions: perms }); await loadTeam(); }
    else { const updated = team.map(u => u.id === id ? { ...u, role, permissions: perms } : u); setTeam(updated); saveUsers(updated); }
  };

  const togglePermission = async (id, perm) => {
    const member = team.find(u => u.id === id); if (!member) return;
    const newPerms = { ...member.permissions, [perm]: !member.permissions?.[perm] };
    if (usesSupa) { await dbUpdateMember(id, { permissions: newPerms }); await loadTeam(); }
    else { const updated = team.map(u => u.id === id ? { ...u, permissions: newPerms } : u); setTeam(updated); saveUsers(updated); }
  };

  const handleRevokeInvitation = async (invId) => {
    await revokeInvitation(invId);
    await loadTeam();
  };

  const currentUser = team.find(u => u.id === user?.id) || user;

  return <div style={{ maxWidth: 700 }}>
    <div style={{ marginBottom: 24 }}><h1 style={{ fontSize: 20, fontWeight: 600, color: T.cream, letterSpacing: "-0.01em" }}>Profile</h1><p style={{ fontSize: 13, color: T.dim, marginTop: 6 }}>Your account and team</p></div>

    {/* Profile Card */}
    <Card style={{ padding: 28, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <input ref={avatarRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
        <div onClick={() => avatarRef.current?.click()} style={{ position: "relative", cursor: "pointer" }}>
          {currentUser.avatar || currentUser.avatar_url
            ? <img src={currentUser.avatar || currentUser.avatar_url} alt={currentUser.name} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${T.border}` }} />
            : <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.inkSoft, border: `2px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: T.gold }}>{(currentUser.name || currentUser.email || "?")[0]}</div>
          }
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: T.surfEl, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, color: T.dim }}>📷</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.cream }}>{currentUser.name || currentUser.email}</div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{currentUser.email}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 8, background: `${ROLE_COLORS[currentUser.role]}18`, color: ROLE_COLORS[currentUser.role], textTransform: "uppercase" }}>{ROLE_LABELS[currentUser.role] || currentUser.role}</span>
          </div>
        </div>
      </div>
    </Card>

    {/* Team Management */}
    <Card style={{ padding: 28, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: ".08em", color: T.cream }}>Team ({team.length})</div>
        {isAdmin && <button onClick={() => setShowInvite(!showInvite)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: showInvite ? "transparent" : T.ink, color: showInvite ? T.dim : T.brown, border: showInvite ? `1px solid ${T.border}` : "none", borderRadius: T.rS, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.sans }}>{showInvite ? "Cancel" : "+ Invite"}</button>}
      </div>

      {showInvite && <div style={{ marginBottom: 16, padding: 16, borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Name</label><input autoFocus value={invName} onChange={e => setInvName(e.target.value)} placeholder="Name" style={{ width: "100%", padding: "8px 10px", borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}`, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: "none" }} /></div>
          <div><label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Email</label><input value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="user@gmail.com" onKeyDown={e => e.key === "Enter" && addTeamMember()} style={{ width: "100%", padding: "8px 10px", borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}`, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: "none" }} /></div>
          <div><label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Role</label><select value={invRole} onChange={e => setInvRole(e.target.value)} style={{ width: "100%", padding: "8px 8px", borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}`, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: "none", appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={addTeamMember} disabled={!invEmail.trim() || (!(usesSupa && orgId) && !invName.trim())} style={{ padding: "7px 16px", background: invEmail.trim() ? T.ink : T.inkSoft2, color: invEmail.trim() ? T.brown : T.fadedInk, border: "none", borderRadius: T.rS, fontSize: 11, fontWeight: 700, cursor: invEmail.trim() ? "pointer" : "default", fontFamily: T.sans }}>{usesSupa ? "Send Invitation" : "Invite Team Member"}</button>
          {inviteError && <span style={{ fontSize: 11, color: T.neg }}>{inviteError}</span>}
        </div>
      </div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {team.map(u => <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: T.rS, background: T.surfEl, border: `1px solid ${T.border}` }}>
          {u.avatar || u.avatar_url
            ? <img src={u.avatar || u.avatar_url} alt={u.name} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: `1px solid ${T.border}`, flexShrink: 0 }} />
            : <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg,${ROLE_COLORS[u.role]}22,${ROLE_COLORS[u.role]}08)`, border: `1.5px solid ${ROLE_COLORS[u.role]}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: ROLE_COLORS[u.role], flexShrink: 0 }}>{(u.name || "?")[0]}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight:600, color: T.cream }}>{u.name}{u.id === user?.id && <span style={{ fontSize: 10, color: T.dim, marginLeft: 6 }}>(you)</span>}</div>
            <div style={{ fontSize: 10, color: T.dim }}>{u.email}</div>
          </div>
          {isAdmin && <select value={u.role} onChange={e => updateTeamRole(u.id, e.target.value)} disabled={u.id === user?.id} style={{ padding: "4px 6px", borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: ROLE_COLORS[u.role], fontSize: 10, fontFamily: T.sans, outline: "none", cursor: u.id === user?.id ? "default" : "pointer", appearance: "none", WebkitAppearance: "none" }}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>}
          {isAdmin && <div style={{ display: "flex", gap: 2, flexWrap: "wrap", maxWidth: 200 }}>
            {Object.entries(PERMISSION_LABELS).map(([k, label]) => <button key={k} onClick={() => u.id !== user?.id && togglePermission(u.id, k)} disabled={u.id === user?.id} style={{ padding: "2px 6px", borderRadius: 4, border: "none", fontSize: 10, fontWeight: u.permissions?.[k] ? 600 : 400, cursor: u.id === user?.id ? "default" : "pointer", background: u.permissions?.[k] ? "rgba(255,234,151,.1)" : "transparent", color: u.permissions?.[k] ? T.gold : T.dim, transition: "all .15s" }}>{label}</button>)}
          </div>}
          {isAdmin && u.id !== user?.id && <button onClick={() => { if (confirm(`Remove "${u.name}"?`)) removeTeamMember(u.id) }} style={{ background: "none", border: "none", cursor: "pointer", opacity: .2, padding: 2, flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = .2}><TrashI size={11} color={T.neg} /></button>}
        </div>)}
      </div>
      {pendingInvites.length > 0 && <>
        <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 16, marginBottom: 8 }}>Pending Invitations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {pendingInvites.map(inv => <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: T.rS, background: T.surface, border: `1px dashed ${T.border}` }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,234,151,.06)", border: "1.5px dashed rgba(255,234,151,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.gold, flexShrink: 0 }}>?</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.cream }}>{inv.email}</div>
              <div style={{ fontSize: 10, color: T.dim }}>Invited as {ROLE_LABELS[inv.role] || inv.role}</div>
            </div>
            <span style={{ fontSize: 10, color: T.gold, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: "rgba(255,234,151,.08)" }}>Pending</span>
            {isAdmin && <button onClick={() => handleRevokeInvitation(inv.id)} style={{ background: "none", border: "none", cursor: "pointer", opacity: .3, padding: 2, flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = .3}><TrashI size={11} color={T.neg} /></button>}
          </div>)}
        </div>
      </>}
    </Card>

    {/* Organization */}
    <Card style={{padding:28,marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:18}}>Organization</div>
      <input ref={orgLogoRef} type="file" accept="image/*,.svg" onChange={handleOrgLogo} style={{display:"none"}}/>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
        {org.logo?<div onClick={()=>orgLogoRef.current?.click()} style={{width:56,height:56,borderRadius:T.rS,border:`1px solid ${T.border}`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><img src={org.logo} alt="Org logo" style={{maxWidth:52,maxHeight:52,objectFit:"contain"}}/></div>
        :<div onClick={()=>orgLogoRef.current?.click()} style={{width:56,height:56,borderRadius:T.rS,border:`2px dashed ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexDirection:"column",gap:2}}><span style={{fontSize:16,opacity:.3}}>◈</span><span style={{fontSize:10,color:T.dim}}>Logo</span></div>}
        <div style={{flex:1}}>
          <p style={{fontSize:10,color:T.dim}}>Your logo replaces the Early Spring logo in the sidebar, exports, and emails.</p>
          {org.logo&&<button onClick={()=>updateOrg({logo:""})} style={{fontSize:10,color:T.neg,background:"none",border:"none",cursor:"pointer",marginTop:4}}>Remove logo</button>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Organization Name</label><input value={org.name} onChange={e=>updateOrg({name:e.target.value})} placeholder="Your Company" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Website</label><input value={org.website} onChange={e=>updateOrg({website:e.target.value})} placeholder="https://yourcompany.com" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
      </div>
      <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Address (for PDFs & exports)</label><input value={org.address} onChange={e=>updateOrg({address:e.target.value})} placeholder="385 Van Brunt St, Floor 2, Brooklyn, NY 11231" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
    </Card>

    {/* Roles Explained */}
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: ".08em", color: T.cream, marginBottom: 12 }}>Roles</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {ROLES.map(r => <div key={r} style={{ padding: "12px 14px", borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: ROLE_COLORS[r], marginBottom: 6 }}>{ROLE_LABELS[r]}</div>
          <div style={{ fontSize: 10, color: T.dim, lineHeight: 1.5 }}>
            {r === "ep" && "Cross-project dashboard with budget health, staffing overview, and event timelines."}
            {r === "admin" && "Full access. Manage team, settings, budgets, and all project data."}
            {r === "producer" && "Edit budgets, timeline, vendors, and documents. No team or settings access."}
            {r === "creative" && "Access to timeline, documents, and AI assistant."}
            {r === "finance" && "Access to budgets, P&L, and vendor management."}
            {r === "accounts" && "Access to budgets, P&L, and documents."}
            {r === "production" && "Access to timeline, vendors, run of show, and documents."}
            {r === "client" && "View-only access to client-facing content. Cannot edit project data."}
          </div>
        </div>)}
      </div>
    </Card>
  </div>;
}

export default ProfileV;
