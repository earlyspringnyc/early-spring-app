import { useState, useMemo } from 'react';
import T from '../../theme/tokens.js';
import { f0 } from '../../utils/format.js';
import { parseD, daysBetween } from '../../utils/date.js';
import { isOverdue } from '../../utils/calc.js';
import { ESIsotype } from '../brand/index.js';
import { BackI, LogOutI } from '../icons/index.js';

function Side({view,setView,comp,user,project,onBack,toggleTheme,themeMode,onLogout}){
  const clientLabel=project.client||"Client";
  const mainNav=[{id:"dashboard",label:"Dashboard",s:"◐"},{id:"budget",label:"Budget",s:"◈"},{id:"timeline",label:"Timeline",s:"▤"},{id:"vendors",label:"Vendors",s:"◆"},{id:"export",label:clientLabel,s:"◈",isClient:true},{id:"ai",label:"AI Assistant",s:"◉"},...(user.role!=="viewer"?[{id:"settings",label:"Settings",s:"◎"}]:[])];
  const toolboxNav=[{id:"pnl",label:"P&L + Cash",s:"◇"},{id:"docs",label:"Documents",s:"▧"},{id:"ros",label:"Run of Show",s:"▶"}];
  const defaultNav=[...mainNav,...toolboxNav];
  const[nav,setNav]=useState(defaultNav);
  const[dragIdx,setDragIdx]=useState(null);
  const[overIdx,setOverIdx]=useState(null);
  const[search,setSearch]=useState("");
  const[toolboxOpen,setToolboxOpen]=useState(false);
  const searchResults=useMemo(()=>{
    if(!search.trim())return[];
    const q=search.toLowerCase();const results=[];
    (project.vendors||[]).forEach(v=>{if(v.name.toLowerCase().includes(q))results.push({type:"vendor",label:v.name,view:"vendors"})});
    (project.timeline||[]).forEach(t=>{if(t.name.toLowerCase().includes(q))results.push({type:"task",label:t.name,view:"timeline"})});
    (project.docs||[]).forEach(d=>{if(d.name.toLowerCase().includes(q))results.push({type:"doc",label:d.name,view:"docs"})});
    (project.cats||[]).forEach(c=>c.items.forEach(it=>{if(it.name.toLowerCase().includes(q))results.push({type:"item",label:`${it.name} (${c.name})`,view:"budget"})}));
    return results.slice(0,8);
  },[search,project]);
  const oc=(project.docs||[]).filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d))).length;
  const w9p=(project.vendors||[]).filter(v=>v.w9Status==="pending").length;
  const overdueTasks=(project.timeline||[]).filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=parseD(t.endDate);return d&&daysBetween(new Date(),d)<0}).length;
  const dashFlags=oc+overdueTasks;
  const onDragStart=(e,i)=>{setDragIdx(i);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",i)};
  const onDragOver=(e,i)=>{e.preventDefault();e.dataTransfer.dropEffect="move";setOverIdx(i)};
  const onDrop=(e,i)=>{e.preventDefault();if(dragIdx===null||dragIdx===i)return;const n=[...nav];const[moved]=n.splice(dragIdx,1);n.splice(i,0,moved);setNav(n);setDragIdx(null);setOverIdx(null)};
  const onDragEnd=()=>{setDragIdx(null);setOverIdx(null)};
  return<div className="desktop-side" style={{width:228,display:"flex",flexDirection:"column",fontFamily:T.sans,background:"linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.005))",borderRight:`1px solid ${T.border}`}}>
    <div style={{padding:"20px 14px 6px"}}><button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:"6px 8px",borderRadius:T.rS,color:T.dim,fontSize:11,fontFamily:T.sans,width:"100%",textAlign:"left",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.dim}}><BackI size={12} color="currentColor"/> All Projects</button></div>
    <div style={{padding:"10px 22px 18px"}}><div style={{display:"flex",alignItems:"center",gap:7}}><ESIsotype size={18} color={T.gold}/><span style={{fontSize:10,fontWeight:600,letterSpacing:".14em",color:T.gold}}>EARLY SPRING</span></div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>{project.logo&&<img src={project.logo} style={{width:28,height:28,borderRadius:6,objectFit:"contain",flexShrink:0,border:`1px solid ${T.border}`}}/>}<div><h2 style={{fontSize:14,fontWeight:600,color:T.cream,lineHeight:1.3}}>{project.name}</h2><p style={{fontSize:11,color:T.dim,marginTop:2}}>{project.client||"No client"}</p></div></div>
    </div>
    <div style={{padding:"0 14px 8px",position:"relative"}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{width:"100%",padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}}/>
      {searchResults.length>0&&<div style={{position:"absolute",left:14,right:14,top:"100%",zIndex:50,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxHeight:200,overflow:"auto"}}>
        {searchResults.map((r,i)=><button key={i} onClick={()=>{setView(r.view);setSearch("")}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:T.cream,fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <span style={{fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:4,background:r.type==="vendor"?`${T.cyan}22`:r.type==="task"?`${T.gold}22`:r.type==="doc"?`${T.magenta}22`:`${T.pos}22`,color:r.type==="vendor"?T.cyan:r.type==="task"?T.gold:r.type==="doc"?T.magenta:T.pos,textTransform:"uppercase"}}>{r.type}</span>
          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</span>
        </button>)}
      </div>}
    </div>
    <nav style={{flex:1,padding:"0 10px",overflow:"auto"}}>
      {mainNav.map(n=>{const isC=n.isClient;const activeColor=isC?T.cyan:T.gold;const activeBg=isC?"rgba(34,211,238,.1)":T.goldSoft;return<button key={n.id} onClick={()=>setView(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:12.5,fontWeight:view===n.id?500:400,fontFamily:T.sans,background:view===n.id?activeBg:"transparent",color:view===n.id?activeColor:T.dim,transition:"all .2s",marginBottom:1,textAlign:"left",position:"relative"}} onMouseEnter={e=>{if(view!==n.id){e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.dimH}}} onMouseLeave={e=>{if(view!==n.id){e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.dim}}}><span style={{fontSize:13,opacity:.6,width:18,color:isC&&view===n.id?T.cyan:undefined}}>{n.s}</span>{n.label}{n.id==="dashboard"&&dashFlags>0&&<span style={{position:"absolute",right:12,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8,background:"rgba(248,113,113,.15)",color:T.neg}}>{dashFlags}</span>}{n.id==="vendors"&&w9p>0&&<span style={{position:"absolute",right:12,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8,background:"rgba(251,191,36,.15)",color:"#FBBF24"}}>{w9p}</span>}</button>})}
      <button onClick={()=>setToolboxOpen(!toolboxOpen)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,margin:"10px 4px 6px",padding:"6px 10px",background:"none",border:"none",cursor:"pointer"}}>
        <span style={{fontSize:10,transition:"transform .2s",transform:toolboxOpen?"rotate(90deg)":"rotate(0)",color:T.dim}}>▸</span>
        <span style={{fontSize:9,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:".12em"}}>Toolbox</span>
        {oc>0&&!toolboxOpen&&<span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:6,background:"rgba(248,113,113,.15)",color:T.neg,marginLeft:"auto"}}>{oc}</span>}
      </button>
      {toolboxOpen&&<div style={{margin:"0 4px 4px",padding:"6px",borderRadius:T.rS,background:"rgba(255,255,255,.015)",border:`1px solid ${T.border}`}}>
        {toolboxNav.map(n=><button key={n.id} onClick={()=>setView(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:12,fontWeight:view===n.id?500:400,fontFamily:T.sans,background:view===n.id?T.goldSoft:"transparent",color:view===n.id?T.gold:T.dim,transition:"all .2s",marginBottom:1,textAlign:"left",position:"relative"}} onMouseEnter={e=>{if(view!==n.id){e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.dimH}}} onMouseLeave={e=>{if(view!==n.id){e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.dim}}}><span style={{fontSize:12,opacity:.6,width:16}}>{n.s}</span>{n.label}{n.id==="docs"&&oc>0&&<span style={{position:"absolute",right:10,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8,background:"rgba(248,113,113,.15)",color:T.neg}}>{oc}</span>}</button>)}
      </div>}
    </nav>
    <div style={{padding:"0 14px 12px"}}><div className="border-breathe" style={{padding:"20px 18px",borderRadius:T.r,background:"linear-gradient(135deg,rgba(255,234,151,.04),rgba(34,211,238,.02),rgba(232,121,249,.02))",backgroundSize:"200% 200%",animation:"gradientShift 8s ease infinite",border:"1px solid rgba(255,234,151,.06)"}}><div style={{fontSize:9,color:T.dim,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",fontFamily:T.sans}}>Net Profit</div><div className="num" style={{fontSize:26,fontWeight:700,color:T.gold,fontFamily:T.mono,marginTop:6,lineHeight:1,letterSpacing:"-0.02em"}}>{f0(comp.netProfit)}</div><div style={{height:1,background:`linear-gradient(90deg,transparent,${T.border},transparent)`,margin:"14px 0"}}/><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:T.dim,fontFamily:T.serif,fontStyle:"italic"}}>Grand Total</span><span className="num" style={{fontSize:14,fontWeight:600,color:T.cream,fontFamily:T.mono}}>{f0(comp.grandTotal)}</span></div></div></div>
    {toggleTheme&&<div style={{padding:"8px 14px"}}>
      <button onClick={toggleTheme} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"8px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:500,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.dim}}>
        <span style={{fontSize:14}}>{themeMode==="dark"?"\u2600":"\u263E"}</span>
        {themeMode==="dark"?"Light Mode":"Dark Mode"}
      </button>
    </div>}
    <div style={{padding:"12px 14px",borderTop:`1px solid ${T.border}`}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:onLogout?8:0}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,rgba(255,234,151,.15),rgba(255,234,151,.05))",border:"1.5px solid rgba(255,234,151,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:T.gold}}>{(user.name||user.email||"?")[0]}</div>
        <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:T.cream}}>{user.name||user.email||""}</div><div style={{fontSize:10,color:T.dim,textTransform:"capitalize"}}>{user.role}</div></div>
      </div>
      {onLogout&&<button onClick={onLogout} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"7px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:500,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.06)";e.currentTarget.style.borderColor="rgba(248,113,113,.2)";e.currentTarget.style.color=T.neg}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}><LogOutI size={12} color="currentColor"/> Sign Out</button>}
    </div>
  </div>;
}

export default Side;
