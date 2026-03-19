import { useState, useEffect } from 'react';
import T from '../../theme/tokens.js';
import { MorganIsotype } from '../brand/MorganLogo.jsx';

function MobileNav({view,setView,project,onBack,toggleTheme,themeMode,onLogout}){
  const[open,setOpen]=useState(false);
  const clientName=project.client||"Client";

  // Close on escape
  useEffect(()=>{
    if(!open)return;
    const onKey=e=>{if(e.key==="Escape")setOpen(false)};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open]);

  // Close when view changes
  useEffect(()=>{setOpen(false)},[view]);

  const navItems=[
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
    {id:"settings",label:"Settings",icon:"\u25CE"},
    {id:"profile",label:"Profile",icon:"\uD83D\uDC64"},
  ];

  const NavBtn=({id,label,icon})=>(
    <button onClick={()=>setView(id)} style={{
      display:"flex",alignItems:"center",gap:12,padding:"12px 16px",width:"100%",
      borderRadius:T.rS,border:"none",cursor:"pointer",textAlign:"left",
      background:view===id?T.surfEl:"transparent",
      color:view===id?T.cream:T.dim,
      fontSize:14,fontWeight:view===id?500:400,fontFamily:T.sans,
    }}>
      <span style={{fontSize:16,width:22,textAlign:"center",opacity:view===id?1:.5}}>{icon}</span>
      <span>{label}</span>
    </button>
  );

  return<>
    {/* Top bar */}
    <div className="mobile-nav" style={{position:"fixed",top:0,left:0,right:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:"rgba(8,8,12,.92)",backdropFilter:"blur(20px)",borderBottom:`1px solid ${T.border}`}}>
      <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:4,display:"flex",alignItems:"center"}}>
        <MorganIsotype size={24} color={T.gold}/>
      </button>
      <div style={{fontSize:13,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,textAlign:"center",padding:"0 12px"}}>{project.name||"Morgan"}</div>
      <button onClick={()=>setOpen(!open)} style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",flexDirection:"column",gap:4,alignItems:"center",justifyContent:"center",width:32,height:32}}>
        <span style={{display:"block",width:18,height:1.5,background:open?T.gold:T.cream,borderRadius:1,transition:"all .2s",transform:open?"rotate(45deg) translateY(2.75px)":"none"}}/>
        <span style={{display:"block",width:18,height:1.5,background:open?T.gold:T.cream,borderRadius:1,transition:"all .2s",opacity:open?0:1}}/>
        <span style={{display:"block",width:18,height:1.5,background:open?T.gold:T.cream,borderRadius:1,transition:"all .2s",transform:open?"rotate(-45deg) translateY(-2.75px)":"none"}}/>
      </button>
    </div>

    {/* Overlay backdrop */}
    {open&&<div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:298,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)"}}/>}

    {/* Slide-out drawer */}
    <div style={{
      position:"fixed",top:0,right:0,bottom:0,zIndex:299,
      width:260,maxWidth:"80vw",
      background:T.bg,borderLeft:`1px solid ${T.border}`,
      transform:open?"translateX(0)":"translateX(100%)",
      transition:"transform .25s cubic-bezier(.4,0,.2,1)",
      display:"flex",flexDirection:"column",
      paddingTop:56,overflow:"auto",
    }}>
      <nav style={{flex:1,padding:"12px 8px",display:"flex",flexDirection:"column",gap:1}}>
        {navItems.map(n=><NavBtn key={n.id} {...n}/>)}
        <div style={{height:1,background:T.border,margin:"8px 16px"}}/>
        <NavBtn {...clientNav}/>
        <div style={{height:1,background:T.border,margin:"8px 16px"}}/>
        <div style={{padding:"4px 16px",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".12em"}}>Tools</div>
        {toolItems.map(n=><NavBtn key={n.id} {...n}/>)}
      </nav>
      <div style={{borderTop:`1px solid ${T.border}`,padding:"8px 8px 20px",display:"flex",flexDirection:"column",gap:1}}>
        {bottomItems.map(n=><NavBtn key={n.id} {...n}/>)}
        {toggleTheme&&<button onClick={toggleTheme} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",width:"100%",borderRadius:T.rS,border:"none",cursor:"pointer",background:"transparent",color:T.dim,fontSize:14,fontFamily:T.sans,textAlign:"left"}}>
          <span style={{fontSize:16,width:22,textAlign:"center"}}>{themeMode==="dark"?"\u2600":"\u263E"}</span>
          <span>{themeMode==="dark"?"Light Mode":"Dark Mode"}</span>
        </button>}
        {onLogout&&<button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",width:"100%",borderRadius:T.rS,border:"none",cursor:"pointer",background:"transparent",color:T.dim,fontSize:14,fontFamily:T.sans,textAlign:"left"}}>
          <span style={{fontSize:16,width:22,textAlign:"center"}}>{"\u2192"}</span>
          <span>Sign Out</span>
        </button>}
      </div>
    </div>
  </>;
}

export default MobileNav;
