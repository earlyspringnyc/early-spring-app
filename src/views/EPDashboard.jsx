import { useState, useMemo, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f$, fp } from '../utils/format.js';
import { calcProject } from '../utils/calc.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { getBudgetHealth } from '../utils/budgetHealth.js';
import { getProjectStaff, getCrossProjectStaffing } from '../utils/staffing.js';
import { STAGE_LABELS, STAGE_COLORS, ROLE_LABELS, ROLE_COLORS } from '../constants/index.js';
import { LogOutI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card } from '../components/primitives/index.js';
import GanttChart from './GanttChart.jsx';
import { getTeamMembers } from '../lib/db.js';
import { isSupabaseConfigured } from '../lib/supabase.js';

/* ── helpers ── */
const Pill=({children,color=T.gold})=><span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

const Avatar=({name,avatar,size=28})=>{
  const initials=(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return avatar?<img src={avatar} alt={name} style={{width:size,height:size,borderRadius:size/2,objectFit:"cover",border:`2px solid ${T.bg}`}}/>
    :<div style={{width:size,height:size,borderRadius:size/2,background:T.surfEl,border:`2px solid ${T.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.35,fontWeight:700,color:T.dim}}>{initials}</div>;
};

function OrgSwitcher({organizations,profiles,currentOrgId,switchOrg}){
  const[open,setOpen]=useState(false);
  const currentOrg=organizations.find(o=>o.id===currentOrgId)||organizations[0];
  return<div style={{position:"relative"}}>
    <button onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:T.rS,border:`1px solid ${open?T.borderGlow:T.border}`,background:open?T.surfEl:"transparent",color:T.cream,fontSize:11,fontWeight:600,fontFamily:T.sans,cursor:"pointer",transition:"all .15s"}}>
      <span style={{width:16,height:16,borderRadius:8,background:T.surfEl,border:`1px solid ${T.border}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:T.cream}}>{(currentOrg?.name||"?")[0]}</span>
      {currentOrg?.name||"Org"}
      <span style={{fontSize:8,opacity:.5}}>&#9662;</span>
    </button>
    {open&&<div style={{position:"absolute",top:"100%",left:0,marginTop:4,minWidth:200,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:T.shadow,zIndex:100,padding:4}}>
      {organizations.map(org=>{
        const isActive=org.id===currentOrgId;
        const orgProfile=profiles.find(p=>p.org_id===org.id);
        return<button key={org.id} onClick={()=>{switchOrg(org.id);setOpen(false)}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",background:isActive?T.surfEl:"transparent",color:isActive?T.cream:T.dim,fontSize:11,fontFamily:T.sans,transition:"all .15s",width:"100%",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="transparent";if(!isActive)e.currentTarget.style.color=T.dim}}>
          <span style={{width:18,height:18,borderRadius:9,background:T.surfEl,border:`1px solid ${T.border}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,color:T.cream,flexShrink:0}}>{(org.name||"?")[0]}</span>
          <div style={{flex:1}}><div style={{fontWeight:isActive?500:400}}>{org.name}</div>{orgProfile&&<div style={{fontSize:9,color:T.dim,marginTop:1}}>{orgProfile.role}</div>}</div>
          {isActive&&<span style={{fontSize:10,color:T.gold}}>&#10003;</span>}
        </button>;
      })}
    </div>}
  </div>;
}

/* ── EP Dashboard ── */
function EPDashboard({projects,onOpen,user,onLogout,profiles=[],organizations=[],currentOrgId,switchOrg,orgId}){
  const[tab,setTab]=useState("overview"); // overview | staffing
  const[expandedId,setExpandedId]=useState(null);
  const[teamMembers,setTeamMembers]=useState([]);

  useEffect(()=>{
    if(isSupabaseConfigured()&&orgId){
      getTeamMembers(orgId).then(t=>setTeamMembers(t||[])).catch(()=>{});
    }
  },[orgId]);

  const projectData=useMemo(()=>projects.filter(p=>p.stage!=="archived").map(p=>{
    const comp=calcProject(p);
    const health=getBudgetHealth(p);
    const staff=getProjectStaff(p,teamMembers);
    const eventDate=parseD(p.eventDate);
    const daysOut=eventDate?daysBetween(new Date(),eventDate):null;
    return{project:p,comp,health,staff,daysOut,eventDate};
  }),[projects,teamMembers]);

  const crossStaffing=useMemo(()=>getCrossProjectStaffing(projects.filter(p=>p.stage!=="archived"),teamMembers),[projects,teamMembers]);

  const activeProjects=projects.filter(p=>p.stage!=="archived");
  const expandedData=expandedId?projectData.find(d=>d.project.id===expandedId):null;

  const greeting=`${(()=>{const h=new Date().getHours();if(h<12)return"Good morning";if(h<17)return"Good afternoon";return"Good evening"})()}, ${user?.name?.split(" ")[0]||""}`;

  return<div style={{minHeight:"100vh",background:T.bg,color:T.cream,fontFamily:T.sans}}>
    {/* Header */}
    <div style={{display:"flex",alignItems:"center",padding:"20px 32px",borderBottom:`1px solid ${T.border}`,gap:16}}>
      <ESWordmark/>
      <div style={{marginLeft:8}}>
        {organizations.length>1&&<OrgSwitcher organizations={organizations} profiles={profiles} currentOrgId={currentOrgId} switchOrg={switchOrg}/>}
      </div>
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:16}}>
        <Pill color="#F59E0B">EP View</Pill>
        <span style={{fontSize:12,color:T.dim}}>{user?.email}</span>
        <button onClick={onLogout} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",padding:4}} title="Sign out"><LogOutI size={16}/></button>
      </div>
    </div>

    <div style={{padding:"28px 32px",maxWidth:1400,margin:"0 auto"}}>
      {/* Greeting + tabs */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:700,letterSpacing:"-0.03em",margin:0}}>{greeting}</h1>
          <p style={{fontSize:13,color:T.dim,marginTop:4}}>{activeProjects.length} active project{activeProjects.length!==1?"s":""}</p>
        </div>
        <div style={{display:"flex",gap:4,background:T.surface,borderRadius:T.rS,padding:3}}>
          {["overview","staffing"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"7px 16px",borderRadius:T.rS,border:"none",background:tab===t?T.surfEl:"transparent",color:tab===t?T.cream:T.dim,fontSize:11,fontWeight:tab===t?600:400,cursor:"pointer",fontFamily:T.sans,textTransform:"capitalize",transition:"all .15s"}}>{t}</button>)}
        </div>
      </div>

      {/* Overview Tab */}
      {tab==="overview"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:16}}>
        {projectData.map(({project:p,comp,health,staff,daysOut,eventDate})=><Card key={p.id} style={{padding:0,cursor:"pointer",transition:"all .2s",border:`1px solid ${expandedId===p.id?T.borderGlow:T.border}`}} onClick={()=>setExpandedId(expandedId===p.id?null:p.id)} onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderGlow} onMouseLeave={e=>{if(expandedId!==p.id)e.currentTarget.style.borderColor=T.border}}>
          <div style={{padding:"16px 18px"}}>
            {/* Row 1: name + stage */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:15,fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
              <Pill color={STAGE_COLORS[p.stage]||T.dim}>{STAGE_LABELS[p.stage]||p.stage}</Pill>
            </div>
            {p.client&&<div style={{fontSize:11,color:T.dim,marginBottom:12}}>{p.client}</div>}

            {/* Row 2: budget + health + event date */}
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
              <div>
                <div style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>Sold</div>
                <div style={{fontSize:18,fontWeight:700,fontFamily:T.mono,letterSpacing:"-0.03em"}}>{f$(p.clientBudget||0)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:8,height:8,borderRadius:4,background:health.color}}/>
                <span style={{fontSize:10,color:health.color,fontWeight:600}}>{health.label}</span>
                {health.status!=="none"&&<span style={{fontSize:9,color:T.dim}}>{Math.round(health.pct*100)}% spent</span>}
              </div>
              <div style={{marginLeft:"auto",textAlign:"right"}}>
                {eventDate&&<>
                  <div style={{fontSize:10,color:T.dim}}>{fmtShort(eventDate)}</div>
                  <div style={{fontSize:12,fontWeight:600,color:daysOut<14?T.neg:daysOut<30?"#FBBF24":T.cream}}>{daysOut>0?`${daysOut}d out`:daysOut===0?"Today":`${Math.abs(daysOut)}d ago`}</div>
                </>}
              </div>
            </div>

            {/* Row 3: staff avatars */}
            {staff.length>0&&<div style={{display:"flex",gap:0}}>
              {staff.slice(0,8).map((s,i)=><div key={s.userId||s.name||i} style={{marginLeft:i===0?0:-6}} title={s.name}><Avatar name={s.name} avatar={s.avatar} size={26}/></div>)}
              {staff.length>8&&<div style={{width:26,height:26,borderRadius:13,background:T.surfEl,border:`2px solid ${T.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,color:T.dim,marginLeft:-6}}>+{staff.length-8}</div>}
            </div>}
          </div>
        </Card>)}
      </div>}

      {/* Staffing Tab */}
      {tab==="staffing"&&<StaffingGrid crossStaffing={crossStaffing} activeProjects={activeProjects}/>}
    </div>

    {/* Drill-down overlay */}
    {expandedData&&<DrillDown data={expandedData} allProjectData={projectData} crossStaffing={crossStaffing} onClose={()=>setExpandedId(null)} onOpenFull={()=>{onOpen(expandedData.project.id);setExpandedId(null)}}/>}
  </div>;
}

/* ── Staffing Grid ── */
function StaffingGrid({crossStaffing,activeProjects}){
  const people=[...crossStaffing.values()].sort((a,b)=>b.projects.length-a.projects.length);
  if(people.length===0)return<Card style={{padding:32,textAlign:"center"}}><p style={{color:T.dim,fontSize:13}}>No staff assigned to any projects yet.</p></Card>;

  return<Card style={{padding:0,overflow:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.sans}}>
      <thead>
        <tr style={{borderBottom:`1px solid ${T.border}`}}>
          <th style={{textAlign:"left",padding:"10px 14px",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",position:"sticky",left:0,background:T.surface,zIndex:1,minWidth:160}}>Team Member</th>
          {activeProjects.map(p=><th key={p.id} style={{textAlign:"center",padding:"10px 8px",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".04em",minWidth:100,maxWidth:140}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div></th>)}
          <th style={{textAlign:"center",padding:"10px 8px",fontSize:10,fontWeight:600,color:T.dim,minWidth:60}}>Total</th>
        </tr>
      </thead>
      <tbody>
        {people.map(person=>{
          const projectIds=new Set(person.projects.map(pp=>pp.projectId));
          return<tr key={person.name} style={{borderBottom:`1px solid ${T.border}22`}}>
            <td style={{padding:"8px 14px",position:"sticky",left:0,background:T.surface,zIndex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Avatar name={person.name} avatar={person.avatar} size={22}/>
                <span style={{fontWeight:600,color:T.cream}}>{person.name}</span>
              </div>
            </td>
            {activeProjects.map(p=>{
              const match=person.projects.find(pp=>pp.projectId===p.id);
              return<td key={p.id} style={{textAlign:"center",padding:"8px"}}>
                {match?<Pill color={ROLE_COLORS[match.role]||T.cyan}>{ROLE_LABELS[match.role]||match.role||"Assigned"}</Pill>:<span style={{color:T.dim,fontSize:10}}>-</span>}
              </td>;
            })}
            <td style={{textAlign:"center",padding:"8px",fontWeight:600,color:person.projects.length>1?"#FBBF24":T.cream}}>{person.projects.length}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </Card>;
}

/* ── Drill-down overlay ── */
function DrillDown({data,allProjectData,crossStaffing,onClose,onOpenFull}){
  const{project:p,comp,health,staff,daysOut,eventDate}=data;

  return<div style={{position:"fixed",inset:0,zIndex:200,display:"flex",justifyContent:"flex-end",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}} onClick={onClose}>
    <div className="slide-in" style={{width:"min(680px,90vw)",height:"100vh",background:T.bg,borderLeft:`1px solid ${T.border}`,overflow:"auto",boxShadow:T.shadow}} onClick={e=>e.stopPropagation()}>
      {/* Header */}
      <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1}}>
          <h2 style={{fontSize:20,fontWeight:700,margin:0,letterSpacing:"-0.02em"}}>{p.name}</h2>
          {p.client&&<div style={{fontSize:12,color:T.dim,marginTop:2}}>{p.client}</div>}
        </div>
        <Pill color={STAGE_COLORS[p.stage]||T.dim}>{STAGE_LABELS[p.stage]||p.stage}</Pill>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.dim,fontSize:22,cursor:"pointer",padding:4,lineHeight:1}}>&#10005;</button>
      </div>

      <div style={{padding:"24px"}}>
        {/* Budget summary */}
        <div style={{display:"flex",gap:20,marginBottom:24}}>
          <div>
            <div style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Sold to Client</div>
            <div style={{fontSize:28,fontWeight:700,fontFamily:T.mono,letterSpacing:"-0.03em"}}>{f$(p.clientBudget||0)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Actual Spend</div>
            <div style={{fontSize:28,fontWeight:700,fontFamily:T.mono,letterSpacing:"-0.03em",color:health.color}}>{f$((comp.productionSubtotal?.actualCost||0)+(comp.agencyCostsSubtotal?.actualCost||0)+(comp.agencyFee?.actualCost||0))}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:10,height:10,borderRadius:5,background:health.color}}/>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:health.color}}>{health.label}</div>
              {health.status!=="none"&&<div style={{fontSize:10,color:T.dim}}>{Math.round(health.pct*100)}% of budget spent</div>}
            </div>
          </div>
          {eventDate&&<div style={{marginLeft:"auto",textAlign:"right"}}>
            <div style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Event Date</div>
            <div style={{fontSize:16,fontWeight:600}}>{fmtShort(eventDate)}</div>
            <div style={{fontSize:11,color:daysOut<14?T.neg:daysOut<30?"#FBBF24":T.dim}}>{daysOut>0?`${daysOut} days out`:daysOut===0?"Today":`${Math.abs(daysOut)} days ago`}</div>
          </div>}
        </div>

        {/* Gantt chart */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Production Timeline</div>
          <GanttChart tasks={p.timeline||[]}/>
        </div>

        {/* Staffing */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Staffing</div>
          <Card style={{padding:0}}>
            {staff.length===0?<div style={{padding:16,textAlign:"center",color:T.dim,fontSize:12}}>No staff assigned</div>
            :staff.map((s,i)=>{
              const personEntry=crossStaffing.get(s.userId||s.name);
              const otherProjects=personEntry?personEntry.projects.filter(pp=>pp.projectId!==p.id):[];
              return<div key={s.userId||s.name||i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<staff.length-1?`1px solid ${T.border}22`:"none"}}>
                <Avatar name={s.name} avatar={s.avatar} size={28}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{s.name}</div>
                  {s.role&&<span style={{fontSize:10,color:ROLE_COLORS[s.role]||T.dim}}>{ROLE_LABELS[s.role]||s.role}</span>}
                </div>
                {otherProjects.length>0&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:T.rS,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.15)"}}>
                  <span style={{fontSize:9,color:"#FBBF24",fontWeight:600}}>Also on {otherProjects.length} other project{otherProjects.length!==1?"s":""}</span>
                </div>}
              </div>;
            })}
          </Card>
        </div>

        {/* Open full project button */}
        <button onClick={onOpenFull} style={{width:"100%",padding:"12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfEl}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>Open Full Project View</button>
      </div>
    </div>
  </div>;
}

export default EPDashboard;
