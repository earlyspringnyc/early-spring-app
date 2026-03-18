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
import CalendarView from './CalendarView.jsx';
import GanttChart from './GanttChart.jsx';

const Pill=({children,color=T.gold,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

function ExpV({cats,ag,comp,feeP,project,updateProject,accessToken}){
  const[activeView,setActiveView]=useState(null); // null=grid, "budget"|"timeline"|"files"
  const tasks=project.timeline||[];
  const clientFiles=project.clientFiles||[];
  const[included,setIncluded]=useState(()=>new Set(tasks.map(t=>t.id)));
  const[tlFormat,setTlFormat]=useState("both");
  const[emailTo,setEmailTo]=useState("");const[emailSending,setEmailSending]=useState(false);const[emailSent,setEmailSent]=useState("");
  const[fileFilter,setFileFilter]=useState("all");
  const fileInputRef=useRef(null);
  const deckRef=useRef(null);
  const[deckEmail,setDeckEmail]=useState("");const[deckSending,setDeckSending]=useState(false);const[deckSent,setDeckSent]=useState("");
  const[figmaUrl,setFigmaUrl]=useState(project.figmaDeckUrl||"");
  const deck=project.pitchDeck||null;
  const clientContacts=project.clientContacts||[];
  const[editingContacts,setEditingContacts]=useState(false);
  const[newContactName,setNewContactName]=useState("");const[newContactEmail,setNewContactEmail]=useState("");const[newContactRole,setNewContactRole]=useState("");const[newContactPhone,setNewContactPhone]=useState("");
  const[showExportMenu,setShowExportMenu]=useState(false);
  const[showShareMenu,setShowShareMenu]=useState(false);
  const[showTaskPicker,setShowTaskPicker]=useState(false);
  const[clientViewMode,setClientViewMode]=useState("calendar");
  const[clientSections,setClientSections]=useState(["visual","list"]);
  const[dragClientSection,setDragClientSection]=useState(null);
  const[dropClientSection,setDropClientSection]=useState(null);
  const[contactSugs,setContactSugs]=useState([]);
  const[showContactSugs,setShowContactSugs]=useState(false);
  const[linkCopied,setLinkCopied]=useState(false);

  const searchEmailContacts=async(val)=>{
    setEmailTo(val);
    const parts=val.split(",");const current=parts[parts.length-1].trim();
    if(current.length>=2&&accessToken){
      try{const{searchContacts}=await import('../utils/google.js');const results=await searchContacts(accessToken,current);setContactSugs(results||[]);setShowContactSugs(results&&results.length>0)}catch(e){setShowContactSugs(false)}
    }else{setShowContactSugs(false)}
  };
  const pickContact=(email)=>{const parts=emailTo.split(",");parts[parts.length-1]=email;setEmailTo(parts.join(", ")+", ");setShowContactSugs(false)};
  const copyLink=()=>{navigator.clipboard?.writeText(window.location.href);setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000)};
  const toggleTask=id=>setIncluded(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n});
  const selectAll=()=>setIncluded(new Set(tasks.map(t=>t.id)));
  const selectNone=()=>setIncluded(new Set());
  const clientTasks=tasks.filter(t=>included.has(t.id));
  const clientName=project.client||"Client";
  const tasksDone=tasks.filter(t=>t.status==="done").length;
  const taskPct=tasks.length?Math.round(tasksDone/tasks.length*100):0;

  const autoCategory=(fileName)=>{
    const n=fileName.toLowerCase();
    if(n.includes("rfp")||n.includes("request for proposal"))return"rfp";
    if(n.includes("brief")||n.includes("creative brief"))return"brief";
    if(n.includes("contract")||n.includes("agreement")||n.includes("sow")||n.includes("nda"))return"contract";
    if(n.includes("deck")||n.includes("presentation")||n.includes("pitch")||n.includes("pptx")||n.includes(".ppt")||n.includes(".key"))return"deck";
    if(n.includes("design")||n.includes("mock")||n.includes("render")||n.includes(".psd")||n.includes(".ai")||n.includes(".fig"))return"design";
    if(n.includes("ref")||n.includes("inspo")||n.includes("mood"))return"reference";
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

  const doSendEmail=async(subject,bodyFn)=>{if(!emailTo.trim())return;if(!accessToken){alert("Google access token required. Sign in with Google OAuth.");return}setEmailSending(true);try{const{sendEmail:gmailSend}=await import('../utils/google.js');const htmlBody=await bodyFn();await gmailSend(accessToken,emailTo.trim(),subject,htmlBody);setEmailSent(emailTo);setEmailTo("")}catch(e){alert("Failed to send: "+(e.message||"Unknown error"))}finally{setEmailSending(false)}};

  const sendBudget=()=>doSendEmail(`Production Estimate: ${project.name||""}`,async()=>{const{budgetEmailHtml}=await import('../utils/emailTemplates.js');return budgetEmailHtml(project,cats,ag,comp,feeP)});
  const sendTimeline=()=>doSendEmail(`Production Schedule: ${project.name||""}`,async()=>{const{timelineEmailHtml}=await import('../utils/emailTemplates.js');return timelineEmailHtml(project,clientTasks)});

  const getOrgInfo=()=>{let orgN="Early Spring LLC",orgA="",orgW="earlyspring.nyc";try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgN=o.name;if(o.address)orgA=o.address;if(o.website)orgW=o.website}catch(e){}return{orgN,orgA,orgW}};
  const OrgLogo=({color="#475569"})=>{try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.logo)return<img src={o.logo} alt={o.name||"Logo"} style={{height:16,objectFit:"contain"}}/>;if(o.name)return<span style={{fontSize:10,fontWeight:700,color,letterSpacing:".14em",textTransform:"uppercase"}}>{o.name}</span>}catch(e){}return<ESWordmark height={16} color={color}/>};
  const OrgFooter=()=>{const{orgN,orgA,orgW}=getOrgInfo();const w=orgW.replace(/^https?:\/\//,'');return<div style={{textAlign:"center",marginTop:36,paddingTop:18,borderTop:"1px solid #EEE"}}><div style={{fontSize:10,color:"#BBB"}}>Sent from <a href="https://early-spring-app.vercel.app" style={{color:"#999",textDecoration:"none"}}>Morgan</a> @ <a href={orgW.startsWith("http")?orgW:`https://${w}`} style={{color:"#999",textDecoration:"none"}}>{orgN}</a></div>{orgA&&<div style={{fontSize:9,color:"#CCC",marginTop:4}}>{orgA}</div>}</div>};

  /* Share bar component */
  const ShareBar=({onSend})=><div style={{display:"flex",gap:8,alignItems:"center",padding:"12px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:16}}>
    <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder={`${clientName.toLowerCase().replace(/\s/g,"")}@email.com`} onKeyDown={e=>e.key==="Enter"&&onSend()} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
    <button onClick={onSend} disabled={!emailTo.trim()||emailSending} style={{padding:"8px 16px",borderRadius:T.rS,border:"none",background:emailTo.trim()&&!emailSending?T.goldSoft:"rgba(255,255,255,.05)",color:emailTo.trim()&&!emailSending?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${emailTo.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:emailTo.trim()&&!emailSending?"pointer":"default",fontFamily:T.sans}}>{emailSending?"Sending...":"Send"}</button>
    <button onClick={()=>window.print()} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>PDF</button>
    {emailSent&&<span style={{fontSize:10,color:T.pos}}>Sent</span>}
  </div>;

  /* Back button */
  const BackBtn=()=><button onClick={()=>{setActiveView(null);setEmailSent("")}} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:12,fontFamily:T.sans,marginBottom:16,padding:0}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}><span style={{fontSize:14}}>&larr;</span> Back</button>;

  /* Client Gantt */
  const ClientGantt=()=>{
    const dated=clientTasks.filter(t=>parseD(t.startDate));
    if(!dated.length)return<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No dated tasks selected.</div>;
    const allDates=[];dated.forEach(t=>{allDates.push(parseD(t.startDate));if(parseD(t.endDate))allDates.push(parseD(t.endDate));else allDates.push(parseD(t.startDate))});
    const minD=new Date(Math.min(...allDates));const maxD=new Date(Math.max(...allDates));
    minD.setDate(minD.getDate()-2);maxD.setDate(maxD.getDate()+2);
    const totalDays=Math.max(daysBetween(minD,maxD),7);
    const weeks=[];let cur=new Date(minD);while(cur<=maxD){weeks.push(new Date(cur));cur.setDate(cur.getDate()+7)}
    return<div>{dated.map(t=>{const start=parseD(t.startDate);const end=parseD(t.endDate)||start;const left=(daysBetween(minD,start)/totalDays)*100;const width=Math.max((daysBetween(start,end)+1)/totalDays*100,1.5);const barColor=t.status==="done"?"#34D399":t.status==="progress"?"#22D3EE":"#475569";
      return<div key={t.id} style={{display:"flex",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #F0F0F0"}}><div style={{width:140,flexShrink:0,overflow:"hidden"}}><span style={{fontSize:11,color:"#333",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{t.name}</span></div><div style={{flex:1,position:"relative",height:18}}><div style={{position:"absolute",left:`${left}%`,width:`${width}%`,top:3,height:12,borderRadius:3,background:barColor,opacity:.85}}/></div></div>})}</div>};

  /* Client Calendar */
  const ClientCalendar=()=>{
    const dated=clientTasks.filter(t=>parseD(t.startDate)).sort((a,b)=>(a.startDate||"").localeCompare(b.startDate||""));
    if(!dated.length)return<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No dated tasks selected.</div>;
    return<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{borderBottom:"2px solid #E5E5E5"}}>{["Task","Start","End","Status"].map((h,i)=><th key={i} style={{textAlign:i>0?"center":"left",padding:"8px 4px",fontWeight:600,color:"#555",fontSize:10,textTransform:"uppercase",letterSpacing:".06em"}}>{h}</th>)}</tr></thead>
      <tbody>{dated.map(t=><tr key={t.id} style={{borderBottom:"1px solid #F0F0F0"}}><td style={{padding:"10px 4px",color:"#333"}}>{t.name}</td><td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.startDate}</td><td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.endDate||"\u2014"}</td><td style={{padding:"10px 4px",textAlign:"center"}}><span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:t.status==="done"?"#E8F5E9":t.status==="progress"?"#E0F7FA":"#F1F5F9",color:t.status==="done"?"#2E7D32":t.status==="progress"?"#00838F":"#475569",textTransform:"uppercase"}}>{STATUS_LABELS[t.status]}</span></td></tr>)}</tbody></table>};

  const addContact=()=>{if(!newContactName.trim())return;const c={id:Date.now().toString(),name:newContactName.trim(),email:newContactEmail,role:newContactRole,phone:newContactPhone};updateProject({clientContacts:[...clientContacts,c]});setNewContactName("");setNewContactEmail("");setNewContactRole("");setNewContactPhone("")};
  const removeContact=id=>updateProject({clientContacts:clientContacts.filter(c=>c.id!==id)});

  const cb=project.clientBudget||0;
  const totalSpend=comp.productionSubtotal.actualCost+comp.agencyCostsSubtotal.actualCost+comp.agencyFee.actualCost;
  const spendPct=cb>0?Math.min(Math.round((totalSpend/cb)*100),100):0;

  const cardStyle=(accent)=>({borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${accent}`,overflow:"hidden",cursor:"pointer",transition:"all .2s",background:T.surfEl});
  const cardHover=(e)=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=T.shadow};
  const cardLeave=(e)=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"};

  /* ══ GRID VIEW (default) ══ */
  if(!activeView)return<div>
    <div style={{marginBottom:28}}>
      <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em"}}>Client: {clientName}</h1>
      <div style={{display:"flex",gap:12,marginTop:6,alignItems:"center"}}>
        <span style={{fontSize:12,color:T.dim}}>{project.name}</span>
        {project.eventDate&&<span style={{fontSize:12,color:T.dim}}>Event: {project.eventDate}</span>}
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      {/* ── Estimate ── */}
      <div onClick={()=>setActiveView("budget")} style={cardStyle("#F59E0B")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        <div style={{padding:"24px 26px"}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Production Estimate</div>
          <div className="num" style={{fontSize:32,fontWeight:700,color:T.gold,fontFamily:T.mono,marginBottom:12}}>{f0(comp.grandTotal)}</div>
          {cb>0&&<div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:T.dim}}>{spendPct}% of budget</span><span style={{fontSize:9,color:T.dim,fontFamily:T.mono}}>{f0(cb)} budget</span></div>
            <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${spendPct}%`,background:spendPct>90?`linear-gradient(90deg,${T.neg},#FF6B6B)`:"linear-gradient(90deg,#F59E0B,#FBBF24)",borderRadius:2}}/></div>
          </div>}
          {cats.slice(0,4).map(c=>{const t=ct(c.items).totals;return<div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:11}}>
            <span style={{color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{c.name}</span>
            <span style={{color:T.cream,fontFamily:T.mono,flexShrink:0,marginLeft:8}}>{f0(t.clientPrice)}</span>
          </div>})}
          {cats.length>4&&<div style={{fontSize:10,color:T.dim,paddingTop:4}}>+{cats.length-4} more</div>}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div onClick={()=>setActiveView("timeline")} style={cardStyle("#14B8A6")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        <div style={{padding:"24px 26px"}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Production</div>
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:12}}>
            <span className="num" style={{fontSize:32,fontWeight:700,color:T.cyan,fontFamily:T.mono}}>{tasks.length}</span>
            <span style={{fontSize:12,color:T.dim}}>tasks</span>
          </div>
          {tasks.length>0&&<div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:T.dim}}>{tasksDone} done</span><span style={{fontSize:9,color:T.dim,fontFamily:T.mono}}>{taskPct}%</span></div>
            <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${taskPct}%`,background:"linear-gradient(90deg,#14B8A6,#4ADE80)",borderRadius:2}}/></div>
          </div>}
          {tasks.filter(t=>parseD(t.startDate)).slice(0,5).map(t=>{const tc=t.status==="done"?T.pos:t.status==="progress"?T.cyan:T.dim;return<div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:tc,flexShrink:0}}/>
            <span style={{fontSize:11,color:T.dim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span>
            <span style={{fontSize:9,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{t.startDate}</span>
          </div>})}
          {tasks.length===0&&<div style={{fontSize:11,color:T.dim,padding:"8px 0"}}>No tasks yet</div>}
        </div>
      </div>

      {/* ── Pitch Deck — cover fills entire card ── */}
      <div onClick={()=>setActiveView("deck")} style={{...cardStyle("#8B5CF6"),position:"relative",minHeight:280}} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        {deck?.fileData?<>
          <div style={{position:"absolute",inset:0,overflow:"hidden",background:"#f8f8fa"}}>
            {deck.fileData.startsWith("data:application/pdf")?<iframe src={deck.fileData+"#toolbar=0&navpanes=0&scrollbar=0&view=FitH"} style={{width:"200%",height:"200%",border:"none",pointerEvents:"none",position:"absolute",top:0,left:0,transform:"scale(0.5)",transformOrigin:"top left"}} title="Deck preview"/>
            :deck.fileData.startsWith("data:image")?<img src={deck.fileData} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="Deck"/>
            :<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%"}}><span style={{fontSize:48,opacity:.15}}>&#9634;</span></div>}
          </div>
          <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 26px",background:"linear-gradient(transparent,rgba(0,0,0,.8))"}}>
            <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Pitch Deck</div>
            <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{deck.name}</div>
          </div>
        </>
        :figmaUrl?<>
          <div style={{position:"absolute",inset:0,overflow:"hidden",background:"#f8f8fa"}}>
            <iframe src={`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(figmaUrl)}`} style={{width:"100%",height:"100%",border:"none",pointerEvents:"none"}} title="Figma preview" loading="lazy"/>
          </div>
          <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 26px",background:"linear-gradient(transparent,rgba(0,0,0,.8))"}}>
            <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Pitch Deck</div>
            <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>Figma Slides</div>
          </div>
        </>
        :<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:280,background:`rgba(139,92,246,.04)`}}>
          <div style={{textAlign:"center"}}><div style={{fontSize:48,opacity:.1,marginBottom:10}}>&#9634;</div><div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Pitch Deck</div><div style={{fontSize:12,color:T.dim}}>Upload deck or add Figma link</div></div>
        </div>}
      </div>

      {/* ── Files ── */}
      <div onClick={()=>setActiveView("files")} style={cardStyle("#EC4899")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        <div style={{padding:"24px 26px"}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Files</div>
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:14}}>
            <span className="num" style={{fontSize:32,fontWeight:700,color:T.magenta,fontFamily:T.mono}}>{clientFiles.length}</span>
            <span style={{fontSize:12,color:T.dim}}>files</span>
          </div>
          {clientFiles.length>0?<>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {CLIENT_FILE_CATS.filter(c=>fileCounts[c]>0).map(c=><Pill key={c} color={CLIENT_FILE_COLORS[c]} size="xs">{CLIENT_FILE_LABELS[c]} ({fileCounts[c]})</Pill>)}
            </div>
            {clientFiles.slice(0,4).map(f=><div key={f.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:CLIENT_FILE_COLORS[f.category]||T.dim,flexShrink:0}}/>
              <span style={{fontSize:11,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
            </div>)}
            {clientFiles.length>4&&<div style={{fontSize:10,color:T.dim,paddingTop:3}}>+{clientFiles.length-4} more</div>}
          </>:<div style={{fontSize:11,color:T.dim}}>Upload RFPs, briefs, decks, contracts</div>}
        </div>
      </div>

      {/* ── Meeting Notes ── */}
      <div onClick={()=>setActiveView("meetings")} style={cardStyle("#06B6D4")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        <div style={{padding:"24px 26px"}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Meeting Notes</div>
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:14}}>
            <span className="num" style={{fontSize:32,fontWeight:700,color:T.cyan,fontFamily:T.mono}}>{(project.meetings||[]).length}</span>
            <span style={{fontSize:12,color:T.dim}}>meetings</span>
          </div>
          {(project.meetings||[]).slice(0,4).map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#C4B5FD",flexShrink:0}}/>
            <span style={{fontSize:11,color:T.dim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title}</span>
            {m.date&&<span style={{fontSize:9,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{m.date}</span>}
          </div>)}
          {(project.meetings||[]).length===0&&<div style={{fontSize:11,color:T.dim}}>No meetings logged yet</div>}
        </div>
      </div>

      {/* ── Contacts ── */}
      <div onClick={()=>setActiveView("contacts")} style={{...cardStyle("#06B6D4"),gridColumn:"1/-1"}} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        <div style={{padding:"24px 26px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Client Contacts</div><span style={{fontSize:12,color:T.dim}}>{clientContacts.length} contact{clientContacts.length!==1?"s":""}</span></div>
          </div>
          {clientContacts.length>0?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:10}}>
            {clientContacts.map(c=><div key={c.id} style={{padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:13,fontWeight:500,color:T.cream}}>{c.name}</div>
              {c.role&&<div style={{fontSize:10,color:T.cyan,marginTop:2}}>{c.role}</div>}
              {c.email&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{c.email}</div>}
            </div>)}
          </div>
          :<div style={{fontSize:11,color:T.dim}}>Add key contacts at the client</div>}
        </div>
      </div>
    </div>
  </div>;

  /* Export helpers for estimate */
  const exportEstimateXLSX=async()=>{
    const XLSX=await import('xlsx');
    const rows=[["Category","Item","Description","Cost"]];
    cats.forEach(c=>{c.items.filter(it=>ci(it).clientPrice>0).forEach(it=>{rows.push([c.name,it.name,it.details||"",ci(it).clientPrice])})});
    rows.push([]);rows.push(["","","PRODUCTION SUBTOTAL",comp.productionSubtotal.clientPrice]);
    ag.forEach(it=>{rows.push(["Agency",it.name,"",ci(it).clientPrice])});
    rows.push(["","","AGENCY SUBTOTAL",comp.agencyCostsSubtotal.clientPrice]);
    rows.push(["","",`AGENCY FEE (${fp(feeP)})`,comp.agencyFee.clientPrice]);
    rows.push(["","","GRAND TOTAL",comp.grandTotal]);
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:18},{wch:24},{wch:20},{wch:14}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Estimate");
    XLSX.writeFile(wb,(project.name||"estimate")+"-client-estimate.xlsx");
  };
  const exportEstimateCSV=()=>{
    const rows=[["Category","Item","Description","Cost"]];
    cats.forEach(c=>{c.items.filter(it=>ci(it).clientPrice>0).forEach(it=>{rows.push([c.name,it.name,it.details||"",ci(it).clientPrice])})});
    rows.push([]);rows.push(["","","GRAND TOTAL",comp.grandTotal]);
    const csv=rows.map(r=>r.map(c=>typeof c==="string"&&c.includes(",")?`"${c}"`:c).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(project.name||"estimate")+"-client-estimate.csv";a.click();URL.revokeObjectURL(url);
  };
  /* ══ ESTIMATE VIEW ══ */
  if(activeView==="budget")return<div>
    <BackBtn/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Production Estimate</h2>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {/* Export dropdown */}
        <div style={{position:"relative"}}>
          <button onClick={()=>{setShowExportMenu(!showExportMenu);setShowShareMenu(false)}} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Export &#9662;</button>
          {showExportMenu&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:60,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",minWidth:160,overflow:"hidden"}}>
            {[["PDF",()=>{window.print();setShowExportMenu(false)},"Print to PDF"],["XLSX",()=>{exportEstimateXLSX();setShowExportMenu(false)},"Spreadsheet"],["CSV",()=>{exportEstimateCSV();setShowExportMenu(false)},"Comma-separated"]].map(([label,fn,sub])=>
              <button key={label} onClick={fn} style={{width:"100%",display:"flex",flexDirection:"column",padding:"10px 14px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:12,fontWeight:600,color:T.cream}}>{label}</span>
                <span style={{fontSize:10,color:T.dim,marginTop:1}}>{sub}</span>
              </button>)}
          </div>}
        </div>
        {/* Share dropdown */}
        <div style={{position:"relative"}}>
          <button onClick={()=>{setShowShareMenu(!showShareMenu);setShowExportMenu(false)}} style={{padding:"8px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Share &#9662;</button>
          {showShareMenu&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:60,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.r,boxShadow:"0 12px 40px rgba(0,0,0,.5)",width:300,overflow:"visible"}}>
            {/* Copy link */}
            <button onClick={copyLink} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:14}}>&#128279;</span><span style={{fontSize:12,fontWeight:500,color:T.cream}}>Copy Link</span></div>
              {linkCopied&&<span style={{fontSize:10,color:T.pos,fontWeight:600}}>Copied</span>}
            </button>
            {/* Email section */}
            <div style={{padding:"14px 16px"}}>
              <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Send via email</div>
              <div style={{position:"relative",marginBottom:12}}>
                <input value={emailTo} onChange={e=>searchEmailContacts(e.target.value)} onFocus={()=>{if(contactSugs.length)setShowContactSugs(true)}} onBlur={()=>setTimeout(()=>setShowContactSugs(false),200)} placeholder="Start typing a name or email..." style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
                {showContactSugs&&<div style={{position:"absolute",left:0,right:0,top:"100%",zIndex:70,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxHeight:140,overflow:"auto"}}>
                  {contactSugs.map((c,i)=><button key={i} onMouseDown={e=>{e.preventDefault();pickContact(c.email)}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:T.cream,fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {c.name&&<span>{c.name}</span>}<span style={{color:T.dim}}>{c.email}</span>
                  </button>)}
                </div>}
              </div>
              <div style={{display:"flex",flex:"column",gap:6}}>
                <button onClick={()=>{sendBudget();setShowShareMenu(false)}} disabled={!emailTo.trim()||emailSending} style={{flex:1,padding:"8px 0",borderRadius:T.rS,border:`1px solid ${T.border}`,background:emailTo.trim()?T.surfHov:"transparent",color:emailTo.trim()?T.cream:T.dim,fontSize:11,fontWeight:500,cursor:emailTo.trim()?"pointer":"default",fontFamily:T.sans,textAlign:"center"}}>Send as Email</button>
                <button onClick={()=>{window.print();setShowShareMenu(false)}} style={{flex:1,padding:"8px 0",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:T.sans,textAlign:"center"}}>Send as PDF</button>
              </div>
              {emailSent&&<div style={{marginTop:8,fontSize:10,color:T.pos}}>Sent to {emailSent}</div>}
            </div>
          </div>}
        </div>
      </div>
    </div>

    {/* Live table — dark theme, client-facing columns only */}
    <Card style={{overflow:"hidden",marginBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:"1.5fr 2fr 1fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        {["Item","Description","Cost"].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i===2?"right":"left"}}>{h}</span>)}
      </div>
      {cats.map((c,ci2)=>{const t=ct(c.items).totals;const accent=["#F59E0B","#14B8A6","#8B5CF6","#EC4899","#06B6D4","#6366F1","#10B981","#F47264"][ci2%8];return<React.Fragment key={c.id}>
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 2fr 1fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:`${accent}08`,borderLeft:`3px solid ${accent}`}}>
          <span style={{fontSize:12,fontWeight:600,color:T.cream,gridColumn:"1/3"}}>{c.name}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{f$(t.clientPrice)}</span>
        </div>
        {c.items.filter(it=>ci(it).clientPrice>0).map(it=><div key={it.id} style={{display:"grid",gridTemplateColumns:"1.5fr 2fr 1fr",padding:"10px 18px 10px 28px",borderBottom:`1px solid ${T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <span style={{fontSize:12,color:T.cream}}>{it.name}</span>
          <span style={{fontSize:11,color:T.dim,fontStyle:"italic"}}>{it.details||""}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.cream}}>{f$(ci(it).clientPrice)}</span>
        </div>)}
      </React.Fragment>})}
    </Card>

    {/* Production subtotal */}
    <div style={{display:"flex",justifyContent:"space-between",padding:"12px 18px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:4}}>
      <span style={{fontSize:11,fontWeight:700,color:T.cream,textTransform:"uppercase",letterSpacing:".06em"}}>Production Subtotal</span>
      <span className="num" style={{fontSize:13,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{f$(comp.productionSubtotal.clientPrice)}</span>
    </div>

    {/* Agency */}
    <Card style={{overflow:"hidden",marginTop:12,marginBottom:4}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em"}}>Agency Services</span>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:"right"}}>Cost</span>
      </div>
      {ag.map(it=>{const c=ci(it);return<div key={it.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr",padding:"10px 18px",borderBottom:`1px solid ${T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <span style={{fontSize:12,color:T.cream}}>{it.name}</span>
        <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.cream}}>{f$(c.clientPrice)}</span>
      </div>})}
    </Card>
    <div style={{display:"flex",justifyContent:"space-between",padding:"10px 18px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:2}}>
      <span style={{fontSize:11,fontWeight:600,color:T.dim,textTransform:"uppercase"}}>Agency Subtotal</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.cream}}>{f$(comp.agencyCostsSubtotal.clientPrice)}</span>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",padding:"10px 18px",borderRadius:T.rS,marginBottom:8}}>
      <span style={{fontSize:11,color:T.dim}}>Agency Fee ({fp(feeP)})</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.dim}}>{f$(comp.agencyFee.clientPrice)}</span>
    </div>

    {/* Grand Total */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 22px",borderRadius:T.rS,background:`linear-gradient(135deg,rgba(99,102,241,.08),rgba(20,184,166,.06))`,border:`1px solid rgba(99,102,241,.15)`}}>
      <span style={{fontSize:12,fontWeight:700,color:T.cream,textTransform:"uppercase",letterSpacing:".08em"}}>Grand Total</span>
      <span className="num" style={{fontSize:24,fontFamily:T.mono,color:T.gold,fontWeight:700}}>{f$(comp.grandTotal)}</span>
    </div>
  </div>;

  /* ══ PRODUCTION (CLIENT) VIEW ══ */
  if(activeView==="timeline"){
    const CLIENT_KEYWORDS=["deliverable","delivery","handoff","final","feedback","review","revision","approval","kick","kickoff","kick-off","launch","presentation","client","meeting","call","sync","milestone","deadline","due"];
    const isClientRelevant=(t)=>{const s=((t.name||"")+" "+(t.category||"")).toLowerCase();return CLIENT_KEYWORDS.some(k=>s.includes(k))};
    const autoFiltered=tasks.filter(t=>included.has(t.id));
    const suggestedTasks=tasks.filter(isClientRelevant);

    const handleClientSectionDrop=(targetKey)=>{
      if(!dragClientSection||dragClientSection===targetKey)return;
      const newOrder=[...clientSections];
      const fromIdx=newOrder.indexOf(dragClientSection);
      const toIdx=newOrder.indexOf(targetKey);
      newOrder.splice(fromIdx,1);newOrder.splice(toIdx,0,dragClientSection);
      setClientSections(newOrder);setDragClientSection(null);setDropClientSection(null);
    };

    const visualSection=<div key="visual" draggable onDragStart={()=>setDragClientSection("visual")} onDragOver={e=>{e.preventDefault();setDropClientSection("visual")}} onDrop={()=>handleClientSectionDrop("visual")} onDragEnd={()=>{setDragClientSection(null);setDropClientSection(null)}} style={{marginBottom:16,opacity:dragClientSection==="visual"?.4:1,borderTop:dropClientSection==="visual"&&dragClientSection?`2px solid ${T.gold}`:"2px solid transparent",transition:"opacity .15s",cursor:"grab"}}>
      {clientViewMode==="calendar"?<CalendarView tasks={autoFiltered} onAddTask={()=>{}} onEditTask={()=>{}} onDeleteTask={()=>{}} canEdit={false}/>
      :<GanttChart tasks={autoFiltered}/>}
    </div>;

    const listSection=<div key="list" draggable onDragStart={()=>setDragClientSection("list")} onDragOver={e=>{e.preventDefault();setDropClientSection("list")}} onDrop={()=>handleClientSectionDrop("list")} onDragEnd={()=>{setDragClientSection(null);setDropClientSection(null)}} style={{opacity:dragClientSection==="list"?.4:1,borderTop:dropClientSection==="list"&&dragClientSection?`2px solid ${T.gold}`:"2px solid transparent",transition:"opacity .15s",cursor:"grab"}}>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {autoFiltered.sort((a,b)=>(a.startDate||"9999").localeCompare(b.startDate||"9999")).map(t=>{
          const statusColor=t.status==="done"?T.pos:t.status==="progress"?T.cyan:t.status==="roadblocked"?T.neg:T.dim;
          const dateStr=t.startDate?(t.endDate&&t.endDate!==t.startDate?`${t.startDate} — ${t.endDate}`:t.startDate):"";
          return<div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.surfEl,borderRadius:T.rS,border:`1px solid ${T.border}`,borderLeft:`3px solid ${statusColor}`,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
            <div style={{flex:1,minWidth:0}}>
              <span style={{fontSize:13,fontWeight:500,color:T.cream}}>{t.name}</span>
              {t.category&&<span style={{marginLeft:8}}><Pill color={T.dim} size="xs">{t.category}</Pill></span>}
            </div>
            {dateStr&&<span style={{fontSize:10,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{dateStr}</span>}
            <Pill color={statusColor} size="xs">{STATUS_LABELS[t.status]}</Pill>
          </div>})}
        {autoFiltered.length===0&&<div style={{padding:40,textAlign:"center",color:T.dim,fontSize:12}}>No milestones to display.</div>}
      </div>
    </div>;

    const sectionMap={visual:visualSection,list:listSection};

    return<div>
    <BackBtn/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Production</h2>
        <span style={{fontSize:12,color:T.dim}}>{autoFiltered.length} milestone{autoFiltered.length!==1?"s":""}</span>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <div style={{display:"flex",gap:2,background:T.surface,borderRadius:20,padding:2}}>
          {[["calendar","Calendar"],["gantt","Gantt"]].map(([k,l])=><button key={k} onClick={()=>setClientViewMode(k)} style={{padding:"5px 14px",borderRadius:18,border:"none",cursor:"pointer",fontSize:10,fontWeight:clientViewMode===k?600:400,fontFamily:T.sans,background:clientViewMode===k?T.goldSoft:"transparent",color:clientViewMode===k?T.gold:T.dim}}>{l}</button>)}
        </div>
        <button onClick={copyLink} style={{padding:"7px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:linkCopied?T.pos:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{linkCopied?"Copied":"Copy Link"}</button>
        <button onClick={()=>window.print()} style={{padding:"7px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>PDF</button>
      </div>
    </div>

    {clientSections.map(k=>sectionMap[k])}
  </div>}

  /* ══ FILES VIEW ══ */
  if(activeView==="files")return<div>
    <BackBtn/>
    <input ref={fileInputRef} type="file" multiple accept="*" onChange={handleFileUpload} style={{display:"none"}}/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Files</h2>
      <button onClick={()=>fileInputRef.current.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color={T.gold}/> Upload</button>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={()=>setFileFilter("all")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter==="all"?600:400,fontFamily:T.sans,background:fileFilter==="all"?T.goldSoft:"transparent",color:fileFilter==="all"?T.gold:T.dim}}>All ({clientFiles.length})</button>
      {CLIENT_FILE_CATS.map(c=>fileCounts[c]>0&&<button key={c} onClick={()=>setFileFilter(c)} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter===c?600:400,fontFamily:T.sans,background:fileFilter===c?`${CLIENT_FILE_COLORS[c]}18`:"transparent",color:fileFilter===c?CLIENT_FILE_COLORS[c]:T.dim}}>{CLIENT_FILE_LABELS[c]} ({fileCounts[c]})</button>)}
    </div>
    {filteredFiles.length>0?<Card style={{overflow:"hidden"}}>
      {filteredFiles.map((f,idx)=><div key={f.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:idx<filteredFiles.length-1?`1px solid ${T.border}`:"none"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <Pill color={CLIENT_FILE_COLORS[f.category]} size="xs">{CLIENT_FILE_LABELS[f.category]}</Pill>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:500,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
          <div style={{fontSize:10,color:T.dim,marginTop:1}}>{f.fileName} · {f.dateAdded}</div>
        </div>
        <select value={f.category} onChange={e=>updateFileCategory(f.id,e.target.value)} style={{padding:"4px 6px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.dim,fontSize:10,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none"}}>{CLIENT_FILE_CATS.map(c=><option key={c} value={c}>{CLIENT_FILE_LABELS[c]}</option>)}</select>
        {f.fileData&&<button onClick={()=>window.open(f.fileData,"_blank")} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,flexShrink:0}}>View</button>}
        <button onClick={()=>removeFile(f.id)} style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.12)",borderRadius:T.rS,cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.15)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.06)"}}><TrashI size={11} color={T.neg}/></button>
      </div>)}
    </Card>
    :<div onClick={()=>fileInputRef.current.click()} style={{textAlign:"center",padding:48,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
      <div style={{fontSize:24,opacity:.15,marginBottom:8}}>&#8593;</div>
      <div style={{fontSize:14,fontWeight:500,color:T.cream,marginBottom:6}}>No files yet</div>
      <p style={{fontSize:12,color:T.dim}}>Upload RFPs, briefs, design files, contracts, decks</p>
    </div>}
  </div>;

  /* ══ MEETINGS VIEW ══ */
  if(activeView==="meetings"){
    const meetings=project.meetings||[];
    const sorted=[...meetings].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    return<div>
      <BackBtn/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Meeting Notes</h2>
        <Pill color={T.cyan}>{meetings.length} meeting{meetings.length!==1?"s":""}</Pill>
      </div>
      {/* Fireflies integration prompt */}
      <Card style={{padding:"14px 18px",marginBottom:16,borderLeft:"3px solid #06B6D4"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:10,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".06em"}}>Fireflies Integration</span>
          <span style={{fontSize:11,color:T.dim}}>Automatically import call recordings, transcripts, and summaries</span>
          <button onClick={()=>{}} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:T.rS,border:`1px solid rgba(6,182,212,.2)`,background:"rgba(6,182,212,.06)",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Connect Fireflies</button>
        </div>
      </Card>
      {sorted.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {sorted.map(m=><Card key={m.id} style={{padding:"20px 22px",borderLeft:"3px solid #C4B5FD"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:T.cream}}>{m.title}</div>
              <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap"}}>
                {m.date&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{m.date}</span>}
                {m.time&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{m.time}</span>}
                {m.duration&&<span style={{fontSize:11,color:T.dim}}>{m.duration}</span>}
                {m.location&&<span style={{fontSize:11,color:T.cyan}}>{m.location}</span>}
              </div>
              {m.attendees&&m.attendees.length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{m.attendees.map((a,i)=><Pill key={i} color={T.dim} size="xs">{a}</Pill>)}</div>}
            </div>
            <Pill color={m.calendarSent?T.pos:"#C4B5FD"} size="xs">{m.calendarSent?"Sent":"Scheduled"}</Pill>
          </div>
          {m.summary&&<div style={{padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,marginBottom:8}}>
            <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Summary</div>
            <div style={{fontSize:12,color:T.dimH,lineHeight:1.5}}>{m.summary}</div>
          </div>}
          {m.notes&&<div style={{padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,marginBottom:8}}>
            <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Notes</div>
            <div style={{fontSize:12,color:T.dimH,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.notes}</div>
          </div>}
          {(m.actionItems||[]).length>0&&<div>
            <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Action Items</div>
            {m.actionItems.map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0"}}>
              <div style={{width:14,height:14,borderRadius:a.done?7:3,border:`2px solid ${a.done?T.pos:T.dim}`,background:a.done?T.pos:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{a.done&&<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}</div>
              <span style={{fontSize:12,color:a.done?T.dim:T.cream,textDecoration:a.done?"line-through":"none"}}>{a.text}</span>
            </div>)}
          </div>}
        </Card>)}
      </div>
      :<Card style={{padding:40}}><div style={{textAlign:"center"}}>
        <div style={{fontSize:24,opacity:.15,marginBottom:8}}>&#9900;</div>
        <div style={{fontSize:14,fontWeight:500,color:T.cream,marginBottom:6}}>No meetings logged</div>
        <p style={{fontSize:12,color:T.dim}}>Meetings from the Production page will appear here</p>
      </div></Card>}
    </div>;
  }

  /* ══ CONTACTS VIEW ══ */
  if(activeView==="contacts")return<div>
    <BackBtn/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Client Contacts</h2>
      <button onClick={()=>setEditingContacts(!editingContacts)} style={{padding:"8px 14px",background:editingContacts?"transparent":T.goldSoft,color:editingContacts?T.dim:T.gold,border:`1px solid ${editingContacts?T.border:T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{editingContacts?"Done":"+ Add"}</button>
    </div>
    {editingContacts&&<Card style={{padding:16,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Name</div><input autoFocus value={newContactName} onChange={e=>setNewContactName(e.target.value)} placeholder="Jane Smith" onKeyDown={e=>e.key==="Enter"&&addContact()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Role</div><input value={newContactRole} onChange={e=>setNewContactRole(e.target.value)} placeholder="Producer" onKeyDown={e=>e.key==="Enter"&&addContact()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Email</div><input value={newContactEmail} onChange={e=>setNewContactEmail(e.target.value)} placeholder="jane@client.com" onKeyDown={e=>e.key==="Enter"&&addContact()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
        <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Phone</div><input value={newContactPhone} onChange={e=>setNewContactPhone(e.target.value)} placeholder="(555) 000-0000" onKeyDown={e=>e.key==="Enter"&&addContact()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
      </div>
      <button onClick={addContact} disabled={!newContactName.trim()} style={{padding:"8px 16px",borderRadius:T.rS,background:newContactName.trim()?T.goldSoft:"rgba(255,255,255,.05)",color:newContactName.trim()?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${newContactName.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:newContactName.trim()?"pointer":"default",fontFamily:T.sans}}>Add Contact</button>
    </Card>}
    {clientContacts.length>0?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:12}}>
      {clientContacts.map(c=><Card key={c.id} style={{padding:"20px 22px",borderLeft:"3px solid #06B6D4"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:T.cream,marginBottom:4}}>{c.name}</div>
            {c.role&&<Pill color={T.cyan} size="xs">{c.role}</Pill>}
          </div>
          <button onClick={()=>removeContact(c.id)} style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.12)",borderRadius:T.rS,cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.15)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.06)"}}><TrashI size={11} color={T.neg}/></button>
        </div>
        <div style={{marginTop:12}}>
          {c.email&&<div style={{fontSize:12,color:T.cyan,marginBottom:4}}>{c.email}</div>}
          {c.phone&&<div style={{fontSize:12,color:T.dim}}>{c.phone}</div>}
        </div>
      </Card>)}
    </div>
    :<Card style={{padding:40}}><div style={{textAlign:"center"}}>
      <div style={{fontSize:24,opacity:.15,marginBottom:8}}>&#128100;</div>
      <div style={{fontSize:14,fontWeight:500,color:T.cream,marginBottom:6}}>No contacts yet</div>
      <p style={{fontSize:12,color:T.dim}}>Add key people at the client organization</p>
    </div></Card>}
  </div>;

  /* ══ DECK VIEW ══ */
  if(activeView==="deck"){
    const handleDeckUpload=(e)=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{updateProject({pitchDeck:{name:file.name,fileData:ev.target.result,dateUploaded:new Date().toLocaleDateString()}})};reader.readAsDataURL(file);e.target.value=""};
    const sendDeck=async()=>{if(!deckEmail.trim()||!deck)return;if(!accessToken){alert("Google access token required.");return}setDeckSending(true);try{const{sendEmail:gmailSend}=await import('../utils/google.js');const{orgN}=getOrgInfo();const htmlBody=`<h2>Pitch Deck — ${project.name||""}</h2><p>Please find our pitch deck attached.</p><p>— ${orgN}</p>`;await gmailSend(accessToken,deckEmail.trim(),`Pitch Deck: ${project.name||""}`,htmlBody);setDeckSent(deckEmail);setDeckEmail("")}catch(e){alert("Failed: "+(e.message||"Error"))}finally{setDeckSending(false)}};
    const saveFigmaUrl=()=>{updateProject({figmaDeckUrl:figmaUrl})};
    return<div>
      <BackBtn/>
      <input ref={deckRef} type="file" accept=".pdf,.pptx,.key,.png,.jpg" onChange={handleDeckUpload} style={{display:"none"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Pitch Deck</h2>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>deckRef.current?.click()} style={{padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{deck?"Replace":"Upload"}</button>
          {deck&&<button onClick={()=>updateProject({pitchDeck:null})} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid rgba(248,113,113,.2)`,background:"transparent",color:T.neg,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Remove</button>}
        </div>
      </div>

      {/* Figma URL input */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",flexShrink:0}}>Figma</span>
        <input value={figmaUrl} onChange={e=>setFigmaUrl(e.target.value)} placeholder="Paste Figma slides URL..." onBlur={saveFigmaUrl} onKeyDown={e=>e.key==="Enter"&&saveFigmaUrl()} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
      </div>

      {/* Preview */}
      {deck?.fileData?<div style={{borderRadius:T.r,overflow:"hidden",border:`1px solid ${T.border}`,marginBottom:16}}>
        {deck.fileData.startsWith("data:application/pdf")?<iframe src={deck.fileData} style={{width:"100%",height:"70vh",border:"none"}} title="Deck"/>
        :deck.fileData.startsWith("data:image")?<img src={deck.fileData} style={{width:"100%",maxHeight:"70vh",objectFit:"contain",background:"#f8f8fa"}} alt="Deck"/>
        :<div style={{padding:60,textAlign:"center"}}><div style={{fontSize:40,opacity:.15,marginBottom:12}}>&#9634;</div><div style={{fontSize:14,color:T.cream,marginBottom:8}}>{deck.name}</div><p style={{fontSize:12,color:T.dim}}>Preview not available</p>{deck.fileData&&<a href={deck.fileData} download={deck.name} style={{display:"inline-block",marginTop:12,padding:"10px 20px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:12,fontWeight:600,textDecoration:"none"}}>Download</a>}</div>}
        <div style={{padding:"12px 18px",background:T.surfEl,borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><span style={{fontSize:13,fontWeight:500,color:T.cream}}>{deck.name}</span><span style={{fontSize:10,color:T.dim,marginLeft:8}}>Uploaded {deck.dateUploaded}</span></div>
          {deck.fileData&&<button onClick={()=>window.open(deck.fileData,"_blank")} style={{padding:"6px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Open</button>}
        </div>
      </div>
      :figmaUrl?<div style={{borderRadius:T.r,overflow:"hidden",border:`1px solid ${T.border}`,marginBottom:16}}>
        <iframe src={`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(figmaUrl)}`} style={{width:"100%",height:"70vh",border:"none"}} title="Figma deck" allowFullScreen/>
      </div>
      :<div onClick={()=>deckRef.current?.click()} style={{textAlign:"center",padding:60,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:"pointer",marginBottom:16}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
        <div style={{fontSize:40,opacity:.15,marginBottom:12}}>&#9634;</div>
        <div style={{fontSize:15,fontWeight:500,color:T.cream,marginBottom:6}}>Upload Pitch Deck</div>
        <p style={{fontSize:12,color:T.dim}}>PDF, PowerPoint, Keynote, or image</p>
        <p style={{fontSize:11,color:T.dim,marginTop:8}}>Or paste a Figma Slides URL above</p>
      </div>}

      {/* Send to client */}
      {deck&&<div style={{display:"flex",gap:8,alignItems:"center",padding:"12px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",flexShrink:0}}>Send</span>
        <input value={deckEmail} onChange={e=>setDeckEmail(e.target.value)} placeholder={`${clientName.toLowerCase().replace(/\s/g,"")}@email.com`} onKeyDown={e=>e.key==="Enter"&&sendDeck()} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
        <button onClick={sendDeck} disabled={!deckEmail.trim()||deckSending} style={{padding:"8px 16px",borderRadius:T.rS,border:"none",background:deckEmail.trim()&&!deckSending?T.goldSoft:"rgba(255,255,255,.05)",color:deckEmail.trim()&&!deckSending?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${deckEmail.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:deckEmail.trim()&&!deckSending?"pointer":"default",fontFamily:T.sans}}>{deckSending?"Sending...":"Send"}</button>
        {deckSent&&<span style={{fontSize:10,color:T.pos}}>Sent</span>}
      </div>}
    </div>;
  }

  return null;
}

export default ExpV;
