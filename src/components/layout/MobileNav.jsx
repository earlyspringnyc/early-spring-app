import { useState } from 'react';
import T from '../../theme/tokens.js';

function MobileNav({view,setView,project}){
  const[showMore,setShowMore]=useState(false);
  const clientLabel=project.client||"Client";
  const tabs=[
    {id:"dashboard",label:"Dashboard",icon:"◐"},
    {id:"budget",label:"Budget",icon:"◈"},
    {id:"timeline",label:"Timeline",icon:"▤"},
    {id:"vendors",label:"Vendors",icon:"◆"},
  ];
  const moreTabs=[
    {id:"pnl",label:"P&L + Cash",icon:"◇"},
    {id:"docs",label:"Documents",icon:"▧"},
    {id:"ros",label:"Run of Show",icon:"▶"},
    {id:"export",label:clientLabel,icon:"◈"},
    {id:"ai",label:"AI Assistant",icon:"◉"},
    {id:"settings",label:"Settings",icon:"◎"},
  ];
  return<div className="mobile-nav" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:"rgba(8,8,12,.95)",backdropFilter:"blur(20px)",borderTop:`1px solid ${T.border}`,padding:"6px 0 env(safe-area-inset-bottom,6px)"}}>
    <div style={{display:"flex",justifyContent:"space-around",alignItems:"center"}}>
      {tabs.map(t=><button key={t.id} onClick={()=>{setView(t.id);setShowMore(false)}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 12px",background:"none",border:"none",cursor:"pointer",color:view===t.id?T.gold:T.dim,fontSize:9,fontFamily:T.sans,fontWeight:view===t.id?600:400,minWidth:56}}>
        <span style={{fontSize:18,lineHeight:1}}>{t.icon}</span>
        <span>{t.label}</span>
      </button>)}
      <button onClick={()=>setShowMore(!showMore)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 12px",background:"none",border:"none",cursor:"pointer",color:showMore?T.gold:T.dim,fontSize:9,fontFamily:T.sans,fontWeight:showMore?600:400,minWidth:56}}>
        <span style={{fontSize:18,lineHeight:1}}>···</span>
        <span>More</span>
      </button>
    </div>
    {showMore&&<div className="slide-in" style={{position:"absolute",bottom:"100%",left:0,right:0,background:"rgba(8,8,12,.97)",borderTop:`1px solid ${T.border}`,padding:"8px 12px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
      {moreTabs.map(t=><button key={t.id} onClick={()=>{setView(t.id);setShowMore(false)}} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",background:view===t.id?T.goldSoft:"transparent",border:"none",borderRadius:T.rS,cursor:"pointer",color:view===t.id?T.gold:T.dim,fontSize:11,fontFamily:T.sans,fontWeight:view===t.id?500:400,textAlign:"left"}}>
        <span style={{fontSize:14,opacity:.6}}>{t.icon}</span>
        <span>{t.label}</span>
      </button>)}
    </div>}
  </div>;
}

export default MobileNav;
