import { useState, useCallback } from 'react';
import T from '../theme/tokens.js';
import { mkROS } from '../data/factories.js';
import { TrashI } from '../components/icons/index.js';
import { Card } from '../components/primitives/index.js';

function ROSV({project,updateProject,canEdit,accessToken}){
  const entries=project.ros||[];
  const[showAdd,setShowAdd]=useState(false);
  const[nT,setNT]=useState("");const[nET,setNET]=useState("");const[nI,setNI]=useState("");const[nL,setNL]=useState("");const[nLd,setNLd]=useState("");const[nNo,setNNo]=useState("");
  const[editId,setEditId]=useState(null);
  const[showShare,setShowShare]=useState(false);
  const[emailTo,setEmailTo]=useState("");
  const[emailSending,setEmailSending]=useState(false);
  const[emailSent,setEmailSent]=useState(false);
  const[emailMsg,setEmailMsg]=useState("");
  const[editingAddress,setEditingAddress]=useState(false);

  const sorted=[...entries].sort((a,b)=>a.time.localeCompare(b.time));
  const addEntry=()=>{if(!nT||!nI.trim())return;const e=mkROS(nT,nI.trim(),nL,nLd,"",nNo);e.endTime=nET;updateProject({ros:[...entries,e]});setNT("");setNET("");setNI("");setNL("");setNLd("");setNNo("");setShowAdd(false)};
  const removeEntry=id=>updateProject({ros:entries.filter(e=>e.id!==id)});
  const updateEntry=(id,updates)=>updateProject({ros:entries.map(e=>e.id===id?{...e,...updates}:e)});

  const venueAddress=project.rosVenueAddress||"";
  const venueName=project.rosVenueName||"";

  // Inline editable cell
  const EditCell=({value,field,entryId,style={}})=>{
    const isEditing=editId===entryId;
    if(!canEdit)return<span style={style}>{value||"\u2014"}</span>;
    return<input value={value||""} onChange={e=>updateEntry(entryId,{[field]:e.target.value})} onFocus={()=>setEditId(entryId)} onBlur={()=>setTimeout(()=>setEditId(null),100)} style={{background:"transparent",border:"none",borderBottom:isEditing?`1px solid ${T.cyan}`:"1px solid transparent",outline:"none",width:"100%",padding:"2px 0",transition:"border .15s",...style}}/>;
  };

  // Build email HTML
  const buildEmailHtml=(message)=>{
    let orgName="Early Spring LLC";
    try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgName=o.name}catch(e){}

    const vendors=project.vendors||[];
    const ag=project.ag||[];
    const team=[];
    try{const t=JSON.parse(localStorage.getItem("es_users")||"[]");team.push(...t)}catch(e){}

    const cueRows=sorted.map(e=>
      `<tr style="border-bottom:1px solid #F0F0F0">
        <td style="padding:10px 0;font-family:monospace;font-weight:700;color:#B8860B;font-size:14px;width:70px">${e.time}</td>
        <td style="padding:10px 4px;font-family:monospace;color:#999;font-size:13px;width:60px">${e.endTime||""}</td>
        <td style="padding:10px 8px;font-weight:600;color:#333;font-size:13px">${e.item}</td>
        <td style="padding:10px 8px;color:#777;font-size:12px">${e.location||""}</td>
        <td style="padding:10px 8px;color:#2196F3;font-size:12px">${e.lead||""}</td>
        <td style="padding:10px 8px;color:#999;font-size:11px">${e.notes||""}</td>
      </tr>`
    ).join("");

    const vendorRows=vendors.map(v=>
      `<tr style="border-bottom:1px solid #F0F0F0">
        <td style="padding:8px 0;font-weight:600;color:#333;font-size:12px">${v.name}</td>
        <td style="padding:8px 0;color:#555;font-size:12px">${v.contactName||""}</td>
        <td style="padding:8px 0;color:#555;font-size:12px">${v.phone||""}</td>
        <td style="padding:8px 0;color:#2196F3;font-size:12px">${v.email||""}</td>
      </tr>`
    ).join("");

    const teamRows=[...ag.map(a=>({name:a.name,role:a.name,phone:"",email:""})),...team.map(t=>({name:t.name,role:t.role,phone:"",email:t.email}))];
    const teamHtml=teamRows.map(t=>
      `<tr style="border-bottom:1px solid #F0F0F0">
        <td style="padding:8px 0;font-weight:600;color:#333;font-size:12px">${t.name}</td>
        <td style="padding:8px 0;color:#555;font-size:12px;text-transform:capitalize">${t.role||""}</td>
        <td style="padding:8px 0;color:#555;font-size:12px">${t.phone||""}</td>
        <td style="padding:8px 0;color:#2196F3;font-size:12px">${t.email||""}</td>
      </tr>`
    ).join("");

    return`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:700px;margin:0 auto;padding:40px 20px">
  <div style="background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #333">
      <div style="font-size:10px;font-weight:700;color:#333;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">${orgName.toUpperCase()}</div>
      <div style="font-size:24px;font-weight:700;color:#333">Run of Show</div>
      <div style="font-size:14px;color:#777;margin-top:4px">${project.name||""} ${project.client?`— ${project.client}`:""}</div>
      ${project.eventDate?`<div style="font-size:13px;color:#B8860B;margin-top:6px;font-weight:600">Event Date: ${project.eventDate}</div>`:""}
    </div>

    ${venueName||venueAddress?`<div style="margin-bottom:24px;padding:16px 20px;background:#FAFAF9;border-radius:8px;border-left:3px solid #B8860B">
      <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Venue / Location</div>
      ${venueName?`<div style="font-size:15px;font-weight:600;color:#333">${venueName}</div>`:""}
      ${venueAddress?`<div style="font-size:13px;color:#555;margin-top:4px;line-height:1.5">${venueAddress.replace(/\n/g,"<br>")}</div>`:""}
    </div>`:""}

    ${message?`<div style="margin-bottom:24px;padding:16px 20px;background:#FFF8E1;border-radius:8px;border-left:3px solid #B8860B"><div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div></div>`:""}

    <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
      <tr style="border-bottom:2px solid #EEE">
        <th style="text-align:left;padding:8px 0;font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em">Start</th>
        <th style="text-align:left;padding:8px 0;font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em">End</th>
        <th style="text-align:left;padding:8px 0;font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em">Cue</th>
        <th style="text-align:left;padding:8px 0;font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em">Location</th>
        <th style="text-align:left;padding:8px 0;font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em">Lead</th>
        <th style="text-align:left;padding:8px 0;font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em">Notes</th>
      </tr>
      ${cueRows}
    </table>

    ${vendorRows?`<div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #EEE">Vendor Contacts</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Vendor</th><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Contact</th><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Phone</th><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Email</th></tr>
        ${vendorRows}
      </table>
    </div>`:""}

    ${teamHtml?`<div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #EEE">Production Team</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Name</th><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Role</th><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Phone</th><th style="text-align:left;padding:6px 0;font-size:9px;font-weight:700;color:#999;text-transform:uppercase">Email</th></tr>
        ${teamHtml}
      </table>
    </div>`:""}

    <div style="text-align:center;padding-top:20px;border-top:1px solid #EEE;font-size:10px;color:#BBB">
      Sent from <span style="color:#999">Morgan</span> · ${orgName}
    </div>
  </div>
</div></body></html>`;
  };

  const sendROS=async()=>{
    if(!emailTo.trim()||!accessToken)return;
    setEmailSending(true);
    try{
      const{sendEmail}=await import('../utils/google.js');
      await sendEmail(accessToken,emailTo.trim(),`Run of Show: ${project.name||""}`,buildEmailHtml(emailMsg));
      setEmailSent(true);setEmailTo("");setTimeout(()=>setEmailSent(false),3000);
    }catch(e){alert("Failed to send: "+(e.message||"Unknown error"))}
    setEmailSending(false);
  };

  const inputStyle={width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"};

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:20,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>Run of Show</h1><p style={{fontSize:13,color:T.dim,marginTop:6}}>{entries.length} cues{project.eventDate?` · Event: ${project.eventDate}`:""}</p></div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setShowShare(!showShare)} style={{padding:"10px 18px",background:"transparent",color:showShare?T.cyan:T.dim,border:`1px solid ${showShare?`${T.cyan}40`:T.border}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showShare?"Cancel":"Share"}</button>
        {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showAdd?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showAdd?T.dim:T.brown,border:showAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Add Cue"}</button>}
      </div>
    </div>

    {/* Share via email */}
    {showShare&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{fontSize:10,fontWeight:700,color:T.cyan,textTransform:"uppercase",letterSpacing:".06em",marginBottom:12}}>Share Run of Show</div>
      <p style={{fontSize:11,color:T.dim,marginBottom:12}}>Sends the full ROS with venue address, vendor contacts, and production team info.</p>
      <textarea value={emailMsg} onChange={e=>setEmailMsg(e.target.value)} placeholder="Add a message (optional)..." rows={2} style={{...inputStyle,resize:"vertical",marginBottom:10}}/>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder="recipient@email.com" onKeyDown={e=>e.key==="Enter"&&sendROS()} style={{flex:1,...inputStyle}}/>
        <button onClick={sendROS} disabled={!emailTo.trim()||emailSending||!accessToken} style={{padding:"10px 20px",borderRadius:T.rS,background:emailTo.trim()&&!emailSending?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(15,82,186,.05)",color:emailTo.trim()&&!emailSending?T.brown:"rgba(255,255,255,.2)",border:"none",fontSize:12,fontWeight:700,cursor:emailTo.trim()&&!emailSending?"pointer":"default",fontFamily:T.sans,flexShrink:0}}>{emailSending?"Sending...":"Send"}</button>
      </div>
      {emailSent&&<div style={{marginTop:8,fontSize:11,color:T.pos}}>Run of Show sent successfully</div>}
      {!accessToken&&<div style={{marginTop:8,fontSize:11,color:T.neg}}>Sign in with Google to send emails</div>}
    </Card>}

    {/* Venue / Location */}
    <Card style={{padding:"16px 20px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{fontSize:10,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Venue / Activation Location</div>
        {canEdit&&!editingAddress&&<button onClick={()=>setEditingAddress(true)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:T.rS,padding:"4px 10px",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Edit</button>}
      </div>
      {editingAddress?<div>
        <div style={{marginBottom:8}}><label style={{display:"block",fontSize:10,color:T.dim,marginBottom:4}}>Venue Name</label><input value={venueName} onChange={e=>updateProject({rosVenueName:e.target.value})} placeholder="The Williamsburg Hotel" style={inputStyle}/></div>
        <div style={{marginBottom:8}}><label style={{display:"block",fontSize:10,color:T.dim,marginBottom:4}}>Address</label><textarea value={venueAddress} onChange={e=>updateProject({rosVenueAddress:e.target.value})} placeholder={"96 Wythe Ave\nBrooklyn, NY 11249"} rows={3} style={{...inputStyle,resize:"vertical"}}/></div>
        <button onClick={()=>setEditingAddress(false)} style={{padding:"6px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Done</button>
      </div>:<div>
        {venueName?<div style={{fontSize:14,fontWeight:600,color:T.cream}}>{venueName}</div>:<div style={{fontSize:12,color:T.dim}}>No venue set</div>}
        {venueAddress&&<div style={{fontSize:12,color:T.dim,marginTop:4,whiteSpace:"pre-line",lineHeight:1.5}}>{venueAddress}</div>}
      </div>}
    </Card>

    {/* Add cue form */}
    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:".6fr .6fr 2fr 1fr 1fr",gap:12,marginBottom:12}}>
        {[["Start",nT,setNT,"14:00"],["End",nET,setNET,"14:30"],["Cue",nI,setNI,"Doors open"],["Location",nL,setNL,"Main Stage"],["Lead",nLd,setNLd,"Event Mgr"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addEntry()} style={inputStyle}/></div>)}
      </div>
      <div style={{marginBottom:12}}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Notes</label><input value={nNo} onChange={e=>setNNo(e.target.value)} placeholder="Additional details" onKeyDown={e=>e.key==="Enter"&&addEntry()} style={inputStyle}/></div>
      <button onClick={addEntry} style={{padding:"9px 20px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Cue</button>
    </Card>}

    {/* ROS table — inline editable */}
    <Card style={{overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:".5fr .5fr 2fr 1fr 1fr 1.5fr .3fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        {["Start","End","Cue","Location","Lead","Notes",""].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em"}}>{h}</span>)}
      </div>
      {sorted.length===0&&<div style={{padding:40,textAlign:"center",color:T.dim,fontSize:13}}>No run of show entries yet.<div style={{fontSize:11,color:T.dim,marginTop:8}}>Add cues to build your event-day schedule</div></div>}
      {sorted.map((e,idx)=><div key={e.id} style={{display:"grid",gridTemplateColumns:".5fr .5fr 2fr 1fr 1fr 1.5fr .3fr",padding:"6px 18px",borderBottom:idx<sorted.length-1?`1px solid ${T.border}`:"none",alignItems:"center"}} onMouseEnter={ev=>ev.currentTarget.style.background=T.surfHov} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
        <EditCell value={e.time} field="time" entryId={e.id} style={{fontSize:14,fontWeight:600,fontFamily:T.mono,color:T.gold}}/>
        <EditCell value={e.endTime||""} field="endTime" entryId={e.id} style={{fontSize:14,fontFamily:T.mono,color:T.dim}}/>
        <EditCell value={e.item} field="item" entryId={e.id} style={{fontSize:13,color:T.cream,fontWeight:600}}/>
        <EditCell value={e.location} field="location" entryId={e.id} style={{fontSize:12,color:T.dim}}/>
        <EditCell value={e.lead} field="lead" entryId={e.id} style={{fontSize:12,color:T.cyan}}/>
        <EditCell value={e.notes} field="notes" entryId={e.id} style={{fontSize:11,color:T.dim}}/>
        {canEdit&&<button onClick={()=>removeEntry(e.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={ev=>ev.currentTarget.style.opacity=1} onMouseLeave={ev=>ev.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
      </div>)}
    </Card>
  </div>;
}

export default ROSV;
