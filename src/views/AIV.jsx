import { useState, useEffect, useRef } from 'react';
import React from 'react';
import T from '../theme/tokens.js';
import { mkTask, mkDoc, mkTxn, mkROS, mkI, mkA } from '../data/factories.js';
import { isOverdue } from '../utils/calc.js';
import { Card } from '../components/primitives/index.js';
import { serializeProject, AI_SYSTEM } from '../ai/serialize.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const ACTION_LABELS={
  add_task:"Add Task",add_doc:"Add Document",add_txn:"Add Transaction",add_ros:"Add ROS Cue",
  update_fee:"Update Agency Fee",update_item:"Update Line Item",update_agency:"Update Agency Role",
  add_item:"Add Line Item",add_agency_role:"Add Agency Role",add_section:"Add Section",
};
const ACTION_COLORS={
  add_task:"#14B8A6",add_item:"#F59E0B",add_agency_role:"#8B5CF6",add_section:"#EC4899",
  add_doc:"#60A5FA",add_txn:"#06B6D4",add_ros:"#C4B5FD",
  update_fee:"#F59E0B",update_item:"#14B8A6",update_agency:"#8B5CF6",
};

function AIV({project,updateProject,comp,accessToken}){
  const defaultMsg={role:"assistant",content:"I have full context on **"+project.name+"** — budget, timeline, documents, cashflow, client files, and creative assets. I can **see and analyze images and PDFs** from your project files.\n\nTry: *\"Review the Wimbledon renders\"* or *\"What does the NDA say?\"* or *\"Add realistic line items to missing categories\"*"};
  const[messages,setMessages]=useState(()=>{const saved=project.aiChat;return saved&&saved.length>0?saved:[defaultMsg]});
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[pendingActions,setPendingActions]=useState({});
  const chatEnd=useRef(null);
  const inputRef=useRef(null);

  // Persist chat to project
  useEffect(()=>{if(messages.length>1)updateProject({aiChat:messages})},[messages]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"})},[messages,pendingActions]);

  const clearChat=()=>{setMessages([defaultMsg]);setPendingActions({});updateProject({aiChat:null})};

  const executeAction=(action)=>{
    try{
      if(action.type==="add_task"){
        updateProject({timeline:[...(project.timeline||[]),mkTask(action.name,action.category||"General",action.assignee||"",action.startDate||"",action.endDate||"")]});
        return"Added task: "+action.name;
      }else if(action.type==="add_doc"){
        const doc=mkDoc(action.name,action.docType||"invoice",action.vendor||"",action.amount||0,action.dueDate||"");
        if(isOverdue(doc))doc.status="overdue";
        updateProject({docs:[...(project.docs||[]),doc]});
        return"Added document: "+action.name;
      }else if(action.type==="add_txn"){
        updateProject({txns:[...(project.txns||[]),mkTxn(action.txnType||"expense",action.description,action.amount||0,action.date||"",action.category||"")]});
        return"Added transaction: "+action.description;
      }else if(action.type==="add_ros"){
        updateProject({ros:[...(project.ros||[]),mkROS(action.time||"",action.item||"",action.location||"",action.lead||"",action.duration||"",action.notes||"")]});
        return"Added ROS cue: "+action.item;
      }else if(action.type==="update_fee"){
        updateProject({feeP:action.feePercent});
        return"Updated agency fee to "+(action.feePercent*100)+"%";
      }else if(action.type==="update_item"){
        const cats=(project.cats||[]).map(c=>{
          if(c.name.toLowerCase()!==action.category?.toLowerCase())return c;
          return{...c,items:c.items.map(it=>{
            if(it.name.toLowerCase()!==action.item?.toLowerCase())return it;
            const updates={};
            if(action.actualCost!==undefined)updates.actualCost=action.actualCost;
            if(action.margin!==undefined)updates.margin=action.margin;
            if(action.budget!==undefined)updates.budget=action.budget;
            if(action.estCost!==undefined)updates.estCost=action.estCost;
            return{...it,...updates};
          })};
        });
        updateProject({cats});
        return"Updated "+action.item+" in "+action.category;
      }else if(action.type==="update_agency"){
        const ag=(project.ag||[]).map(it=>{
          if(it.name.toLowerCase()!==action.item?.toLowerCase())return it;
          const updates={};
          if(action.days!==undefined)updates.days=action.days;
          if(action.dayRate!==undefined)updates.dayRate=action.dayRate;
          if(action.margin!==undefined)updates.margin=action.margin;
          if(action.days!==undefined||action.dayRate!==undefined)updates.actualCost=(action.days??it.days)*(action.dayRate??it.dayRate);
          return{...it,...updates};
        });
        updateProject({ag});
        return"Updated agency role: "+action.item;
      }else if(action.type==="add_item"){
        const cats=(project.cats||[]).map(c=>{
          if(c.name.toLowerCase()!==action.category?.toLowerCase())return c;
          return{...c,items:[...c.items,mkI(action.name||"New Item",action.actualCost||0,action.margin||0.15)]};
        });
        updateProject({cats});
        return"Added "+action.name+" to "+action.category;
      }else if(action.type==="add_agency_role"){
        updateProject({ag:[...(project.ag||[]),mkA(action.name||"New Role",action.days||0,action.dayRate||0,action.margin||0.15)]});
        return"Added agency role: "+action.name;
      }
      return null;
    }catch(e){return"Failed: "+e.message}
  };

  const parseActions=(text)=>{
    const actionRegex=/```action\s*\n([\s\S]*?)\n```/g;
    let match;const actions=[];
    while((match=actionRegex.exec(text))!==null){
      try{actions.push(JSON.parse(match[1]))}catch(e){}
    }
    return actions;
  };

  const applyAction=(msgIdx,actionIdx)=>{
    const actions=pendingActions[msgIdx];if(!actions)return;
    const action=actions[actionIdx];if(!action||action.applied)return;
    const result=executeAction(action);
    setPendingActions(prev=>({...prev,[msgIdx]:prev[msgIdx].map((a,i)=>i===actionIdx?{...a,applied:true,result}:a)}));
  };

  const applyAll=(msgIdx)=>{
    const actions=pendingActions[msgIdx];if(!actions)return;
    actions.forEach((a,i)=>{if(!a.applied)applyAction(msgIdx,i)});
  };

  // Resolve file data from project state, Supabase Storage, localStorage, or Google Drive
  const resolveFileData=async(item)=>{
    if(item.fileData)return item.fileData;
    // Try Supabase Storage
    if(item.storagePath){
      try{
        const{downloadFileData}=await import('../lib/db.js');
        const data=await downloadFileData(item.storagePath);
        if(data)return data;
      }catch(e){console.error("[ai] Supabase Storage download failed:",e)}
    }
    // Try localStorage file cache
    try{const f=localStorage.getItem(`es_file_${item.id}`);if(f)return f}catch(e){}
    // Try es_projects cache
    try{
      const cached=JSON.parse(localStorage.getItem("es_projects")||"[]");
      const proj=cached.find(p=>p.id===project.id);
      if(proj){
        for(const key of["clientFiles","creativeAssets","docs"]){
          const match=(proj[key]||[]).find(f=>f.id===item.id);
          if(match?.fileData)return match.fileData;
        }
      }
    }catch(e){}
    // Last resort: download from Google Drive
    if(item.driveId&&accessToken){
      try{
        console.log("[ai] Downloading from Drive:",item.name,item.driveId);
        const res=await fetch(`https://www.googleapis.com/drive/v3/files/${item.driveId}?alt=media`,{
          headers:{Authorization:`Bearer ${accessToken}`}
        });
        if(res.ok){
          const blob=await res.blob();
          return new Promise(resolve=>{
            const reader=new FileReader();
            reader.onload=()=>resolve(reader.result);
            reader.onerror=()=>resolve(null);
            reader.readAsDataURL(blob);
          });
        }
      }catch(e){console.error("[ai] Drive download failed:",e)}
    }
    return null;
  };

  // Render a PDF's first page (or multiple pages) to base64 PNG images
  const renderPdfToImages=async(dataUrl,maxPages=3)=>{
    try{
      const raw=atob(dataUrl.split(",")[1]);
      const arr=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
      const doc=await pdfjsLib.getDocument({data:arr}).promise;
      const pages=Math.min(doc.numPages,maxPages);
      const results=[];
      for(let p=1;p<=pages;p++){
        const page=await doc.getPage(p);
        const vp=page.getViewport({scale:1.5});
        const canvas=document.createElement("canvas");
        canvas.width=vp.width;canvas.height=vp.height;
        await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
        results.push(canvas.toDataURL("image/png"));
      }
      return results;
    }catch(e){console.error("[ai] PDF render failed:",e);return[]}
  };

  // Gather all viewable files (images + PDFs rendered as images)
  const getAvailableVisuals=async(userText)=>{
    const visuals=[];
    const allFiles=[];
    const t=userText.toLowerCase();

    // Collect all files from both sources (async — may download from Drive)
    const collectFile=async(item,source)=>{
      const data=await resolveFileData(item);
      if(!data){
        console.log("[ai] No data for file:",item.name,"hasLocalFile:",item._hasLocalFile,"hasDriveId:",!!item.driveId);
        return;
      }
      const isImg=data.startsWith("data:image/");
      const isPdf=data.startsWith("data:application/pdf")||(item.isPdf)||(item.fileName&&/\.pdf$/i.test(item.fileName));
      if(isImg||isPdf)allFiles.push({name:item.name,fileName:item.fileName||"",source,data,isImg,isPdf});
    };
    await Promise.all([
      ...(project.creativeAssets||[]).map(a=>collectFile(a,"creative")),
      ...(project.clientFiles||[]).map(f=>collectFile(f,"client")),
    ]);

    // Prioritize files mentioned by name in the user's message
    const mentioned=allFiles.filter(f=>t.includes(f.name.toLowerCase())||t.includes(f.fileName.toLowerCase().replace(/\.[^.]+$/,"")));
    const rest=allFiles.filter(f=>!mentioned.includes(f));
    const ordered=[...mentioned,...rest];

    // Convert files (images pass through, PDFs get rendered to PNG pages)
    // Cap at 8 total images to stay within API limits
    let remaining=8;
    for(const f of ordered){
      if(remaining<=0)break;
      if(f.isImg){
        visuals.push({name:f.name,source:f.source,data:f.data});
        remaining--;
      }else if(f.isPdf){
        const maxPages=Math.min(remaining,3);
        const rendered=await renderPdfToImages(f.data,maxPages);
        rendered.forEach((img,i)=>{
          visuals.push({name:`${f.name} (page ${i+1})`,source:f.source,data:img});
          remaining--;
        });
      }
    }
    return visuals;
  };

  // Check if the user's message likely refers to visuals or files
  const wantsVisuals=(text)=>{
    const t=text.toLowerCase();
    const keywords=["image","photo","render","design","visual","creative","look","see","review","asset","mockup","mock","deck","logo","brand","graphic","layout","comp","show me","what do you think","feedback","critique","analyze","compare","pdf","document","file","contract","nda","brief","rfp","presentation"];
    if(keywords.some(k=>t.includes(k)))return true;
    // Also check if user mentions a specific file by name
    const allNames=[...(project.creativeAssets||[]).map(a=>a.name.toLowerCase()),...(project.clientFiles||[]).map(f=>f.name.toLowerCase())];
    return allNames.some(n=>n&&t.includes(n));
  };

  const send=async()=>{
    if(!input.trim()||loading)return;
    const userMsg={role:"user",content:input.trim()};
    const newMsgs=[...messages,userMsg];
    setMessages(newMsgs);setInput("");setLoading(true);

    const projectContext=serializeProject(project,comp);

    // Build API messages — attach visuals to the latest user message if relevant
    let apiMessages=newMsgs.map(m=>({role:m.role,content:m.content}));

    // If user wants visuals, attach them (async)
    const lastMsg=newMsgs[newMsgs.length-1];
    if(lastMsg.role==="user"&&wantsVisuals(lastMsg.content)){
      const visuals=await getAvailableVisuals(lastMsg.content);
      if(visuals.length>0){
        const content=[{type:"text",text:lastMsg.content+`\n\n[${visuals.length} file(s) attached: ${visuals.map(v=>v.name).join(", ")}]`}];
        visuals.forEach(v=>{
          const parts=v.data.split(",");
          const mimeMatch=parts[0].match(/data:(image\/[^;]+)/);
          const mediaType=mimeMatch?mimeMatch[1]:"image/png";
          content.push({type:"image",source:{type:"base64",media_type:mediaType,data:parts[1]}});
        });
        apiMessages=[...apiMessages.slice(0,-1),{role:"user",content}];
      }else{
        // Files exist but data couldn't be loaded — diagnose why
        const allItems=[...(project.clientFiles||[]).map(f=>({...f,_src:"client"})),...(project.creativeAssets||[]).map(a=>({...a,_src:"creative"}))];
        const diag=allItems.map(f=>`${f.name}: fileData=${f.fileData?"yes":"no"}, _hasLocalFile=${f._hasLocalFile}, driveId=${f.driveId||"none"}`).join("; ");
        console.log("[ai] File diagnosis:",diag);
        if(allItems.length>0){
          const missingDrive=allItems.filter(f=>!f.driveId).map(f=>f.name);
          const hint=`\n\n[Note: ${allItems.length} file(s) exist but their data could not be loaded. ${missingDrive.length>0?`Files without Google Drive backup: ${missingDrive.join(", ")}. These need to be re-uploaded from the Client Files section to enable visual analysis.`:"Files are on Drive but download failed — check Google sign-in."}]`;
          apiMessages=[...apiMessages.slice(0,-1),{role:"user",content:lastMsg.content+hint}];
        }
      }
    }

    try{
      let authHeaders={"Content-Type":"application/json"};
      try{const{getSession}=await import('../lib/db.js');const s=await getSession();if(s?.access_token)authHeaders.Authorization=`Bearer ${s.access_token}`}catch(e){}
      const res=await fetch("/api/chat",{
        method:"POST",
        headers:authHeaders,
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2048,system:AI_SYSTEM+"\n\nCURRENT PROJECT DATA:\n"+projectContext,messages:apiMessages})
      });
      if(!res.ok){const err=await res.text();throw new Error(err)}
      const data=await res.json();
      const reply=data.content[0].text;
      const actions=parseActions(reply);
      const cleanReply=reply.replace(/```action\s*\n[\s\S]*?\n```/g,"").trim();
      const msgIdx=newMsgs.length;
      setMessages(prev=>[...prev,{role:"assistant",content:cleanReply}]);
      if(actions.length>0){
        setPendingActions(prev=>({...prev,[msgIdx]:actions.map(a=>({...a,applied:false,result:null}))}));
      }
    }catch(e){
      setMessages(prev=>[...prev,{role:"assistant",content:"Error connecting to Morgan: "+e.message+"\n\nWhen deployed, the AI assistant connects via the server proxy. For local testing, deploy to Vercel first."}]);
    }
    setLoading(false);
    setTimeout(()=>inputRef.current?.focus(),100);
  };

  const renderMarkdown=(text)=>{
    const parts=text.split(/(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\n)/g);
    return parts.map((p,i)=>{
      if(p==="\n")return React.createElement("br",{key:i});
      if(p.startsWith("**")&&p.endsWith("**"))return React.createElement("strong",{key:i,style:{color:T.cream,fontWeight:600}},p.slice(2,-2));
      if(p.startsWith("*")&&p.endsWith("*"))return React.createElement("em",{key:i,style:{color:T.dimH}},p.slice(1,-1));
      if(p.startsWith("`")&&p.endsWith("`"))return React.createElement("code",{key:i,style:{padding:"2px 6px",borderRadius:4,background:"rgba(15,82,186,.08)",fontFamily:T.mono,fontSize:11,color:T.cyan}},p.slice(1,-1));
      return p;
    });
  };

  const describeAction=(a)=>{
    if(a.type==="add_item")return`Add "${a.name}" to ${a.category}${a.actualCost?` — $${a.actualCost.toLocaleString()}`:""}`;
    if(a.type==="add_task")return`Add task "${a.name}"${a.category?" in "+a.category:""}`;
    if(a.type==="add_agency_role")return`Add role "${a.name}"${a.days?` — ${a.days} days @ $${a.dayRate}/day`:""}`;
    if(a.type==="update_item")return`Update "${a.item}" in ${a.category}${a.actualCost!==undefined?` → $${a.actualCost.toLocaleString()}`:""}`;
    if(a.type==="update_agency")return`Update "${a.item}"${a.days?` → ${a.days} days`:""} ${a.dayRate?`@ $${a.dayRate}/day`:""}`;
    if(a.type==="update_fee")return`Set agency fee to ${(a.feePercent*100).toFixed(0)}%`;
    if(a.type==="add_doc")return`Add ${a.docType||"document"}: "${a.name}"`;
    if(a.type==="add_txn")return`Add ${a.txnType||"transaction"}: "${a.description}"`;
    if(a.type==="add_ros")return`Add ROS cue: "${a.item}"`;
    return JSON.stringify(a);
  };

  return<div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 56px)",maxHeight:"calc(100vh - 56px)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div>
        <h1 style={{fontSize:20,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>ES AI</h1>
        <p style={{fontSize:13,color:T.dim,marginTop:4}}>Powered by Morgan. Full project context loaded.</p>
      </div>
      {messages.length>1&&<button onClick={clearChat} style={{padding:"7px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}>New Chat</button>}
    </div>
    <Card style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:0}}>
      <div style={{flex:1,overflow:"auto",padding:20}}>
        {messages.map((m,i)=><div key={i}>
          <div style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:pendingActions[i]?6:14}}>
            <div style={{maxWidth:"80%",padding:"12px 16px",borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:m.role==="user"?`linear-gradient(135deg,rgba(148,163,184,.12),rgba(148,163,184,.06))`:"rgba(15,82,186,.04)",border:`1px solid ${m.role==="user"?"rgba(148,163,184,.15)":T.border}`,fontSize:13,lineHeight:1.6,color:m.role==="user"?T.cream:T.dimH,fontFamily:T.sans}}>
              {m.role==="assistant"&&<div style={{fontSize:10,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Morgan</div>}
              <div>{renderMarkdown(m.content)}</div>
            </div>
          </div>
          {/* Action cards */}
          {pendingActions[i]&&pendingActions[i].length>0&&<div style={{display:"flex",justifyContent:"flex-start",marginBottom:14}}>
            <div style={{maxWidth:"80%",width:"100%"}}>
              <div style={{padding:"12px 14px",borderRadius:"0 14px 14px 14px",background:"rgba(255,255,255,.02)",border:`1px solid ${T.border}`,borderTop:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:10,fontWeight:600,color:T.gold,textTransform:"uppercase",letterSpacing:".08em"}}>Suggested Actions ({pendingActions[i].length})</span>
                  {pendingActions[i].some(a=>!a.applied)&&<button onClick={()=>applyAll(i)} style={{padding:"4px 12px",borderRadius:20,border:"none",background:T.goldSoft,color:T.gold,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Apply All</button>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {pendingActions[i].map((a,ai)=>{
                    const color=ACTION_COLORS[a.type]||T.gold;
                    return<div key={ai} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:T.rS,background:a.applied?`${T.pos}08`:T.surfEl,border:`1px solid ${a.applied?`${T.pos}20`:T.border}`,transition:"all .2s"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:a.applied?T.pos:color,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,color:a.applied?T.pos:T.cream,fontWeight:600}}>{describeAction(a)}</div>
                        {a.result&&<div style={{fontSize:10,color:T.pos,marginTop:2}}>{a.result}</div>}
                      </div>
                      {!a.applied?<button onClick={()=>applyAction(i,ai)} style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${color}33`,background:`${color}12`,color,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans,flexShrink:0,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=`${color}25`}} onMouseLeave={e=>{e.currentTarget.style.background=`${color}12`}}>Apply</button>
                      :<span style={{fontSize:10,color:T.pos,fontWeight:600,flexShrink:0}}>Applied</span>}
                    </div>})}
                </div>
              </div>
            </div>
          </div>}
        </div>)}
        {loading&&<div style={{display:"flex",justifyContent:"flex-start",marginBottom:14}}>
          <div style={{padding:"12px 16px",borderRadius:"14px 14px 14px 4px",background:"rgba(15,82,186,.04)",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Morgan</div>
            <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.dim,animation:`pulse 1.2s ease-in-out ${i*.2}s infinite`}}/>)}</div>
          </div>
        </div>}
        <div ref={chatEnd}/>
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,alignItems:"center"}}>
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask about budget, timeline, risks, or tell me to add something..." disabled={loading} style={{flex:1,padding:"12px 16px",borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
        <button onClick={send} disabled={loading||!input.trim()} style={{padding:"10px 20px",borderRadius:T.rS,border:"none",background:input.trim()&&!loading?T.goldSoft:"rgba(15,82,186,.05)",color:input.trim()&&!loading?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${input.trim()&&!loading?T.borderGlow:"transparent"}`,fontSize:12,fontWeight:700,cursor:input.trim()&&!loading?"pointer":"default",fontFamily:T.sans,flexShrink:0}}>Send</button>
      </div>
    </Card>
  </div>;
}

export default AIV;
