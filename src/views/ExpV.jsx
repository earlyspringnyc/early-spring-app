import React, { useState, useRef } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { ci, ct } from '../utils/calc.js';
import { STATUS_LABELS, CLIENT_FILE_CATS, CLIENT_FILE_LABELS, CLIENT_FILE_COLORS } from '../constants/index.js';
import { mkClientFile } from '../data/factories.js';
import { PlusI, DlI, TrashI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card } from '../components/primitives/index.js';

function DeckTab({project,updateProject,accessToken,clientName,deckRef,deckEmail,setDeckEmail,deckSending,setDeckSending,deckSent,setDeckSent}){
  const deck=project.pitchDeck||null;
  const handleDeckUpload=(e)=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{updateProject({pitchDeck:{name:file.name,fileData:ev.target.result,dateUploaded:new Date().toLocaleDateString()}})};reader.readAsDataURL(file);e.target.value=""};
  const sendDeck=async()=>{if(!deckEmail.trim()||!deck)return;if(!accessToken){alert("Google access token required. Sign in with Google OAuth.");return}setDeckSending(true);try{const{sendEmail:gmailSend}=await import('../utils/google.js');let dkOrgN="Early Spring LLC",dkOrgA="385 Van Brunt St, Floor 2, Brooklyn, NY 11231",dkOrgW="earlyspring.nyc";try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)dkOrgN=o.name;if(o.address)dkOrgA=o.address;if(o.website)dkOrgW=o.website}catch(ex){}const dkOrgWClean=dkOrgW.replace(/^https?:\/\//,'');const htmlBody=`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:12px;padding:40px"><table style="width:100%;padding-bottom:20px;margin-bottom:28px;border-bottom:2px solid #432D1C"><tr><td style="vertical-align:top"><div style="font-size:10px;font-weight:700;color:#432D1C;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${dkOrgN.toUpperCase()}</div><div style="font-size:24px;font-weight:700;color:#432D1C">Pitch Deck</div></td><td style="text-align:right;font-size:13px;color:#777;line-height:1.8;vertical-align:top"><div><strong style="color:#555">Project:</strong> ${project.name||""}</div><div><strong style="color:#555">Client:</strong> ${project.client||""}</div></td></tr></table><p style="font-size:14px;color:#333;line-height:1.6">Please find our pitch deck for <strong>${project.name||"the project"}</strong> attached to this email.</p><p style="font-size:14px;color:#333;line-height:1.6">We look forward to discussing this with you.</p><div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #EEE"><div style="font-size:10px;color:#BBB">Sent from <a href="https://early-spring-app.vercel.app" style="color:#999;text-decoration:none">Morgan</a> @ <a href="https://${dkOrgWClean}" style="color:#999;text-decoration:none">${dkOrgN}</a></div>${dkOrgA?`<div style="font-size:9px;color:#CCC;margin-top:4px">${dkOrgA}</div>`:""}</div></div></div></body></html>`;await gmailSend(accessToken,deckEmail.trim(),`Pitch Deck: ${project.name||""}`,htmlBody);setDeckSent(deckEmail);setDeckEmail("")}catch(e){alert("Failed to send: "+(e.message||"Unknown error"))}finally{setDeckSending(false)}};
  return<div>
    <input ref={deckRef} type="file" accept=".pdf,.pptx,.key" onChange={handleDeckUpload} style={{display:"none"}}/>
    {deck?<div>
      <Card style={{padding:20,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}><span style={{color:T.gold}}>▧</span></div>
            <div><div style={{fontSize:13,fontWeight:500,color:T.cream}}>{deck.name}</div><div style={{fontSize:10,color:T.dim}}>Uploaded {deck.dateUploaded}</div></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {deck.fileData&&<button onClick={()=>window.open(deck.fileData,"_blank")} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>View</button>}
            <button onClick={()=>deckRef.current?.click()} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Replace</button>
            <button onClick={()=>updateProject({pitchDeck:null})} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.neg,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Remove</button>
          </div>
        </div>
      </Card>
      <Card style={{padding:16}}>
        <div style={{fontSize:11,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Send to Client</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input value={deckEmail} onChange={e=>setDeckEmail(e.target.value)} placeholder={`${clientName.toLowerCase()}@example.com`} onKeyDown={e=>{if(e.key==="Enter")sendDeck();if(e.key==="Tab"||e.key===","){const v=deckEmail.trim();if(v&&!v.endsWith(",")){e.preventDefault();setDeckEmail(v+", ")}}}} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
          <button onClick={sendDeck} disabled={!deckEmail.trim()||deckSending} style={{padding:"8px 18px",borderRadius:T.rS,border:"none",background:deckEmail.trim()&&!deckSending?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(255,255,255,.05)",color:deckEmail.trim()&&!deckSending?T.brown:"rgba(255,255,255,.2)",fontSize:11,fontWeight:700,cursor:deckEmail.trim()&&!deckSending?"pointer":"default",fontFamily:T.sans}}>{deckSending?"Sending…":"Send"}</button>
        </div>
        {deckSent&&<div style={{marginTop:8,fontSize:11,color:T.pos}}>Sent to {deckSent}</div>}
      </Card>
    </div>
    :<div onClick={()=>deckRef.current?.click()} style={{textAlign:"center",padding:60,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
      <div style={{fontSize:40,opacity:.15,marginBottom:12}}>▧</div>
      <div style={{fontSize:15,fontWeight:500,color:T.cream,marginBottom:6}}>Upload Pitch Deck</div>
      <p style={{fontSize:12,color:T.dim}}>PDF, PowerPoint, or Keynote</p>
    </div>}
  </div>;
}

function ExpV({cats,ag,comp,feeP,project,updateProject,accessToken}){
  const[tab,setTab]=useState("budget");
  const tasks=project.timeline||[];
  const clientFiles=project.clientFiles||[];
  const[included,setIncluded]=useState(()=>new Set(tasks.map(t=>t.id)));
  const[tlFormat,setTlFormat]=useState("both");
  const[emailTo,setEmailTo]=useState("");const[emailSending,setEmailSending]=useState(false);const[emailSent,setEmailSent]=useState("");
  const[fileFilter,setFileFilter]=useState("all");
  const fileInputRef=useRef(null);
  const deckRef=useRef(null);
  const[deckEmail,setDeckEmail]=useState("");const[deckSending,setDeckSending]=useState(false);const[deckSent,setDeckSent]=useState("");
  const toggleTask=id=>setIncluded(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n});
  const selectAll=()=>setIncluded(new Set(tasks.map(t=>t.id)));
  const selectNone=()=>setIncluded(new Set());
  const clientTasks=tasks.filter(t=>included.has(t.id));
  const clientName=project.client||"Client";

  /* Auto-categorize uploaded file */
  const autoCategory=(fileName)=>{
    const n=fileName.toLowerCase();
    if(n.includes("rfp")||n.includes("request for proposal"))return"rfp";
    if(n.includes("brief")||n.includes("creative brief")||n.includes("project brief"))return"brief";
    if(n.includes("contract")||n.includes("agreement")||n.includes("sow")||n.includes("scope")||n.includes("msa")||n.includes("nda"))return"contract";
    if(n.includes("deck")||n.includes("presentation")||n.includes("pitch")||n.includes("pptx")||n.includes(".ppt")||n.includes(".key"))return"deck";
    if(n.includes("design")||n.includes("mock")||n.includes("comp")||n.includes("render")||n.includes("layout")||n.includes(".psd")||n.includes(".ai")||n.includes(".fig")||n.includes(".sketch")||n.includes(".indd"))return"design";
    if(n.includes("ref")||n.includes("inspo")||n.includes("mood")||n.includes("board"))return"reference";
    return"other";
  };
  const handleFileUpload=(e)=>{
    const files=Array.from(e.target.files);if(!files.length)return;
    const newFiles=[];let processed=0;
    files.forEach(file=>{const reader=new FileReader();reader.onload=ev=>{
      const cat=autoCategory(file.name);
      newFiles.push(mkClientFile(file.name.replace(/\.[^/.]+$/,""),cat,ev.target.result,file.name));
      processed++;if(processed===files.length)updateProject({clientFiles:[...clientFiles,...newFiles]});
    };reader.readAsDataURL(file)});
    e.target.value="";
  };
  const removeFile=id=>updateProject({clientFiles:clientFiles.filter(f=>f.id!==id)});
  const updateFileCategory=(id,cat)=>updateProject({clientFiles:clientFiles.map(f=>f.id===id?{...f,category:cat}:f)});
  const filteredFiles=fileFilter==="all"?clientFiles:clientFiles.filter(f=>f.category===fileFilter);
  const fileCounts=CLIENT_FILE_CATS.reduce((a,c)=>{a[c]=clientFiles.filter(f=>f.category===c).length;return a},{});
  const doSendEmail=async()=>{if(!emailTo.trim())return;if(!accessToken){alert("Google access token required. Sign in with Google OAuth.");return}setEmailSending(true);try{const{sendEmail:gmailSend}=await import('../utils/google.js');const{budgetEmailHtml,timelineEmailHtml}=await import('../utils/emailTemplates.js');let subject,htmlBody;if(tab==="budget"){subject=`Production Estimate: ${project.name||""}`;htmlBody=budgetEmailHtml(project,cats,ag,comp,feeP)}else if(tab==="timeline"){subject=`Project Timeline: ${project.name||""}`;htmlBody=timelineEmailHtml(project,clientTasks)}else{subject=`${project.name||"Project"} Update`;htmlBody=budgetEmailHtml(project,cats,ag,comp,feeP)}await gmailSend(accessToken,emailTo.trim(),subject,htmlBody);setEmailSent(emailTo);setEmailTo("")}catch(e){alert("Failed to send: "+(e.message||"Unknown error"))}finally{setEmailSending(false)}};

  /* Client Timeline — Gantt for print */
  const ClientGantt=()=>{
    const dated=clientTasks.filter(t=>parseD(t.startDate));
    if(!dated.length)return<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No dated tasks selected.</div>;
    const allDates=[];dated.forEach(t=>{allDates.push(parseD(t.startDate));if(parseD(t.endDate))allDates.push(parseD(t.endDate));else allDates.push(parseD(t.startDate))});
    const minD=new Date(Math.min(...allDates));const maxD=new Date(Math.max(...allDates));
    minD.setDate(minD.getDate()-2);maxD.setDate(maxD.getDate()+2);
    const totalDays=Math.max(daysBetween(minD,maxD),7);
    const weeks=[];let cur=new Date(minD);while(cur<=maxD){weeks.push(new Date(cur));cur.setDate(cur.getDate()+7)}
    return<div>
      <div style={{display:"flex",borderBottom:"1px solid #E5E5E5",padding:"6px 0"}}>
        <div style={{width:160,flexShrink:0,padding:"0 0 0 4px",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase"}}>Task</div>
        <div style={{flex:1,position:"relative",height:18}}>{weeks.map((w,i)=>{const left=(daysBetween(minD,w)/totalDays)*100;return<span key={i} style={{position:"absolute",left:`${left}%`,fontSize:9,color:"#999",fontFamily:"monospace"}}>{fmtShort(w)}</span>})}</div>
      </div>
      {dated.map(t=>{const start=parseD(t.startDate);const end=parseD(t.endDate)||start;const left=(daysBetween(minD,start)/totalDays)*100;const width=Math.max((daysBetween(start,end)+1)/totalDays*100,1.5);const barColor=t.status==="done"?"#34D399":t.status==="progress"?"#22D3EE":"#432D1C";
        return<div key={t.id} style={{display:"flex",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #F5F5F5"}}>
          <div style={{width:160,flexShrink:0,padding:"0 0 0 4px",overflow:"hidden"}}><span style={{fontSize:11,color:"#333",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{t.name}</span></div>
          <div style={{flex:1,position:"relative",height:18}}><div style={{position:"absolute",left:`${left}%`,width:`${width}%`,top:3,height:12,borderRadius:3,background:barColor,opacity:.8}}><span style={{position:"absolute",left:4,top:0,fontSize:8,color:"#fff",fontWeight:600,whiteSpace:"nowrap"}}>{fmtShort(start)}{end>start?` — ${fmtShort(end)}`:""}</span></div></div>
        </div>})}
    </div>
  };

  /* Client Timeline — Calendar list for print */
  const ClientCalendar=()=>{
    const dated=clientTasks.filter(t=>parseD(t.startDate)).sort((a,b)=>(a.startDate||"").localeCompare(b.startDate||""));
    if(!dated.length)return<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No dated tasks selected.</div>;
    return<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
      <thead><tr style={{borderBottom:"2px solid #E5E5E5"}}>{["Task","Category","Start","End","Status"].map((h,i)=><th key={i} style={{textAlign:i>1?"center":"left",padding:"8px 4px",fontWeight:600,color:"#555",fontSize:10,textTransform:"uppercase",letterSpacing:".06em"}}>{h}</th>)}</tr></thead>
      <tbody>{dated.map(t=><tr key={t.id} style={{borderBottom:"1px solid #F0F0F0"}}>
        <td style={{padding:"10px 4px",color:"#333"}}>{t.name}</td>
        <td style={{padding:"10px 4px",color:"#777",fontSize:12}}>{t.category}</td>
        <td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.startDate}</td>
        <td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.endDate||"\u2014"}</td>
        <td style={{padding:"10px 4px",textAlign:"center"}}><span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:t.status==="done"?"#E8F5E9":t.status==="progress"?"#E0F7FA":"#FFF8E1",color:t.status==="done"?"#2E7D32":t.status==="progress"?"#00838F":"#F57F17",textTransform:"uppercase"}}>{STATUS_LABELS[t.status]}</span></td>
      </tr>)}</tbody>
    </table>
  };

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>{clientName}</h1><p style={{fontSize:13,color:T.dim,marginTop:4,fontFamily:T.serif}}>Client-facing deliverables</p></div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>window.print()} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}><DlI size={14}/> Export PDF</button>
      </div>
    </div>
    <div style={{display:"flex",gap:4,marginBottom:20}}>
      {[["budget","Budget"],["timeline","Timeline"],["deck","Pitch Deck"],["files","Files"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} style={{padding:"9px 20px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:12,fontWeight:tab===id?600:400,fontFamily:T.sans,background:tab===id?T.goldSoft:"transparent",color:tab===id?T.gold:T.dim}}>{label}{id==="files"&&clientFiles.length>0&&<span style={{marginLeft:6,fontSize:9,fontWeight:600,color:T.dim}}>({clientFiles.length})</span>}</button>)}
    </div>

    {/* Email share */}
    <Card style={{padding:16,marginBottom:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",flexShrink:0}}>Share via email</span>
        <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder={`${clientName.toLowerCase()}@example.com`} onKeyDown={e=>{if(e.key==="Enter")doSendEmail();if(e.key==="Tab"||e.key===","){const v=emailTo.trim();if(v&&!v.endsWith(",")){e.preventDefault();setEmailTo(v+", ")}}}} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
        <button onClick={doSendEmail} disabled={!emailTo.trim()||emailSending} style={{padding:"8px 18px",borderRadius:T.rS,border:"none",background:emailTo.trim()&&!emailSending?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(255,255,255,.05)",color:emailTo.trim()&&!emailSending?T.brown:"rgba(255,255,255,.2)",fontSize:11,fontWeight:700,cursor:emailTo.trim()&&!emailSending?"pointer":"default",fontFamily:T.sans}}>{emailSending?"Sending…":"Send"}</button>
      </div>
      {emailSent&&<div style={{marginTop:8,fontSize:11,color:T.pos}}>Sent to {emailSent}</div>}
    </Card>

    {tab==="budget"&&<div style={{background:"#fff",borderRadius:T.r,padding:48,color:"#111",boxShadow:"0 4px 24px rgba(0,0,0,.4)"}}>
      <div style={{display:"flex",justifyContent:"space-between",paddingBottom:24,marginBottom:32,borderBottom:"2px solid #432D1C"}}>
        <div><div style={{marginBottom:14}}>{(()=>{try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.logo)return<img src={o.logo} alt={o.name||"Logo"} style={{height:16,objectFit:"contain"}}/>;if(o.name)return<span style={{fontSize:10,fontWeight:700,color:"#432D1C",letterSpacing:".14em",textTransform:"uppercase"}}>{o.name}</span>}catch(e){}return<ESWordmark height={16} color="#432D1C"/>})()}</div><div style={{fontSize:28,fontWeight:700,color:"#432D1C"}}>Production Estimate</div><div style={{fontSize:13,color:"#999",marginTop:4,fontFamily:"'Century','Georgia',serif"}}>Prepared by {(()=>{try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)return o.name}catch(e){}return"Early Spring"})()}</div></div>
        <div style={{textAlign:"right",fontSize:13,color:"#777",lineHeight:1.8}}>{project.logo&&<div style={{marginBottom:8,display:"flex",justifyContent:"flex-end"}}><img src={project.logo} style={{maxHeight:36,maxWidth:120,objectFit:"contain"}}/></div>}<div><strong style={{color:"#555"}}>Project:</strong> {project.name||"\u2014"}</div><div><strong style={{color:"#555"}}>Client:</strong> {project.client||"\u2014"}</div><div><strong style={{color:"#555"}}>Date:</strong> {project.date||new Date().toLocaleDateString()}</div></div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,marginBottom:32}}><thead><tr style={{borderBottom:"2px solid #E5E5E5"}}><th style={{textAlign:"left",padding:"10px 0",fontWeight:600,color:"#555",fontSize:11,textTransform:"uppercase",letterSpacing:".06em"}}>Item</th><th style={{textAlign:"left",padding:"10px 0",fontWeight:600,color:"#555",fontSize:11,textTransform:"uppercase",letterSpacing:".06em"}}>Description</th><th style={{textAlign:"right",padding:"10px 0",fontWeight:600,color:"#555",fontSize:11,textTransform:"uppercase",letterSpacing:".06em"}}>Cost</th></tr></thead>
        <tbody>{cats.map(c=>{const t=ct(c.items).totals;return<React.Fragment key={c.id}><tr style={{borderBottom:"1px solid #F0F0F0",background:"#FAFAF9"}}><td colSpan={2} style={{padding:"13px 0",color:"#333",fontWeight:600}}>{c.name}</td><td className="num" style={{padding:"13px 0",textAlign:"right",fontFamily:"monospace",color:"#333",fontWeight:600}}>{f$(t.clientPrice)}</td></tr>
          {c.items.filter(it=>ci(it).clientPrice>0).map(it=><tr key={it.id} style={{borderBottom:"1px solid #F8F8F8"}}><td style={{padding:"8px 0 8px 20px",color:"#555",fontSize:13}}>{it.name}</td><td style={{padding:"8px 0 8px 8px",color:"#999",fontSize:12,fontStyle:"italic"}}>{it.details||""}</td><td className="num" style={{padding:"8px 0",textAlign:"right",fontFamily:"monospace",color:"#555",fontSize:13}}>{f$(ci(it).clientPrice)}</td></tr>)}</React.Fragment>})}
          <tr style={{borderTop:"2px solid #432D1C"}}><td colSpan={2} style={{padding:"14px 0",fontWeight:700,color:"#432D1C"}}>PRODUCTION SUBTOTAL</td><td className="num" style={{padding:"14px 0",textAlign:"right",fontWeight:700,fontFamily:"monospace",color:"#432D1C"}}>{f$(comp.productionSubtotal.clientPrice)}</td></tr></tbody></table>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,marginBottom:32}}><thead><tr style={{borderBottom:"1px solid #E5E5E5"}}><th style={{textAlign:"left",padding:"10px 0",fontWeight:600,color:"#555",fontSize:11,textTransform:"uppercase",letterSpacing:".06em"}}>Agency Services</th><th style={{textAlign:"right",padding:"10px 0",fontWeight:600,color:"#555",fontSize:11,textTransform:"uppercase",letterSpacing:".06em"}}>Cost</th></tr></thead>
        <tbody>{ag.map(it=>{const c=ci(it);return<tr key={it.id} style={{borderBottom:"1px solid #F0F0F0"}}><td style={{padding:"11px 0",color:"#333"}}>{it.name}</td><td className="num" style={{padding:"11px 0",textAlign:"right",fontFamily:"monospace",color:"#333"}}>{f$(c.clientPrice)}</td></tr>})}
          <tr style={{borderTop:"1px solid #DDD"}}><td style={{padding:"11px 0",fontWeight:600,color:"#555"}}>Agency Costs Subtotal</td><td className="num" style={{padding:"11px 0",textAlign:"right",fontWeight:600,fontFamily:"monospace",color:"#555"}}>{f$(comp.agencyCostsSubtotal.clientPrice)}</td></tr>
          <tr><td style={{padding:"11px 0",color:"#777"}}>Agency Fee ({fp(feeP)})</td><td className="num" style={{padding:"11px 0",textAlign:"right",fontFamily:"monospace",color:"#777"}}>{f$(comp.agencyFee.clientPrice)}</td></tr></tbody></table>
      <div style={{background:"#432D1C",borderRadius:10,padding:"20px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,fontWeight:700,color:"#fff",letterSpacing:".06em"}}>GRAND TOTAL</span><span className="num" style={{fontSize:26,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{f$(comp.grandTotal)}</span></div>
      {(()=>{let orgN="Early Spring LLC",orgA="385 Van Brunt St, Floor 2, Brooklyn, NY 11231",orgW="earlyspring.nyc";try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgN=o.name;if(o.address)orgA=o.address;if(o.website)orgW=o.website}catch(e){}
return<div style={{textAlign:"center",marginTop:36,paddingTop:18,borderTop:"1px solid #EEE"}}>
  <div style={{fontSize:10,color:"#BBB"}}>Sent from <a href="https://early-spring-app.vercel.app" style={{color:"#999",textDecoration:"none"}}>Morgan</a> @ <a href={orgW.startsWith("http")?orgW:`https://${orgW}`} style={{color:"#999",textDecoration:"none"}}>{orgN}</a></div>
  {orgA&&<div style={{fontSize:9,color:"#CCC",marginTop:4}}>{orgA}</div>}
</div>})()}
    </div>}

    {tab==="timeline"&&<div>
      {/* Controls */}
      <Card style={{padding:18,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>Format</span>
            {[["gantt","Gantt"],["calendar","Calendar"],["both","Both"]].map(([k,l])=><button key={k} onClick={()=>setTlFormat(k)} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:tlFormat===k?600:400,fontFamily:T.sans,background:tlFormat===k?T.goldSoft:"transparent",color:tlFormat===k?T.gold:T.dim}}>{l}</button>)}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={selectAll} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Select All</button>
            <button onClick={selectNone} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Select None</button>
          </div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {tasks.map(t=><button key={t.id} onClick={()=>toggleTask(t.id)} style={{padding:"5px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontFamily:T.sans,background:included.has(t.id)?T.goldSoft:"rgba(255,255,255,.03)",color:included.has(t.id)?T.gold:T.dim,fontWeight:included.has(t.id)?500:400,transition:"all .15s"}}>{t.name}</button>)}
        </div>
        <div style={{marginTop:10,fontSize:11,color:T.dim}}>{included.size} of {tasks.length} tasks included</div>
      </Card>

      {/* Print preview */}
      <div style={{background:"#fff",borderRadius:T.r,padding:48,color:"#111",boxShadow:"0 4px 24px rgba(0,0,0,.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",paddingBottom:24,marginBottom:28,borderBottom:"2px solid #432D1C"}}>
          <div><div style={{marginBottom:14}}>{(()=>{try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.logo)return<img src={o.logo} alt={o.name||"Logo"} style={{height:16,objectFit:"contain"}}/>;if(o.name)return<span style={{fontSize:10,fontWeight:700,color:"#432D1C",letterSpacing:".14em",textTransform:"uppercase"}}>{o.name}</span>}catch(e){}return<ESWordmark height={16} color="#432D1C"/>})()}</div><div style={{fontSize:28,fontWeight:700,color:"#432D1C"}}>Project Timeline</div><div style={{fontSize:13,color:"#999",marginTop:4,fontFamily:"'Century','Georgia',serif"}}>Prepared by {(()=>{try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)return o.name}catch(e){}return"Early Spring"})()}</div></div>
          <div style={{textAlign:"right",fontSize:13,color:"#777",lineHeight:1.8}}>{project.logo&&<div style={{marginBottom:8,display:"flex",justifyContent:"flex-end"}}><img src={project.logo} style={{maxHeight:36,maxWidth:120,objectFit:"contain"}}/></div>}<div><strong style={{color:"#555"}}>Project:</strong> {project.name||"\u2014"}</div><div><strong style={{color:"#555"}}>Client:</strong> {project.client||"\u2014"}</div>{project.eventDate&&<div><strong style={{color:"#555"}}>Event:</strong> {project.eventDate}</div>}</div>
        </div>
        {(tlFormat==="gantt"||tlFormat==="both")&&<div style={{marginBottom:tlFormat==="both"?32:0}}>
          {tlFormat==="both"&&<div style={{fontSize:13,fontWeight:600,color:"#432D1C",marginBottom:14,textTransform:"uppercase",letterSpacing:".06em"}}>Gantt View</div>}
          <ClientGantt/>
        </div>}
        {(tlFormat==="calendar"||tlFormat==="both")&&<div>
          {tlFormat==="both"&&<div style={{fontSize:13,fontWeight:600,color:"#432D1C",marginBottom:14,marginTop:8,textTransform:"uppercase",letterSpacing:".06em"}}>Calendar View</div>}
          <ClientCalendar/>
        </div>}
        {clientTasks.length===0&&<div style={{padding:40,textAlign:"center",color:"#999",fontSize:14}}>No tasks selected for client timeline.</div>}
        {(()=>{let orgN="Early Spring LLC",orgA="385 Van Brunt St, Floor 2, Brooklyn, NY 11231",orgW="earlyspring.nyc";try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgN=o.name;if(o.address)orgA=o.address;if(o.website)orgW=o.website}catch(e){}
return<div style={{textAlign:"center",marginTop:36,paddingTop:18,borderTop:"1px solid #EEE"}}>
  <div style={{fontSize:10,color:"#BBB"}}>Sent from <a href="https://early-spring-app.vercel.app" style={{color:"#999",textDecoration:"none"}}>Morgan</a> @ <a href={orgW.startsWith("http")?orgW:`https://${orgW}`} style={{color:"#999",textDecoration:"none"}}>{orgN}</a></div>
  {orgA&&<div style={{fontSize:9,color:"#CCC",marginTop:4}}>{orgA}</div>}
</div>})()}
      </div>
    </div>}

    {tab==="deck"&&<DeckTab project={project} updateProject={updateProject} accessToken={accessToken} clientName={clientName} deckRef={deckRef} deckEmail={deckEmail} setDeckEmail={setDeckEmail} deckSending={deckSending} setDeckSending={setDeckSending} deckSent={deckSent} setDeckSent={setDeckSent}/>}

    {tab==="files"&&<div>
      <input ref={fileInputRef} type="file" multiple accept="*" onChange={handleFileUpload} style={{display:"none"}}/>
      <Card style={{padding:18,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><span style={{fontSize:13,fontWeight:600,color:T.cream}}>Client Files</span><span style={{fontSize:11,color:T.dim,marginLeft:8}}>{clientFiles.length} files</span></div>
          <button onClick={()=>fileInputRef.current.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 18px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}><PlusI size={12} color={T.brown}/> Upload Files</button>
        </div>
        <p style={{fontSize:11,color:T.dim,marginTop:8,fontFamily:T.serif}}>Files are automatically sorted by type. Drag and drop or click to upload. You can change the category after upload.</p>
      </Card>
      <div style={{display:"flex",gap:3,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setFileFilter("all")} style={{padding:"6px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter==="all"?600:400,fontFamily:T.sans,background:fileFilter==="all"?T.goldSoft:"transparent",color:fileFilter==="all"?T.gold:T.dim}}>All ({clientFiles.length})</button>
        {CLIENT_FILE_CATS.map(c=>fileCounts[c]>0&&<button key={c} onClick={()=>setFileFilter(c)} style={{padding:"6px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter===c?600:400,fontFamily:T.sans,background:fileFilter===c?`${CLIENT_FILE_COLORS[c]}18`:"transparent",color:fileFilter===c?CLIENT_FILE_COLORS[c]:T.dim}}>{CLIENT_FILE_LABELS[c]} ({fileCounts[c]})</button>)}
      </div>
      {CLIENT_FILE_CATS.map(cat=>{
        const catFiles=filteredFiles.filter(f=>f.category===cat);
        if(!catFiles.length)return null;
        return<div key={cat} style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"0 4px"}}>
            <span style={{width:8,height:8,borderRadius:3,background:CLIENT_FILE_COLORS[cat]}}/>
            <span style={{fontSize:11,fontWeight:700,color:T.cream,textTransform:"uppercase",letterSpacing:".08em"}}>{CLIENT_FILE_LABELS[cat]}</span>
            <span style={{fontSize:10,color:T.dim}}>({catFiles.length})</span>
          </div>
          <Card style={{overflow:"hidden"}}>
            {catFiles.map((f,idx)=><div key={f.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:idx<catFiles.length-1?`1px solid ${T.border}`:"none"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:6,background:`${CLIENT_FILE_COLORS[f.category]}18`,color:CLIENT_FILE_COLORS[f.category],textTransform:"uppercase",flexShrink:0}}>{CLIENT_FILE_LABELS[f.category]}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                <div style={{fontSize:10,color:T.dim,marginTop:1}}>{f.fileName} · {f.dateAdded}</div>
              </div>
              <select value={f.category} onChange={e=>updateFileCategory(f.id,e.target.value)} style={{padding:"4px 6px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.dim,fontSize:10,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none"}}>
                {CLIENT_FILE_CATS.map(c=><option key={c} value={c}>{CLIENT_FILE_LABELS[c]}</option>)}
              </select>
              {f.fileData&&<button onClick={()=>window.open(f.fileData,"_blank")} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,flexShrink:0}}>View</button>}
              <button onClick={()=>removeFile(f.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>
            </div>)}
          </Card>
        </div>})}
      {clientFiles.length===0&&<Card style={{padding:40}}><div style={{textAlign:"center"}}>
        <div style={{fontSize:32,opacity:.15,marginBottom:12}}>▧</div>
        <div style={{fontSize:14,fontWeight:500,color:T.cream,marginBottom:6}}>No client files yet</div>
        <p style={{fontSize:12,color:T.dim,marginBottom:16}}>Upload RFPs, briefs, design files, contracts, and more. Files are automatically categorized.</p>
        <button onClick={()=>fileInputRef.current.click()} style={{padding:"10px 24px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Upload Files</button>
      </div></Card>}
    </div>}
  </div>;
}

export default ExpV;
