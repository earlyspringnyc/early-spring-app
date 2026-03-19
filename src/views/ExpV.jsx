import React, { useState, useRef, useCallback, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { ci, ct, calcProject } from '../utils/calc.js';
import { STATUS_LABELS, CLIENT_FILE_CATS, CLIENT_FILE_LABELS, CLIENT_FILE_COLORS } from '../constants/index.js';
import { mkClientFile } from '../data/factories.js';
import { PlusI, DlI, TrashI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card } from '../components/primitives/index.js';
import CalendarView from './CalendarView.jsx';
import GanttChart from './GanttChart.jsx';

const Pill=({children,color=T.gold,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

/* ── Inline file viewer modal (PDF via pdf.js, images native) ── */
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* ── PDF thumbnail — renders first page at small scale ── */
function PdfThumbnail({fileData}){
  const canvasRef=useRef(null);
  const[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    if(!fileData||!fileData.includes(","))return;
    const render=async()=>{
      try{
        const raw=atob(fileData.split(",")[1]);
        const arr=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
        const doc=await pdfjsLib.getDocument({data:arr}).promise;
        const pg=await doc.getPage(1);
        const vp=pg.getViewport({scale:.4});
        const canvas=canvasRef.current;
        if(!canvas)return;
        canvas.width=vp.width;canvas.height=vp.height;
        await pg.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
        setLoaded(true);
      }catch(e){console.error("[pdf thumb]",e)}
    };
    render();
  },[fileData]);
  return<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
    <canvas ref={canvasRef} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",opacity:loaded?1:0,transition:"opacity .2s"}}/>
    {!loaded&&<div style={{position:"absolute",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <span style={{fontSize:32,opacity:.3}}>&#128196;</span>
      <span style={{fontSize:9,fontWeight:600,color:T.neg,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",padding:"2px 6px",borderRadius:4,background:"rgba(248,113,113,.1)"}}>PDF</span>
    </div>}
  </div>;
}

function FileViewerModal({file,onClose}){
  const canvasRef=useRef(null);
  const[pdf,setPdf]=useState(null);
  const[page,setPage]=useState(0);
  const[total,setTotal]=useState(0);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState(null);
  // Resolve fileData — may need to restore from localStorage
  const[resolvedData,setResolvedData]=useState(file.fileData);
  useEffect(()=>{
    if(file.fileData){setResolvedData(file.fileData);return}
    if(file._hasLocalFile){
      try{const d=localStorage.getItem(`es_file_${file.id}`);if(d){setResolvedData(d);return}}catch(e){}
    }
    setResolvedData(null);
  },[file]);
  const isPdf=(file.fileName&&/\.pdf$/i.test(file.fileName))||(resolvedData&&resolvedData.startsWith("data:application/pdf"));
  const isImage=(file.fileName&&/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.fileName))||(resolvedData&&/^data:image\//i.test(resolvedData));

  useEffect(()=>{
    if(!isPdf||!resolvedData)return;
    const load=async()=>{
      try{
        setLoading(true);setError(null);
        let loadArg;
        if(resolvedData.includes(",")){
          const raw=atob(resolvedData.split(",")[1]);
          const arr=new Uint8Array(raw.length);
          for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
          loadArg={data:arr};
        } else { setError("Invalid PDF data");setLoading(false);return; }
        const doc=await pdfjsLib.getDocument(loadArg).promise;
        setPdf(doc);setTotal(doc.numPages);setLoading(false);
      }catch(e){console.error("[pdf]",e);setError("Could not load PDF");setLoading(false)}
    };
    load();
  },[resolvedData]);

  useEffect(()=>{
    if(!pdf||!canvasRef.current)return;
    const render=async()=>{
      const pg=await pdf.getPage(page+1);
      const canvas=canvasRef.current;
      const ctx=canvas.getContext("2d");
      const vp=pg.getViewport({scale:2.0});
      canvas.width=vp.width;canvas.height=vp.height;
      await pg.render({canvasContext:ctx,viewport:vp}).promise;
    };
    render();
  },[pdf,page]);

  return<div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{maxWidth:"95vw",maxHeight:"95vh",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:12,overflow:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",flexShrink:0}}>
        <div style={{fontSize:14,fontWeight:600,color:T.cream}}>{file.name}</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {resolvedData&&<a href={resolvedData} download={file.fileName||"file"} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none",fontFamily:T.sans,cursor:"pointer"}}>Download</a>}
          <button onClick={onClose} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Close</button>
        </div>
      </div>
      {!resolvedData?<div style={{padding:48,textAlign:"center"}}>
        <div style={{fontSize:13,color:T.dim}}>File data not available — it may have been cleared from storage</div>
      </div>
      :isPdf?<>
        {loading&&<div style={{color:T.dim,fontSize:13,padding:48}}>Loading PDF...</div>}
        {error&&<div style={{color:T.neg,fontSize:13,padding:48}}>{error}</div>}
        {pdf&&<canvas ref={canvasRef} style={{maxWidth:"100%",borderRadius:8,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}/>}
        {pdf&&total>1&&<div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <button onClick={()=>setPage(Math.max(0,page-1))} disabled={page===0} style={{padding:"6px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${page===0?"transparent":T.border}`,color:page===0?T.dim:T.cream,fontSize:12,cursor:page===0?"default":"pointer",fontFamily:T.sans}}>&larr; Prev</button>
          <span style={{fontSize:12,fontFamily:T.mono,color:T.cream,fontWeight:600}}>Page {page+1} of {total}</span>
          <button onClick={()=>setPage(Math.min(total-1,page+1))} disabled={page>=total-1} style={{padding:"6px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${page>=total-1?"transparent":T.border}`,color:page>=total-1?T.dim:T.cream,fontSize:12,cursor:page>=total-1?"default":"pointer",fontFamily:T.sans}}>Next &rarr;</button>
        </div>}
      </>
      :isImage?<img src={resolvedData} alt={file.name} style={{maxWidth:"100%",maxHeight:"80vh",borderRadius:8,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}/>
      :<div style={{padding:48,textAlign:"center"}}>
        <div style={{fontSize:13,color:T.dim,marginBottom:12}}>Preview not available for this file type</div>
        {resolvedData&&<a href={resolvedData} download={file.fileName||"file"} style={{padding:"8px 18px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:12,fontWeight:600,textDecoration:"none",fontFamily:T.sans}}>Download File</a>}
      </div>}
    </div>
  </div>;
}

function ExpV({cats,ag,comp,feeP,project,updateProject,accessToken,budgets}){
  const[activeView,setActiveView]=useState(null); // null=grid, "budget"|"timeline"|"files"
  const tasks=project.timeline||[];
  const clientFiles=project.clientFiles||[];
  const[included,setIncluded]=useState(()=>new Set(tasks.map(t=>t.id)));
  const[tlFormat,setTlFormat]=useState("both");
  const[emailTo,setEmailTo]=useState("");const[emailSending,setEmailSending]=useState(false);const[emailSent,setEmailSent]=useState("");
  const[emailMsg,setEmailMsg]=useState("");
  const[selectedBudgetId,setSelectedBudgetId]=useState(null); // null = primary
  const[fileFilter,setFileFilter]=useState("all");
  const[fileSearch,setFileSearch]=useState("");
  const[viewingFile,setViewingFile]=useState(null);
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
  const[fileDragging,setFileDragging]=useState(false);
  const fileDragCounter=useRef(0);
  const onFileDragEnter=useCallback(e=>{e.preventDefault();e.stopPropagation();fileDragCounter.current++;setFileDragging(true)},[]);
  const onFileDragLeave=useCallback(e=>{e.preventDefault();e.stopPropagation();fileDragCounter.current--;if(fileDragCounter.current===0)setFileDragging(false)},[]);
  const onFileDragOver=useCallback(e=>{e.preventDefault();e.stopPropagation()},[]);
  const onFileDrop=useCallback(e=>{
    e.preventDefault();e.stopPropagation();setFileDragging(false);fileDragCounter.current=0;
    const files=Array.from(e.dataTransfer.files);if(!files.length)return;
    const newFiles=[];let processed=0;
    files.forEach(file=>{const reader=new FileReader();reader.onload=ev=>{
      const cat=autoCategory(file.name);
      newFiles.push(mkClientFile(file.name.replace(/\.[^/.]+$/,""),cat,ev.target.result,file.name));
      processed++;if(processed===files.length)updateProject({clientFiles:[...clientFiles,...newFiles]});
    };reader.readAsDataURL(file)});
  },[clientFiles,updateProject]);

  const searchEmailContacts=async(val)=>{
    setEmailTo(val);
    const parts=val.split(",");const current=parts[parts.length-1].trim();
    if(current.length>=2&&accessToken){
      try{const{searchContacts}=await import('../utils/google.js');const results=await searchContacts(accessToken,current);setContactSugs(results||[]);setShowContactSugs(results&&results.length>0)}catch(e){setShowContactSugs(false)}
    }else{setShowContactSugs(false)}
  };
  const pickContact=(email)=>{const parts=emailTo.split(",");parts[parts.length-1]=email;setEmailTo(parts.join(", ")+", ");setShowContactSugs(false)};
  const copyLink=()=>{
    let token=project.shareToken;
    if(!token){token=Math.random().toString(36).slice(2)+Date.now().toString(36);if(updateProject)updateProject({shareToken:token})}
    const url=`${window.location.origin}?share=${token}`;
    navigator.clipboard?.writeText(url);setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);
  };
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
  const filteredFiles=(fileFilter==="all"?clientFiles:clientFiles.filter(f=>f.category===fileFilter)).filter(f=>!fileSearch||f.name.toLowerCase().includes(fileSearch.toLowerCase())||((f.fileName||"").toLowerCase().includes(fileSearch.toLowerCase())));
  const fileCounts=CLIENT_FILE_CATS.reduce((a,c)=>{a[c]=clientFiles.filter(f=>f.category===c).length;return a},{});

  const doSendEmail=async(subject,bodyFn)=>{if(!emailTo.trim())return;if(!accessToken){alert("Google access token required. Sign in with Google OAuth.");return}setEmailSending(true);try{const{sendEmail:gmailSend}=await import('../utils/google.js');const htmlBody=await bodyFn();await gmailSend(accessToken,emailTo.trim(),subject,htmlBody);setEmailSent(emailTo);setEmailTo("")}catch(e){alert("Failed to send: "+(e.message||"Unknown error"))}finally{setEmailSending(false)}};

  const getSelectedBudgetData=()=>{
    if(!selectedBudgetId)return{cats,ag,comp,feeP};
    const alt=(budgets||[]).find(b=>b.id===selectedBudgetId);
    if(!alt)return{cats,ag,comp,feeP};
    const altComp=calcProject({...project,cats:alt.cats,ag:alt.ag,feeP:alt.feeP});
    return{cats:alt.cats,ag:alt.ag,comp:altComp,feeP:alt.feeP};
  };
  const sendBudget=()=>{const bd=getSelectedBudgetData();const label=selectedBudgetId?(budgets||[]).find(b=>b.id===selectedBudgetId)?.name:"";doSendEmail(`Production Estimate${label?` (${label})`:""}: ${project.name||""}`,async()=>{const{budgetEmailHtml}=await import('../utils/emailTemplates.js');return budgetEmailHtml(project,bd.cats,bd.ag,bd.comp,bd.feeP,emailMsg)})};
  const sendTimeline=()=>doSendEmail(`Production Schedule: ${project.name||""}`,async()=>{const{timelineEmailHtml}=await import('../utils/emailTemplates.js');return timelineEmailHtml(project,clientTasks,emailMsg)});

  const getOrgInfo=()=>{let orgN="Early Spring LLC",orgA="",orgW="earlyspring.nyc";try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgN=o.name;if(o.address)orgA=o.address;if(o.website)orgW=o.website}catch(e){}return{orgN,orgA,orgW}};
  const OrgLogo=({color="#475569"})=>{try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.logo)return<img src={o.logo} alt={o.name||"Logo"} style={{height:16,objectFit:"contain"}}/>;if(o.name)return<span style={{fontSize:10,fontWeight:700,color,letterSpacing:".14em",textTransform:"uppercase"}}>{o.name}</span>}catch(e){}return<ESWordmark height={16} color={color}/>};
  const OrgFooter=()=>{const{orgN,orgA,orgW}=getOrgInfo();const w=orgW.replace(/^https?:\/\//,'');return<div style={{textAlign:"center",marginTop:36,paddingTop:18,borderTop:"1px solid #EEE"}}><div style={{fontSize:10,color:"#BBB"}}>Sent from <a href="https://early-spring-app.vercel.app" style={{color:"#999",textDecoration:"none"}}>Morgan</a> @ <a href={orgW.startsWith("http")?orgW:`https://${w}`} style={{color:"#999",textDecoration:"none"}}>{orgN}</a></div>{orgA&&<div style={{fontSize:9,color:"#CCC",marginTop:4}}>{orgA}</div>}</div>};

  /* Share bar component */
  const ShareBar=({onSend,showBudgetPicker})=><div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:16}}>
    {showBudgetPicker&&(budgets||[]).length>0&&<div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
      <span style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",alignSelf:"center",marginRight:4}}>Budget:</span>
      <button onClick={()=>setSelectedBudgetId(null)} style={{padding:"4px 10px",borderRadius:14,border:"none",fontSize:10,fontWeight:!selectedBudgetId?600:400,cursor:"pointer",fontFamily:T.sans,background:!selectedBudgetId?T.goldSoft:"transparent",color:!selectedBudgetId?T.gold:T.dim}}>Primary</button>
      {(budgets||[]).map(b=><button key={b.id} onClick={()=>setSelectedBudgetId(b.id)} style={{padding:"4px 10px",borderRadius:14,border:"none",fontSize:10,fontWeight:selectedBudgetId===b.id?600:400,cursor:"pointer",fontFamily:T.sans,background:selectedBudgetId===b.id?T.goldSoft:"transparent",color:selectedBudgetId===b.id?T.gold:T.dim}}>{b.name}</button>)}
    </div>}
    <textarea value={emailMsg} onChange={e=>setEmailMsg(e.target.value)} placeholder="Add a message (optional)..." rows={2} style={{width:"100%",padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical",marginBottom:10}}/>
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder={`${clientName.toLowerCase().replace(/\s/g,"")}@email.com`} onKeyDown={e=>e.key==="Enter"&&onSend()} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
      <button onClick={onSend} disabled={!emailTo.trim()||emailSending} style={{padding:"8px 16px",borderRadius:T.rS,border:"none",background:emailTo.trim()&&!emailSending?T.goldSoft:"rgba(255,255,255,.05)",color:emailTo.trim()&&!emailSending?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${emailTo.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:emailTo.trim()&&!emailSending?"pointer":"default",fontFamily:T.sans}}>{emailSending?"Sending...":"Send"}</button>
      <button onClick={()=>window.print()} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>PDF</button>
      {emailSent&&<span style={{fontSize:10,color:T.pos}}>Sent</span>}
    </div>
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
      {/* ── Estimate(s) ── */}
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
          {(budgets||[]).length>0&&<div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
            {(budgets||[]).map(b=>{const bc=calcProject({...project,cats:b.cats,ag:b.ag,feeP:b.feeP});return<div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
              <span style={{fontSize:11,color:T.dim}}>{b.name}</span>
              <span className="num" style={{fontSize:13,fontWeight:600,color:T.gold,fontFamily:T.mono}}>{f0(bc.grandTotal)}</span>
            </div>})}
          </div>}
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

      {/* ── Creative & Design Assets ── */}
      {(()=>{
        const allAssets=project.creativeAssets||[];
        const approved=allAssets.filter(a=>a.status==="approved"||a.status==="sent"||a.clientVisible);
        const inReview=allAssets.filter(a=>a.status==="review");
        const firstImage=approved.find(a=>a.isImage&&a.fileData);
        return<div onClick={()=>setActiveView("creative")} style={{...cardStyle("#8B5CF6"),position:"relative",minHeight:280}} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
          {firstImage?<>
            <div style={{position:"absolute",inset:0,overflow:"hidden",background:"#0A0A0C"}}>
              <img src={firstImage.fileData} style={{width:"100%",height:"100%",objectFit:"cover",opacity:.6}} alt=""/>
            </div>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 40%,rgba(0,0,0,.85) 100%)"}}/>
            <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 26px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".08em"}}>Creative & Design</div>
                {inReview.length>0&&<span style={{fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"rgba(245,158,11,.2)",color:"#F59E0B",textTransform:"uppercase"}}>&#9679; {inReview.length} awaiting review</span>}
              </div>
              <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{approved.length} approved asset{approved.length!==1?"s":""}</div>
            </div>
          </>
          :<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:280,background:"rgba(139,92,246,.04)",position:"relative"}}>
            {inReview.length>0&&<div style={{position:"absolute",top:16,right:16}}><span style={{fontSize:8,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"rgba(245,158,11,.2)",color:"#F59E0B",textTransform:"uppercase"}}>&#9679; {inReview.length} awaiting review</span></div>}
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:48,opacity:.1,marginBottom:10}}>&#9733;</div>
              <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Creative & Design</div>
              <div style={{fontSize:12,color:T.dim}}>{allAssets.length>0?`${allAssets.length} assets — none approved yet`:"No assets uploaded yet"}</div>
            </div>
          </div>}
        </div>;
      })()}

      {/* ── Files ── */}
      <div onClick={()=>setActiveView("files")} style={{...cardStyle("#EC4899"),border:fileDragging?`2px dashed ${T.magenta}`:`1px solid ${T.border}`,background:fileDragging?"rgba(236,72,153,.06)":undefined}} onMouseEnter={cardHover} onMouseLeave={cardLeave} onDragEnter={onFileDragEnter} onDragLeave={onFileDragLeave} onDragOver={onFileDragOver} onDrop={e=>{onFileDrop(e);setActiveView(null)}}>
        {fileDragging?<div style={{padding:"24px 26px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:160,gap:8}}>
          <div style={{fontSize:28,opacity:.4}}>&#8593;</div>
          <div style={{fontSize:13,fontWeight:600,color:T.magenta}}>Drop files here</div>
          <div style={{fontSize:10,color:T.dim}}>RFPs, briefs, decks, contracts</div>
        </div>:<div style={{padding:"24px 26px"}}>
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
          </>:<div style={{fontSize:11,color:T.dim}}>Drop or click to upload files</div>}
        </div>}
      </div>

      {/* ── Meeting Notes ── */}
      {(()=>{const allMtgs=project.meetings||[];const cEmails=(project.clientContacts||[]).map(c=>(c.email||"").toLowerCase()).filter(Boolean);const clientMtgs=allMtgs.filter(m=>m.isClientMeeting||(cEmails.length>0&&(m.attendees||[]).some(a=>cEmails.includes((a||"").toLowerCase()))));return<div onClick={()=>setActiveView("meetings")} style={cardStyle("#06B6D4")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        <div style={{padding:"24px 26px"}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Meeting Notes</div>
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:14}}>
            <span className="num" style={{fontSize:32,fontWeight:700,color:T.cyan,fontFamily:T.mono}}>{clientMtgs.length}</span>
            <span style={{fontSize:12,color:T.dim}}>client meeting{clientMtgs.length!==1?"s":""}</span>
          </div>
          {clientMtgs.slice(0,4).map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#C4B5FD",flexShrink:0}}/>
            <span style={{fontSize:11,color:T.dim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title}</span>
            {m.date&&<span style={{fontSize:9,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{m.date}</span>}
          </div>)}
          {clientMtgs.length===0&&<div style={{fontSize:11,color:T.dim}}>No client meetings yet</div>}
        </div>
      </div>})()}

      {/* ── Contacts ── */}
      <div onClick={()=>setActiveView("contacts")} style={cardStyle("#06B6D4")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
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
              {(budgets||[]).length>0&&<div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",alignSelf:"center",marginRight:2}}>Budget:</span>
                <button onClick={()=>setSelectedBudgetId(null)} style={{padding:"3px 8px",borderRadius:12,border:"none",fontSize:9,fontWeight:!selectedBudgetId?600:400,cursor:"pointer",fontFamily:T.sans,background:!selectedBudgetId?T.goldSoft:"transparent",color:!selectedBudgetId?T.gold:T.dim}}>Primary</button>
                {(budgets||[]).map(b=><button key={b.id} onClick={()=>setSelectedBudgetId(b.id)} style={{padding:"3px 8px",borderRadius:12,border:"none",fontSize:9,fontWeight:selectedBudgetId===b.id?600:400,cursor:"pointer",fontFamily:T.sans,background:selectedBudgetId===b.id?T.goldSoft:"transparent",color:selectedBudgetId===b.id?T.gold:T.dim}}>{b.name}</button>)}
              </div>}
              <div style={{position:"relative",marginBottom:8}}>
                <input value={emailTo} onChange={e=>searchEmailContacts(e.target.value)} onFocus={()=>{if(contactSugs.length)setShowContactSugs(true)}} onBlur={()=>setTimeout(()=>setShowContactSugs(false),200)} placeholder="Start typing a name or email..." style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
                {showContactSugs&&<div style={{position:"absolute",left:0,right:0,top:"100%",zIndex:70,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxHeight:140,overflow:"auto"}}>
                  {contactSugs.map((c,i)=><button key={i} onMouseDown={e=>{e.preventDefault();pickContact(c.email)}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:T.cream,fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {c.name&&<span>{c.name}</span>}<span style={{color:T.dim}}>{c.email}</span>
                  </button>)}
                </div>}
              </div>
              <textarea value={emailMsg} onChange={e=>setEmailMsg(e.target.value)} placeholder="Add a message (optional)..." rows={2} style={{width:"100%",padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none",resize:"vertical",marginBottom:10}}/>
              <div style={{display:"flex",flex:"column",gap:6}}>
                <button onClick={()=>{sendBudget();setShowShareMenu(false)}} disabled={!emailTo.trim()||emailSending} style={{flex:1,padding:"8px 0",borderRadius:T.rS,border:`1px solid ${T.border}`,background:emailTo.trim()?T.surfHov:"transparent",color:emailTo.trim()?T.cream:T.dim,fontSize:11,fontWeight:500,cursor:emailTo.trim()?"pointer":"default",fontFamily:T.sans,textAlign:"center"}}>{emailSending?"Sending...":"Send as Email"}</button>
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
  if(activeView==="files")return<div onDragEnter={onFileDragEnter} onDragLeave={onFileDragLeave} onDragOver={onFileDragOver} onDrop={onFileDrop} style={{position:"relative",minHeight:"50vh"}}>
    {fileDragging&&<div style={{position:"absolute",inset:0,zIndex:100,background:"rgba(8,8,12,.85)",backdropFilter:"blur(8px)",borderRadius:T.r,border:`3px dashed ${T.magenta}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:40,opacity:.6}}>&#8593;</div>
      <div style={{fontSize:18,fontWeight:600,color:T.magenta}}>Drop files here</div>
      <div style={{fontSize:12,color:T.dim}}>RFPs, briefs, decks, contracts, and more</div>
    </div>}
    <BackBtn/>
    <input ref={fileInputRef} type="file" multiple accept="*" onChange={handleFileUpload} style={{display:"none"}}/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Files</h2>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <input value={fileSearch} onChange={e=>setFileSearch(e.target.value)} placeholder="Search files..." style={{padding:"7px 12px 7px 30px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none",width:180}} onFocus={e=>e.currentTarget.style.borderColor=T.borderGlow} onBlur={e=>e.currentTarget.style.borderColor=T.border}/>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12,color:T.dim,pointerEvents:"none"}}>&#128269;</span>
        </div>
        <button onClick={()=>fileInputRef.current.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color={T.gold}/> Upload</button>
      </div>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={()=>setFileFilter("all")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter==="all"?600:400,fontFamily:T.sans,background:fileFilter==="all"?T.goldSoft:"transparent",color:fileFilter==="all"?T.gold:T.dim}}>All ({clientFiles.length})</button>
      {CLIENT_FILE_CATS.map(c=>fileCounts[c]>0&&<button key={c} onClick={()=>setFileFilter(c)} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter===c?600:400,fontFamily:T.sans,background:fileFilter===c?`${CLIENT_FILE_COLORS[c]}18`:"transparent",color:fileFilter===c?CLIENT_FILE_COLORS[c]:T.dim}}>{CLIENT_FILE_LABELS[c]} ({fileCounts[c]})</button>)}
    </div>
    {filteredFiles.length>0?<div className="file-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14}}>
      {filteredFiles.map(f=>{
        // Resolve fileData from localStorage if stripped
        const fd=f.fileData||(f._hasLocalFile?(()=>{try{return localStorage.getItem(`es_file_${f.id}`)}catch(e){return null}})():null);
        const isPdf=(f.fileName&&/\.pdf$/i.test(f.fileName))||(fd&&fd.startsWith("data:application/pdf"));
        const isImg=fd&&/^data:image\//i.test(fd);
        return<div key={f.id} onClick={()=>fd&&setViewingFile({...f,fileData:fd})} style={{borderRadius:T.r,border:`1px solid ${T.border}`,background:T.surfEl,overflow:"hidden",cursor:fd?"pointer":"default",transition:"border-color .15s, box-shadow .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.boxShadow=T.shadow}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none"}}>
          {/* Thumbnail area */}
          <div style={{height:130,background:T.surface,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
            {isImg?<img src={fd} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            :isPdf?<PdfThumbnail fileData={fd}/>
            :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              <span style={{fontSize:32,opacity:.3}}>&#128462;</span>
              <span style={{fontSize:9,fontWeight:600,color:T.dim,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em"}}>{(f.fileName||"").split(".").pop()||"FILE"}</span>
            </div>}
            <div style={{position:"absolute",top:6,left:6}}><Pill color={CLIENT_FILE_COLORS[f.category]} size="xs">{CLIENT_FILE_LABELS[f.category]}</Pill></div>
          </div>
          {/* Info area */}
          <div style={{padding:"10px 12px"}}>
            <div style={{fontSize:12,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{f.name}</div>
            <div style={{fontSize:9,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:8}}>{f.fileName} · {f.dateAdded}</div>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <select value={f.category} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();updateFileCategory(f.id,e.target.value)}} style={{flex:1,padding:"3px 4px",borderRadius:4,background:T.surface,border:`1px solid ${T.border}`,color:T.dim,fontSize:9,fontFamily:T.sans,outline:"none",cursor:"pointer"}}>{CLIENT_FILE_CATS.map(c=><option key={c} value={c}>{CLIENT_FILE_LABELS[c]}</option>)}</select>
              <button onClick={e=>{e.stopPropagation();removeFile(f.id)}} style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.12)",borderRadius:4,cursor:"pointer",padding:"3px 5px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.15)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.06)"}}><TrashI size={10} color={T.neg}/></button>
            </div>
          </div>
        </div>})}
    </div>
    :<div onClick={()=>fileInputRef.current.click()} style={{textAlign:"center",padding:48,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
      <div style={{fontSize:24,opacity:.15,marginBottom:8}}>&#8593;</div>
      <div style={{fontSize:14,fontWeight:500,color:T.cream,marginBottom:6}}>No files yet</div>
      <p style={{fontSize:12,color:T.dim}}>Upload RFPs, briefs, design files, contracts, decks</p>
    </div>}
    {viewingFile&&<FileViewerModal file={viewingFile} onClose={()=>setViewingFile(null)}/>}
  </div>;

  /* ══ MEETINGS VIEW ══ */
  if(activeView==="meetings"){
    const allMeetings=project.meetings||[];
    const clientEmails=(project.clientContacts||[]).map(c=>(c.email||"").toLowerCase()).filter(Boolean);
    /* Auto-detect: meeting is client-facing if explicitly flagged OR if any attendee email matches a client contact */
    const isClientMeeting=(m)=>{
      if(m.isClientMeeting)return true;
      if(clientEmails.length>0&&m.attendees&&m.attendees.length>0){
        return m.attendees.some(a=>clientEmails.includes((a||"").toLowerCase()));
      }
      return false;
    };
    const clientMeetings=allMeetings.filter(isClientMeeting);
    const sorted=[...clientMeetings].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const toggleClientFlag=(meetingId)=>{
      const updated=(project.meetings||[]).map(m=>m.id===meetingId?{...m,isClientMeeting:!m.isClientMeeting}:m);
      updateProject({meetings:updated});
    };
    return<div>
      <BackBtn/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Meeting Notes</h2>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Pill color={T.cyan}>{clientMeetings.length} client meeting{clientMeetings.length!==1?"s":""}</Pill>
          {allMeetings.length>clientMeetings.length&&<span style={{fontSize:10,color:T.dim}}>{allMeetings.length-clientMeetings.length} internal hidden</span>}
        </div>
      </div>
      {/* How it works */}
      {clientEmails.length===0&&clientMeetings.length===0&&<Card style={{padding:"14px 18px",marginBottom:12,borderLeft:`3px solid ${T.gold}`}}>
        <div style={{fontSize:11,color:T.dim,lineHeight:1.5}}>Add client contacts with email addresses to auto-detect client meetings. You can also manually mark any meeting as client-facing from the Production page.</div>
      </Card>}
      {/* Fireflies */}
      <Card style={{padding:"14px 18px",marginBottom:16,borderLeft:"3px solid #06B6D4"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:10,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".06em"}}>Fireflies Integration</span>
          <span style={{fontSize:11,color:T.dim}}>Auto-import call recordings, transcripts, and summaries</span>
          <button onClick={()=>{}} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:T.rS,border:`1px solid rgba(6,182,212,.2)`,background:"rgba(6,182,212,.06)",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Connect Fireflies</button>
        </div>
      </Card>
      {/* Untagged meetings — offer to mark as client */}
      {(()=>{const untagged=allMeetings.filter(m=>!isClientMeeting(m));if(!untagged.length)return null;return<Card style={{padding:"14px 18px",marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Other Meetings — mark as client-facing?</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {untagged.map(m=><button key={m.id} onClick={()=>toggleClientFlag(m.id)} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontFamily:T.sans,background:"rgba(255,255,255,.04)",color:T.dim,fontWeight:400}} onMouseEnter={e=>{e.currentTarget.style.background=T.goldSoft;e.currentTarget.style.color=T.gold}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.04)";e.currentTarget.style.color=T.dim}}>{m.title}{m.date?` · ${m.date}`:""}</button>)}
        </div>
      </Card>})()}
      {sorted.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {sorted.map(m=><Card key={m.id} style={{padding:"20px 22px",borderLeft:"3px solid #C4B5FD"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:15,fontWeight:600,color:T.cream}}>{m.title}</span>{m.isClientMeeting&&<Pill color={T.cyan} size="xs">Client</Pill>}</div>
              <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap"}}>
                {m.date&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{m.date}</span>}
                {m.time&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{m.time}</span>}
                {m.duration&&<span style={{fontSize:11,color:T.dim}}>{m.duration}</span>}
                {m.location&&<span style={{fontSize:11,color:T.cyan}}>{m.location}</span>}
              </div>
              {m.attendees&&m.attendees.length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{m.attendees.map((a,i)=>{const isClient=clientEmails.includes((a||"").toLowerCase());return<Pill key={i} color={isClient?T.cyan:T.dim} size="xs">{a}</Pill>})}</div>}
            </div>
            <button onClick={()=>toggleClientFlag(m.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:T.dim,fontFamily:T.sans,padding:"2px 6px"}} onMouseEnter={e=>e.currentTarget.style.color=T.neg} onMouseLeave={e=>e.currentTarget.style.color=T.dim} title="Remove from client meetings">×</button>
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
        <div style={{fontSize:14,fontWeight:500,color:T.cream,marginBottom:6}}>No client meetings</div>
        <p style={{fontSize:12,color:T.dim,maxWidth:300,margin:"0 auto"}}>Meetings are auto-detected when attendees match your client contacts. You can also manually tag meetings as client-facing.</p>
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

  /* ══ CREATIVE & DESIGN VIEW ══ */
  if(activeView==="creative"){
    const allAssets=project.creativeAssets||[];
    const approved=allAssets.filter(a=>a.status==="approved"||a.status==="sent"||a.clientVisible);
    const inReview=allAssets.filter(a=>a.status==="review");
    const STATUS_META={draft:{label:"Draft",color:T.dim},review:{label:"In Review",color:"#F59E0B"},approved:{label:"Approved",color:T.pos},sent:{label:"Sent",color:T.cyan}};
    return<div>
      <BackBtn/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>Creative & Design</h2>
        {inReview.length>0&&<Pill color="#F59E0B">&#9679; {inReview.length} awaiting review</Pill>}
      </div>

      {/* In Review — needs attention */}
      {inReview.length>0&&<div style={{marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:700,color:"#F59E0B",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Awaiting Review</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))",gap:10}}>
          {inReview.map(a=><div key={a.id} style={{borderRadius:T.rS,border:`1px solid rgba(245,158,11,.2)`,background:"rgba(245,158,11,.03)",overflow:"hidden"}}>
            <div style={{height:100,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
              {a.isImage&&a.fileData?<img src={a.fileData} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<div style={{fontSize:20,color:T.dim,opacity:.2}}>&#9634;</div>}
            </div>
            <div style={{padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:500,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
              <div style={{fontSize:9,color:"#F59E0B",marginTop:2}}>Needs approval</div>
            </div>
          </div>)}
        </div>
      </div>}

      {/* Approved / Sent */}
      {approved.length>0?<div>
        <div style={{fontSize:10,fontWeight:700,color:T.pos,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Approved Assets ({approved.length})</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:10}}>
          {approved.map(a=>{const sm=STATUS_META[a.status||"approved"];return<div key={a.id} style={{borderRadius:T.rS,border:`1px solid ${T.border}`,overflow:"hidden",background:T.surfEl}}>
            <div style={{height:120,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
              {a.isImage&&a.fileData?<img src={a.fileData} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
              :a.isVideo?<div style={{fontSize:28,color:T.dim,opacity:.3}}>&#9654;</div>
              :<div style={{fontSize:20,color:T.dim,opacity:.2}}>&#9634;</div>}
              <div style={{position:"absolute",top:6,right:6}}><Pill color={sm?.color||T.pos} size="xs">{sm?.label||"Approved"}</Pill></div>
            </div>
            <div style={{padding:"10px 12px"}}>
              <div style={{fontSize:12,fontWeight:500,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
              <div style={{fontSize:9,color:T.dim,marginTop:2}}>{a.dateAdded}</div>
              {a.fileData&&<a href={a.fileData} download={a.fileName||a.name} onClick={e=>e.stopPropagation()} style={{fontSize:9,color:T.cyan,marginTop:4,display:"block",textDecoration:"none"}}>Download</a>}
            </div>
          </div>})}
        </div>
      </div>
      :<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:12,border:`1px dashed ${T.border}`,borderRadius:T.r}}>
        <div style={{fontSize:24,opacity:.15,marginBottom:8}}>&#9733;</div>
        <div style={{fontSize:13,marginBottom:4}}>No approved assets yet</div>
        <p style={{fontSize:11,opacity:.6}}>Approve assets in the Creative page to make them visible here.</p>
      </div>}
    </div>;
  }

  return null;
}

export default ExpV;
