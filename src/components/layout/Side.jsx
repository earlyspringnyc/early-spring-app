import { useState, useMemo } from 'react';
import T from '../../theme/tokens.js';
import { f0 } from '../../utils/format.js';
import { parseD, daysBetween } from '../../utils/date.js';
import { isOverdue } from '../../utils/calc.js';
import { MorganIsotype } from '../brand/MorganLogo.jsx';

function Side({view,setView,comp,user,project,onBack,toggleTheme,themeMode,onLogout,saving,lastSaved}){
  const[expanded,setExpanded]=useState(false);
  const clientLabel=project.client||"Client";

  const navItems=[
    {id:"dashboard",label:"Dashboard",icon:"◐"},
    {id:"budget",label:"Budget",icon:"◈"},
    {id:"timeline",label:"Production",icon:"▤"},
    {id:"vendors",label:"Vendors",icon:"◆"},
    {id:"pnl",label:"P&L + Cash",icon:"◇"},
    {id:"docs",label:"Documents",icon:"▧"},
    {id:"ros",label:"Run of Show",icon:"▶"},
    {id:"export",label:clientLabel,icon:"◈",isClient:true},
    {id:"ai",label:"AI",icon:"◉"},
  ];

  const bottomItems=[
    ...(user.role!=="viewer"?[{id:"settings",label:"Settings",icon:"◎"}]:[]),
    {id:"profile",label:"Profile",icon:"👤"},
  ];

  const oc=(project.docs||[]).filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d))).length;
  const w9p=(project.vendors||[]).filter(v=>v.w9Status==="pending").length;
  const overdueTasks=(project.timeline||[]).filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=parseD(t.endDate);return d&&daysBetween(new Date(),d)<0}).length;
  const dashFlags=oc+overdueTasks;

  return(
    <div
      className="desktop-side"
      onMouseEnter={()=>setExpanded(true)}
      onMouseLeave={()=>setExpanded(false)}
      style={{
        width:expanded?220:64,
        transition:"width .2s cubic-bezier(.4,0,.2,1)",
        display:"flex",
        flexDirection:"column",
        background:T.bg,
        borderRight:`1px solid ${T.border}`,
        overflow:"hidden",
        flexShrink:0,
        fontFamily:T.sans,
      }}
    >
      {/* Logo */}
      <div style={{padding:"20px 0",display:"flex",justifyContent:"center",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:8}} title="All Projects">
          <MorganIsotype size={28} color={T.gold}/>
        </button>
      </div>

      {/* Project name (visible when expanded) */}
      <div style={{padding:"0 16px 16px",overflow:"hidden",whiteSpace:"nowrap",opacity:expanded?1:0,transition:"opacity .15s",height:expanded?"auto":0}}>
        <div style={{fontSize:13,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis"}}>{project.name}</div>
        <div style={{fontSize:11,color:T.dim,marginTop:2}}>{project.client||""}</div>
      </div>

      {/* Main nav */}
      <nav style={{flex:1,padding:"0 8px",display:"flex",flexDirection:"column",gap:2,overflow:"auto"}}>
        {navItems.map(n=>{
          const active=view===n.id;
          const badge=n.id==="dashboard"&&dashFlags>0?dashFlags:n.id==="vendors"&&w9p>0?w9p:n.id==="docs"&&oc>0?oc:0;
          return(
            <button
              key={n.id}
              onClick={()=>setView(n.id)}
              style={{
                display:"flex",
                alignItems:"center",
                gap:12,
                padding:"10px 12px",
                borderRadius:T.rS,
                border:"none",
                cursor:"pointer",
                background:active?T.surfEl:"transparent",
                color:active?T.cream:T.dim,
                fontSize:13,
                fontWeight:active?500:400,
                fontFamily:T.sans,
                transition:"all .15s",
                width:"100%",
                textAlign:"left",
                overflow:"hidden",
                whiteSpace:"nowrap",
                position:"relative",
              }}
              onMouseEnter={e=>{if(!active)e.currentTarget.style.background=T.surfHov}}
              onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent"}}
            >
              <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0,opacity:active?1:.5}}>{n.icon}</span>
              <span style={{opacity:expanded?1:0,transition:"opacity .15s",flex:1}}>{n.label}</span>
              {badge>0&&expanded&&<span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:8,background:"rgba(248,113,113,.15)",color:T.neg}}>{badge}</span>}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{margin:"0 16px",height:1,background:T.border}}/>

      {/* Bottom items */}
      <div style={{padding:"8px 8px 12px",display:"flex",flexDirection:"column",gap:2}}>
        {bottomItems.map(n=>(
          <button
            key={n.id}
            onClick={()=>setView(n.id)}
            style={{
              display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
              borderRadius:T.rS,border:"none",cursor:"pointer",
              background:view===n.id?T.surfEl:"transparent",
              color:view===n.id?T.cream:T.dim,
              fontSize:13,fontFamily:T.sans,transition:"all .15s",
              width:"100%",textAlign:"left",overflow:"hidden",whiteSpace:"nowrap",
            }}
            onMouseEnter={e=>e.currentTarget.style.background=T.surfHov}
            onMouseLeave={e=>{if(view!==n.id)e.currentTarget.style.background="transparent"}}
          >
            <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0,opacity:.5}}>{n.icon}</span>
            <span style={{opacity:expanded?1:0,transition:"opacity .15s"}}>{n.label}</span>
          </button>
        ))}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
            borderRadius:T.rS,border:"none",cursor:"pointer",
            background:"transparent",color:T.dim,
            fontSize:13,fontFamily:T.sans,transition:"all .15s",
            width:"100%",textAlign:"left",
          }}
          onMouseEnter={e=>e.currentTarget.style.color=T.cream}
          onMouseLeave={e=>e.currentTarget.style.color=T.dim}
        >
          <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0}}>{themeMode==="dark"?"\u2600":"\u263E"}</span>
          <span style={{opacity:expanded?1:0,transition:"opacity .15s"}}>{themeMode==="dark"?"Light":"Dark"}</span>
        </button>

        {/* Sign out */}
        {onLogout&&<button
          onClick={onLogout}
          style={{
            display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
            borderRadius:T.rS,border:"none",cursor:"pointer",
            background:"transparent",color:T.dim,
            fontSize:13,fontFamily:T.sans,transition:"all .15s",
            width:"100%",textAlign:"left",
          }}
          onMouseEnter={e=>e.currentTarget.style.color=T.neg}
          onMouseLeave={e=>e.currentTarget.style.color=T.dim}
        >
          <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0}}>{"\u2192"}</span>
          <span style={{opacity:expanded?1:0,transition:"opacity .15s"}}>Sign Out</span>
        </button>}

        {/* Save indicator */}
        {saving&&<div style={{textAlign:"center",padding:4}}><div style={{width:6,height:6,borderRadius:"50%",background:T.gold,margin:"0 auto",animation:"pulse 1s ease-in-out infinite"}}/></div>}
      </div>
    </div>
  );
}

export default Side;
