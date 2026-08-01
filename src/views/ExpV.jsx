import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { ci, ct, calcProject, fmtRange, projectSupportsRanges } from '../utils/calc.js';
import { STATUS_LABELS, CLIENT_FILE_CATS, CLIENT_FILE_LABELS, CLIENT_FILE_COLORS, canDo } from '../constants/index.js';
import { mkClientFile } from '../data/factories.js';
import { PlusI, DlI, TrashI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card } from '../components/primitives/index.js';
import { toast } from '../lib/toast.js';
import { listContactsForProject, listContacts, linkContactToProject, unlinkContactFromProject } from '../lib/contacts.js';
import { listMeetingsForProject } from '../lib/meetings.js';
import { normalizeCompany } from '../utils/companyDedup.js';
import { restFetch } from '../lib/db.js';
import CalendarView from './CalendarView.jsx';
import GanttChart from './GanttChart.jsx';
import { syncFirefliesMeetings } from '../utils/fireflies.js';

const Pill=({children,color=T.ink,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 8px":"3px 10px",borderRadius:999,background:"transparent",color,border:`1px solid ${color}`,textTransform:"uppercase",letterSpacing:".06em",whiteSpace:"nowrap"}}>{children}</span>;

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
      <span style={{fontSize:9,fontWeight:700,color:T.ink,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".10em",padding:"2px 8px",borderRadius:4,background:T.inkSoft}}>PDF</span>
    </div>}
  </div>;
}

