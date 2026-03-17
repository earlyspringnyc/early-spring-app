import { useState } from 'react';
import T from '../theme/tokens.js';
import { mkROS } from '../data/factories.js';
import { TrashI } from '../components/icons/index.js';
import { Card } from '../components/primitives/index.js';

function ROSV({project,updateProject,canEdit}){
  const entries=project.ros||[];
  const[showAdd,setShowAdd]=useState(false);
  const[nT,setNT]=useState("");const[nI,setNI]=useState("");const[nL,setNL]=useState("");const[nLd,setNLd]=useState("");const[nDr,setNDr]=useState("");const[nNo,setNNo]=useState("");
  const sorted=[...entries].sort((a,b)=>a.time.localeCompare(b.time));
  const addEntry=()=>{if(!nT||!nI.trim())return;updateProject({ros:[...entries,mkROS(nT,nI.trim(),nL,nLd,nDr,nNo)]});setNT("");setNI("");setNL("");setNLd("");setNDr("");setNNo("");setShowAdd(false)};
  const removeEntry=id=>updateProject({ros:entries.filter(e=>e.id!==id)});
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>Run of Show</h1><p style={{fontSize:13,color:T.dim,marginTop:6,fontFamily:T.serif,fontStyle:"italic"}}>{entries.length} cues{project.eventDate?` · Event: ${project.eventDate}`:""}</p></div>
      {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showAdd?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showAdd?T.dim:T.brown,border:showAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Add Cue"}</button>}
    </div>
    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:".6fr 2fr 1fr 1fr .6fr",gap:12,marginBottom:12}}>
        {[["Time",nT,setNT,"14:00"],["Cue",nI,setNI,"Doors open"],["Location",nL,setNL,"Main Stage"],["Lead",nLd,setNLd,"Event Mgr"],["Duration",nDr,setNDr,"30m"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addEntry()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>)}
      </div>
      <button onClick={addEntry} style={{padding:"9px 20px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Cue</button>
    </Card>}
    <Card style={{overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:".5fr 2fr 1fr 1fr .5fr 1.5fr .3fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        {["Time","Cue","Location","Lead","Dur.","Notes",""].map((h,i)=><span key={i} style={{fontSize:9.5,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em"}}>{h}</span>)}
      </div>
      {sorted.length===0&&<div style={{padding:40,textAlign:"center",color:T.dim,fontSize:13}}>No run of show entries yet.<div style={{fontSize:11,color:T.dim,marginTop:8,fontFamily:T.serif,fontStyle:"italic"}}>Add cues to build your event-day schedule</div></div>}
      {sorted.map((e,idx)=><div key={e.id} style={{display:"grid",gridTemplateColumns:".5fr 2fr 1fr 1fr .5fr 1.5fr .3fr",padding:"10px 18px",borderBottom:idx<sorted.length-1?`1px solid ${T.border}`:"none",alignItems:"center"}} onMouseEnter={ev=>ev.currentTarget.style.background=T.surfHov} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
        <span style={{fontSize:14,fontWeight:600,fontFamily:T.mono,color:T.gold}}>{e.time}</span>
        <span style={{fontSize:13,color:T.cream,fontWeight:500}}>{e.item}</span>
        <span style={{fontSize:12,color:T.dim}}>{e.location}</span>
        <span style={{fontSize:12,color:T.cyan}}>{e.lead}</span>
        <span style={{fontSize:12,color:T.dim,fontFamily:T.mono}}>{e.duration}</span>
        <span style={{fontSize:11,color:T.dim}}>{e.notes||"\u2014"}</span>
        {canEdit&&<button onClick={()=>removeEntry(e.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={ev=>ev.currentTarget.style.opacity=1} onMouseLeave={ev=>ev.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
      </div>)}
    </Card>
  </div>;
}

export default ROSV;
