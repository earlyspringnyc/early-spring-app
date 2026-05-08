import { useState, useMemo } from 'react';
import T from '../../theme/tokens.js';
import { f0 } from '../../utils/format.js';
import { parseD, daysBetween } from '../../utils/date.js';
import { isOverdue } from '../../utils/calc.js';
import { MorganIsotype } from '../brand/MorganLogo.jsx';

function OrgAvatar({org,size=20}){
  const initial=(org?.name||"?")[0].toUpperCase();
  if(org?.logo_url)return<img src={org.logo_url} alt="" style={{width:size,height:size,borderRadius:size/2,objectFit:"cover"}}/>;
  return<div style={{width:size,height:size,borderRadius:size/2,background:T.surfEl,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.5,fontWeight:600,color:T.cream,flexShrink:0}}>{initial}</div>;
}

function Side({view,setView,comp,user,project,onBack,toggleTheme,themeMode,onLogout,saving,lastSaved,profiles=[],organizations=[],currentOrgId,switchOrg}){
  const[expanded,setExpanded]=useState(false);
  const[toolsOpen,setToolsOpen]=useState(false);
  const[orgDropdownOpen,setOrgDropdownOpen]=useState(false);
  const clientName=project.client||"Client";

  const currentOrg=organizations.find(o=>o.id===currentOrgId)||organizations[0]||null;
  const hasMultipleOrgs=profiles.length>1;

  const mainNav=[
    {id:"dashboard",label:"Dashboard",icon:"\u25D0"},
    {id:"budget",label:"Budget",icon:"\u25C8"},
    {id:"timeline",label:"Production",icon:"\u25A4"},
    {id:"vendors",label:"Vendors",icon:"\u25C6"},
    {id:"creative",label:"Creative",icon:"\u25A8"},
    {id:"ai",label:"ES AI",icon:"\u25C9"},
  ];

  const clientNav={id:"export",label:`Client: ${clientName}`,icon:"\u25CE"};

  const toolItems=[
    {id:"pnl",label:"Finance",icon:"\u25C7"},
    {id:"ros",label:"Run of Show",icon:"\u25B6"},
    {id:"reporting",label:"Reporting",icon:"\u25A3"},
  ];

  const bottomItems=[
    ...(user.role!=="client"?[{id:"settings",label:"Settings",icon:"\u25CE"}]:[]),
    {id:"profile",label:"Profile",icon:"\uD83D\uDC64"},
  ];

  const oc=(project.docs||[]).filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d))).length;
  const overdueTasks=(project.timeline||[]).filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=parseD(t.endDate);return d&&daysBetween(new Date(),d)<0}).length;
  const dashFlags=oc+overdueTasks;

  const isToolView=toolItems.some(t=>t.id===view);

  const NavBtn=({id,label,icon,active,badge=0,style:extraStyle={}})=>(
    <button
      onClick={()=>setView(id)}
      style={{
        display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
        borderRadius:T.rS,border:"none",cursor:"pointer",
        background:active?T.inkSoft:"transparent",
        color:active?T.ink:T.ink70,
        fontSize:13,fontWeight:active?700:500,fontFamily:T.sans,
        transition:"background .18s ease, color .18s ease",width:"100%",textAlign:"left",
        overflow:"hidden",whiteSpace:"nowrap",position:"relative",...extraStyle,
      }}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background=T.inkSoft2;e.currentTarget.style.color=T.ink}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background=extraStyle.background||"transparent";e.currentTarget.style.color=T.ink70}}}
    >
      <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0,color:"inherit"}}>{icon}</span>
      <span style={{opacity:expanded?1:0,transition:"opacity .15s",flex:1,overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
      {badge>0&&expanded&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:999,background:T.alertSoft,color:T.alert}}>{badge}</span>}
    </button>
  );

  return(
    <div
      className="desktop-side"
      onMouseEnter={()=>setExpanded(true)}
      onMouseLeave={()=>{setExpanded(false);setOrgDropdownOpen(false)}}
      style={{
        width:expanded?220:64,
        transition:"width .2s cubic-bezier(.4,0,.2,1)",
        display:"flex",flexDirection:"column",
        background:T.bg,borderRight:`1px solid ${T.border}`,
        overflow:"visible",flexShrink:0,fontFamily:T.sans,
        position:"relative",
      }}
    >
      {/* Logo */}
      <div style={{padding:"20px 0",display:"flex",justifyContent:"center",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:8}} title="Home">
          <MorganIsotype size={28} color={T.gold}/>
        </button>
      </div>

      {/* Org Switcher — only shown when user belongs to 2+ orgs */}
      {hasMultipleOrgs&&<div style={{padding:"0 8px 8px",position:"relative"}}>
        <button
          onClick={()=>setOrgDropdownOpen(!orgDropdownOpen)}
          style={{
            display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
            borderRadius:T.rS,border:`1px solid ${orgDropdownOpen?T.borderGlow:T.border}`,
            cursor:"pointer",background:orgDropdownOpen?T.surfEl:"transparent",
            color:T.cream,fontSize:12,fontWeight:500,fontFamily:T.sans,
            transition:"all .15s",width:"100%",textAlign:"left",
            overflow:"hidden",whiteSpace:"nowrap",
          }}
          onMouseEnter={e=>{if(!orgDropdownOpen)e.currentTarget.style.background=T.surfHov}}
          onMouseLeave={e=>{if(!orgDropdownOpen)e.currentTarget.style.background="transparent"}}
        >
          <OrgAvatar org={currentOrg} size={18}/>
          <span style={{opacity:expanded?1:0,transition:"opacity .15s",flex:1,overflow:"hidden",textOverflow:"ellipsis"}}>{currentOrg?.name||"Org"}</span>
          {expanded&&<span style={{fontSize:10,opacity:.5,transition:"transform .15s",transform:orgDropdownOpen?"rotate(180deg)":"rotate(0)"}}>&#9662;</span>}
        </button>

        {/* Dropdown */}
        {orgDropdownOpen&&expanded&&<div className="fc-panel" style={{
          position:"absolute",left:8,right:8,top:"100%",marginTop:6,zIndex:100,
          padding:4,display:"flex",flexDirection:"column",gap:2,
          maxHeight:240,overflowY:"auto",borderRadius:12,
        }}>
          {organizations.map(org=>{
            const isActive=org.id===currentOrgId;
            const orgProfile=profiles.find(p=>p.org_id===org.id);
            return<button
              key={org.id}
              onClick={()=>{switchOrg(org.id);setOrgDropdownOpen(false)}}
              style={{
                display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                borderRadius:T.rS,border:"none",cursor:"pointer",
                background:isActive?T.surfEl:"transparent",
                color:isActive?T.cream:T.dim,
                fontSize:12,fontFamily:T.sans,transition:"all .15s",
                width:"100%",textAlign:"left",
              }}
              onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}}
              onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="transparent";if(!isActive)e.currentTarget.style.color=T.dim}}
            >
              <OrgAvatar org={org} size={16}/>
              <div style={{flex:1,overflow:"hidden"}}>
                <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:isActive?500:400}}>{org.name}</div>
                {orgProfile&&<div style={{fontSize:10,color:T.dim,marginTop:1}}>{orgProfile.role}</div>}
              </div>
              {isActive&&<span style={{fontSize:10,color:T.gold}}>&#10003;</span>}
            </button>;
          })}
        </div>}
      </div>}

      {/* Project name */}
      <div style={{padding:"0 16px 16px",overflow:"hidden",whiteSpace:"nowrap",opacity:expanded?1:0,transition:"opacity .15s",height:expanded?"auto":0}}>
        <div style={{fontSize:13,fontWeight:700,color:T.ink,overflow:"hidden",textOverflow:"ellipsis"}}>{project.name}</div>
        <div style={{fontSize:11,color:T.fadedInk,marginTop:2}}>{project.client||""}</div>
      </div>

      {/* Main nav */}
      <nav style={{flex:1,padding:"0 8px",display:"flex",flexDirection:"column",gap:2,overflow:"auto"}}>
        {mainNav.map(n=>(
          <NavBtn key={n.id} {...n} active={view===n.id} badge={n.id==="dashboard"?dashFlags:0}/>
        ))}

        {/* Client — standalone */}
        <div style={{margin:"8px 0 4px",height:1,background:expanded?T.border:"transparent",transition:"background .15s"}}/>
        <NavBtn {...clientNav} active={view===clientNav.id}/>

        {/* Tools — expandable */}
        <div style={{margin:"4px 0",height:1,background:expanded?T.border:"transparent",transition:"background .15s"}}/>
        <button
          onClick={()=>setToolsOpen(!toolsOpen)}
          style={{
            display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
            borderRadius:T.rS,border:"none",cursor:"pointer",
            background:isToolView&&!toolsOpen?T.inkSoft:"transparent",
            color:toolsOpen||isToolView?T.ink:T.ink70,
            fontSize:13,fontWeight:toolsOpen||isToolView?700:500,fontFamily:T.sans,
            transition:"background .18s ease, color .18s ease",width:"100%",textAlign:"left",
            overflow:"hidden",whiteSpace:"nowrap",
          }}
          onMouseEnter={e=>{e.currentTarget.style.background=T.inkSoft2;e.currentTarget.style.color=T.ink}}
          onMouseLeave={e=>{e.currentTarget.style.background=isToolView&&!toolsOpen?T.inkSoft:"transparent";e.currentTarget.style.color=toolsOpen||isToolView?T.ink:T.ink70}}
        >
          <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0,color:"inherit",transition:"transform .2s ease",transform:toolsOpen?"rotate(90deg)":"rotate(0)"}}>&#9656;</span>
          <span style={{opacity:expanded?1:0,transition:"opacity .15s",flex:1}}>Tools</span>
        </button>
        {(toolsOpen||!expanded)&&<div style={{display:"flex",flexDirection:"column",gap:1,paddingLeft:expanded?12:0}}>
          {toolItems.map(n=>(
            <NavBtn key={n.id} {...n} active={view===n.id} badge={n.id==="docs"?oc:0}/>
          ))}
        </div>}
      </nav>

      {/* Divider */}
      <div style={{margin:"0 16px",height:1,background:T.border}}/>

      {/* Bottom items */}
      <div style={{padding:"8px 8px 12px",display:"flex",flexDirection:"column",gap:2}}>
        {bottomItems.map(n=>(
          <NavBtn key={n.id} {...n} active={view===n.id}/>
        ))}

        {/* Theme toggle — flips paper ↔ sapphire canvas */}
        {toggleTheme&&<button
          onClick={toggleTheme}
          title={themeMode==="dark"?"Switch to light":"Switch to dark"}
          style={{
            display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
            borderRadius:T.rS,border:"none",cursor:"pointer",
            background:"transparent",color:T.ink70,
            fontSize:13,fontWeight:500,fontFamily:T.sans,transition:"color .18s ease",
            width:"100%",textAlign:"left",
          }}
          onMouseEnter={e=>e.currentTarget.style.color=T.ink}
          onMouseLeave={e=>e.currentTarget.style.color=T.ink70}
        >
          <span style={{fontSize:14,width:20,textAlign:"center",flexShrink:0,color:"inherit"}}>{themeMode==="dark"?"☼":"☾"}</span>
          <span style={{opacity:expanded?1:0,transition:"opacity .15s"}}>{themeMode==="dark"?"Light":"Dark"}</span>
        </button>}

        {/* Sign out */}
        {onLogout&&<button
          onClick={onLogout}
          style={{
            display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
            borderRadius:T.rS,border:"none",cursor:"pointer",
            background:"transparent",color:T.ink70,
            fontSize:13,fontWeight:500,fontFamily:T.sans,transition:"color .18s ease",
            width:"100%",textAlign:"left",
          }}
          onMouseEnter={e=>e.currentTarget.style.color=T.alert}
          onMouseLeave={e=>e.currentTarget.style.color=T.ink70}
        >
          <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0}}>{"\u2192"}</span>
          <span style={{opacity:expanded?1:0,transition:"opacity .15s"}}>Sign Out</span>
        </button>}

        {saving&&<div style={{textAlign:"center",padding:4}}><div style={{width:6,height:6,borderRadius:"50%",background:T.gold,margin:"0 auto",animation:"pulse 1s ease-in-out infinite"}}/></div>}
      </div>
    </div>
  );
}

export default Side;