function FileViewerModal({file,onClose}){
  // Close on Escape key
  useEffect(()=>{
    const onKey=e=>{if(e.key==="Escape")onClose()};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[onClose]);
  const canvasRef=useRef(null);
  const[pdf,setPdf]=useState(null);
  const[page,setPage]=useState(0);
  const[total,setTotal]=useState(0);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState(null);
  // Resolve fileData — may need to restore from localStorage
  const[resolvedData,setResolvedData]=useState(file.fileData);
  const[loadError,setLoadError]=useState(null);
  useEffect(()=>{
    setLoadError(null);
    if(file.fileData){setResolvedData(file.fileData);return}
    if(file.storagePath){
      import('../lib/db.js')
        .then(({downloadFileData})=>downloadFileData(file.storagePath))
        .then(d=>{if(d)setResolvedData(d);else setLoadError('File could not be loaded from storage. It may have been deleted or your access may have changed.')})
        .catch(e=>{console.error('[file-viewer]',e);setLoadError('File could not be loaded. Try refreshing.')});
      return;
    }
    if(file._hasLocalFile){
      try{const d=localStorage.getItem(`es_file_${file.id}`);if(d){setResolvedData(d);return}}catch(e){}
      setLoadError('File is no longer available locally.');
      return;
    }
    setResolvedData(null);
    setLoadError('No file data available for this item.');
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
      // Use nearly the full screen — only 40px header and 50px page nav
      const availW=window.innerWidth;
      const availH=window.innerHeight-90;
      const baseVp=pg.getViewport({scale:1});
      const scale=Math.min(availW/baseVp.width,availH/baseVp.height);
      const vp=pg.getViewport({scale});
      canvas.width=vp.width;canvas.height=vp.height;
      await pg.render({canvasContext:ctx,viewport:vp}).promise;
    };
    render();
  },[pdf,page]);

  // Scroll through pages with mouse wheel
  const onWheel=useCallback(e=>{
    if(!pdf||total<=1)return;
    e.preventDefault();
    if(e.deltaY>0)setPage(p=>Math.min(total-1,p+1));
    else if(e.deltaY<0)setPage(p=>Math.max(0,p-1));
  },[pdf,total]);

  // Arrow keys for page navigation
  useEffect(()=>{
    if(!pdf||total<=1)return;
    const onKey=e=>{
      if(e.key==="ArrowRight"||e.key==="ArrowDown")setPage(p=>Math.min(total-1,p+1));
      if(e.key==="ArrowLeft"||e.key==="ArrowUp")setPage(p=>Math.max(0,p-1));
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[pdf,total]);

  return<div onClick={onClose} onWheel={onWheel} style={{position:"fixed",inset:0,zIndex:9999,background:"#000",display:"flex",flexDirection:"column",height:"100vh",width:"100vw"}}>
    {/* Header — compact */}
    <div onClick={e=>e.stopPropagation()} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",flexShrink:0,height:40,background:T.inkSoft2}}>
      <div style={{fontSize:13,fontWeight:600,color:T.cream}}>{file.name}</div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {file.linkUrl&&<a href={file.linkUrl} target="_blank" rel="noopener noreferrer" className="btn-pill" style={{padding:"4px 14px",fontSize:11,textDecoration:"none",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`}}>Open & Edit ↗</a>}
        {resolvedData&&<a href={resolvedData} download={file.fileName||"file"} className="btn-pill" style={{padding:"4px 14px",fontSize:11,textDecoration:"none"}}>Download</a>}
        <button onClick={onClose} className="btn-pill" style={{padding:"4px 14px",fontSize:11}}>Close (Esc)</button>
      </div>
    </div>
    {/* Content — full remaining space */}
    <div onClick={e=>e.stopPropagation()} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto"}}>
      {file.linkUrl?(()=>{
        // Convert known providers to their iframe-embed URLs so the
        // preview actually renders. Inline mini-version of
        // CreativeV.toEmbedUrl — kept here so ExpV doesn't have to
        // import the whole creative module.
        const u=file.linkUrl;const ul=u.toLowerCase();
        let src=u;
        if(ul.includes('docs.google.com')||ul.includes('drive.google.com'))src=u.replace(/\/(edit|view|viewform)(\?[^#]*)?(#.*)?$/,'/preview');
        else if(ul.includes('figma.com'))src=`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(u)}`;
        else if(ul.includes('canva.com')){const v=u.replace(/\/(edit|view)(\?[^#]*)?(#.*)?$/,'/view');src=v.includes('?embed')?v:`${v}?embed`}
        else if(ul.includes('youtube.com')||ul.includes('youtu.be')){const m=u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);if(m)src=`https://www.youtube.com/embed/${m[1]}`}
        else if(ul.includes('vimeo.com')){const m=u.match(/vimeo\.com\/(?:video\/)?(\d+)/);if(m)src=`https://player.vimeo.com/video/${m[1]}`}
        else if(ul.includes('loom.com'))src=u.replace('/share/','/embed/');
        return<iframe src={src} title={file.name} style={{width:"100vw",height:"calc(100vh - 50px)",border:"none",background:"#fff"}} allow="autoplay; fullscreen; clipboard-write" allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"/>;
      })()
      :!resolvedData?<div style={{padding:48,textAlign:"center",color:loadError?T.alert:T.fadedInk,fontSize:13,maxWidth:480,lineHeight:1.6}}>{loadError||'Loading…'}</div>
      :isPdf?<div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
        {loading&&<div style={{color:T.fadedInk,fontSize:13,padding:48}}>Loading PDF…</div>}
        {error&&<div style={{color:T.neg,fontSize:13,padding:48}}>{error}</div>}
        {pdf&&<canvas ref={canvasRef} style={{display:"block"}}/>}
      </div>
      :isImage?<img src={resolvedData} alt={file.name} style={{maxWidth:"100vw",maxHeight:"calc(100vh - 90px)",objectFit:"contain"}}/>
      :<div style={{padding:48,textAlign:"center"}}>
        <div style={{fontSize:13,color:T.dim,marginBottom:12}}>Preview not available for this file type</div>
        {resolvedData&&<a href={resolvedData} download={file.fileName||"file"} style={{padding:"8px 18px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:12,fontWeight:600,textDecoration:"none",fontFamily:T.sans}}>Download File</a>}
      </div>}
    </div>
    {/* Page nav — fixed at bottom */}
    {isPdf&&pdf&&total>1&&<div onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"10px 0",flexShrink:0,height:50,background:T.inkSoft2}}>
      <button onClick={()=>setPage(Math.max(0,page-1))} disabled={page===0} className="btn-pill" style={{padding:"4px 14px",fontSize:12,opacity:page===0?.4:1,cursor:page===0?"default":"pointer"}}>&larr; Prev</button>
      <span style={{fontSize:12,fontFamily:T.mono,color:T.paper,fontWeight:600}}>Page {page+1} of {total}</span>
      <button onClick={()=>setPage(Math.min(total-1,page+1))} disabled={page>=total-1} className="btn-pill" style={{padding:"4px 14px",fontSize:12,opacity:page>=total-1?.4:1,cursor:page>=total-1?"default":"pointer"}}>Next &rarr;</button>
    </div>}
  </div>;
}

function ExpV({cats,ag,comp,feeP,project,updateProject,accessToken,budgets,requestCalendarAccess,user}){
  // Capability gates. Agents (and viewer/client roles) lose Send-Email
  // and Invite-Client surfaces — they can still download PDFs.
  const canSendEmail = canDo(user, 'send_email');
  const canInviteClient = canDo(user, 'invite_client');
  const[activeView,setActiveView]=useState(null); // null=grid, "budget"|"timeline"|"files"

  // ── Client portal presence ──────────────────────────────────
  // project_clients rows for this project. last_seen_at is heartbeated
  // from the /client portal every 60s while a client tab is open.
  // We poll every 30s so staff sees presence within ~1 minute.
  const[portalClients,setPortalClients]=useState([]);
  useEffect(()=>{
    if(!project?.id)return;
    let cancelled=false;
    const fetchClients=async()=>{
      try{
        const rows=await restFetch(`/project_clients?project_id=eq.${project.id}&select=id,user_id,invited_at,last_seen_at&order=invited_at.desc`);
        if(!cancelled)setPortalClients(rows||[]);
      }catch(e){/* RLS errors swallow gracefully */}
    };
    fetchClients();
    // 90s while visible — was 30s, throttled to ease free-tier load.
    const interval=setInterval(()=>{if(document.visibilityState==='visible')fetchClients()},90000);
    return()=>{cancelled=true;clearInterval(interval)};
  },[project?.id]);

  // ── Chat with the client ────────────────────────────────────
  const[chatOpen,setChatOpen]=useState(false);
  const[chatMessages,setChatMessages]=useState([]);
  const[chatDraft,setChatDraft]=useState("");
  const[chatSending,setChatSending]=useState(false);
  const[chatLastSeenAt,setChatLastSeenAt]=useState(()=>{
    try{return localStorage.getItem(`es_chat_staff_last_seen_${project?.id}`)||""}catch(e){return""}
  });
  const chatScrollerRef=useRef(null);
  useEffect(()=>{
    if(!project?.id)return;
    let cancelled=false;
    const fetchChat=async()=>{
      try{
        const rows=await restFetch(`/client_messages?project_id=eq.${project.id}&order=created_at.asc&limit=300`);
        if(!cancelled)setChatMessages(rows||[]);
      }catch(e){}
    };
    fetchChat();
    // 15s while visible — was 4s. Duplicate of the global chat poll;
    // this can be removed once the inline chat in ExpV is fully retired.
    const interval=setInterval(()=>{if(document.visibilityState==='visible')fetchChat()},15000);
    return()=>{cancelled=true;clearInterval(interval)};
  },[project?.id]);
  useEffect(()=>{
    if(chatOpen&&chatScrollerRef.current){chatScrollerRef.current.scrollTop=chatScrollerRef.current.scrollHeight}
  },[chatMessages,chatOpen]);
  useEffect(()=>{
    if(chatOpen&&chatMessages.length>0){
      const newest=chatMessages[chatMessages.length-1]?.created_at||'';
      if(newest){setChatLastSeenAt(newest);try{localStorage.setItem(`es_chat_staff_last_seen_${project?.id}`,newest)}catch(e){}}
    }
  },[chatOpen,chatMessages,project?.id]);
  const sendChatMessage=async()=>{
    const body=chatDraft.trim();
    if(!body||!project?.id)return;
    setChatSending(true);
    try{
      const sbKey=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
      const session=sbKey?JSON.parse(localStorage.getItem(sbKey)):null;
      const myId=session?.user?.id;
      if(!myId){alert('Sign in first.');return}
      const inserted=await restFetch('/client_messages',{
        method:'POST',
        body:{project_id:project.id,user_id:myId,body},
      });
      const row=Array.isArray(inserted)?inserted[0]:inserted;
      if(row)setChatMessages(prev=>[...prev,row]);
      setChatDraft("");
    }catch(e){alert(`Couldn't send: ${e.message||e}`)}
    finally{setChatSending(false)}
  };

  // Presence summary: are any clients "active now" (last_seen <90s ago)?
  const clientPresence=useMemo(()=>{
    if(!portalClients.length)return{state:'none'};
    const now=Date.now();
    const mostRecent=portalClients.reduce((max,c)=>{
      const t=c.last_seen_at?new Date(c.last_seen_at).getTime():0;
      return t>max?t:max;
    },0);
    if(mostRecent===0)return{state:'invited',count:portalClients.length};
    const ageMs=now-mostRecent;
    if(ageMs<90000)return{state:'active',count:portalClients.length,at:mostRecent};
    return{state:'idle',count:portalClients.length,at:mostRecent};
  },[portalClients]);

  // Unread chat messages from the client side (anyone NOT the current
  // staff user, since we don't track sender role here — close enough).
  const currentUserId=useMemo(()=>{
    try{
      const sbKey=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
      const session=sbKey?JSON.parse(localStorage.getItem(sbKey)):null;
      return session?.user?.id||null;
    }catch(e){return null}
  },[]);
  const chatUnread=useMemo(()=>{
    if(!chatMessages.length)return 0;
    return chatMessages.filter(m=>m.user_id!==currentUserId&&(!chatLastSeenAt||m.created_at>chatLastSeenAt)).length;
  },[chatMessages,chatLastSeenAt,currentUserId]);

  const tasks=project.timeline||[];
  const clientFiles=project.clientFiles||[];
  const[included,setIncluded]=useState(()=>new Set(tasks.map(t=>t.id)));
  const[tlFormat,setTlFormat]=useState("both");
  const[emailTo,setEmailTo]=useState("");const[emailSending,setEmailSending]=useState(false);const[emailSent,setEmailSent]=useState("");
  const[emailMsg,setEmailMsg]=useState("");
  const[selectedBudgetId,setSelectedBudgetId]=useState(null); // null = primary
  const[shareModal,setShareModal]=useState(null); // null | "budget" | "timeline"
  const[previewHtml,setPreviewHtml]=useState("");
  const[fileFilter,setFileFilter]=useState("all");
  const[showFileLink,setShowFileLink]=useState(false);
  const[fileLinkUrl,setFileLinkUrl]=useState("");
  const[fileLinkName,setFileLinkName]=useState("");
  const[fileLinkAddingName,setFileLinkAddingName]=useState(false);
  // Look up the doc name from the URL (Drive API for Google Docs,
  // slug parse for Figma/Canva/etc.) as soon as the user finishes
  // typing/pastes the URL — only if they haven't manually typed
  // their own name yet.
  const fileLinkBlur=async()=>{
    if(!fileLinkUrl.trim()||fileLinkName.trim())return;
    setFileLinkAddingName(true);
    try{
      const{deriveLinkName}=await import('../utils/linkMeta.js');
      const n=await deriveLinkName(fileLinkUrl.trim(),accessToken);
      if(n&&!fileLinkName.trim())setFileLinkName(n);
    }catch(e){}
    finally{setFileLinkAddingName(false)}
  };
  const addFileLink=async()=>{
    const url=fileLinkUrl.trim();if(!url)return;
    let name=fileLinkName.trim();
    if(!name){
      try{const{deriveLinkName}=await import('../utils/linkMeta.js');name=(await deriveLinkName(url,accessToken))||""}catch(e){}
    }
    if(!name){
      try{const u=new URL(url);name=u.hostname.replace(/^www\./,'')+u.pathname.split('/').filter(Boolean).slice(0,1).map(s=>` · ${s}`).join('')}catch(e){name=url.slice(0,60)}
    }
    const doc=mkClientFile(name,fileFilter==='all'?'other':fileFilter,null,null);
    doc.linkUrl=url;
    updateProject(prev=>({clientFiles:[...(prev.clientFiles||[]),doc]}));
    setFileLinkUrl("");setFileLinkName("");setShowFileLink(false);
  };
  const[fileSearch,setFileSearch]=useState("");
  const[viewingFile,setViewingFile]=useState(null);
  const fileInputRef=useRef(null);
  const deckRef=useRef(null);
  const[deckEmail,setDeckEmail]=useState("");const[deckSending,setDeckSending]=useState(false);const[deckSent,setDeckSent]=useState("");
  const[figmaUrl,setFigmaUrl]=useState(project.figmaDeckUrl||"");
  const deck=project.pitchDeck||null;
  // Legacy "manually entered client contacts" stored on the project's
  // JSONB blob. Pre-CRM model. Merged below with CRM-resolved contacts
  // so the Client Contacts card on the Client View pulls from both
  // sources without losing legacy data.
  const legacyClientContacts=project.clientContacts||[];

  // CRM contacts + meetings linked to this project. Mirrors the
  // hardwire pattern in DashV: explicit contact_projects links
  // PLUS contacts whose company matches project.client.
  const[crmContacts,setCrmContacts]=useState([]);
  const[crmMeetings,setCrmMeetings]=useState([]);
  const[crmReloadKey,setCrmReloadKey]=useState(0);
  // Inline role editor — same pattern as DashV. Lets the user
  // switch a contact between POC / Champion / Team member / RFP
  // sender, or remove an explicit row entirely. Implicit
  // (company-match) contacts can't be "removed" inline; the
  // Manage modal on the dashboard handles that case.
  const userIdEx=user?.user_id||user?.id;
  const ROLE_OPTIONS_EX=[
    {id:'point_of_contact',label:'Point of contact'},
    {id:'champion',label:'Champion'},
    {id:'rfp_sender',label:'RFP sender'},
    {id:'team_member',label:'Team member'},
  ];
  const changeContactRoleEx=async(contactId,oldRole,newRole)=>{
    try{
      if(newRole==='__remove__'){
        if(oldRole&&oldRole!=='client_team'){
          await unlinkContactFromProject(contactId,project.id,oldRole);
        }else{
          alert("Use the dashboard's Client Team → Manage button to remove auto-included contacts.");
          return;
        }
      }else if(oldRole&&oldRole!=='client_team'&&oldRole!==newRole){
        await unlinkContactFromProject(contactId,project.id,oldRole);
        await linkContactToProject(userIdEx,contactId,project.id,newRole);
      }else if(!oldRole||oldRole==='client_team'){
        await linkContactToProject(userIdEx,contactId,project.id,newRole);
      }else{
        return;
      }
      setCrmReloadKey(k=>k+1);
    }catch(e){alert('Could not update role: '+(e.message||e))}
  };
  useEffect(()=>{
    if(!project?.id)return;
    let cancelled=false;
    (async()=>{
      const targetNorm=normalizeCompany(project.client||"");
      let byCompany=[];
      if(targetNorm){
        try{
          const rows=await listContacts({search:project.client,limit:200});
          byCompany=(rows||[]).filter(c=>normalizeCompany(c.company||"")===targetNorm);
        }catch(e){console.warn("[expv] company-contacts load failed:",e.message||e)}
      }
      let explicit=[];
      try{explicit=await listContactsForProject(project.id)||[]}
      catch(e){console.warn("[expv] contact_projects load failed:",e.message||e)}
      // Curation rule (mirrors DashV): once any explicit contact_projects
      // row exists, the team is considered curated — skip the company-
      // match auto-include so only the people explicitly added show up.
      // Zero explicit rows → fall back to showing the whole company as
      // a discovery default.
      const seenIds=new Set(explicit.map(lp=>lp.contacts?.id).filter(Boolean));
      const implicit=explicit.length>0?[]:byCompany.filter(c=>!seenIds.has(c.id)).map(c=>({...c,_role:"client_team"}));
      const merged=[
        ...explicit.map(lp=>({...lp.contacts,_role:lp.role})),
        ...implicit,
      ];
      if(!cancelled)setCrmContacts(merged);

      // Meetings: explicit meeting_projects + meetings linked to any
      // of the company contacts. Batched query keeps DB load minimal.
      let explicitM=[];
      try{explicitM=await listMeetingsForProject(project.id)||[]}
      catch(e){console.warn("[expv] meeting_projects load failed:",e.message||e)}
      const mById=new Map(explicitM.map(m=>[m.id,m]));
      // Curated team → only explicit contacts contribute to meeting
      // lookups. Otherwise meetings from sibling projects (same
      // company, different project) leak in via the company match.
      const allContactIds=(explicit.length>0?[...seenIds]:[...seenIds,...byCompany.map(c=>c.id)]).filter(Boolean);
      if(allContactIds.length){
        try{
          const enc=encodeURIComponent;
          const path=`/meeting_contacts?select=meetings(*)&contact_id=in.(${allContactIds.map(enc).join(',')})&limit=200`;
          const rows=await restFetch(path);
          for(const r of (rows||[])){
            const m=r?.meetings;
            if(m?.id&&!mById.has(m.id))mById.set(m.id,m);
          }
        }catch(e){console.warn("[expv] meeting batch load failed:",e.message||e)}
      }
      const all=[...mById.values()].sort((a,b)=>new Date(b.occurred_at||0)-new Date(a.occurred_at||0));
      if(!cancelled)setCrmMeetings(all);
    })();
    return()=>{cancelled=true};
  },[project?.id,project?.client,crmReloadKey]);

  // Shape CRM contacts into the same { id, name, role, email } the
  // existing UI expects, then merge with legacy.
  const ROLE_LABEL={rfp_sender:"RFP sender",champion:"Champion",point_of_contact:"Point of contact",agent:"Agent",team_member:"Team member",client_team:"Client team"};
  const crmAsClientContacts=crmContacts.map(c=>({
    id:c.id,
    name:`${c.first_name||""} ${c.last_name||""}`.trim()||c.email||"(No name)",
    email:c.email||"",
    role:ROLE_LABEL[c._role]||c._role||"",
    // Keep the raw role id around so the inline role editor can
    // PATCH against contact_projects with the correct value.
    _roleId:c._role||"",
    phone:c.phone||"",
    title:c.title||"",
    _crm:true,
  }));
  // Dedupe by email — legacy entries with matching email get replaced.
  const seenEmails=new Set(crmAsClientContacts.map(c=>c.email?.toLowerCase()).filter(Boolean));
  const clientContacts=[
    ...crmAsClientContacts,
    ...legacyClientContacts.filter(c=>!c.email||!seenEmails.has(c.email.toLowerCase())),
  ];
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
  const[ffKeyInput,setFfKeyInput]=useState("");const[showFfSetup,setShowFfSetup]=useState(false);
  const[ffSyncing,setFfSyncing]=useState(false);const[ffStatus,setFfStatus]=useState("");
  const ffApiKey=project.firefliesApiKey||"";
  const connectFireflies=async(key)=>{
    const apiKey=key||ffApiKey;if(!apiKey)return;
    setFfSyncing(true);setFfStatus("Syncing...");
    try{
      const clientEmails=(project.clientContacts||[]).map(c=>c.email).filter(Boolean);
      const meetings=await syncFirefliesMeetings(apiKey,{clientEmails,projectName:project.name||"",clientName:project.client||""});
      // Functional updater — `project.meetings` captured above could be stale
      // after the network round-trip; re-derive from prev to avoid wiping
      // concurrent edits.
      if(meetings.length>0){
        updateProject(prev=>{
          const existing=new Set((prev.meetings||[]).map(m=>m.firefliesId).filter(Boolean));
          const newM=meetings.filter(m=>!existing.has(m.firefliesId));
          return{meetings:[...(prev.meetings||[]),...newM],firefliesApiKey:apiKey};
        });
        setFfStatus(`Imported ${meetings.length} meeting${meetings.length!==1?"s":""}`);
      }else{
        updateProject({firefliesApiKey:apiKey});
        setFfStatus("No new meetings found");
      }
      setShowFfSetup(false);
    }catch(e){console.error("[fireflies]",e);setFfStatus(e.message||"Sync failed")}
    setFfSyncing(false);setTimeout(()=>setFfStatus(""),5000);
  };
  const[showContactSugs,setShowContactSugs]=useState(false);
  const[linkCopied,setLinkCopied]=useState(false);

  // ── Client portal invite state ──────────────────────────────
  // Provisions a Supabase auth user + project_clients link for a client,
  // then emails the portal URL + credentials via the staff member's Gmail.
  const[showInviteModal,setShowInviteModal]=useState(false);
  const[inviteEmail,setInviteEmail]=useState("");
  const[inviteName,setInviteName]=useState("");
  const[inviteSending,setInviteSending]=useState(false);
  const[inviteResult,setInviteResult]=useState(null); // {email,password,portalUrl,emailSent}
  const[inviteError,setInviteError]=useState("");
  const portalUrl=typeof window!=='undefined'?`${window.location.origin}/client`:'/client';

  const provisionClientPortal=async()=>{
    setInviteError("");
    const email=inviteEmail.trim().toLowerCase();
    if(!email.includes('@')){setInviteError('Enter a valid email.');return}
    setInviteSending(true);
    try{
      const sbKey=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
      const token=sbKey?JSON.parse(localStorage.getItem(sbKey))?.access_token:null;
      if(!token){setInviteError('Sign in first.');setInviteSending(false);return}
      const res=await fetch('/api/client-invite',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({projectId:project.id||project._dbId,email,name:inviteName.trim()||undefined}),
      });
      if(!res.ok){
        const e=await res.json().catch(()=>({}));
        setInviteError(e.error||'Could not provision client account');
        setInviteSending(false);
        return;
      }
      const data=await res.json();
      // Try to email the client via Gmail using the existing helper.
      let emailSent=false;let emailErr=null;
      try{
        const{sendEmail:gmailSend}=await import('../utils/google.js');
        const{clientInviteEmailHtml}=await import('../utils/emailTemplates.js');
        let gToken=accessToken;
        if(!gToken){try{gToken=localStorage.getItem('es_google_token')}catch(e){}}
        if(!gToken&&requestCalendarAccess){try{gToken=await requestCalendarAccess()}catch(e){}}
        if(gToken){
          const html=clientInviteEmailHtml(project,data.email,data.password,portalUrl,'');
          await gmailSend(gToken,data.email,`Your ${project.name||"project"} portal access`,html);
          emailSent=true;
        }else{emailErr='No Google token — credentials shown below to share manually.'}
      }catch(e){emailErr=e.message||'Email send failed — credentials shown below.'}
      setInviteResult({...data,portalUrl,emailSent,emailErr});
    }catch(e){setInviteError(e.message||'Network error')}
    finally{setInviteSending(false)}
  };

  const closeInviteModal=()=>{
    setShowInviteModal(false);
    setInviteEmail("");setInviteName("");setInviteResult(null);setInviteError("");
  };

  // Rendered via `{renderInviteModal()}` rather than `<ClientInviteModal/>`
  // so React keeps the input nodes mounted across re-renders — otherwise
  // focus jumps on every keystroke since the component identity changes.
  const inviteRow=(label,value,mono)=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:12}}>
      <span style={{fontSize:10,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",flexShrink:0}}>{label}</span>
      <span style={{fontSize:12,color:T.cream,fontFamily:mono?T.mono:T.sans,wordBreak:"break-all",textAlign:"right"}}>{value}</span>
    </div>
  );
  const renderInviteModal=()=>{
    if(!showInviteModal)return null;
    return<div onClick={closeInviteModal} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(15,82,186,.18)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,background:T.paper,border:`1px solid ${T.faintRule}`,borderRadius:T.r,boxShadow:"0 24px 80px rgba(15,82,186,.20)",overflow:"hidden"}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:15,fontWeight:700,color:T.cream}}>Invite Client to Portal</div>
          <button onClick={closeInviteModal} style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4,lineHeight:1}}>×</button>
        </div>

        {!inviteResult?<div style={{padding:"24px"}}>
          <p style={{fontSize:12,color:T.dim,lineHeight:1.6,margin:"0 0 18px"}}>
            We'll create a portal login for this email and send an invitation
            with the credentials. The password is {' '}
            <code style={{fontFamily:T.mono,color:T.cream,padding:"1px 6px",background:T.surface,borderRadius:3,fontSize:11}}>earlyspring{(project.client||project.name||'client').toLowerCase().replace(/[^a-z0-9]/g,'')}</code>.
          </p>

          {/* Quick-pick from this project's client contacts (CRM + legacy).
              Tapping a chip autofills the form. Manual entry below still works. */}
          {(()=>{const invitable=clientContacts.filter(c=>c.email);if(!invitable.length)return null;
            return<div style={{marginBottom:18}}>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Pick from client contacts</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {invitable.map(c=>{
                  const isPicked=c.email.toLowerCase()===inviteEmail.trim().toLowerCase();
                  return<button key={c.id||c.email} onClick={()=>{setInviteEmail(c.email);setInviteName(c.name||"")}} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${isPicked?T.ink:T.faintRule}`,background:isPicked?T.ink:"transparent",color:isPicked?T.paper:T.cream,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans,textAlign:"left",lineHeight:1.4,transition:"all .15s"}}>
                    <span style={{fontWeight:700}}>{c.name||c.email}</span>
                    {c.name&&<span style={{marginLeft:6,opacity:.6,fontWeight:400}}>{c.email}</span>}
                  </button>;
                })}
              </div>
            </div>;
          })()}

          <div style={{display:"grid",gap:14}}>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Client name (optional)</label>
              <input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Jane Doe" style={{width:"100%",padding:"10px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Client email *</label>
              <input type="email" autoFocus value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="jane@client.com" onKeyDown={e=>e.key==='Enter'&&provisionClientPortal()} style={{width:"100%",padding:"10px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>
          {inviteError&&<div style={{marginTop:14,fontSize:12,color:T.neg,fontWeight:600}}>{inviteError}</div>}
          <div style={{marginTop:22,display:"flex",justifyContent:"flex-end",gap:8}}>
            <button onClick={closeInviteModal} style={{padding:"9px 18px",background:"transparent",color:T.dim,border:`1px solid ${T.border}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
            <button onClick={provisionClientPortal} disabled={inviteSending||!inviteEmail.trim()} style={{padding:"9px 22px",background:T.ink,color:T.paper,border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:inviteSending||!inviteEmail.trim()?"default":"pointer",opacity:inviteSending||!inviteEmail.trim()?.4:1,fontFamily:T.sans}}>{inviteSending?"Creating…":"Create & Send"}</button>
          </div>
        </div>
        :<div style={{padding:"24px"}}>
          <div style={{fontSize:13,fontWeight:600,color:T.pos,marginBottom:14}}>
            {inviteResult.alreadyExisted?'Existing account refreshed.':'Client account created.'}
            {inviteResult.emailSent?' Invitation email sent.':' Email NOT sent — copy the credentials below.'}
          </div>
          {inviteResult.emailErr&&!inviteResult.emailSent&&<div style={{fontSize:11,color:T.dim,marginBottom:14}}>{inviteResult.emailErr}</div>}
          <div style={{display:"grid",gap:10,background:T.surface,padding:"16px 18px",borderRadius:T.rS,border:`1px solid ${T.border}`}}>
            {inviteRow("Portal URL",inviteResult.portalUrl,true)}
            {inviteRow("Email",inviteResult.email,true)}
            {inviteRow("Password",inviteResult.password,true)}
          </div>
          <div style={{marginTop:18,display:"flex",justifyContent:"flex-end",gap:8}}>
            <button onClick={()=>{navigator.clipboard?.writeText(`Portal: ${inviteResult.portalUrl}\nEmail: ${inviteResult.email}\nPassword: ${inviteResult.password}`)}} style={{padding:"9px 18px",background:"transparent",color:T.cream,border:`1px solid ${T.border}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Copy all</button>
            <button onClick={closeInviteModal} style={{padding:"9px 22px",background:T.ink,color:T.paper,border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans}}>Done</button>
          </div>
        </div>}
      </div>
    </div>;
  };


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
      processed++;if(processed===files.length){
        updateProject(prev=>({clientFiles:[...(prev.clientFiles||[]),...newFiles]}));
        // Background upload to Google Drive
        if(accessToken&&project.driveFolders){
          import('../utils/drive.js').then(({uploadToDrive})=>{
            newFiles.forEach(async(f)=>{
              if(!f.fileData)return;
              const result=await uploadToDrive(accessToken,f.fileData,f.fileName,project.driveFolders,null,"client");
              if(result){
                updateProject(prev=>({clientFiles:(prev.clientFiles||[]).map(x=>x.id===f.id?{...x,driveId:result.driveId,driveLink:result.webViewLink}:x)}));
              }
            });
          });
        }
      }
    };reader.readAsDataURL(file)});
  },[clientFiles,updateProject,accessToken,project.driveFolders]);

  const searchEmailContacts=async(val)=>{
    setEmailTo(val);
    const parts=val.split(",");const current=parts[parts.length-1].trim();
    if(current.length>=2&&accessToken){
      try{const{searchContacts}=await import('../utils/google.js');const results=await searchContacts(accessToken,current);setContactSugs(results||[]);setShowContactSugs(results&&results.length>0)}catch(e){setShowContactSugs(false)}
    }else{setShowContactSugs(false)}
  };
  const pickContact=(email)=>{const parts=emailTo.split(",");parts[parts.length-1]=email;setEmailTo(parts.join(", ")+", ");setShowContactSugs(false)};
  const copyLink=async()=>{
    try{
      // Get the current Supabase access token to authenticate the request.
      const sbKey=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
      const token=sbKey?JSON.parse(localStorage.getItem(sbKey))?.access_token:null;
      if(!token)return alert('Sign in to create a share link');
      const res=await fetch('/api/share-create',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({projectId:project.id||project._dbId}),
      });
      if(!res.ok){const e=await res.json().catch(()=>({}));return alert(e.error||'Could not create share link')}
      const{token:shareToken}=await res.json();
      const url=`${window.location.origin}?share=${shareToken}`;
      navigator.clipboard?.writeText(url);
      setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);
    }catch(e){console.error('[share]',e);alert('Could not create share link')}
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
      processed++;if(processed===files.length){
        updateProject(prev=>({clientFiles:[...(prev.clientFiles||[]),...newFiles]}));
        if(accessToken&&project.driveFolders){
          import('../utils/drive.js').then(({uploadToDrive})=>{
            newFiles.forEach(async(f)=>{
              if(!f.fileData)return;
              const result=await uploadToDrive(accessToken,f.fileData,f.fileName,project.driveFolders,null,"client");
              if(result){
                updateProject(prev=>({clientFiles:(prev.clientFiles||[]).map(x=>x.id===f.id?{...x,driveId:result.driveId,driveLink:result.webViewLink}:x)}));
              }
            });
          });
        }
      }
    };reader.readAsDataURL(file)});
    e.target.value="";
  };
  const removeFile=id=>updateProject({clientFiles:clientFiles.filter(f=>f.id!==id)});
  const updateFileCategory=(id,cat)=>updateProject({clientFiles:clientFiles.map(f=>f.id===id?{...f,category:cat}:f)});

  // ── Share-a-file via email state. The user clicks "Send" on a
  // file card → modal opens prefilled with project client emails +
  // a default subject. Gmail-sent so the email arrives FROM the
  // signed-in user.
  const [shareFile, setShareFile] = useState(null);
  const [shareTo, setShareTo] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareSending, setShareSending] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [shareSentTo, setShareSentTo] = useState('');
  const openShareFileModal = (f) => {
    setShareFile(f);
    setShareError(null);
    setShareSentTo('');
    setShareMessage('');
    if (!shareTo) setShareTo(clientEmails);
  };
  const closeShareFileModal = () => { setShareFile(null); setShareError(null); };
  // Resolve fileData from the doc, localStorage, or null. Same
  // fallback chain the FileViewerModal uses.
  const resolveFileData = (f) => {
    if (f?.fileData) return f.fileData;
    try { return localStorage.getItem(`es_file_${f?.id}`) || null; } catch { return null; }
  };
  const sendFileViaEmail = async () => {
    if (!shareFile) return;
    if (!shareTo.trim()) { setShareError('Recipient email is required.'); return; }
    let token = accessToken;
    if (!token) { try { token = localStorage.getItem('es_google_token'); } catch {} }
    if (!token) { setShareError('Sign in with Google first — Morgan emails via your Gmail account.'); return; }
    const dataUrl = resolveFileData(shareFile);
    if (!dataUrl || !dataUrl.includes(',')) {
      setShareError("Couldn't load the file content. Try re-uploading and sending again.");
      return;
    }
    setShareSending(true);
    setShareError(null);
    try {
      const [meta, raw] = dataUrl.split(',');
      const mimeMatch = /data:([^;]+);base64/.exec(meta);
      const mimeType = mimeMatch?.[1] || 'application/octet-stream';
      const filename = shareFile.fileName || `${shareFile.name || 'attachment'}`;
      const subject = `${shareFile.name || 'File'} — ${project.name || 'Early Spring'}`;
      const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; color: #0F52BA;">
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
            Hi — attaching <strong>${esc(shareFile.name || filename)}</strong> for <strong>${esc(project.name || 'our project')}</strong>.
          </p>
          ${shareMessage.trim() ? `<p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px; white-space: pre-wrap;">${esc(shareMessage.trim())}</p>` : ''}
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Let me know if anything's blocked or you need a re-send.</p>
          <p style="font-size: 11px; color: rgba(15,82,186,.55); margin: 24px 0 0;">
            Early Spring NYC · earlyspring.nyc
          </p>
        </div>
      `;
      const { sendEmailWithAttachment } = await import('../utils/google.js');
      await sendEmailWithAttachment(token, shareTo.trim(), subject, html, {
        filename, mimeType, dataBase64: raw,
      });
      setShareSentTo(shareTo.trim());
    } catch (e) {
      setShareError(e.message || 'Send failed');
    } finally { setShareSending(false); }
  };
  const filteredFiles=(fileFilter==="all"?clientFiles:clientFiles.filter(f=>f.category===fileFilter)).filter(f=>!fileSearch||f.name.toLowerCase().includes(fileSearch.toLowerCase())||((f.fileName||"").toLowerCase().includes(fileSearch.toLowerCase())));
  const fileCounts=CLIENT_FILE_CATS.reduce((a,c)=>{a[c]=clientFiles.filter(f=>f.category===c).length;return a},{});

  const doSendEmail=async(subject,bodyFn)=>{
    if(!emailTo.trim())return;
    // Try to get a valid token — refresh if expired
    let token=accessToken;
    if(!token&&requestCalendarAccess){
      try{token=await requestCalendarAccess()}catch(e){}
    }
    if(!token){
      // Try localStorage fallback
      try{token=localStorage.getItem("es_google_token")}catch(e){}
    }
    if(!token){alert("Google sign-in expired. Please sign out and sign back in.");return}
    setEmailSending(true);
    try{
      const{sendEmail:gmailSend}=await import('../utils/google.js');
      const htmlBody=await bodyFn();
      await gmailSend(token,emailTo.trim(),subject,htmlBody);
      setEmailSent(emailTo);setEmailTo("");
    }catch(e){
      // If 401, token is truly expired
      if(e.message&&e.message.includes("401")&&requestCalendarAccess){
        try{const newToken=await requestCalendarAccess();if(newToken){const{sendEmail:gmailSend}=await import('../utils/google.js');const htmlBody=await bodyFn();await gmailSend(newToken,emailTo.trim(),subject,htmlBody);setEmailSent(emailTo);setEmailTo("");return}}catch(e2){}
      }
      alert("Failed to send: "+(e.message||"Unknown error"));
    }finally{setEmailSending(false)}
  };

  const getSelectedBudgetData=()=>{
    if(!selectedBudgetId)return{cats,ag,comp,feeP};
    const alt=(budgets||[]).find(b=>b.id===selectedBudgetId);
    if(!alt)return{cats,ag,comp,feeP};
    const altComp=calcProject({...project,cats:alt.cats,ag:alt.ag,feeP:alt.feeP});
    return{cats:alt.cats,ag:alt.ag,comp:altComp,feeP:alt.feeP};
  };
  const sendBudget=()=>{const bd=getSelectedBudgetData();const label=selectedBudgetId?(budgets||[]).find(b=>b.id===selectedBudgetId)?.name:"";doSendEmail(`Production Estimate${label?` (${label})`:""}: ${project.name||""}`,async()=>{const{budgetEmailHtml}=await import('../utils/emailTemplates.js');return budgetEmailHtml(project,bd.cats,bd.ag,bd.comp,bd.feeP,emailMsg)})};
  const sendTimeline=()=>doSendEmail(`Production Schedule: ${project.name||""}`,async()=>{const{timelineEmailHtml}=await import('../utils/emailTemplates.js');return timelineEmailHtml(project,clientTasks,emailMsg)});

  // Prepopulate client emails
  const clientEmails=(project.clientContacts||[]).map(c=>c.email).filter(Boolean).join(", ");
  const openShareModal=async(type)=>{
    setShareModal(type);setEmailSent("");setEmailMsg("");
    if(!emailTo)setEmailTo(clientEmails);
    // Generate preview
    if(type==="budget"){
      const bd=getSelectedBudgetData();
      const{budgetEmailHtml}=await import('../utils/emailTemplates.js');
      setPreviewHtml(budgetEmailHtml(project,bd.cats,bd.ag,bd.comp,bd.feeP,""));
    }else{
      const{timelineEmailHtml}=await import('../utils/emailTemplates.js');
      setPreviewHtml(timelineEmailHtml(project,clientTasks,""));
    }
  };
  // Refresh preview when budget selection changes
  const refreshPreview=async(budgetId)=>{
    setSelectedBudgetId(budgetId);
    const alt=budgetId?(budgets||[]).find(b=>b.id===budgetId):null;
    const bd=alt?{cats:alt.cats,ag:alt.ag,comp:calcProject({...project,cats:alt.cats,ag:alt.ag,feeP:alt.feeP}),feeP:alt.feeP}:{cats,ag,comp,feeP};
    const{budgetEmailHtml}=await import('../utils/emailTemplates.js');
    setPreviewHtml(budgetEmailHtml(project,bd.cats,bd.ag,bd.comp,bd.feeP,emailMsg));
  };

  const getOrgInfo=()=>{let orgN="Early Spring LLC",orgA="",orgW="earlyspring.nyc";try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgN=o.name;if(o.address)orgA=o.address;if(o.website)orgW=o.website}catch(e){}return{orgN,orgA,orgW}};
  const OrgLogo=({color="#475569"})=>{try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.logo)return<img src={o.logo} alt={o.name||"Logo"} style={{height:16,objectFit:"contain"}}/>;if(o.name)return<span style={{fontSize:10,fontWeight:700,color,letterSpacing:".14em",textTransform:"uppercase"}}>{o.name}</span>}catch(e){}return<ESWordmark height={16} color={color}/>};
  const OrgFooter=()=>{const{orgN,orgA,orgW}=getOrgInfo();const w=orgW.replace(/^https?:\/\//,'');return<div style={{textAlign:"center",marginTop:36,paddingTop:18,borderTop:"1px solid #EEE"}}><div style={{fontSize:10,color:"#BBB"}}>Sent from <a href="https://early-spring-app.vercel.app" style={{color:"#999",textDecoration:"none"}}>Morgan</a> @ <a href={orgW.startsWith("http")?orgW:`https://${w}`} style={{color:"#999",textDecoration:"none"}}>{orgN}</a></div>{orgA&&<div style={{fontSize:9,color:"#CCC",marginTop:4}}>{orgA}</div>}</div>};

  /* ── Share Email Modal — full email composer ── */
  const[showPreview,setShowPreview]=useState(false);
  const editorRef=useRef(null);
  const execCmd=(cmd,val)=>{document.execCommand(cmd,false,val||null);editorRef.current?.focus()};
  const ShareEmailModal=()=>{
    if(!shareModal)return null;
    const isBudget=shareModal==="budget";
    const onSend=isBudget?sendBudget:sendTimeline;
    const title=isBudget?"Share Production Estimate":"Share Production Schedule";
    const FmtBtn=({cmd,icon,title:t,val})=><button onClick={()=>execCmd(cmd,val)} title={t} style={{padding:"4px 8px",background:"none",border:"none",color:T.dim,fontSize:14,cursor:"pointer",borderRadius:4,lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=T.dim}}>{icon}</button>;
    return<div onClick={()=>setShareModal(null)} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(15,82,186,.18)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:1100,height:"90vh",background:T.paper,border:`1px solid ${T.faintRule}`,borderRadius:T.r,boxShadow:"0 24px 80px rgba(15,82,186,.20)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:15,fontWeight:600,color:T.cream}}>{title}</div>
            {isBudget&&(budgets||[]).length>0&&<div style={{display:"flex",gap:4,marginLeft:8}}>
              <button onClick={()=>refreshPreview(null)} style={{padding:"3px 10px",borderRadius:12,border:"none",fontSize:9,fontWeight:!selectedBudgetId?600:400,cursor:"pointer",fontFamily:T.sans,background:!selectedBudgetId?T.goldSoft:"transparent",color:!selectedBudgetId?T.gold:T.dim}}>Primary</button>
              {(budgets||[]).map(b=><button key={b.id} onClick={()=>refreshPreview(b.id)} style={{padding:"3px 10px",borderRadius:12,border:"none",fontSize:9,fontWeight:selectedBudgetId===b.id?600:400,cursor:"pointer",fontFamily:T.sans,background:selectedBudgetId===b.id?T.goldSoft:"transparent",color:selectedBudgetId===b.id?T.gold:T.dim}}>{b.name}</button>)}
            </div>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setShowPreview(!showPreview)} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${showPreview?T.borderGlow:T.border}`,background:showPreview?T.surfEl:"transparent",color:showPreview?T.cream:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showPreview?"Hide Preview":"Preview"}</button>
            <button onClick={()=>setShareModal(null)} style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4,lineHeight:1}}>×</button>
          </div>
        </div>
        {/* To field */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:600,color:T.dim,flexShrink:0}}>To:</span>
          <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder="recipient@email.com" style={{flex:1,padding:"6px 0",background:"transparent",border:"none",color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
        </div>
        {/* Body */}
        <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>
          {/* Compose area */}
          <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
            {/* Formatting toolbar */}
            <div style={{display:"flex",alignItems:"center",gap:2,padding:"6px 16px",borderBottom:`1px solid ${T.border}`,flexShrink:0,flexWrap:"wrap"}}>
              <FmtBtn cmd="bold" icon="B" title="Bold (Cmd+B)"/>
              <FmtBtn cmd="italic" icon="I" title="Italic (Cmd+I)"/>
              <FmtBtn cmd="underline" icon="U" title="Underline (Cmd+U)"/>
              <span style={{width:1,height:16,background:T.border,margin:"0 4px"}}/>
              <FmtBtn cmd="insertUnorderedList" icon="•" title="Bullet list"/>
              <FmtBtn cmd="insertOrderedList" icon="1." title="Numbered list"/>
              <span style={{width:1,height:16,background:T.border,margin:"0 4px"}}/>
              <FmtBtn cmd="formatBlock" icon="H" title="Heading" val="h3"/>
              <FmtBtn cmd="formatBlock" icon="¶" title="Normal text" val="div"/>
              <span style={{width:1,height:16,background:T.border,margin:"0 4px"}}/>
              <button onClick={()=>{const url=prompt("Link URL:");if(url)execCmd("createLink",url)}} title="Insert link" style={{padding:"4px 8px",background:"none",border:"none",color:T.dim,fontSize:12,cursor:"pointer",borderRadius:4,lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=T.dim}}>&#128279;</button>
              <FmtBtn cmd="removeFormat" icon="✕" title="Clear formatting"/>
            </div>
            {/* Editor */}
            <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={e=>setEmailMsg(e.currentTarget.innerHTML)} onPaste={e=>{
              const html=e.clipboardData.getData("text/html");
              if(html){e.preventDefault();document.execCommand("insertHTML",false,html)}
            }} data-placeholder="Compose your message..." style={{flex:1,overflow:"auto",padding:"16px 20px",color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}/>
            <style>{`[data-placeholder]:empty:before{content:attr(data-placeholder);color:${T.dim};pointer-events:none} [contenteditable] ul,[contenteditable] ol{padding-left:24px;margin:8px 0} [contenteditable] li{margin:4px 0} [contenteditable] h3{font-size:16px;font-weight:600;margin:12px 0 6px} [contenteditable] a{color:${T.cyan};text-decoration:underline}`}</style>
            {/* Bottom bar */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderTop:`1px solid ${T.border}`,flexShrink:0}}>
              <button onClick={()=>{onSend();setShareModal(null)}} disabled={!emailTo.trim()||emailSending} className="btn-pill" style={{padding:"7px 22px",fontSize:12,opacity:emailTo.trim()&&!emailSending?1:.4,cursor:emailTo.trim()&&!emailSending?"pointer":"default",...(emailTo.trim()&&!emailSending?{background:T.ink,color:T.paper}:{})}}>{emailSending?"Sending…":"Send"}</button>
              <button onClick={copyLink} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}>{linkCopied?"Copied":"Copy Link"}</button>
              <button onClick={()=>{if(isBudget)exportEstimatePDF();else window.print()}} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}>PDF</button>
              <div style={{flex:1}}/>
              {emailSent&&<span style={{fontSize:11,color:T.pos,fontWeight:600}}>Sent to {emailSent}</span>}
            </div>
          </div>
          {/* Preview panel — toggle */}
          {showPreview&&<div style={{width:420,flexShrink:0,borderLeft:`1px solid ${T.border}`,overflow:"auto",background:"#F5F4F1"}}>
            <iframe srcDoc={previewHtml} style={{width:"100%",height:"100%",border:"none"}} title="Email preview"/>
          </div>}
        </div>
      </div>
    </div>;
  };

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
  // Floating chat widget — same shape on portal + staff side so the
  // experience reads as one shared thread. Rendered as a function call
  // rather than a sub-component so input focus survives parent re-renders.
  const renderChatWidget=()=>{
    if(!project?.id)return null;
    const PAPER='#FFFFFF',INK='#0F52BA',RULE='#CDD7EB',FADED='#7791C5',GOLD='#F0B849';
    return<div style={{position:'fixed',bottom:20,right:20,zIndex:1000}}>
      {chatOpen?<div style={{width:380,height:540,maxHeight:'calc(100vh - 40px)',background:PAPER,border:`1px solid ${RULE}`,borderRadius:10,boxShadow:'0 16px 40px rgba(15,82,186,.18)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'14px 16px',borderBottom:`1px solid ${RULE}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:FADED,letterSpacing:'.10em',textTransform:'uppercase'}}>Chat</div>
            <div style={{fontSize:13,fontWeight:700,color:INK,marginTop:2}}>{clientName||'Client'}</div>
          </div>
          <button onClick={()=>setChatOpen(false)} style={{background:'transparent',border:'none',color:FADED,fontSize:20,cursor:'pointer',padding:4,lineHeight:1}}>×</button>
        </div>
        <div ref={chatScrollerRef} style={{flex:1,overflow:'auto',padding:'14px 16px',background:PAPER,display:'flex',flexDirection:'column',gap:10}}>
          {chatMessages.length===0?<div style={{fontSize:12,color:FADED,padding:'14px 0',lineHeight:1.55}}>No messages yet. Say hi to the client.</div>:chatMessages.map(m=>{
            const isMine=m.user_id===currentUserId;
            return<div key={m.id} style={{display:'flex',flexDirection:'column',alignItems:isMine?'flex-end':'flex-start'}}>
              <div style={{maxWidth:'80%',padding:'8px 12px',borderRadius:12,background:isMine?INK:'rgba(15,82,186,.06)',color:isMine?PAPER:INK,fontSize:13,lineHeight:1.45,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{m.body}</div>
              <span style={{fontSize:9,color:FADED,marginTop:4,fontFamily:T.mono,letterSpacing:'.04em'}}>{isMine?'You':'Client'} · {new Date(m.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            </div>;
          })}
        </div>
        <div style={{borderTop:`1px solid ${RULE}`,padding:'10px 12px',display:'flex',gap:8,alignItems:'flex-end'}}>
          <textarea value={chatDraft} onChange={e=>setChatDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage()}}} placeholder={`Message ${clientName||'the client'}…`} rows={1} style={{flex:1,padding:'8px 10px',background:PAPER,border:`1px solid ${RULE}`,borderRadius:6,color:INK,fontSize:13,fontFamily:T.sans,outline:'none',resize:'none',lineHeight:1.4,maxHeight:100,boxSizing:'border-box'}} onFocus={e=>e.currentTarget.style.borderColor=INK} onBlur={e=>e.currentTarget.style.borderColor=RULE}/>
          <button onClick={sendChatMessage} disabled={!chatDraft.trim()||chatSending} style={{padding:'8px 14px',background:INK,color:PAPER,border:'none',borderRadius:6,fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',cursor:chatDraft.trim()&&!chatSending?'pointer':'default',opacity:chatDraft.trim()&&!chatSending?1:.4,fontFamily:T.sans}}>{chatSending?'…':'Send'}</button>
        </div>
      </div>:<button onClick={()=>setChatOpen(true)} style={{position:'relative',padding:'12px 18px 12px 16px',background:INK,color:PAPER,border:'none',borderRadius:999,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',cursor:'pointer',fontFamily:T.sans,boxShadow:'0 8px 24px rgba(15,82,186,.30)',display:'inline-flex',alignItems:'center',gap:8}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Chat with {clientName||'client'}
        {chatUnread>0&&<span style={{marginLeft:4,minWidth:18,height:18,padding:'0 6px',borderRadius:9,background:GOLD,color:INK,fontSize:10,fontWeight:800,display:'inline-flex',alignItems:'center',justifyContent:'center',letterSpacing:0}}>{chatUnread}</span>}
      </button>}
    </div>;
  };

  if(!activeView)return<div>
    <div style={{marginBottom:28,display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:16,flexWrap:"wrap"}}>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",margin:0}}>Client: {clientName}</h1>
          {clientPresence.state!=='none'&&(()=>{
            // Live presence badge. Active = green dot, anything else
            // shows last seen relative to now ("3 min ago" / "2 hrs ago").
            const fmtAgo=(ms)=>{
              const s=Math.max(0,Math.round((Date.now()-ms)/1000));
              if(s<60)return 'just now';
              const m=Math.round(s/60);if(m<60)return `${m} min ago`;
              const h=Math.round(m/60);if(h<24)return `${h} hr${h===1?'':'s'} ago`;
              const d=Math.round(h/24);return `${d} day${d===1?'':'s'} ago`;
            };
            const isActive=clientPresence.state==='active';
            const isInvited=clientPresence.state==='invited';
            return<span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:999,border:`1px solid ${isActive?'#1F7A3F':T.faintRule}`,fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',fontFamily:T.sans,color:isActive?'#1F7A3F':T.dim,background:isActive?'rgba(31,122,63,.08)':'transparent'}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:isActive?'#1F7A3F':isInvited?T.fadedInk:T.dim,boxShadow:isActive?'0 0 0 4px rgba(31,122,63,.18)':'none',display:'inline-block'}}/>
              {isActive?'In portal now':isInvited?'Invited':`Last seen ${fmtAgo(clientPresence.at)}`}
            </span>;
          })()}
        </div>
        <div style={{display:"flex",gap:12,marginTop:6,alignItems:"center"}}>
          <span style={{fontSize:12,color:T.dim}}>{project.name}</span>
          {project.eventDate&&<span style={{fontSize:12,color:T.dim}}>Event: {project.eventDate}</span>}
        </div>
      </div>
      {canInviteClient&&<button onClick={()=>setShowInviteModal(true)} style={{padding:"10px 18px",background:T.ink,color:T.paper,border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans}}>
        Invite Client to Portal
      </button>}
    </div>
    {renderInviteModal()}

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      {/* ── Estimate(s) ── */}
      <div onClick={()=>setActiveView("budget")} style={cardStyle("#F59E0B")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
        <div style={{padding:"24px 26px"}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Production Estimate</div>
          <div className="num" style={{fontSize:projectSupportsRanges(project)&&Math.abs((comp.grandMax||0)-(comp.grandMin||0))>=0.5?24:32,fontWeight:700,color:T.gold,fontFamily:T.mono,marginBottom:12}}>{projectSupportsRanges(project)?fmtRange(comp.grandMin||0,comp.grandMax||0,f0):f0(comp.grandTotal)}</div>
          {cb>0&&<div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:T.dim}}>{spendPct}% of budget</span><span style={{fontSize:9,color:T.dim,fontFamily:T.mono}}>{f0(cb)} budget</span></div>
            <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${spendPct}%`,background:spendPct>90?T.alert:T.ink,borderRadius:2}}/></div>
          </div>}
          {cats.slice(0,4).map(c=>{const t=ct(c.items,c).totals;const showR=projectSupportsRanges(project);return<div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:11}}>
            <span style={{color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{c.name}</span>
            <span style={{color:T.cream,fontFamily:T.mono,flexShrink:0,marginLeft:8}}>{showR?fmtRange(t.clientMin,t.clientMax,f0):f0(t.clientPrice)}</span>
          </div>})}
          {cats.length>4&&<div style={{fontSize:10,color:T.dim,paddingTop:4}}>+{cats.length-4} more</div>}
          {(budgets||[]).length>0&&<div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
            {(budgets||[]).map(b=>{const bc=calcProject({...project,cats:b.cats,ag:b.ag,feeP:b.feeP});const showR=projectSupportsRanges(project);return<div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
              <span style={{fontSize:11,color:T.dim}}>{b.name}</span>
              <span className="num" style={{fontSize:13,fontWeight:600,color:T.gold,fontFamily:T.mono}}>{showR?fmtRange(bc.grandMin||0,bc.grandMax||0,f0):f0(bc.grandTotal)}</span>
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
            <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${taskPct}%`,background:T.ink,borderRadius:2}}/></div>
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
            <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 40%,rgba(15,82,186,.85) 100%)"}}/>
            <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 26px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{fontSize:10,fontWeight:700,color:T.paper,textTransform:"uppercase",letterSpacing:".10em"}}>Creative & Design</div>
                {inReview.length>0&&<span style={{fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"rgba(245,158,11,.2)",color:"#F59E0B",textTransform:"uppercase"}}>&#9679; {inReview.length} awaiting review</span>}
              </div>
              <div style={{fontSize:14,fontWeight:600,color:T.paper}}>{approved.length} approved asset{approved.length!==1?"s":""}</div>
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
      {(()=>{
        // Three sources of client meetings, merged:
        //   1. Legacy project.meetings flagged isClientMeeting
        //   2. Legacy meetings with an attendee email matching a legacy client contact
        //   3. CRM meetings resolved via contact_projects + hardwire-by-company
        const allMtgs=project.meetings||[];
        const cEmails=(project.clientContacts||[]).map(c=>(c.email||"").toLowerCase()).filter(Boolean);
        const legacyClientMtgs=allMtgs.filter(m=>m.isClientMeeting||(cEmails.length>0&&(m.attendees||[]).some(a=>cEmails.includes((a||"").toLowerCase()))));
        // Normalize CRM meetings to the {title,date,id} shape the
        // card already renders.
        const crmAsClient=crmMeetings.map(m=>({
          id:m.id,
          title:m.title||"Untitled",
          date:m.occurred_at?new Date(m.occurred_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"}):"",
          _crm:true,
        }));
        const clientMtgs=[...crmAsClient,...legacyClientMtgs];
        return<div onClick={()=>setActiveView("meetings")} style={cardStyle("#06B6D4")} onMouseEnter={cardHover} onMouseLeave={cardLeave}>
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
              <div style={{fontSize:13,fontWeight:600,color:T.cream}}>{c.name}</div>
              {c.role&&<div style={{fontSize:10,color:T.cyan,marginTop:2}}>{c.role}</div>}
              {c.email&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{c.email}</div>}
            </div>)}
          </div>
          :<div style={{fontSize:11,color:T.dim}}>Add key contacts at the client</div>}
        </div>
      </div>
    </div>
  </div>;

  /* Export helpers for estimate — use selected budget */
  const exportEstimatePDF=async()=>{
    const bd=getSelectedBudgetData();
    const{exportEstimatePDF:gen}=await import('../utils/pdfExport.js');
    const label=selectedBudgetId?(budgets||[]).find(b=>b.id===selectedBudgetId)?.name:"";
    await gen(project,bd,{title:label?`Production Estimate — ${label}`:"Production Estimate",filename:(project.name||"estimate")+(label?`-${label}`:"")+"-production-estimate.pdf"});
  };
  // Shared row builder for the tabular client exports (XLSX + CSV) so
  // they carry the same lines as the PDF and the client PNG. Ranges go
  // out as two numeric columns rather than a "$a – $b" string — a
  // spreadsheet cell should stay a number you can sum.
  const buildEstimateRows=(bd)=>{
    const showR=projectSupportsRanges(project);
    const money=(lo,hi,single)=>showR?[lo||0,hi||0]:[single||0];
    const rows=[["Category","Item","Description",...(showR?["Cost (Low)","Cost (High)"]:["Cost"])]];
    bd.cats.forEach(c=>{
      const totals=ct(c.items,c).totals;
      const items=c.items.filter(it=>ci(it).clientPrice>0);
      if(!items.length)return;
      // Overlaid category: items no longer sum to the quoted band, so
      // emit the band alone (matches PDF + PNG).
      if(showR&&totals.hasOverlay&&Math.abs((totals.clientMax||0)-(totals.clientMin||0))>=0.5){
        rows.push([c.name,"Estimated range","",...money(totals.clientMin,totals.clientMax,totals.clientPrice)]);
        return;
      }
      items.forEach(it=>{const c2=ci(it);rows.push([c.name,it.name,it.details||"",...money(c2.minClient,c2.maxClient,c2.clientPrice)])});
    });
    rows.push([]);
    const prod=bd.comp.productionSubtotal;
    rows.push(["","","PRODUCTION SUBTOTAL",...money(prod.clientMin,prod.clientMax,prod.clientPrice)]);
    const agItems=bd.ag.filter(it=>ci(it).clientPrice>0);
    if(agItems.length){
      agItems.forEach(it=>{const c2=ci(it);rows.push(["Agency",it.name,it.details||"",...money(c2.minClient,c2.maxClient,c2.clientPrice)])});
      const agS=bd.comp.agencyCostsSubtotal;
      rows.push(["","","AGENCY SUBTOTAL",...money(agS.clientMin,agS.clientMax,agS.clientPrice)]);
    }
    const af=bd.comp.agencyFee;
    if(af?.clientPrice)rows.push(["","",`AGENCY FEE (${fp(bd.feeP)})`,...money(af.minClient,af.maxClient,af.clientPrice)]);
    if((project.clientBudget||0)>0)rows.push(["","","CLIENT BUDGET",...money(project.clientBudget,project.clientBudget,project.clientBudget)]);
    rows.push(["","","GRAND TOTAL",...money(bd.comp.grandMin,bd.comp.grandMax,bd.comp.grandTotal)]);
    return{rows,showR};
  };
  const exportEstimateXLSX=async()=>{
    const bd=getSelectedBudgetData();
    const XLSX=await import('xlsx');
    const{rows,showR}=buildEstimateRows(bd);
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:18},{wch:24},{wch:20},{wch:14},...(showR?[{wch:14}]:[])];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Estimate");
    const label=selectedBudgetId?(budgets||[]).find(b=>b.id===selectedBudgetId)?.name:"";
    XLSX.writeFile(wb,(project.name||"estimate")+(label?`-${label}`:"")+"-client-estimate.xlsx");
  };
  const exportEstimateCSV=()=>{
    const bd=getSelectedBudgetData();
    const{rows}=buildEstimateRows(bd);
    const csv=rows.map(r=>r.map(c=>typeof c==="string"&&c.includes(",")?`"${c}"`:c).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;const label=selectedBudgetId?(budgets||[]).find(b=>b.id===selectedBudgetId)?.name:"";a.download=(project.name||"estimate")+(label?`-${label}`:"")+"-client-estimate.csv";a.click();URL.revokeObjectURL(url);
  };
  const exportEstimatePNG=async()=>{
    console.log('[export-png] click → start');
    try {
      const bd=getSelectedBudgetData();
      console.log('[export-png] data:', { catsLen: bd.cats?.length, agLen: bd.ag?.length, hasComp: !!bd.comp, feeP: bd.feeP });
      const label=selectedBudgetId?(budgets||[]).find(b=>b.id===selectedBudgetId)?.name:"";
      const activeBudgetName=label||"Primary Budget";
      console.log('[export-png] loading clientBudgetPNG module…');
      const{exportClientBudgetPNG}=await import('../utils/clientBudgetPNG.js');
      console.log('[export-png] module loaded, rendering canvas…');
      await exportClientBudgetPNG(project,{cats:bd.cats,ag:bd.ag,comp:bd.comp,feeP:bd.feeP,activeBudgetName},{filename:(project.name||"estimate")+(label?`-${label}`:"")+"-client-summary.png"});
      console.log('[export-png] done — download should have fired');
    } catch (e) {
      console.error('[export-png] failed:', e);
      toast.error(`PNG export failed: ${e?.message || e}`);
    }
  };
  /* ══ ESTIMATE VIEW ══ */
  if(activeView==="budget"){
  // Resolve which budget to display
  const altBudget=selectedBudgetId?(budgets||[]).find(b=>b.id===selectedBudgetId):null;
  const viewCats=altBudget?altBudget.cats:cats;
  const viewAg=altBudget?altBudget.ag:ag;
  const viewFeeP=altBudget?altBudget.feeP:feeP;
  const viewComp=altBudget?calcProject({...project,cats:altBudget.cats,ag:altBudget.ag,feeP:altBudget.feeP}):comp;
  const viewLabel=altBudget?altBudget.name:"Production Estimate";

  return<div>
    <BackBtn/>
    {/* Budget tabs */}
    {(budgets||[]).length>0&&<div style={{display:"flex",gap:0,marginBottom:16,borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>setSelectedBudgetId(null)} style={{padding:"10px 18px",background:"none",border:"none",borderBottom:!selectedBudgetId?`2px solid ${T.gold}`:"2px solid transparent",color:!selectedBudgetId?T.cream:T.dim,fontSize:12,fontWeight:!selectedBudgetId?600:400,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}} onMouseEnter={e=>{if(selectedBudgetId)e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{if(selectedBudgetId)e.currentTarget.style.color=T.dim}}>Primary Estimate</button>
      {(budgets||[]).map(b=><button key={b.id} onClick={()=>setSelectedBudgetId(b.id)} style={{padding:"10px 18px",background:"none",border:"none",borderBottom:selectedBudgetId===b.id?`2px solid ${T.gold}`:"2px solid transparent",color:selectedBudgetId===b.id?T.cream:T.dim,fontSize:12,fontWeight:selectedBudgetId===b.id?600:400,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}} onMouseEnter={e=>{if(selectedBudgetId!==b.id)e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{if(selectedBudgetId!==b.id)e.currentTarget.style.color=T.dim}}>{b.name}</button>)}
    </div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>{viewLabel}</h2>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {/* Export dropdown */}
        <div style={{position:"relative"}}>
          <button onClick={()=>{setShowExportMenu(!showExportMenu);setShowShareMenu(false)}} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Export &#9662;</button>
          {showExportMenu&&<div className="fc-panel" style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:60,minWidth:200,padding:4,borderRadius:12,overflow:"hidden"}}>
            {[["PDF",()=>{exportEstimatePDF();setShowExportMenu(false)},"Download PDF"],["XLSX",()=>{exportEstimateXLSX();setShowExportMenu(false)},"Spreadsheet"],["CSV",()=>{exportEstimateCSV();setShowExportMenu(false)},"Comma-separated"],["Client PNG",()=>{exportEstimatePNG();setShowExportMenu(false)},"Section totals · landscape for decks"]].map(([label,fn,sub])=>
              <button key={label} onClick={fn} style={{width:"100%",display:"flex",flexDirection:"column",padding:"10px 14px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:12,fontWeight:600,color:T.cream}}>{label}</span>
                <span style={{fontSize:10,color:T.dim,marginTop:1}}>{sub}</span>
              </button>)}
          </div>}
        </div>
        {/* Share buttons */}
        {canSendEmail&&<button onClick={()=>openShareModal("budget")} style={{padding:"8px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Share</button>}
      </div>
    </div>

    {/* Live table — dark theme, client-facing columns only */}
    <Card style={{overflow:"hidden",marginBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:"1.5fr 2fr 1fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        {["Item","Description","Cost"].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i===2?"right":"left"}}>{h}</span>)}
      </div>
      {viewCats.map((c,ci2)=>{const t=ct(c.items,c).totals;const accent=["#F59E0B","#14B8A6","#8B5CF6","#EC4899","#06B6D4","#6366F1","#10B981","#F47264"][ci2%8];const showR=projectSupportsRanges(project);const showAsRange=showR&&Math.abs((t.clientMax||0)-(t.clientMin||0))>=0.5;return<React.Fragment key={c.id}>
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 2fr 1fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:`${accent}08`,borderLeft:`3px solid ${accent}`}}>
          <span style={{fontSize:12,fontWeight:600,color:T.cream,gridColumn:"1/3"}}>{c.name}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{showR?fmtRange(t.clientMin,t.clientMax,f$):f$(t.clientPrice)}</span>
        </div>
        {!(showAsRange&&t.hasOverlay)&&c.items.filter(it=>ci(it).clientPrice>0).map(it=>{const c2=ci(it);const itemRange=showR&&it.isRange&&Math.abs((c2.maxClient||0)-(c2.minClient||0))>=0.5;return<div key={it.id} style={{display:"grid",gridTemplateColumns:"1.5fr 2fr 1fr",padding:"10px 18px 10px 28px",borderBottom:`1px solid ${T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <span style={{fontSize:12,color:T.cream}}>{it.name}</span>
          <span style={{fontSize:11,color:T.dim,fontStyle:"italic"}}>{it.details||""}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.cream}}>{itemRange?fmtRange(c2.minClient,c2.maxClient,f$):f$(c2.clientPrice)}</span>
        </div>})}
      </React.Fragment>})}
    </Card>

    {/* Production subtotal */}
    <div style={{display:"flex",justifyContent:"space-between",padding:"12px 18px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:4}}>
      <span style={{fontSize:11,fontWeight:700,color:T.cream,textTransform:"uppercase",letterSpacing:".06em"}}>Production Subtotal</span>
      <span className="num" style={{fontSize:13,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{projectSupportsRanges(project)?fmtRange(viewComp.productionSubtotal.clientMin||viewComp.productionSubtotal.clientPrice,viewComp.productionSubtotal.clientMax||viewComp.productionSubtotal.clientPrice,f$):f$(viewComp.productionSubtotal.clientPrice)}</span>
    </div>

    {/* Agency */}
    <Card style={{overflow:"hidden",marginTop:12,marginBottom:4}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em"}}>Agency Services</span>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:"right"}}>Cost</span>
      </div>
      {viewAg.map(it=>{const c=ci(it);const showR=projectSupportsRanges(project);const itemRange=showR&&it.isRange&&Math.abs((c.maxClient||0)-(c.minClient||0))>=0.5;return<div key={it.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr",padding:"10px 18px",borderBottom:`1px solid ${T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <span style={{fontSize:12,color:T.cream}}>{it.name}</span>
        <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.cream}}>{itemRange?fmtRange(c.minClient,c.maxClient,f$):f$(c.clientPrice)}</span>
      </div>})}
    </Card>
    <div style={{display:"flex",justifyContent:"space-between",padding:"10px 18px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:2}}>
      <span style={{fontSize:11,fontWeight:600,color:T.dim,textTransform:"uppercase"}}>Agency Subtotal</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.cream}}>{projectSupportsRanges(project)&&Math.abs((viewComp.agencyCostsSubtotal.clientMax||0)-(viewComp.agencyCostsSubtotal.clientMin||0))>=0.5?fmtRange(viewComp.agencyCostsSubtotal.clientMin,viewComp.agencyCostsSubtotal.clientMax,f$):f$(viewComp.agencyCostsSubtotal.clientPrice)}</span>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",padding:"10px 18px",borderRadius:T.rS,marginBottom:8}}>
      <span style={{fontSize:11,color:T.dim}}>Agency Fee ({fp(viewFeeP)})</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.dim}}>{projectSupportsRanges(project)&&Math.abs((viewComp.agencyFee.maxClient||0)-(viewComp.agencyFee.minClient||0))>=0.5?fmtRange(viewComp.agencyFee.minClient,viewComp.agencyFee.maxClient,f$):f$(viewComp.agencyFee.clientPrice)}</span>
    </div>

    {/* Grand Total */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 22px",borderRadius:T.rS,background:T.inkSoft2,border:`1px solid ${T.faintRule}`,borderTop:`2px solid ${T.ink}`}}>
      <span style={{fontSize:12,fontWeight:700,color:T.cream,textTransform:"uppercase",letterSpacing:".08em"}}>Grand Total</span>
      <span className="num" style={{fontSize:projectSupportsRanges(project)&&Math.abs((viewComp.grandMax||0)-(viewComp.grandMin||0))>=0.5?20:24,fontFamily:T.mono,color:T.gold,fontWeight:700}}>{projectSupportsRanges(project)?fmtRange(viewComp.grandMin||0,viewComp.grandMax||0,f$):f$(viewComp.grandTotal)}</span>
    </div>
    {ShareEmailModal()}
  </div>}

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
              <span style={{fontSize:13,fontWeight:600,color:T.cream}}>{t.name}</span>
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
        {canSendEmail&&<button onClick={()=>openShareModal("timeline")} style={{padding:"7px 12px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Share</button>}
        <button onClick={copyLink} style={{padding:"7px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:linkCopied?T.pos:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{linkCopied?"Copied":"Copy Link"}</button>
        <button onClick={()=>window.print()} style={{padding:"7px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>PDF</button>
      </div>
    </div>

    {clientSections.map(k=>sectionMap[k])}
    {ShareEmailModal()}
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
        {accessToken&&project.driveFolders&&clientFiles.some(f=>!f.driveId)&&<button onClick={async()=>{
          const{uploadToDrive}=await import('../utils/drive.js');
          let synced=0;
          for(const f of clientFiles){
            if(f.driveId)continue;
            // Try all sources for file data
            let data=f.fileData;
            if(!data){try{data=localStorage.getItem(`es_file_${f.id}`)}catch(e){}}
            if(!data){try{const cached=JSON.parse(localStorage.getItem("es_projects")||"[]");const proj=cached.find(p=>p.id===project.id);if(proj){const match=(proj.clientFiles||[]).find(x=>x.id===f.id);if(match?.fileData)data=match.fileData}}catch(e){}}
            if(!data){console.log("[sync] No data for",f.name,"— needs re-upload");continue}
            const result=await uploadToDrive(accessToken,data,f.fileName,project.driveFolders,null,"client");
            if(result){updateProject({clientFiles:(project.clientFiles||[]).map(x=>x.id===f.id?{...x,driveId:result.driveId,driveLink:result.webViewLink}:x)});synced++}
          }
          alert(synced>0?`${synced} file(s) synced to Drive`:"No files could be synced — files without local data need to be re-uploaded");
        }} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:"transparent",color:T.cyan,border:`1px solid ${T.cyan}40`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Sync to Drive</button>}
        <button onClick={()=>setShowFileLink(s=>!s)} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:showFileLink?T.inkSoft:T.cyan+"18",color:showFileLink?T.ink:T.cyan,border:`1px solid ${showFileLink?T.ink:T.cyan+"40"}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color="currentColor"/> Paste Link</button>
        <button onClick={()=>fileInputRef.current.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color={T.gold}/> Upload File</button>
      </div>
    </div>
    {showFileLink&&<div style={{marginBottom:16,padding:14,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
      <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Paste a link — Google Docs, Figma, Canva, Notion, Dropbox, YouTube, etc. {fileLinkAddingName?'· auto-naming…':''}</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr auto",gap:8,alignItems:"flex-end"}}>
        <div><div style={{fontSize:9,color:T.dim,marginBottom:4}}>URL</div><input value={fileLinkUrl} onChange={e=>setFileLinkUrl(e.target.value)} onBlur={fileLinkBlur} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addFileLink()}}} placeholder="https://docs.google.com/document/d/..." style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg||T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
        <div><div style={{fontSize:9,color:T.dim,marginBottom:4}}>Name {fileLinkName?'':<span style={{fontStyle:'italic'}}>(auto)</span>}</div><input value={fileLinkName} onChange={e=>setFileLinkName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addFileLink()}}} placeholder="Auto-filled from URL" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg||T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
        <button onClick={addFileLink} disabled={!fileLinkUrl.trim()} style={{padding:"8px 16px",borderRadius:T.rS,background:fileLinkUrl.trim()?T.goldSoft:T.inkSoft2,color:fileLinkUrl.trim()?T.gold:T.fadedInk,border:`1px solid ${fileLinkUrl.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:fileLinkUrl.trim()?"pointer":"default",fontFamily:T.sans}}>Add</button>
      </div>
    </div>}
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={()=>setFileFilter("all")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter==="all"?600:400,fontFamily:T.sans,background:fileFilter==="all"?T.goldSoft:"transparent",color:fileFilter==="all"?T.gold:T.dim}}>All ({clientFiles.length})</button>
      {CLIENT_FILE_CATS.map(c=>fileCounts[c]>0&&<button key={c} onClick={()=>setFileFilter(c)} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:fileFilter===c?600:400,fontFamily:T.sans,background:fileFilter===c?`${CLIENT_FILE_COLORS[c]}18`:"transparent",color:fileFilter===c?CLIENT_FILE_COLORS[c]:T.dim}}>{CLIENT_FILE_LABELS[c]} ({fileCounts[c]})</button>)}
    </div>
    {filteredFiles.length>0?<div className="file-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14}}>
      {filteredFiles.map(f=>{
        // Resolve fileData from memory or localStorage (Supabase Storage fetched on-demand in viewer)
        const fd=f.fileData||(f._hasLocalFile?(()=>{try{return localStorage.getItem(`es_file_${f.id}`)}catch(e){return null}})():null);
        const hasStorage=!!f.storagePath;
        const isPdf=(f.fileName&&/\.pdf$/i.test(f.fileName));
        const isImg=(fd&&/^data:image\//i.test(fd))||(!fd&&hasStorage&&/\.(png|jpe?g|gif|webp)$/i.test(f.fileName||""));
        const canView=fd||hasStorage||f.driveId||!!f.linkUrl;
        return<div key={f.id} onClick={()=>canView&&setViewingFile({...f,fileData:fd||null})} style={{borderRadius:T.r,border:`1px solid ${T.border}`,background:T.surfEl,overflow:"hidden",cursor:canView?"pointer":"default",transition:"border-color .15s, box-shadow .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.boxShadow=T.shadow}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none"}}>
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
              {canSendEmail&&<button onClick={e=>{e.stopPropagation();openShareFileModal(f)}} title="Send this file via email" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,cursor:"pointer",padding:"3px 6px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:10,color:T.cream,fontFamily:T.sans}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.color=T.gold}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.cream}}>✉</button>}
              <button onClick={e=>{e.stopPropagation();removeFile(f.id)}} style={{background:"rgba(122,31,31,.06)",border:"1px solid rgba(122,31,31,.18)",borderRadius:4,cursor:"pointer",padding:"3px 5px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(122,31,31,.18)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(122,31,31,.06)"}}><TrashI size={10} color={T.neg}/></button>
            </div>
          </div>
        </div>})}
    </div>
    :<div onClick={()=>fileInputRef.current.click()} style={{textAlign:"center",padding:48,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
      <div style={{fontSize:24,opacity:.15,marginBottom:8}}>&#8593;</div>
      <div style={{fontSize:14,fontWeight:600,color:T.cream,marginBottom:6}}>No files yet</div>
      <p style={{fontSize:12,color:T.dim}}>Upload RFPs, briefs, design files, contracts, decks</p>
    </div>}
    {viewingFile&&<FileViewerModal file={viewingFile} onClose={()=>setViewingFile(null)}/>}
    {shareFile&&<div onClick={closeShareFileModal} style={{position:"fixed",inset:0,zIndex:220,background:"rgba(15,82,186,.22)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{width:520,maxWidth:"100%",background:T.paper,borderRadius:12,border:`1px solid ${T.faintRule}`,boxShadow:"0 20px 60px rgba(15,82,186,.18)",padding:"22px 24px",fontFamily:T.sans}}>
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:14}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:T.ink,letterSpacing:"-0.012em"}}>✉ Send file via email</h2>
          <button type="button" onClick={closeShareFileModal} style={{background:"transparent",border:"none",color:T.fadedInk,cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{padding:"10px 12px",borderRadius:8,background:T.inkSoft2,border:`1px solid ${T.faintRule}`,marginBottom:14,fontSize:12,color:T.ink,lineHeight:1.5}}>
          <div style={{fontWeight:600,marginBottom:2}}>{shareFile.name}</div>
          <div style={{fontSize:10,color:T.fadedInk}}>{shareFile.fileName} · {shareFile.category}</div>
        </div>
        {shareSentTo?<>
          <div style={{padding:14,borderRadius:8,background:T.inkSoft,border:`1px solid ${T.faintRule}`,fontSize:13,color:T.ink,lineHeight:1.5,marginBottom:14}}>
            ✓ Sent to <strong>{shareSentTo}</strong> from your Gmail. They'll see the file as an attachment.
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button onClick={closeShareFileModal} style={{padding:"8px 16px",borderRadius:6,fontSize:12,fontWeight:700,fontFamily:T.sans,background:T.ink,color:T.paper,border:"none",cursor:"pointer",letterSpacing:".04em"}}>Done</button>
          </div>
        </>:<>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,fontWeight:700,color:T.fadedInk,letterSpacing:".12em",textTransform:"uppercase",marginBottom:4}}>Recipient email</div>
            <input type="email" value={shareTo} onChange={e=>setShareTo(e.target.value)} placeholder={clientEmails||"name@company.com"} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:`1px solid ${T.faintRule}`,background:T.paper,fontSize:13,fontFamily:T.sans,color:T.ink,outline:"none"}}/>
            <div style={{marginTop:4,fontSize:10,color:T.fadedInk,fontStyle:"italic"}}>Defaults to the client contacts on this project. Override for one-offs.</div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,fontWeight:700,color:T.fadedInk,letterSpacing:".12em",textTransform:"uppercase",marginBottom:4}}>Short message · optional</div>
            <textarea value={shareMessage} onChange={e=>setShareMessage(e.target.value)} placeholder="As discussed, here's the deck. Let me know any thoughts." style={{width:"100%",padding:"8px 10px",borderRadius:6,minHeight:60,border:`1px solid ${T.faintRule}`,background:T.paper,fontSize:13,fontFamily:T.sans,color:T.ink,outline:"none",resize:"vertical",lineHeight:1.5}}/>
          </div>
          {shareError&&<div style={{marginTop:6,padding:"10px 12px",borderRadius:8,background:T.alertSoft,border:`1px solid ${T.alert}33`,color:T.alert,fontSize:11,lineHeight:1.5,marginBottom:10}}>{shareError}</div>}
          <div style={{marginTop:8,display:"flex",justifyContent:"flex-end",gap:8}}>
            <button onClick={closeShareFileModal} style={{padding:"8px 16px",borderRadius:6,fontSize:12,fontWeight:600,fontFamily:T.sans,background:"transparent",color:T.ink70,border:`1px solid ${T.faintRule}`,cursor:"pointer"}}>Cancel</button>
            <button onClick={sendFileViaEmail} disabled={shareSending||!shareTo.trim()} style={{padding:"8px 16px",borderRadius:6,fontSize:12,fontWeight:700,fontFamily:T.sans,background:T.ink,color:T.paper,border:"none",cursor:shareSending?"wait":(shareTo.trim()?"pointer":"not-allowed"),opacity:shareSending||!shareTo.trim()?.6:1,letterSpacing:".04em"}}>{shareSending?"Sending…":"📤 Send"}</button>
          </div>
        </>}
      </div>
    </div>}
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
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:10,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".06em"}}>Fireflies</span>
          {ffApiKey&&!showFfSetup?<>
            <span style={{fontSize:11,color:T.dim}}>Connected</span>
            <button onClick={()=>connectFireflies()} disabled={ffSyncing} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:T.rS,border:`1px solid rgba(6,182,212,.2)`,background:"rgba(6,182,212,.06)",color:T.cyan,fontSize:10,fontWeight:600,cursor:ffSyncing?"wait":"pointer",fontFamily:T.sans,opacity:ffSyncing?.5:1}}>{ffSyncing?"Syncing...":"Sync Meetings"}</button>
            <button onClick={()=>setShowFfSetup(true)} style={{padding:"6px 8px",borderRadius:T.rS,border:"none",background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Change Key</button>
          </>:<>
            <span style={{fontSize:11,color:T.dim}}>Auto-import call recordings, transcripts, and summaries</span>
            <button onClick={()=>setShowFfSetup(true)} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:T.rS,border:`1px solid rgba(6,182,212,.2)`,background:"rgba(6,182,212,.06)",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Connect Fireflies</button>
          </>}
          {ffStatus&&<span style={{fontSize:10,color:ffStatus.includes("fail")||ffStatus.includes("error")?T.neg:T.pos,fontFamily:T.sans,width:"100%"}}>{ffStatus}</span>}
        </div>
        {showFfSetup&&<div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
          <input value={ffKeyInput} onChange={e=>setFfKeyInput(e.target.value)} placeholder="Fireflies API key" type="password" style={{flex:1,padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}} onKeyDown={e=>e.key==="Enter"&&ffKeyInput.trim()&&connectFireflies(ffKeyInput.trim())}/>
          <button onClick={()=>{if(ffKeyInput.trim())connectFireflies(ffKeyInput.trim())}} disabled={!ffKeyInput.trim()||ffSyncing} className="btn-pill" style={{padding:"6px 14px",fontSize:11,opacity:ffKeyInput.trim()&&!ffSyncing?1:.4,cursor:ffKeyInput.trim()&&!ffSyncing?"pointer":"default",...(ffKeyInput.trim()&&!ffSyncing?{background:T.ink,color:T.paper}:{})}}>Connect & Sync</button>
          <button onClick={()=>setShowFfSetup(false)} style={{padding:"8px",borderRadius:T.rS,border:"none",background:"transparent",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
        </div>}
      </Card>
      {/* Untagged meetings — offer to mark as client */}
      {(()=>{const untagged=allMeetings.filter(m=>!isClientMeeting(m));if(!untagged.length)return null;return<Card style={{padding:"14px 18px",marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Other Meetings — mark as client-facing?</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {untagged.map(m=><button key={m.id} onClick={()=>toggleClientFlag(m.id)} style={{padding:"5px 12px",borderRadius:999,border:`1px solid ${T.faintRule}`,cursor:"pointer",fontSize:10,fontFamily:T.sans,background:"transparent",color:T.fadedInk,fontWeight:600,letterSpacing:".04em",transition:"all .18s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.ink;e.currentTarget.style.color=T.ink}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.faintRule;e.currentTarget.style.color=T.fadedInk}}>{m.title}{m.date?` · ${m.date}`:""}</button>)}
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
        <div style={{fontSize:14,fontWeight:600,color:T.cream,marginBottom:6}}>No client meetings</div>
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
      <button onClick={addContact} disabled={!newContactName.trim()} className="btn-pill" style={{padding:"6px 14px",fontSize:11,opacity:newContactName.trim()?1:.4,cursor:newContactName.trim()?"pointer":"default"}}>Add Contact</button>
    </Card>}
    {clientContacts.length>0?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:12}}>
      {clientContacts.map(c=><Card key={c.id} style={{padding:"20px 22px",borderLeft:"3px solid #06B6D4"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{minWidth:0,flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:T.cream,marginBottom:6}}>{c.name}</div>
            {c._crm?(
              <select value={c._roleId||"client_team"} onChange={e=>changeContactRoleEx(c.id,c._roleId,e.target.value)} title="Change role" style={{fontSize:10,fontWeight:700,padding:"3px 20px 3px 8px",borderRadius:10,background:`${T.cyan}18`,color:T.cyan,letterSpacing:".04em",textTransform:"uppercase",border:"none",cursor:"pointer",fontFamily:T.sans,appearance:"none",WebkitAppearance:"none",backgroundImage:`linear-gradient(45deg, transparent 50%, ${T.cyan} 50%), linear-gradient(135deg, ${T.cyan} 50%, transparent 50%)`,backgroundPosition:`calc(100% - 9px) 50%, calc(100% - 5px) 50%`,backgroundSize:"4px 4px, 4px 4px",backgroundRepeat:"no-repeat"}}>
                {c._roleId==='client_team'&&<option value="client_team">Auto · Click to assign</option>}
                {ROLE_OPTIONS_EX.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                <option value="__remove__">— Remove from project</option>
              </select>
            ):c.role&&<Pill color={T.cyan} size="xs">{c.role}</Pill>}
          </div>
          {!c._crm&&<button onClick={()=>removeContact(c.id)} style={{background:"rgba(122,31,31,.06)",border:"1px solid rgba(122,31,31,.18)",borderRadius:T.rS,cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(122,31,31,.18)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(122,31,31,.06)"}}><TrashI size={11} color={T.neg}/></button>}
        </div>
        <div style={{marginTop:12}}>
          {c.email&&<div style={{fontSize:12,color:T.cyan,marginBottom:4}}>{c.email}</div>}
          {c.phone&&<div style={{fontSize:12,color:T.dim}}>{c.phone}</div>}
        </div>
      </Card>)}
    </div>
    :<Card style={{padding:40}}><div style={{textAlign:"center"}}>
      <div style={{fontSize:24,opacity:.15,marginBottom:8}}>&#128100;</div>
      <div style={{fontSize:14,fontWeight:600,color:T.cream,marginBottom:6}}>No contacts yet</div>
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
            <div style={{height:100,background:"rgba(15,82,186,.04)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
              {a.isImage&&a.fileData?<img src={a.fileData} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<div style={{fontSize:20,color:T.dim,opacity:.2}}>&#9634;</div>}
            </div>
            <div style={{padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
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
            <div style={{height:120,background:"rgba(15,82,186,.04)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
              {a.isImage&&a.fileData?<img src={a.fileData} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
              :a.isVideo?<div style={{fontSize:28,color:T.dim,opacity:.3}}>&#9654;</div>
              :<div style={{fontSize:20,color:T.dim,opacity:.2}}>&#9634;</div>}
              <div style={{position:"absolute",top:6,right:6}}><Pill color={sm?.color||T.pos} size="xs">{sm?.label||"Approved"}</Pill></div>
            </div>
            <div style={{padding:"10px 12px"}}>
              <div style={{fontSize:12,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
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
