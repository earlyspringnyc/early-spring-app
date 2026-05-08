import { useState, useMemo } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { calcProject, isOverdue } from '../utils/calc.js';
import { PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS, VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, VENDOR_TYPES } from '../constants/index.js';
import { PlusI, LogOutI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card, DonutChart } from '../components/primitives/index.js';
import BarChart from '../components/primitives/BarChart.jsx';
import VendorDetailModal from '../components/modals/VendorDetailModal.jsx';

const Pill=({children,color=T.ink,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 8px":"3px 10px",borderRadius:999,background:"transparent",color,border:`1px solid ${color}`,textTransform:"uppercase",letterSpacing:".06em",whiteSpace:"nowrap"}}>{children}</span>;

function OrgSwitcher({organizations,profiles,currentOrgId,switchOrg}){
  const[open,setOpen]=useState(false);
  const currentOrg=organizations.find(o=>o.id===currentOrgId)||organizations[0];
  return<div style={{position:"relative"}}>
    <button onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:T.rS,border:`1px solid ${open?T.borderGlow:T.border}`,background:open?T.surfEl:"transparent",color:T.cream,fontSize:11,fontWeight:500,fontFamily:T.sans,cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{if(!open)e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{if(!open)e.currentTarget.style.background="transparent"}}>
      <span style={{width:16,height:16,borderRadius:8,background:T.surfEl,border:`1px solid ${T.border}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:T.cream}}>{(currentOrg?.name||"?")[0]}</span>
      {currentOrg?.name||"Org"}
      <span style={{fontSize:8,opacity:.5}}>&#9662;</span>
    </button>
    {open&&<div className="fc-panel" style={{position:"absolute",top:"100%",left:0,marginTop:6,minWidth:220,zIndex:100,padding:4,borderRadius:12}}>
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

const getGreeting=()=>{const h=new Date().getHours();if(h<4)return"Burning the midnight oil";if(h<9)return"You're up early";if(h<12)return"Good morning";if(h<17)return"Good afternoon";if(h<20)return"Good evening";return"Working hard"};

// Bento helpers
const L=({children})=><div style={{fontSize:10,fontWeight:500,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".06em",color:T.dim,marginBottom:10}}>{children}</div>;
const Big=({children,color=T.cream,size=42})=><div className="num" style={{fontSize:size,fontWeight:700,fontFamily:T.mono,letterSpacing:"-0.04em",color,lineHeight:1}}>{children}</div>;
const Sub=({children})=><div style={{fontSize:11,color:T.dim,marginTop:6}}>{children}</div>;

function PortfolioDash({projects,onOpen,onNew,user,onLogout,onDuplicate,onDelete,onUpdateStage,accessToken,profiles=[],organizations=[],currentOrgId,switchOrg}){
  const canCreate=user.role!=="client";
  const[vendorDetailId,setVendorDetailId]=useState(null);
  const[vendorProjectId,setVendorProjectId]=useState(null);
  const[showArchived,setShowArchived]=useState(false);

  // Calculations — memoized so calcProject only reruns when projects change
  // Financial totals exclude archived projects so the dashboard reflects active business
  const {allComps,activeComps,totalRevenue,totalCost,totalProfit,blendedMargin,totalProdCost,totalAgencyFee,totalProdMargin,totalAgencyMargin,totalOwed,allOverdue,allUpcoming,activeProjects:activeProjectCount}=useMemo(()=>{
    const allComps=projects.map(p=>({p,c:calcProject(p)}));
    const activeComps=allComps.filter(({p})=>(p.stage||"pitching")!=="archived");
    const totalRevenue=activeComps.reduce((a,{c})=>a+c.grandTotal,0);
    const totalCost=activeComps.reduce((a,{c})=>a+c.productionSubtotal.actualCost+c.agencyCostsSubtotal.actualCost+c.agencyFee.actualCost,0);
    const totalProfit=activeComps.reduce((a,{c})=>a+c.netProfit,0);
    const blendedMargin=totalRevenue>0?((totalProfit/totalRevenue)*100):0;
    const totalProdCost=activeComps.reduce((a,{c})=>a+c.productionSubtotal.actualCost,0);
    const totalAgencyFee=activeComps.reduce((a,{c})=>a+c.agencyFee.clientPrice,0);
    const totalProdMargin=activeComps.reduce((a,{c})=>a+c.productionSubtotal.variance,0);
    const totalAgencyMargin=activeComps.reduce((a,{c})=>a+c.agencyCostsSubtotal.variance,0);
    const totalOwed=activeComps.reduce((a,{p})=>{const invoiced=(p.docs||[]).filter(d=>d.type==="invoice"&&d.status!=="paid").reduce((s,d)=>s+(d.amount||0),0);return a+invoiced},0);
    const allOverdue=[];const allUpcoming=[];
    activeComps.forEach(({p})=>{(p.docs||[]).forEach(d=>{if(d.status==="overdue"||(d.status==="pending"&&isOverdue(d)))allOverdue.push({...d,projectName:p.name,projectId:p.id});else if(d.status==="pending"&&d.dueDate&&!isOverdue(d))allUpcoming.push({...d,projectName:p.name,projectId:p.id})})});
    allUpcoming.sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""));
    const activeProjects=activeComps.length;
    return{allComps,activeComps,totalRevenue,totalCost,totalProfit,blendedMargin,totalProdCost,totalAgencyFee,totalProdMargin,totalAgencyMargin,totalOwed,allOverdue,allUpcoming,activeProjects};
  },[projects]);

  // Tasks across active projects (archived excluded so rollups reflect current work)
  const allTasks=useMemo(()=>{
    const tasks=[];
    projects.forEach(p=>{if((p.stage||"pitching")==="archived")return;(p.timeline||[]).forEach(t=>tasks.push({...t,projectName:p.name,projectId:p.id}))});
    return tasks;
  },[projects]);
  const tasksDone=allTasks.filter(t=>t.status==="done").length;
  const tasksInProgress=allTasks.filter(t=>t.status==="in_progress"||t.status==="doing").length;
  const tasksTodo=allTasks.filter(t=>!t.status||t.status==="todo"||t.status==="not_started").length;
  const tasksBlocked=allTasks.filter(t=>t.status==="blocked").length;
  const tasksTotal=allTasks.length;
  const taskPct=tasksTotal>0?Math.round(tasksDone/tasksTotal*100):0;
  // Upcoming/overdue tasks
  const upcomingTasks=allTasks.filter(t=>{if(t.status==="done"||!t.endDate)return false;const now=new Date();const d=new Date(t.endDate);const diff=(d-now)/(1000*60*60*24);return diff>=0&&diff<=14}).sort((a,b)=>(a.endDate||"").localeCompare(b.endDate||"")).slice(0,6);
  const overdueTasks=allTasks.filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=new Date(t.endDate);return d<new Date()});

  // Vendors
  const masterVendors=useMemo(()=>{
    const map=new Map();
    projects.forEach(p=>{(p.vendors||[]).forEach(v=>{const key=(v.name||"").toLowerCase().trim()+(v.email||"").toLowerCase().trim();if(!key)return;const existing=map.get(key);if(existing){existing.projects.push({id:p.id,name:p.name});existing.projectCount++}else map.set(key,{...v,projects:[{id:p.id,name:p.name}],projectCount:1,_projectId:p.id})})});
    return[...map.values()];
  },[projects]);

  // Vendor type breakdown
  const vendorsByType=useMemo(()=>{
    const map=new Map();
    masterVendors.forEach(v=>{const t=v.vendorType||"other";map.set(t,(map.get(t)||0)+1)});
    return[...map.entries()].map(([type,count])=>({name:VENDOR_TYPE_LABELS[type]||type,value:count,color:VENDOR_TYPE_COLORS[type]||T.dim})).sort((a,b)=>b.value-a.value);
  },[masterVendors]);

  // Stage breakdown
  const stageData=useMemo(()=>PROJECT_STAGES.map(s=>{const ps=allComps.filter(({p})=>(p.stage||"pitching")===s);return{name:STAGE_LABELS[s],value:ps.reduce((a,{c})=>a+c.grandTotal,0),count:ps.length,color:STAGE_COLORS[s]}}).filter(d=>d.count>0),[allComps]);

  // Bar chart — top projects by revenue
  const barData=useMemo(()=>[...activeComps].sort((a,b)=>b.c.grandTotal-a.c.grandTotal).slice(0,8).map(({p,c})=>({name:p.name?.length>12?p.name.slice(0,11)+"\u2026":p.name,actual:c.productionSubtotal.actualCost+c.agencyCostsSubtotal.actualCost+c.agencyFee.actualCost,client:c.grandTotal})),[activeComps]);

  // Spend by category — active projects only
  const spendData=useMemo(()=>{
    const catMap=new Map();
    projects.forEach(p=>{if((p.stage||"pitching")==="archived")return;(p.cats||[]).forEach(cat=>{const existing=catMap.get(cat.name)||0;const catCost=(cat.items||[]).reduce((a,it)=>a+(it.excluded?0:(it.actualCost||0)),0);catMap.set(cat.name,existing+catCost)})});
    return[...catMap.entries()].map(([name,value])=>({name,value})).filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  },[projects]);

  // Profit composition — sapphire opacity ramp for separation (100 / 60 / 25)
  const profitData=useMemo(()=>[
    {name:"Production Margin",value:Math.max(0,totalProdMargin),color:T.ink},
    {name:"Agency Margin",value:Math.max(0,totalAgencyMargin),color:T.ink60},
    {name:"Agency Fee",value:Math.max(0,totalAgencyFee),color:T.ink25},
  ].filter(d=>d.value>0),[totalProdMargin,totalAgencyMargin,totalAgencyFee]);

  const activeProjects=activeProjectCount;
  const firstName=(user.name||user.email||"").split(" ")[0]||"there";

  // Project card variants — sapphire only, varied by opacity
  const cardColors=[
    [T.inkSoft3,T.faintRule,T.ink],
    [T.inkSoft2,T.faintRule,T.ink70],
  ];

  return<div style={{height:"100vh",background:T.bg,fontFamily:T.sans,overflow:"auto"}}>
    <div style={{height:1,background:T.faintRule}}/>

    <div className="portfolio-container" style={{maxWidth:1200,margin:"0 auto",padding:"36px 32px"}}>
      {/* Header */}
      <div className="portfolio-header" style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:14,marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <ESWordmark height={14} color={T.gold}/>
          {profiles.length>1&&<OrgSwitcher organizations={organizations} profiles={profiles} currentOrgId={currentOrgId} switchOrg={switchOrg}/>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          {canCreate&&<button className="portfolio-new-btn btn-pill" onClick={onNew} style={{padding:"7px 14px",fontSize:12}}><PlusI size={11} color="currentColor"/> New Project</button>}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:T.inkSoft,border:`1px solid ${T.faintRule}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.ink,flexShrink:0}}>{(user.name||user.email||"?")[0]}</div>
            <span style={{fontSize:11,color:T.fadedInk,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:120}}>{user.name||user.email||""}</span>
            <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:4,background:"transparent",border:`1px solid ${T.faintRule}`,borderRadius:999,cursor:"pointer",padding:"5px 12px",flexShrink:0,fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:T.fadedInk,fontFamily:T.sans,transition:"all .18s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.alert;e.currentTarget.style.color=T.alert}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.faintRule;e.currentTarget.style.color=T.fadedInk}}><LogOutI size={11} color="currentColor"/>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Welcome */}
      <div style={{marginBottom:32,marginTop:12}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:".10em",textTransform:"uppercase",color:T.ink,marginBottom:14}}>Portfolio</div>
        <h1 style={{fontSize:"clamp(34px,5.4vw,64px)",fontWeight:800,color:T.ink,letterSpacing:"-0.028em",lineHeight:0.98,margin:0}}>{getGreeting()}, {firstName}{getGreeting()==="Working hard"?"?":"."}</h1>
      </div>

      {/* ── BENTO GRID ── */}
      <div className="portfolio-bento" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>

        {/* Row 1: Key financial metrics */}
        <Card style={{padding:24,gridColumn:"span 2"}} hoverable>
          <L>Total Revenue</L>
          <Big color={T.gold}>{f0(totalRevenue)}</Big>
          <Sub>{projects.length} project{projects.length!==1?"s":""} · {activeProjects} active</Sub>
        </Card>
        <Card style={{padding:24}} hoverable>
          <L>Net Profit</L>
          <Big color={totalProfit>=0?T.pos:T.neg} size={36}>{f0(totalProfit)}</Big>
          <Sub>{blendedMargin.toFixed(1)}% margin</Sub>
        </Card>
        <Card style={{padding:24}} hoverable>
          <L>Total Cost</L>
          <Big color={T.cream} size={36}>{f0(totalCost)}</Big>
          <Sub>Prod + agency</Sub>
        </Card>

        {/* Row 2: Overdue alerts (full width, only if overdue) */}
        {allOverdue.length>0&&<Card style={{padding:18,gridColumn:"span 4",background:T.alertSoft,borderColor:T.alert,borderLeft:`2px solid ${T.alert}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:10,fontWeight:700,color:T.alert,textTransform:"uppercase",letterSpacing:".10em"}}>Overdue Invoices</span><Pill color={T.alert} size="xs">{allOverdue.length}</Pill></div>
          {allOverdue.slice(0,5).map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background="rgba(122,31,31,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{color:T.cream,flex:1,fontWeight:500}}>{d.name}</span><Pill color={T.fadedInk} size="xs">{d.projectName}</Pill><span style={{fontSize:10,color:T.fadedInk,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontFamily:T.mono,fontWeight:600,color:T.alert}}>{f$(d.amount)}</span>
          </div>)}
        </Card>}

        {/* Row 3: Projects as cards */}
        <Card style={{padding:24,gridColumn:"span 4"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <L>Projects</L>
            {canCreate&&<button onClick={onNew} className="btn-pill" style={{padding:"5px 12px",fontSize:11}}>+ New</button>}
          </div>
          {projects.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:T.dim,fontSize:13}}>No projects yet. Create one to get started.</div>
          :(()=>{
            const sorted=[...projects].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
            const active=sorted.filter(p=>(p.stage||"pitching")!=="archived");
            const archived=sorted.filter(p=>(p.stage||"pitching")==="archived");
            const renderCard=(p,pi)=>{
              const comp=calcProject(p);
              const ov=(p.docs||[]).filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d))).length;
              const td=(p.timeline||[]).filter(t=>t.status==="done").length;
              const tt=(p.timeline||[]).length;
              const tp=tt>0?Math.round(td/tt*100):0;
              const[cardBg,cardBorder,cardAccent]=cardColors[pi%cardColors.length];
              const stage=p.stage||"pitching";
              return<Card key={p.id} hoverable onClick={()=>onOpen(p.id)} style={{padding:0,overflow:"hidden",opacity:stage==="archived"?.6:1,background:cardBg,borderColor:cardBorder,borderLeft:`3px solid ${cardAccent}`}}>
                <div style={{padding:"18px 20px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <h3 style={{fontSize:14,fontWeight:600,color:T.cream,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</h3>
                      <p style={{fontSize:11,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.client||"No client"}</p>
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <Pill color={STAGE_COLORS[stage]} size="xs">{STAGE_LABELS[stage]}</Pill>
                      {ov>0&&<Pill color={T.neg} size="xs">{ov} overdue</Pill>}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Revenue</div><div className="num" style={{fontSize:18,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(comp.grandTotal)}</div></div>
                    <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Profit</div><div className="num" style={{fontSize:18,fontWeight:700,color:comp.netProfit>0?T.pos:T.dim,fontFamily:T.mono}}>{f0(comp.netProfit)}</div></div>
                  </div>
                  {tt>0&&<div style={{marginTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:T.dim}}>{td}/{tt} tasks</span><span style={{fontSize:9,color:T.dim,fontFamily:T.mono}}>{tp}%</span></div>
                    <div style={{height:3,background:T.faintRule,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${tp}%`,background:cardAccent,borderRadius:2,transition:"width .4s cubic-bezier(.2,.8,.2,1)"}}/></div>
                  </div>}
                </div>
              </Card>;
            };
            return<>
              {active.length===0?<div style={{textAlign:"center",padding:"24px 20px",color:T.dim,fontSize:12}}>No active projects.</div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
                {active.map((p,pi)=>renderCard(p,pi))}
              </div>}
              {archived.length>0&&<div style={{marginTop:active.length>0?16:0,paddingTop:active.length>0?14:0,borderTop:active.length>0?`1px solid ${T.border}`:"none"}}>
                <button onClick={()=>setShowArchived(!showArchived)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:T.sans,color:T.dim,fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",marginBottom:showArchived?12:0,transition:"color .15s"}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>
                  <span style={{display:"inline-block",transform:showArchived?"rotate(90deg)":"rotate(0deg)",transition:"transform .15s",fontSize:9}}>&#9656;</span>
                  {archived.length} archived
                </button>
                {showArchived&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
                  {archived.map((p,pi)=>renderCard(p,active.length+pi))}
                </div>}
              </div>}
            </>;
          })()}
        </Card>

        {/* Row 4: Tasks + Secondary metrics */}
        <Card style={{padding:24,gridColumn:"span 2"}} hoverable>
          <L>Tasks Overview</L>
          <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14}}>
            <Big size={36} color={T.cream}>{tasksDone}<span style={{fontSize:16,color:T.dim,fontWeight:400}}>/{tasksTotal}</span></Big>
            <span style={{fontSize:11,color:T.dim}}>completed</span>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {tasksInProgress>0&&<Pill color={T.gold} size="xs">{tasksInProgress} in progress</Pill>}
            {tasksTodo>0&&<Pill color={T.dim} size="xs">{tasksTodo} to do</Pill>}
            {tasksBlocked>0&&<Pill color={T.neg} size="xs">{tasksBlocked} blocked</Pill>}
            {overdueTasks.length>0&&<Pill color={T.neg} size="xs">{overdueTasks.length} overdue</Pill>}
          </div>
          {tasksTotal>0&&<div style={{marginBottom:14}}>
            <div style={{height:6,borderRadius:3,background:T.faintRule,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,background:T.ink,width:`${taskPct}%`,transition:"width .4s cubic-bezier(.2,.8,.2,1)"}}/>
            </div>
          </div>}
          {upcomingTasks.length>0&&<div>
            <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Upcoming</div>
            {upcomingTasks.map(t=><div key={t.id||t.name} onClick={()=>onOpen(t.projectId)} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:11}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.cream,flex:1,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name||t.title||"Task"}</span>
              <Pill color={T.dim} size="xs">{t.projectName}</Pill>
              <span style={{fontSize:9,color:T.gold,fontFamily:T.mono,flexShrink:0}}>{t.endDate}</span>
            </div>)}
          </div>}
        </Card>

        <Card style={{padding:24}} hoverable>
          <L>Production Cost</L>
          <Big size={28} color={T.cream}>{f0(totalProdCost)}</Big>
        </Card>
        <Card style={{padding:24}} hoverable>
          <L>Owed to Vendors</L>
          <Big size={28} color={totalOwed>0?T.neg:T.dim}>{f0(totalOwed)}</Big>
          {allOverdue.length>0&&<div style={{marginTop:6}}><Pill color={T.neg} size="xs">{allOverdue.length} overdue</Pill></div>}
        </Card>

        {/* Row 5: Charts */}
        <Card style={{padding:24,gridColumn:"span 2"}} hoverable>
          <L>Revenue by Project</L>
          {barData.length>0?<BarChart data={barData} height={180}/>
          :<div style={{height:180,display:"flex",alignItems:"center",justifyContent:"center",color:T.dim,fontSize:12}}>No project data</div>}
          <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center"}}>
            <span style={{fontSize:10,color:T.dim,display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:T.dim,display:"inline-block"}}/> Cost</span>
            <span style={{fontSize:10,color:T.dim,display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:T.gold,display:"inline-block"}}/> Client Total</span>
          </div>
        </Card>
        <Card style={{padding:24,gridColumn:"span 2"}} hoverable>
          <L>Profit Composition</L>
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            <DonutChart data={profitData} size={120} thickness={16}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
              {profitData.map(d=><div key={d.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:8,height:8,borderRadius:2,background:d.color,flexShrink:0}}/>
                  <span style={{fontSize:11,color:T.dim}}>{d.name}</span>
                </div>
                <span className="num" style={{fontSize:12,fontWeight:600,fontFamily:T.mono,color:d.color}}>{f0(d.value)}</span>
              </div>)}
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:6,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:11,fontWeight:600,color:T.cream}}>Net Profit</span>
                <span className="num" style={{fontSize:12,fontWeight:700,fontFamily:T.mono,color:T.pos}}>{f0(totalProfit)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Row 6: Vendors + Pipeline */}
        <Card style={{padding:24,gridColumn:"span 2"}} hoverable>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <L>Vendor Database</L>
            <span style={{fontSize:10,color:T.dim}}>{masterVendors.length} vendor{masterVendors.length!==1?"s":""}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:14}}>
            <DonutChart data={vendorsByType} size={100} thickness={14}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
              {vendorsByType.slice(0,6).map(d=><div key={d.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:8,height:8,borderRadius:2,background:d.color,flexShrink:0}}/>
                  <span style={{fontSize:11,color:T.dim}}>{d.name}</span>
                </div>
                <span style={{fontSize:11,fontFamily:T.mono,color:T.cream}}>{d.value}</span>
              </div>)}
            </div>
          </div>
          {masterVendors.length>0&&<div style={{borderTop:`1px solid ${T.border}`,paddingTop:10}}>
            <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Recent Vendors</div>
            {masterVendors.slice(0,5).map(v=><div key={v.id+v._projectId} onClick={()=>{setVendorDetailId(v.id);setVendorProjectId(v._projectId)}} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:11}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.cream,flex:1,fontWeight:500}}>{v.name}</span>
              <Pill color={VENDOR_TYPE_COLORS[v.vendorType||"other"]||T.dim} size="xs">{VENDOR_TYPE_LABELS[v.vendorType||"other"]}</Pill>
              <span style={{fontSize:9,color:T.dim}}>{v.projectCount} proj{v.projectCount!==1?"s":""}</span>
            </div>)}
          </div>}
        </Card>
        <Card style={{padding:24,gridColumn:"span 2"}} hoverable>
          <L>Pipeline by Stage</L>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {stageData.map(d=>{const pct=totalRevenue>0?(d.value/totalRevenue)*100:0;return<div key={d.name}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:500,color:d.color}}>{d.name} <span style={{fontSize:10,color:T.dim,fontWeight:400}}>({d.count})</span></span>
                <span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:d.color}}>{f0(d.value)}</span>
              </div>
              <div style={{height:6,borderRadius:3,background:T.surface,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:3,background:d.color,width:`${Math.max(pct,1)}%`,transition:"width .4s ease"}}/>
              </div>
            </div>})}
          </div>
          {spendData.length>0&&<div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:12}}>
            <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Top Spend Categories</div>
            {spendData.slice(0,5).map((d,i)=><div key={d.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:8,height:8,borderRadius:2,background:T.colors?.[i%T.colors?.length]||T.gold,flexShrink:0}}/>
                <span style={{fontSize:11,color:T.dim}}>{d.name}</span>
              </div>
              <span className="num" style={{fontSize:11,fontFamily:T.mono,color:T.cream}}>{f0(d.value)}</span>
            </div>)}
          </div>}
        </Card>

        {/* Upcoming due dates */}
        {allUpcoming.length>0&&<Card style={{padding:18,gridColumn:"span 4"}}>
          <div style={{fontSize:10,fontWeight:700,color:T.gold,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Upcoming Due Dates</div>
          {allUpcoming.slice(0,6).map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{color:T.cream,flex:1,fontWeight:500}}>{d.name}</span><Pill color={T.dim} size="xs">{d.projectName}</Pill><span style={{fontSize:10,color:T.gold,fontFamily:T.mono}}>{d.dueDate}</span><span className="num" style={{fontFamily:T.mono,color:T.dim}}>{f$(d.amount)}</span>
          </div>)}
        </Card>}
      </div>
    </div>

    {vendorDetailId&&vendorProjectId&&(()=>{
      const proj=projects.find(p=>p.id===vendorProjectId);
      if(!proj)return null;
      return<VendorDetailModal vendorId={vendorDetailId} project={proj} onClose={()=>{setVendorDetailId(null);setVendorProjectId(null)}} canEdit={user.role!=="client"} updateProject={()=>{}}/>;
    })()}

    {/* Mobile FAB — New Project */}
    {canCreate&&<button className="portfolio-fab" onClick={onNew} style={{position:"fixed",bottom:24,right:20,zIndex:200,width:52,height:52,borderRadius:26,background:T.ink,color:T.paper,border:"none",cursor:"pointer",display:"none",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:300,boxShadow:"0 8px 24px rgba(15,82,186,.20)",transition:"transform .15s ease"}} onMouseDown={e=>e.currentTarget.style.transform="scale(.96)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"} aria-label="New Project">+</button>}
  </div>;
}

export default PortfolioDash;
