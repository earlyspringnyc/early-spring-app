import { useState, useRef, useEffect, useCallback } from 'react';
import T from '../theme/tokens.js';
import { fp } from '../utils/format.js';
import { uid } from '../utils/uid.js';
import { ROLES, ROLE_LABELS, ROLE_COLORS, PERMISSION_LABELS, PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS } from '../constants/index.js';
import { getStoredUsers, saveUsers } from '../utils/storage.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { getTeamMembers, inviteTeamMember as dbInvite, updateTeamMember as dbUpdateMember, removeTeamMember as dbRemoveMember, getPendingInvitations, revokeInvitation } from '../lib/db.js';
import { PlusI, TrashI } from '../components/icons/index.js';
import { Card, DatePick } from '../components/primitives/index.js';

function SetV({project,updateProject,onDelete,user,accessToken,orgId}){
  const isAdmin=user?.role==="admin";
  const[sharedDrives,setSharedDrives]=useState([]);
  const[loadingDrives,setLoadingDrives]=useState(false);
  const[driveSetup,setDriveSetup]=useState(false);

  const loadSharedDrives=async()=>{
    if(!accessToken)return;
    setLoadingDrives(true);
    try{
      const res=await fetch("https://www.googleapis.com/drive/v3/drives?pageSize=50",{headers:{Authorization:`Bearer ${accessToken}`}});
      if(res.ok){const data=await res.json();setSharedDrives(data.drives||[])}
    }catch(e){console.error("[drive] Failed to load shared drives:",e)}
    setLoadingDrives(false);
  };

  const[driveCreating,setDriveCreating]=useState(false);
  const[driveCreated,setDriveCreated]=useState(false);

  const setDriveLocation=async(driveId,driveName)=>{
    updateProject({driveLocation:{driveId,driveName:driveName||"My Drive"}});
    setDriveCreating(true);
    if(accessToken){
      try{
        const{createProjectFoldersInDrive,shareWithTeam}=await import('../utils/drive.js');
        const folderIds=await createProjectFoldersInDrive(accessToken,project.name||"Untitled",driveId,project.stage||"pitching",project.client||"General");
        if(folderIds){
          updateProject({driveFolders:folderIds});
          // Share with team based on roles
          if(!driveId){
            const team=getStoredUsers();
            if(team.length)await shareWithTeam(accessToken,folderIds,team);
          }
          setDriveCreated(true);
          setTimeout(()=>setDriveCreated(false),3000);
        }
      }catch(e){console.error("[drive]",e)}
    }
    setDriveCreating(false);
    setDriveSetup(false);
  };

  const setupDriveQuick=async()=>{
    if(!accessToken){alert("Sign in with Google to set up Drive");return}
    const driveLoc=(()=>{try{const s=localStorage.getItem("es_drive_location");return s?JSON.parse(s):null}catch(e){return null}})();
    await setDriveLocation(driveLoc?.driveId||null,driveLoc?.driveName||"My Drive");
  };
  const usesSupa=isSupabaseConfigured();
  const[team,setTeam]=useState(usesSupa?[]:getStoredUsers);
  const[pendingInvites,setPendingInvites]=useState([]);
  const[inviteError,setInviteError]=useState(null);

  // Load team from Supabase when available
  const loadTeam=useCallback(async()=>{
    if(!usesSupa||!orgId)return;
    const members=await getTeamMembers(orgId);
    setTeam(members);
    const invites=await getPendingInvitations(orgId);
    setPendingInvites(invites);
  },[usesSupa,orgId]);

  useEffect(()=>{loadTeam()},[loadTeam]);

  const[showAddUser,setShowAddUser]=useState(false);
  const[nuEmail,setNuEmail]=useState("");const[nuName,setNuName]=useState("");const[nuRole,setNuRole]=useState("producer");
  const defaultPerms=(role)=>role==="admin"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:true,ai:true,settings:true}:role==="producer"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:false,ai:true,settings:false}:{budget:false,timeline:false,vendors:false,pnl:false,docs:false,ros:false,client:true,ai:false,settings:false};
  const[nuPerms,setNuPerms]=useState(()=>defaultPerms("producer"));
  const toggleNuPerm=(perm)=>setNuPerms(p=>({...p,[perm]:!p[perm]}));
  const handleNuRoleChange=(role)=>{setNuRole(role);setNuPerms(defaultPerms(role))};
  const addTeamMember=async()=>{
    if(!nuEmail.trim()||!nuName.trim())return;
    setInviteError(null);
    if(usesSupa&&orgId){
      const result=await dbInvite(orgId,nuEmail.trim(),nuRole,user?.id);
      if(result?.error){setInviteError(result.error);return}
      setNuEmail("");setNuName("");setNuRole("producer");setNuPerms(defaultPerms("producer"));setShowAddUser(false);
      await loadTeam();
    }else{
      const u={id:uid(),email:nuEmail.trim(),name:nuName.trim(),role:nuRole,avatar:"",permissions:nuPerms};
      const updated=[...team,u];setTeam(updated);saveUsers(updated);setNuEmail("");setNuName("");setNuRole("producer");setNuPerms(defaultPerms("producer"));setShowAddUser(false);
    }
  };
  const removeTeamMember=async(id)=>{
    if(id===user?.id)return;
    if(usesSupa){await dbRemoveMember(id);await loadTeam()}
    else{const updated=team.filter(u=>u.id!==id);setTeam(updated);saveUsers(updated)}
  };
  const updateTeamRole=async(id,role)=>{
    const perms=role==="admin"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:true,ai:true,settings:true}:role==="producer"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:false,ai:true,settings:false}:{budget:false,timeline:false,vendors:false,pnl:false,docs:false,ros:false,client:true,ai:false,settings:false};
    if(usesSupa){await dbUpdateMember(id,{role,permissions:perms});await loadTeam()}
    else{const updated=team.map(u=>u.id===id?{...u,role,permissions:perms}:u);setTeam(updated);saveUsers(updated)}
  };
  const togglePermission=async(id,perm)=>{
    const member=team.find(u=>u.id===id);if(!member)return;
    const newPerms={...member.permissions,[perm]:!member.permissions?.[perm]};
    if(usesSupa){await dbUpdateMember(id,{permissions:newPerms});await loadTeam()}
    else{const updated=team.map(u=>u.id===id?{...u,permissions:newPerms}:u);setTeam(updated);saveUsers(updated)}
  };
  const handleRevokeInvitation=async(invId)=>{
    await revokeInvitation(invId);
    await loadTeam();
  };
  const F=({label,field})=><div style={{marginBottom:18}}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>{label}</label>
    <input value={project[field]||""} onChange={e=>updateProject({[field]:e.target.value})} style={{width:"100%",padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>;
  const logoRef=useRef(null);
  const handleLogo=(e)=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>updateProject({logo:ev.target.result});reader.readAsDataURL(file)};
  return<div style={{maxWidth:isAdmin?700:500}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:20,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>Settings</h1><p style={{fontSize:13,color:T.dim,marginTop:6}}>Changes save automatically</p></div>
    </div>
    <Card style={{padding:28,marginBottom:16}}><div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:18}}>Project Information</div><F label="Project Name" field="name"/><F label="Client" field="client"/>
      <div style={{marginBottom:18}}>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>Client Logo</label>
        <input ref={logoRef} type="file" accept="image/*,.svg" onChange={handleLogo} style={{display:"none"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {project.logo?<div style={{width:48,height:48,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}><img src={project.logo} style={{maxWidth:44,maxHeight:44,objectFit:"contain"}}/></div>
            :<div onClick={()=>logoRef.current.click()} style={{width:48,height:48,borderRadius:T.rS,background:T.surface,border:`2px dashed ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><PlusI size={16} color={T.dim}/></div>}
          <button onClick={()=>logoRef.current.click()} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:T.rS,padding:"8px 14px",color:T.cream,fontSize:12,cursor:"pointer",fontFamily:T.sans}}>{project.logo?"Replace":"Upload"}</button>
          {project.logo&&<button onClick={()=>updateProject({logo:""})} style={{background:"none",border:"none",color:T.neg,fontSize:11,cursor:"pointer"}}>Remove</button>}
        </div>
      </div>
      <div style={{marginBottom:18}}><DatePick label="Start Date" value={project.date||""} onChange={v=>updateProject({date:v})}/></div>
      <div style={{marginBottom:18}}><DatePick label="Event Date" value={project.eventDate||""} onChange={v=>updateProject({eventDate:v})}/></div>
      <div style={{marginBottom:18}}>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>Project Stage</label>
        <div style={{display:"flex",gap:4}}>{PROJECT_STAGES.map(s=><button key={s} onClick={async()=>{
          updateProject({stage:s});
          if(accessToken&&project.driveFolders){
            try{const{moveProjectToStage}=await import('../utils/drive.js');const updated=await moveProjectToStage(accessToken,project.driveFolders,s);if(updated)updateProject({driveFolders:updated})}catch(e){}
          }
        }} style={{flex:1,padding:"10px 0",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:12,fontWeight:(project.stage||"pitching")===s?700:400,fontFamily:T.sans,background:(project.stage||"pitching")===s?`${STAGE_COLORS[s]}18`:"transparent",color:(project.stage||"pitching")===s?STAGE_COLORS[s]:T.dim,transition:"all .15s"}}>{STAGE_LABELS[s]}</button>)}</div>
      </div>
    </Card>
    <Card style={{padding:28,marginBottom:16}}><div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:18}}>Financial Defaults</div>
      <div style={{marginBottom:18}}>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>Currency</label>
        <select value={project.currency||"USD"} onChange={e=>updateProject({currency:e.target.value})} style={{width:"100%",maxWidth:260,padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
          {[["USD","$ — US Dollar"],["EUR","\u20AC — Euro"],["GBP","\u00A3 — British Pound"],["CAD","C$ — Canadian Dollar"],["AUD","A$ — Australian Dollar"],["AED","AED — UAE Dirham"],["SAR","SAR — Saudi Riyal"],["JPY","\u00A5 — Japanese Yen"],["CHF","CHF — Swiss Franc"],["SGD","S$ — Singapore Dollar"],["HKD","HK$ — Hong Kong Dollar"],["INR","\u20B9 — Indian Rupee"],["BRL","R$ — Brazilian Real"],["MXN","MX$ — Mexican Peso"],["ZAR","R — South African Rand"],["SEK","kr — Swedish Krona"],["NOK","kr — Norwegian Krone"],["DKK","kr — Danish Krone"],["NZD","NZ$ — New Zealand Dollar"],["KRW","\u20A9 — South Korean Won"]].map(([code,label])=>
            <option key={code} value={code}>{label}</option>
          )}
        </select>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}><span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Agency Fee</span><span className="num" style={{fontSize:20,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{fp(project.feeP)}</span></div>
      <input type="range" min="0" max=".40" step=".01" value={project.feeP} onChange={e=>updateProject({feeP:parseFloat(e.target.value)})}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.dim,marginTop:6}}><span>0%</span><span>10%</span><span>20%</span><span>30%</span><span>40%</span></div>
    </Card>
    <Card style={{padding:28,marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:18}}>Google Drive</div>
      {!project.driveFolders?<div>
        <p style={{fontSize:12,color:T.dim,marginBottom:14}}>Create a folder structure on Google Drive for this project. Files will be organized by category and shared with team members based on their roles.</p>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={setupDriveQuick} disabled={driveCreating} style={{padding:"10px 20px",borderRadius:T.rS,background:driveCreating?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:driveCreating?T.dim:T.brown,border:driveCreating?`1px solid ${T.border}`:"none",fontSize:12,fontWeight:700,cursor:driveCreating?"default":"pointer",fontFamily:T.sans}}>{driveCreating?"Creating folders...":"Set up Google Drive"}</button>
          <button onClick={()=>{setDriveSetup(!driveSetup);if(!driveSetup)loadSharedDrives()}} style={{padding:"10px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Choose location</button>
          {driveCreated&&<span style={{fontSize:11,color:T.pos,fontWeight:600}}>Done!</span>}
        </div>
      </div>:<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>&#128193;</span>
          <div>
            <div style={{fontSize:12,color:T.cream,fontWeight:500}}>{project.driveLocation?.driveName||"My Drive"}</div>
            <div style={{fontSize:10,color:T.pos,marginTop:2}}>Folder structure active</div>
          </div>
        </div>
        <button onClick={()=>{setDriveSetup(!driveSetup);if(!driveSetup)loadSharedDrives()}} style={{padding:"7px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{driveSetup?"Cancel":"Change"}</button>
      </div>}
      {driveSetup&&<div style={{borderTop:`1px solid ${T.border}`,paddingTop:14}}>
        <div style={{fontSize:10,color:T.dim,marginBottom:10}}>Choose where Morgan stores project files:</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>setDriveLocation(null,"My Drive")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:T.rS,background:!project.driveLocation?.driveId?"rgba(74,222,128,.06)":T.surfEl,border:`1px solid ${!project.driveLocation?.driveId?"rgba(74,222,128,.15)":T.border}`,cursor:"pointer",textAlign:"left"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>&#128193;</span>
              <div><div style={{fontSize:12,fontWeight:500,color:T.cream}}>My Drive</div><div style={{fontSize:10,color:T.dim}}>Personal Google Drive</div></div>
            </div>
            {!project.driveLocation?.driveId&&<span style={{fontSize:10,color:T.pos,fontWeight:600}}>Current</span>}
          </button>
          {loadingDrives&&<div style={{padding:12,fontSize:11,color:T.dim}}>Loading shared drives...</div>}
          {sharedDrives.map(d=><button key={d.id} onClick={()=>setDriveLocation(d.id,d.name)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:T.rS,background:project.driveLocation?.driveId===d.id?"rgba(74,222,128,.06)":T.surfEl,border:`1px solid ${project.driveLocation?.driveId===d.id?"rgba(74,222,128,.15)":T.border}`,cursor:"pointer",textAlign:"left"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>&#128101;</span>
              <div><div style={{fontSize:12,fontWeight:500,color:T.cream}}>{d.name}</div><div style={{fontSize:10,color:T.dim}}>Shared Drive</div></div>
            </div>
            {project.driveLocation?.driveId===d.id&&<span style={{fontSize:10,color:T.pos,fontWeight:600}}>Current</span>}
          </button>)}
          {!loadingDrives&&sharedDrives.length===0&&<div style={{padding:12,fontSize:11,color:T.dim}}>No shared drives found. Shared drives are available with Google Workspace.</div>}
        </div>
      </div>}
    </Card>
    {isAdmin&&<Card style={{padding:28,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream}}>Team & Permissions</div>
        <button onClick={()=>setShowAddUser(!showAddUser)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",background:showAddUser?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showAddUser?T.dim:T.brown,border:showAddUser?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAddUser?"Cancel":"+ Invite"}</button>
      </div>
      {showAddUser&&<div style={{marginBottom:16,padding:16,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Name</label><input autoFocus value={nuName} onChange={e=>setNuName(e.target.value)} placeholder="Full name" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}}/></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Email</label><input value={nuEmail} onChange={e=>setNuEmail(e.target.value)} placeholder="name@company.com" onKeyDown={e=>e.key==="Enter"&&addTeamMember()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}}/></div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Role</label>
          <select value={nuRole} onChange={e=>handleNuRoleChange(e.target.value)} style={{width:"100%",padding:"8px 8px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer",boxSizing:"border-box"}}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Permissions</label>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {Object.entries(PERMISSION_LABELS).map(([k,label])=><button key={k} type="button" onClick={()=>toggleNuPerm(k)} style={{padding:"4px 10px",borderRadius:4,border:`1px solid ${nuPerms[k]?`${T.gold}44`:T.border}`,fontSize:10,fontWeight:nuPerms[k]?600:400,cursor:"pointer",background:nuPerms[k]?"rgba(255,234,151,.1)":"transparent",color:nuPerms[k]?T.gold:T.dim,transition:"all .15s",fontFamily:T.sans}}>{label}</button>)}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={addTeamMember} disabled={!nuEmail.trim()||!nuName.trim()} style={{padding:"7px 16px",background:nuEmail.trim()&&nuName.trim()?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(255,255,255,.05)",color:nuEmail.trim()&&nuName.trim()?T.brown:"rgba(255,255,255,.2)",border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:nuEmail.trim()&&nuName.trim()?"pointer":"default",fontFamily:T.sans}}>{usesSupa?"Send Invitation":"Add Team Member"}</button>
          {inviteError&&<span style={{fontSize:11,color:T.neg}}>{inviteError}</span>}
        </div>
      </div>}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {team.map(u=><div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${ROLE_COLORS[u.role]}22,${ROLE_COLORS[u.role]}08)`,border:`1.5px solid ${ROLE_COLORS[u.role]}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:ROLE_COLORS[u.role],flexShrink:0}}>{u.name[0]}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:500,color:T.cream}}>{u.name}{u.id===user?.id&&<span style={{fontSize:10,color:T.dim,marginLeft:6}}>(you)</span>}</div>
            <div style={{fontSize:10,color:T.dim}}>{u.email}</div>
          </div>
          <select value={u.role} onChange={e=>updateTeamRole(u.id,e.target.value)} disabled={u.id===user?.id} style={{padding:"4px 6px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:ROLE_COLORS[u.role],fontSize:10,fontFamily:T.sans,outline:"none",cursor:u.id===user?.id?"default":"pointer",appearance:"none",WebkitAppearance:"none"}}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          <div style={{display:"flex",gap:2,flexWrap:"wrap",maxWidth:200}}>
            {Object.entries(PERMISSION_LABELS).map(([k,label])=><button key={k} onClick={()=>u.id!==user?.id&&togglePermission(u.id,k)} disabled={u.id===user?.id} style={{padding:"2px 6px",borderRadius:4,border:"none",fontSize:10,fontWeight:u.permissions?.[k]?600:400,cursor:u.id===user?.id?"default":"pointer",background:u.permissions?.[k]?"rgba(255,234,151,.1)":"transparent",color:u.permissions?.[k]?T.gold:T.dim,transition:"all .15s"}}>{label}</button>)}
          </div>
          {u.id!==user?.id&&<button onClick={()=>removeTeamMember(u.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
        </div>)}
      </div>
      {pendingInvites.length>0&&<>
        <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginTop:16,marginBottom:8}}>Pending Invitations</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {pendingInvites.map(inv=><div key={inv.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px dashed ${T.border}`}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(255,234,151,.06)",border:"1.5px dashed rgba(255,234,151,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.gold,flexShrink:0}}>?</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:T.cream}}>{inv.email}</div>
              <div style={{fontSize:10,color:T.dim}}>Invited as {ROLE_LABELS[inv.role]||inv.role}</div>
            </div>
            <span style={{fontSize:10,color:T.gold,fontWeight:600,padding:"2px 8px",borderRadius:8,background:"rgba(255,234,151,.08)"}}>Pending</span>
            <button onClick={()=>handleRevokeInvitation(inv.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.3,padding:2,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.3}><TrashI size={11} color={T.neg}/></button>
          </div>)}
        </div>
      </>}
      <p style={{fontSize:10,color:T.dim,marginTop:12}}>Team members sign in with Google. Permissions control which sections they can access.</p>
    </Card>}
    <Card style={{padding:28}}><div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.neg,marginBottom:12}}>Danger Zone</div>
      <p style={{fontSize:12,color:T.dim,marginBottom:16}}>Permanently delete this project and all its data.</p>
      <button onClick={onDelete} style={{padding:"10px 20px",borderRadius:T.rS,border:`1px solid ${T.neg}`,background:"transparent",color:T.neg,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,.1)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Delete Project</button>
    </Card>
  </div>;
}

export default SetV;
