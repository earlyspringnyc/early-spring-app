import { useState, useRef } from 'react';
import T from '../theme/tokens.js';
import { fp } from '../utils/format.js';
import { uid } from '../utils/uid.js';
import { ROLES, ROLE_LABELS, ROLE_COLORS, PERMISSION_LABELS, PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS } from '../constants/index.js';
import { getStoredUsers, saveUsers } from '../utils/storage.js';
import { PlusI, TrashI } from '../components/icons/index.js';
import { Card, DatePick } from '../components/primitives/index.js';

function SetV({project,updateProject,onDelete,user}){
  const isAdmin=user?.role==="admin";
  const[team,setTeam]=useState(getStoredUsers);
  const[showAddUser,setShowAddUser]=useState(false);
  const[nuEmail,setNuEmail]=useState("");const[nuName,setNuName]=useState("");const[nuRole,setNuRole]=useState("producer");
  const addTeamMember=()=>{if(!nuEmail.trim()||!nuName.trim())return;const perms=nuRole==="admin"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:true,ai:true,settings:true}:nuRole==="producer"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:false,ai:true,settings:false}:{budget:false,timeline:false,vendors:false,pnl:false,docs:false,ros:false,client:true,ai:false,settings:false};const u={id:uid(),email:nuEmail.trim(),name:nuName.trim(),role:nuRole,avatar:"",permissions:perms};const updated=[...team,u];setTeam(updated);saveUsers(updated);setNuEmail("");setNuName("");setNuRole("producer");setShowAddUser(false)};
  const removeTeamMember=id=>{if(id===user?.id)return;const updated=team.filter(u=>u.id!==id);setTeam(updated);saveUsers(updated)};
  const updateTeamRole=(id,role)=>{const perms=role==="admin"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:true,ai:true,settings:true}:role==="producer"?{budget:true,timeline:true,vendors:true,pnl:true,docs:true,ros:true,client:false,ai:true,settings:false}:{budget:false,timeline:false,vendors:false,pnl:false,docs:false,ros:false,client:true,ai:false,settings:false};const updated=team.map(u=>u.id===id?{...u,role,permissions:perms}:u);setTeam(updated);saveUsers(updated)};
  const togglePermission=(id,perm)=>{const updated=team.map(u=>u.id===id?{...u,permissions:{...u.permissions,[perm]:!u.permissions[perm]}}:u);setTeam(updated);saveUsers(updated)};
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
        <div style={{display:"flex",gap:4}}>{PROJECT_STAGES.map(s=><button key={s} onClick={()=>updateProject({stage:s})} style={{flex:1,padding:"10px 0",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:12,fontWeight:(project.stage||"pitching")===s?700:400,fontFamily:T.sans,background:(project.stage||"pitching")===s?`${STAGE_COLORS[s]}18`:"transparent",color:(project.stage||"pitching")===s?STAGE_COLORS[s]:T.dim,transition:"all .15s"}}>{STAGE_LABELS[s]}</button>)}</div>
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
    {isAdmin&&<Card style={{padding:28,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream}}>Team & Permissions</div>
        <button onClick={()=>setShowAddUser(!showAddUser)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",background:showAddUser?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showAddUser?T.dim:T.brown,border:showAddUser?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAddUser?"Cancel":"+ Invite"}</button>
      </div>
      {showAddUser&&<div style={{marginBottom:16,padding:16,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Name</label><input autoFocus value={nuName} onChange={e=>setNuName(e.target.value)} placeholder="Name" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Google Email</label><input value={nuEmail} onChange={e=>setNuEmail(e.target.value)} placeholder="user@gmail.com" onKeyDown={e=>e.key==="Enter"&&addTeamMember()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Role</label><select value={nuRole} onChange={e=>setNuRole(e.target.value)} style={{width:"100%",padding:"8px 8px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        </div>
        <button onClick={addTeamMember} disabled={!nuEmail.trim()||!nuName.trim()} style={{padding:"7px 16px",background:nuEmail.trim()&&nuName.trim()?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(255,255,255,.05)",color:nuEmail.trim()&&nuName.trim()?T.brown:"rgba(255,255,255,.2)",border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:nuEmail.trim()&&nuName.trim()?"pointer":"default",fontFamily:T.sans}}>Add Team Member</button>
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
      <p style={{fontSize:10,color:T.dim,marginTop:12}}>Team members sign in with Google. Permissions control which sections they can access.</p>
    </Card>}
    <Card style={{padding:28}}><div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.neg,marginBottom:12}}>Danger Zone</div>
      <p style={{fontSize:12,color:T.dim,marginBottom:16}}>Permanently delete this project and all its data.</p>
      <button onClick={onDelete} style={{padding:"10px 20px",borderRadius:T.rS,border:`1px solid ${T.neg}`,background:"transparent",color:T.neg,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,.1)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Delete Project</button>
    </Card>
  </div>;
}

export default SetV;
