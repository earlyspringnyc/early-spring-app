import { useState } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { calcProject, isOverdue } from '../utils/calc.js';
import { PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS } from '../constants/index.js';
import { PlusI, LogOutI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card, Metric } from '../components/primitives/index.js';

function PortfolioDash({projects,onOpen,onNew,user,onLogout,onDuplicate,onDelete,onUpdateStage}){
  const sorted=[...projects].sort((a,b)=>b.createdAt-a.createdAt);
  const canCreate=user.role!=="viewer";
  const[dragProjectId,setDragProjectId]=useState(null);
  const[dropStage,setDropStage]=useState(null);
  const[tab,setTab]=useState("projects");
  const allComps=projects.map(p=>({p,c:calcProject(p)}));
  const totalRevenue=allComps.reduce((a,{c})=>a+c.grandTotal,0);
  const totalCost=allComps.reduce((a,{c})=>a+c.productionSubtotal.actualCost+c.agencyCostsSubtotal.actualCost+c.agencyFee.actualCost,0);
  const totalProfit=allComps.reduce((a,{c})=>a+c.netProfit,0);
  const allOverdue=[];const allUpcoming=[];
  projects.forEach(p=>{(p.docs||[]).forEach(d=>{if(d.status==="overdue"||(d.status==="pending"&&isOverdue(d)))allOverdue.push({...d,projectName:p.name,projectId:p.id});else if(d.status==="pending"&&d.dueDate&&!isOverdue(d))allUpcoming.push({...d,projectName:p.name,projectId:p.id})})});
  allUpcoming.sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""));

  return<div style={{height:"100vh",background:T.bg,fontFamily:T.sans,overflow:"auto"}}>
    <div className="portfolio-container" style={{maxWidth:1100,margin:"0 auto",padding:"40px 32px"}}>
      {/* Header — wraps cleanly on narrow screens */}
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:28}}>
        <div style={{minWidth:0}}>
          <div style={{marginBottom:8}}><ESWordmark height={14} color={T.gold}/></div>
          <h1 style={{fontSize:"clamp(20px, 4vw, 28px)",fontWeight:600,color:T.cream,whiteSpace:"nowrap"}}>Production Portfolio</h1>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          {canCreate&&<button onClick={onNew} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}}><PlusI size={12} color={T.gold}/> New Project</button>}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:T.goldSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:T.gold,flexShrink:0}}>{(user.name||user.email||"?")[0]}</div>
            <span style={{fontSize:12,color:T.dim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:120}}>{user.name||user.email||""}</span>
            <button onClick={onLogout} style={{background:"none",border:"none",cursor:"pointer",padding:4,flexShrink:0}}><LogOutI size={13} color={T.dim}/></button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:24}}>{[["projects","Projects"],["dashboard","Dashboard"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} style={{padding:"9px 18px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:12,fontWeight:tab===id?600:400,fontFamily:T.sans,background:tab===id?T.goldSoft:"transparent",color:tab===id?T.gold:T.dim}}>{label}{id==="dashboard"&&allOverdue.length>0?<span style={{marginLeft:6,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:8,background:"rgba(248,113,113,.15)",color:T.neg}}>{allOverdue.length}</span>:""}</button>)}</div>

      {tab==="dashboard"&&<div className="fade-up">
        <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:12,marginBottom:20}}>
          <Metric label="Active Projects" value={projects.length}/><Metric label="Total Revenue" value={f0(totalRevenue)} color={T.gold} glow/><Metric label="Total Costs" value={f0(totalCost)}/><Metric label="Total Profit" value={f0(totalProfit)} color={T.pos}/>
        </div>
        {allOverdue.length>0&&<Card style={{padding:20,marginBottom:16,borderColor:"rgba(248,113,113,.2)",background:"rgba(248,113,113,.03)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{fontSize:16}}>⚠</span><span style={{fontSize:13,fontWeight:600,color:T.neg}}>Overdue Invoices ({allOverdue.length})</span></div>
          {allOverdue.map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",marginBottom:4,borderRadius:T.rS,cursor:"pointer",flexWrap:"wrap"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:12,color:T.neg,fontWeight:600,flex:1,minWidth:100}}>{d.name}</span><span style={{fontSize:11,color:T.dim}}>{d.projectName}</span><span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:T.neg}}>{f$(d.amount)}</span>
          </div>)}
        </Card>}
        {allUpcoming.length>0&&<Card style={{padding:20,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:14}}>Upcoming Due Dates</div>
          {allUpcoming.slice(0,8).map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 14px",marginBottom:2,borderRadius:T.rS,cursor:"pointer",flexWrap:"wrap"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:12,color:T.cream,flex:1,minWidth:100}}>{d.name}</span><span style={{fontSize:11,color:T.dim}}>{d.projectName}</span><span style={{fontSize:11,color:T.gold,fontFamily:T.mono}}>{d.dueDate}</span><span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.dim}}>{f$(d.amount)}</span>
          </div>)}
        </Card>}
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

      {tab==="projects"&&<div className="fade-up">
        {projects.length===0?<div style={{textAlign:"center",padding:"80px 20px"}}><div style={{fontSize:48,marginBottom:16,opacity:.15}}>◈</div><h2 style={{fontSize:18,fontWeight:500,color:T.cream,marginBottom:8}}>No projects yet</h2><p style={{fontSize:13,color:T.dim,marginBottom:28}}>Create your first production budget to get started.</p>{canCreate&&<button onClick={onNew} style={{padding:"12px 28px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Create Project</button>}</div>
        :<div>
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
                {stageProjects.map(p=>{const comp=calcProject(p);const ov=(p.docs||[]).filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d))).length;
                  return<div key={p.id} draggable onDragStart={e=>{setDragProjectId(p.id);e.dataTransfer.effectAllowed="move"}} onDragEnd={()=>{setDragProjectId(null);setDropStage(null)}}><Card hoverable onClick={()=>onOpen(p.id)} style={{padding:0,overflow:"hidden",opacity:stage==="archived"?.6:dragProjectId===p.id?.4:1,cursor:"grab"}}>
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
                          {ov>0&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:10,background:"rgba(248,113,113,.12)",color:T.neg}}>{ov} overdue</span>}
                          <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:`${STAGE_COLORS[stage]}15`,color:STAGE_COLORS[stage],textTransform:"uppercase"}}>{STAGE_LABELS[stage]}</span>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}>
                        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Grand Total</div><div className="num" style={{fontSize:16,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(comp.grandTotal)}</div></div>
                        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Net Profit</div><div className="num" style={{fontSize:16,fontWeight:700,color:comp.netProfit>0?T.pos:T.dim,fontFamily:T.mono}}>{f0(comp.netProfit)}</div></div>
                      </div>
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
    </div>
  </div>;
}

export default PortfolioDash;
