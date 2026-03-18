import { useState, useMemo } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { calcProject, isOverdue } from '../utils/calc.js';
import { PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS, VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, VENDOR_TYPES } from '../constants/index.js';
import { PlusI, LogOutI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card, Metric } from '../components/primitives/index.js';
import VendorDetailModal from '../components/modals/VendorDetailModal.jsx';

const Pill=({children,color=T.gold,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

const getGreeting=()=>{const h=new Date().getHours();if(h<6)return"Burning the midnight oil";if(h<9)return"You're up early";if(h<12)return"Good morning";if(h<17)return"Good afternoon";if(h<20)return"Good evening";return"Working hard"};

function PortfolioDash({projects,onOpen,onNew,user,onLogout,onDuplicate,onDelete,onUpdateStage}){
  const sorted=[...projects].sort((a,b)=>b.createdAt-a.createdAt);
  const canCreate=user.role!=="viewer";
  const[dragProjectId,setDragProjectId]=useState(null);
  const[dropStage,setDropStage]=useState(null);
  const[tab,setTab]=useState("projects");
  const[vendorSearch,setVendorSearch]=useState("");
  const[vendorTypeFilter,setVendorTypeFilter]=useState("all");
  const[vendorDetailId,setVendorDetailId]=useState(null);
  const[vendorProjectId,setVendorProjectId]=useState(null);
  const allComps=projects.map(p=>({p,c:calcProject(p)}));
  const totalRevenue=allComps.reduce((a,{c})=>a+c.grandTotal,0);
  const totalCost=allComps.reduce((a,{c})=>a+c.productionSubtotal.actualCost+c.agencyCostsSubtotal.actualCost+c.agencyFee.actualCost,0);
  const totalProfit=allComps.reduce((a,{c})=>a+c.netProfit,0);
  const allOverdue=[];const allUpcoming=[];
  projects.forEach(p=>{(p.docs||[]).forEach(d=>{if(d.status==="overdue"||(d.status==="pending"&&isOverdue(d)))allOverdue.push({...d,projectName:p.name,projectId:p.id});else if(d.status==="pending"&&d.dueDate&&!isOverdue(d))allUpcoming.push({...d,projectName:p.name,projectId:p.id})})});
  allUpcoming.sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""));

  const masterVendors=useMemo(()=>{
    const map=new Map();
    projects.forEach(p=>{
      (p.vendors||[]).forEach(v=>{
        const key=(v.name||"").toLowerCase().trim()+(v.email||"").toLowerCase().trim();
        if(!key)return;
        const existing=map.get(key);
        if(existing){existing.projects.push({id:p.id,name:p.name});existing.projectCount++}
        else map.set(key,{...v,projects:[{id:p.id,name:p.name}],projectCount:1,_projectId:p.id});
      });
    });
    return[...map.values()];
  },[projects]);

  const filteredVendors=masterVendors.filter(v=>{
    if(vendorTypeFilter!=="all"&&v.vendorType!==vendorTypeFilter)return false;
    if(vendorSearch){const s=vendorSearch.toLowerCase();return(v.name||"").toLowerCase().includes(s)||(v.email||"").toLowerCase().includes(s)||(v.contactName||"").toLowerCase().includes(s)}
    return true;
  });

  const activeProjects=projects.filter(p=>(p.stage||"pitching")!=="archived").length;
  const firstName=(user.name||user.email||"").split(" ")[0]||"there";
  const statusParts=[];
  if(allOverdue.length>0)statusParts.push(`${allOverdue.length} invoice${allOverdue.length>1?"s":""} overdue`);
  if(allUpcoming.length>0)statusParts.push(`${allUpcoming.length} deadline${allUpcoming.length>1?"s":""} coming up`);
  if(activeProjects>0)statusParts.push(`${activeProjects} active project${activeProjects>1?"s":""}`);
  if(totalRevenue>0)statusParts.push(`${f0(totalRevenue)} total revenue`);
  const statusLine=statusParts.join(" · ");

  return<div style={{height:"100vh",background:T.bg,fontFamily:T.sans,overflow:"auto"}}>
    {/* ── Accent gradient line ── */}
    <div style={{height:2,background:`linear-gradient(90deg,${T.gold},${T.cyan},${T.magenta},${T.pos})`,opacity:.4}}/>

    <div className="portfolio-container" style={{maxWidth:1100,margin:"0 auto",padding:"36px 32px"}}>

      {/* ── Header ── */}
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:14,marginBottom:8}}>
        <ESWordmark height={14} color={T.gold}/>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          {canCreate&&<button onClick={onNew} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}}><PlusI size={11} color={T.gold}/> New Project</button>}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:T.goldSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:T.gold,flexShrink:0}}>{(user.name||user.email||"?")[0]}</div>
            <span style={{fontSize:11,color:T.dim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:100}}>{user.name||user.email||""}</span>
            <button onClick={onLogout} style={{background:"none",border:"none",cursor:"pointer",padding:4,flexShrink:0}}><LogOutI size={12} color={T.dim}/></button>
          </div>
        </div>
      </div>

      {/* ── Welcome ── */}
      <div style={{marginBottom:28}}>
        <h1 style={{fontSize:"clamp(22px, 4vw, 30px)",fontWeight:700,color:T.cream,letterSpacing:"-0.03em"}}>{getGreeting()}, {firstName}.</h1>
        {statusLine&&<p style={{fontSize:12,color:T.dim,marginTop:6}}>{statusLine}</p>}
      </div>

      {/* ── Nav — full width ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:2,marginBottom:24,background:T.surface,borderRadius:T.rS,padding:3}}>
        {[["projects","Projects"],["vendors","Vendors"],["dashboard","Dashboard"]].map(([id,label])=>
          <button key={id} onClick={()=>setTab(id)} style={{padding:"9px 0",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:tab===id?600:400,fontFamily:T.sans,background:tab===id?T.goldSoft:"transparent",color:tab===id?T.gold:T.dim,transition:"all .15s",textAlign:"center"}}>
            {label}
            {id==="dashboard"&&allOverdue.length>0?<span style={{marginLeft:6,fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:8,background:"rgba(248,113,113,.15)",color:T.neg}}>{allOverdue.length}</span>:""}
          </button>
        )}
      </div>

      {/* ── Projects tab ── */}
      {tab==="projects"&&<div className="fade-up">
        {projects.length===0?<div style={{textAlign:"center",padding:"80px 20px"}}><div style={{fontSize:48,marginBottom:16,opacity:.15}}>&#9674;</div><h2 style={{fontSize:18,fontWeight:500,color:T.cream,marginBottom:8}}>No projects yet</h2><p style={{fontSize:13,color:T.dim,marginBottom:28}}>Create your first production budget to get started.</p>{canCreate&&<button onClick={onNew} style={{padding:"12px 28px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Create Project</button>}</div>
        :<div>
          {/* Overdue alert */}
          {allOverdue.length>0&&<div style={{padding:"14px 18px",marginBottom:20,borderRadius:T.rS,background:"rgba(248,113,113,.04)",border:"1px solid rgba(248,113,113,.12)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:10,fontWeight:700,color:T.neg,textTransform:"uppercase",letterSpacing:".06em"}}>Overdue Invoices</span><Pill color={T.neg} size="xs">{allOverdue.length}</Pill></div>
            {allOverdue.slice(0,5).map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.cream,flex:1,fontWeight:500}}>{d.name}</span><Pill color={T.dim} size="xs">{d.projectName}</Pill><span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontFamily:T.mono,fontWeight:600,color:T.neg}}>{f$(d.amount)}</span>
            </div>)}
          </div>}

          {/* Upcoming deadlines */}
          {allUpcoming.length>0&&<div style={{padding:"14px 18px",marginBottom:20,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:T.gold,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Upcoming Deadlines</div>
            {allUpcoming.slice(0,5).map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.cream,flex:1,fontWeight:500}}>{d.name}</span><Pill color={T.dim} size="xs">{d.projectName}</Pill><span style={{fontSize:10,color:T.gold,fontFamily:T.mono}}>{d.dueDate}</span><span className="num" style={{fontFamily:T.mono,color:T.dim}}>{f$(d.amount)}</span>
            </div>)}
          </div>}

          {/* Stage sections */}
          {PROJECT_STAGES.map(stage=>{
            const stageProjects=sorted.filter(p=>(p.stage||"pitching")===stage);
            const isDropTarget=dragProjectId&&dropStage===stage;
            const showEmpty=stageProjects.length===0;
            if(showEmpty&&stage==="archived"&&!dragProjectId)return null;
            return<div key={stage} style={{marginBottom:28}}
              onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDropStage(stage)}}
              onDragLeave={()=>setDropStage(null)}
              onDrop={e=>{e.preventDefault();if(dragProjectId&&onUpdateStage){onUpdateStage(dragProjectId,stage)}setDragProjectId(null);setDropStage(null)}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:STAGE_COLORS[stage],transition:"transform .2s",transform:isDropTarget?"scale(1.3)":"scale(1)"}}/>
                <h2 style={{fontSize:16,fontWeight:600,color:isDropTarget?STAGE_COLORS[stage]:T.cream,letterSpacing:"-0.01em",transition:"color .2s"}}>{STAGE_LABELS[stage]}</h2>
                <span style={{fontSize:11,color:T.dim}}>({stageProjects.length})</span>
              </div>
              {showEmpty?<div style={{padding:"24px 20px",border:`2px dashed ${isDropTarget?STAGE_COLORS[stage]:T.border}`,borderRadius:T.r,textAlign:"center",transition:"all .2s",background:isDropTarget?`${STAGE_COLORS[stage]}08`:"transparent"}}>
                <p style={{fontSize:12,color:isDropTarget?STAGE_COLORS[stage]:T.dim}}>{isDropTarget?"Drop here to move to "+STAGE_LABELS[stage]:"No "+STAGE_LABELS[stage].toLowerCase()+" projects"}</p>
              </div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:14,padding:isDropTarget?8:0,border:isDropTarget?`2px dashed ${STAGE_COLORS[stage]}`:"2px dashed transparent",borderRadius:T.r,transition:"all .2s",background:isDropTarget?`${STAGE_COLORS[stage]}06`:"transparent"}}>
                {stageProjects.map(p=>{const comp=calcProject(p);const ov=(p.docs||[]).filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d))).length;const tasksDone=(p.timeline||[]).filter(t=>t.status==="done").length;const tasksTotal=(p.timeline||[]).length;const taskPct=tasksTotal>0?Math.round(tasksDone/tasksTotal*100):0;
                  return<div key={p.id} draggable onDragStart={e=>{setDragProjectId(p.id);e.dataTransfer.effectAllowed="move"}} onDragEnd={()=>{setDragProjectId(null);setDropStage(null)}}><Card hoverable onClick={()=>onOpen(p.id)} style={{padding:0,overflow:"hidden",opacity:stage==="archived"?.6:dragProjectId===p.id?.4:1,cursor:"grab",borderLeft:`3px solid ${STAGE_COLORS[stage]}`}}>
                    <div style={{padding:"18px 20px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                          {p.logo&&<img src={p.logo} alt={p.client||p.name||"Client logo"} style={{width:26,height:26,borderRadius:4,objectFit:"contain",flexShrink:0}}/>}
                          <div style={{flex:1,minWidth:0}}>
                            <h3 style={{fontSize:13,fontWeight:600,color:T.cream,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</h3>
                            <p style={{fontSize:11,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.client||"No client"}</p>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                          {ov>0&&<Pill color={T.neg} size="xs">{ov} overdue</Pill>}
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}>
                        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Grand Total</div><div className="num" style={{fontSize:16,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(comp.grandTotal)}</div></div>
                        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Net Profit</div><div className="num" style={{fontSize:16,fontWeight:700,color:comp.netProfit>0?T.pos:T.dim,fontFamily:T.mono}}>{f0(comp.netProfit)}</div></div>
                      </div>
                      {/* Task progress bar */}
                      {tasksTotal>0&&<div style={{marginTop:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:T.dim}}>{tasksDone}/{tasksTotal} tasks</span><span style={{fontSize:9,color:T.dim,fontFamily:T.mono}}>{taskPct}%</span></div>
                        <div style={{height:3,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${taskPct}%`,background:`linear-gradient(90deg,${STAGE_COLORS[stage]},${T.pos})`,borderRadius:2,transition:"width .4s ease"}}/></div>
                      </div>}
                    </div>
                    <div style={{padding:"8px 20px",background:"rgba(255,255,255,.015)",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                      <span style={{fontSize:10,color:T.dim}}>{p.eventDate?`Event: ${p.eventDate}`:p.date||"No date"}</span>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        {onDuplicate&&<button onClick={e=>{e.stopPropagation();onDuplicate(p.id)}} style={{fontSize:10,color:T.dim,background:"none",border:"none",cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Duplicate</button>}
                        {onDelete&&<button onClick={e=>{e.stopPropagation();if(confirm(`Delete "${p.name}"? This cannot be undone.`))onDelete(p.id)}} style={{fontSize:10,color:T.dim,background:"none",border:"none",cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.neg} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Delete</button>}
                        <span style={{fontSize:10,color:T.gold,fontWeight:500}}>Open &rarr;</span>
                      </div>
                    </div>
                  </Card></div>})}
              </div>}
            </div>})}
          {canCreate&&<div onClick={onNew} style={{borderRadius:T.r,border:`2px dashed ${T.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:36,cursor:"pointer",transition:"all .2s",maxWidth:240}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}><div style={{width:32,height:32,borderRadius:"50%",background:T.goldSoft,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><PlusI size={14} color={T.gold}/></div><span style={{fontSize:12,fontWeight:500,color:T.dim}}>New Project</span></div>}
        </div>}
      </div>}

      {/* ── Vendors tab ── */}
      {tab==="vendors"&&<div className="fade-up">
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
          <input value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)} placeholder="Search vendors..." style={{flex:1,minWidth:180,padding:"8px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
          <div style={{position:"relative"}}>
            <select value={vendorTypeFilter} onChange={e=>setVendorTypeFilter(e.target.value)} style={{padding:"8px 28px 8px 10px",borderRadius:T.rS,background:vendorTypeFilter!=="all"?`${VENDOR_TYPE_COLORS[vendorTypeFilter]||T.gold}12`:T.surface,border:`1px solid ${vendorTypeFilter!=="all"?`${VENDOR_TYPE_COLORS[vendorTypeFilter]||T.gold}33`:T.border}`,color:vendorTypeFilter!=="all"?VENDOR_TYPE_COLORS[vendorTypeFilter]||T.gold:T.dim,fontSize:11,fontWeight:vendorTypeFilter!=="all"?600:400,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none"}}>
              <option value="all">All Types</option>
              {VENDOR_TYPES.map(t=><option key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</option>)}
            </select>
            <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:8,color:T.dim,pointerEvents:"none"}}>&#9660;</span>
          </div>
          {vendorTypeFilter!=="all"&&<button onClick={()=>setVendorTypeFilter("all")} style={{padding:"5px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontFamily:T.sans,background:"rgba(248,113,113,.08)",color:T.neg}}>Clear</button>}
          <span style={{fontSize:11,color:T.dim,marginLeft:"auto"}}>{filteredVendors.length} vendor{filteredVendors.length!==1?"s":""}</span>
        </div>

        {filteredVendors.length===0?<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:13}}>No vendors{vendorSearch||vendorTypeFilter!=="all"?" match this search":""}</div>
        :<Card style={{overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr minmax(70px,.8fr) minmax(80px,1fr) minmax(100px,1.2fr) minmax(80px,1fr)",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface,alignItems:"center"}}>
            {["Vendor","Type","Contact","Email","Projects"].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i===4?"right":"left"}}>{h}</span>)}
          </div>
          {filteredVendors.map(v=><div key={v.id+v._projectId} onClick={()=>{setVendorDetailId(v.id);setVendorProjectId(v._projectId)}} style={{display:"grid",gridTemplateColumns:"2fr minmax(70px,.8fr) minmax(80px,1fr) minmax(100px,1.2fr) minmax(80px,1fr)",padding:"14px 18px",borderBottom:`1px solid ${T.border}`,alignItems:"center",cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div><div style={{fontSize:13,fontWeight:500,color:T.cream}}>{v.name}</div>{v.notes&&<div style={{fontSize:10,color:T.dim,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.notes}</div>}</div>
            <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${VENDOR_TYPE_COLORS[v.vendorType||"other"]}18`,color:VENDOR_TYPE_COLORS[v.vendorType||"other"],display:"inline-block",lineHeight:1.4,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis"}}>{VENDOR_TYPE_LABELS[v.vendorType||"other"]}</span>
            <div style={{fontSize:12,color:T.cream}}>{v.contactName||"\u2014"}</div>
            <div style={{fontSize:11,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.email||"\u2014"}</div>
            <div style={{display:"flex",gap:4,justifyContent:"flex-end",flexWrap:"wrap"}}>{v.projects.map(p=><Pill key={p.id} color={T.dim} size="xs">{p.name}</Pill>)}</div>
          </div>)}
        </Card>}
      </div>}

      {/* ── Dashboard tab ── */}
      {tab==="dashboard"&&<div className="fade-up">
        {allOverdue.length>0&&<div style={{padding:"14px 18px",marginBottom:16,borderRadius:T.rS,background:"rgba(248,113,113,.04)",border:"1px solid rgba(248,113,113,.12)"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:10,fontWeight:700,color:T.neg,textTransform:"uppercase",letterSpacing:".06em"}}>Overdue Invoices</span><Pill color={T.neg} size="xs">{allOverdue.length}</Pill></div>
          {allOverdue.map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{color:T.cream,flex:1,fontWeight:500}}>{d.name}</span><Pill color={T.dim} size="xs">{d.projectName}</Pill><span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontFamily:T.mono,fontWeight:600,color:T.neg}}>{f$(d.amount)}</span>
          </div>)}
        </div>}
        {allUpcoming.length>0&&<div style={{padding:"14px 18px",marginBottom:16,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.gold,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Upcoming Due Dates</div>
          {allUpcoming.slice(0,8).map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{color:T.cream,flex:1,fontWeight:500}}>{d.name}</span><Pill color={T.dim} size="xs">{d.projectName}</Pill><span style={{fontSize:10,color:T.gold,fontFamily:T.mono}}>{d.dueDate}</span><span className="num" style={{fontFamily:T.mono,color:T.dim}}>{f$(d.amount)}</span>
          </div>)}
        </div>}
        <Card style={{overflow:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr .5fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface,minWidth:500}}>{["Project","Grand Total","Net Profit","Margin","Docs"].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i>0?"right":"left"}}>{h}</span>)}</div>
          {allComps.map(({p,c})=>{const m=c.grandTotal>0?((c.netProfit/c.grandTotal)*100).toFixed(1):0;return<div key={p.id} onClick={()=>onOpen(p.id)} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr .5fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,cursor:"pointer",minWidth:500}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{minWidth:0}}><span style={{fontSize:13,fontWeight:500,color:T.cream}}>{p.name}</span><span style={{fontSize:11,color:T.dim,marginLeft:8}}>{p.client}</span></div>
            <span className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{f0(c.grandTotal)}</span>
            <span className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.pos,fontWeight:600}}>{f0(c.netProfit)}</span>
            <span className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.cyan}}>{m}%</span>
            <span style={{textAlign:"right",fontSize:12,color:T.dim}}>{(p.docs||[]).length}</span>
          </div>})}
        </Card>
      </div>}
    </div>

    {vendorDetailId&&vendorProjectId&&(()=>{
      const proj=projects.find(p=>p.id===vendorProjectId);
      if(!proj)return null;
      return<VendorDetailModal vendorId={vendorDetailId} project={proj} onClose={()=>{setVendorDetailId(null);setVendorProjectId(null)}} canEdit={user.role!=="viewer"} updateProject={()=>{}}/>;
    })()}
  </div>;
}

export default PortfolioDash;
