import { useState } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { calcProject, isOverdue } from '../utils/calc.js';
import { PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS } from '../constants/index.js';
import { PlusI, LogOutI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card, Metric } from '../components/primitives/index.js';

function PortfolioDash({projects,onOpen,onNew,user,onLogout}){
  const sorted=[...projects].sort((a,b)=>b.createdAt-a.createdAt);
  const canCreate=user.role!=="viewer";
  const[tab,setTab]=useState("projects");
  const allComps=projects.map(p=>({p,c:calcProject(p)}));
  const totalRevenue=allComps.reduce((a,{c})=>a+c.grandTotal,0);
  const totalCost=allComps.reduce((a,{c})=>a+c.productionSubtotal.actualCost+c.agencyCostsSubtotal.actualCost+c.agencyFee.actualCost,0);
  const totalProfit=allComps.reduce((a,{c})=>a+c.netProfit,0);
  const allOverdue=[];const allUpcoming=[];
  projects.forEach(p=>{(p.docs||[]).forEach(d=>{if(d.status==="overdue"||(d.status==="pending"&&isOverdue(d)))allOverdue.push({...d,projectName:p.name,projectId:p.id});else if(d.status==="pending"&&d.dueDate&&!isOverdue(d))allUpcoming.push({...d,projectName:p.name,projectId:p.id})})});
  allUpcoming.sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""));

  return<div className="scanlines retro-grid" style={{height:"100vh",background:T.bgGrad,fontFamily:T.sans,overflow:"auto"}}>
    <div className="portfolio-container" style={{maxWidth:1100,margin:"0 auto",padding:"40px 32px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div><div style={{marginBottom:10}}><ESWordmark height={16} color={T.gold}/></div><h1 style={{fontSize:28,fontWeight:600,color:T.cream}}>Production Portfolio</h1></div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          {canCreate&&<button onClick={onNew} style={{display:"flex",alignItems:"center",gap:8,padding:"11px 22px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}><PlusI size={13} color={T.brown}/> New Project</button>}
          <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:"50%",background:T.goldSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:T.gold}}>{(user.name||user.email||"?")[0]}</div><span style={{fontSize:12,color:T.dim}}>{user.name||user.email||""}</span><button onClick={onLogout} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><LogOutI size={13} color={T.dim}/></button></div>
        </div>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:24}}>{[["projects","Projects"],["dashboard","Dashboard"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} style={{padding:"9px 18px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:12,fontWeight:tab===id?600:400,fontFamily:T.sans,background:tab===id?T.goldSoft:"transparent",color:tab===id?T.gold:T.dim}}>{label}{id==="dashboard"&&allOverdue.length>0?<span style={{marginLeft:6,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8,background:"rgba(248,113,113,.15)",color:T.neg}}>{allOverdue.length}</span>:""}</button>)}</div>

      {tab==="dashboard"&&<div className="fade-up">
        <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
          <Metric label="Active Projects" value={projects.length}/><Metric label="Total Revenue" value={f0(totalRevenue)} color={T.gold} glow/><Metric label="Total Costs" value={f0(totalCost)}/><Metric label="Total Profit" value={f0(totalProfit)} color={T.pos}/>
        </div>
        {allOverdue.length>0&&<Card style={{padding:20,marginBottom:16,borderColor:"rgba(248,113,113,.2)",background:"rgba(248,113,113,.03)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{fontSize:16}}>⚠</span><span style={{fontSize:13,fontWeight:600,color:T.neg}}>Overdue Invoices ({allOverdue.length})</span></div>
          {allOverdue.map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",marginBottom:4,borderRadius:T.rS,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:12,color:T.neg,fontWeight:600,flex:1}}>{d.name}</span><span style={{fontSize:11,color:T.dim}}>{d.projectName}</span><span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:T.neg}}>{f$(d.amount)}</span>
          </div>)}
        </Card>}
        {allUpcoming.length>0&&<Card style={{padding:20,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:T.cream,marginBottom:14}}>Upcoming Due Dates</div>
          {allUpcoming.slice(0,8).map(d=><div key={d.id} onClick={()=>onOpen(d.projectId)} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 14px",marginBottom:2,borderRadius:T.rS,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:12,color:T.cream,flex:1}}>{d.name}</span><span style={{fontSize:11,color:T.dim}}>{d.projectName}</span><span style={{fontSize:11,color:T.gold,fontFamily:T.mono}}>{d.dueDate}</span><span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.dim}}>{f$(d.amount)}</span>
          </div>)}
        </Card>}
        <Card style={{overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr .5fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>{["Project","Grand Total","Net Profit","Margin","Docs"].map((h,i)=><span key={i} style={{fontSize:9.5,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i>0?"right":"left"}}>{h}</span>)}</div>
          {allComps.map(({p,c})=>{const m=c.grandTotal>0?((c.netProfit/c.grandTotal)*100).toFixed(1):0;return<div key={p.id} onClick={()=>onOpen(p.id)} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr .5fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div><span style={{fontSize:13,fontWeight:500,color:T.cream}}>{p.name}</span><span style={{fontSize:11,color:T.dim,marginLeft:8}}>{p.client}</span></div>
            <span className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{f0(c.grandTotal)}</span>
            <span className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.pos,fontWeight:600}}>{f0(c.netProfit)}</span>
            <span className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.cyan}}>{m}%</span>
            <span style={{textAlign:"right",fontSize:12,color:T.dim}}>{(p.docs||[]).length}</span>
          </div>})}
        </Card>
      </div>}

      {tab==="projects"&&<div className="fade-up">
        {projects.length===0?<div style={{textAlign:"center",padding:"80px 20px"}}><div style={{fontSize:48,marginBottom:16,opacity:.15}}>◈</div><h2 style={{fontSize:18,fontWeight:500,color:T.cream,marginBottom:8}}>No projects yet</h2><p style={{fontSize:14,color:T.dim,marginBottom:28}}>Create your first production budget to get started.</p>{canCreate&&<button onClick={onNew} style={{padding:"12px 28px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Create Project</button>}</div>
        :<div>
          {PROJECT_STAGES.map(stage=>{
            const stageProjects=sorted.filter(p=>(p.stage||"pitching")===stage);
            if(stageProjects.length===0&&stage==="archived")return null;
            return<div key={stage} style={{marginBottom:28}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:STAGE_COLORS[stage]}}/>
                <h2 style={{fontSize:16,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>{STAGE_LABELS[stage]}</h2>
                <span style={{fontSize:11,color:T.dim}}>({stageProjects.length})</span>
              </div>
              {stageProjects.length===0?<div style={{padding:"24px 20px",border:`1px dashed ${T.border}`,borderRadius:T.r,textAlign:"center"}}>
                <p style={{fontSize:12,color:T.dim}}>No {STAGE_LABELS[stage].toLowerCase()} projects</p>
              </div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:16}}>
                {stageProjects.map(p=>{const comp=calcProject(p);const hasData=comp.productionSubtotal.actualCost>0;const ov=(p.docs||[]).filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d))).length;
                  return<Card key={p.id} hoverable onClick={()=>onOpen(p.id)} style={{padding:0,overflow:"hidden",opacity:stage==="archived"?.6:1}}>
                    <div style={{padding:"22px 24px 18px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                          {p.logo&&<img src={p.logo} style={{width:28,height:28,borderRadius:4,objectFit:"contain",flexShrink:0}}/>}
                          <div style={{flex:1,minWidth:0}}><h3 style={{fontSize:15,fontWeight:600,color:T.cream,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</h3><p style={{fontSize:12,color:T.dim,fontFamily:T.serif}}>{p.client||"No client"}</p></div></div><div style={{display:"flex",gap:4,alignItems:"center"}}>{ov>0&&<span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:10,background:"rgba(248,113,113,.12)",color:T.neg}}>{ov} overdue</span>}<span style={{fontSize:8,fontWeight:700,padding:"2px 7px",borderRadius:6,background:`${STAGE_COLORS[stage]}15`,color:STAGE_COLORS[stage],textTransform:"uppercase"}}>{STAGE_LABELS[stage]}</span></div></div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:16}}><div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Grand Total</div><div className="num" style={{fontSize:18,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(comp.grandTotal)}</div></div><div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Net Profit</div><div className="num" style={{fontSize:18,fontWeight:700,color:comp.netProfit>0?T.pos:T.dim,fontFamily:T.mono}}>{f0(comp.netProfit)}</div></div></div></div>
                    <div style={{padding:"10px 24px",background:"rgba(255,255,255,.015)",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:10,color:T.dim}}>{p.eventDate?`Event: ${p.eventDate}`:p.date||"No date"}</span><span style={{fontSize:10,color:T.gold,fontWeight:500}}>Open →</span></div>
                  </Card>})}
              </div>}
            </div>})}
          {canCreate&&<div onClick={onNew} style={{borderRadius:T.r,border:`2px dashed ${T.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}><div style={{width:36,height:36,borderRadius:"50%",background:T.goldSoft,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}><PlusI size={16} color={T.gold}/></div><span style={{fontSize:13,fontWeight:500,color:T.dim}}>New Project</span></div>}
        </div>}
      </div>}
    </div>
  </div>;
}

export default PortfolioDash;
