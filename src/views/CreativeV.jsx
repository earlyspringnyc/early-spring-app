import { useState, useRef, useCallback, useEffect } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { PlusI, TrashI } from '../components/icons/index.js';
import { Card } from '../components/primitives/index.js';

/* ── PDF page renderer using pdf.js ── */
function PdfViewer({fileData,driveLink,currentPage,onPageChange,onTotalPages}){
  const canvasRef=useRef(null);
  const[pdf,setPdf]=useState(null);
  const[totalPages,setTotalPages]=useState(0);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState(null);

  useEffect(()=>{
    if(!fileData&&!driveLink)return;
    const loadPdfJs=async()=>{
      if(!window.pdfjsLib){
        await new Promise((resolve,reject)=>{
          const script=document.createElement("script");
          script.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";resolve()};
          script.onerror=reject;
          document.head.appendChild(script);
        });
      }
      await loadPdf();
    };
    const loadPdf=async()=>{
      try{
        setLoading(true);setError(null);
        let loadArg;
        if(fileData&&fileData.includes(",")){
          const raw=atob(fileData.split(",")[1]);
          const arr=new Uint8Array(raw.length);
          for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
          loadArg={data:arr};
        } else if(driveLink){
          loadArg={url:driveLink};
        } else {
          setError("No PDF data available");setLoading(false);return;
        }
        const doc=await window.pdfjsLib.getDocument(loadArg).promise;
        setPdf(doc);
        setTotalPages(doc.numPages);
        if(onTotalPages)onTotalPages(doc.numPages);
        setLoading(false);
      }catch(e){console.error("[pdf]",e);setError("Could not load PDF");setLoading(false)}
    };
    loadPdfJs();
  },[fileData,driveLink]);

  useEffect(()=>{
    if(!pdf||!canvasRef.current)return;
    const renderPage=async()=>{
      const page=await pdf.getPage(currentPage+1);
      const canvas=canvasRef.current;
      const ctx=canvas.getContext("2d");
      const vp=page.getViewport({scale:1.5});
      canvas.width=vp.width;canvas.height=vp.height;
      await page.render({canvasContext:ctx,viewport:vp}).promise;
    };
    renderPage();
  },[pdf,currentPage]);

  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:T.dim,fontSize:13}}>Loading PDF...</div>;
  if(error||!pdf)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:T.dim,fontSize:13}}>{error||"Could not load PDF"}</div>;

  return<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,width:"100%",height:"100%",overflow:"auto"}}>
    <canvas ref={canvasRef} style={{maxWidth:"100%",borderRadius:8,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}/>
    <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
      <button onClick={()=>onPageChange(Math.max(0,currentPage-1))} disabled={currentPage===0} style={{padding:"6px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${currentPage===0?"transparent":T.border}`,color:currentPage===0?T.dim:T.cream,fontSize:12,cursor:currentPage===0?"default":"pointer",fontFamily:T.sans}}>&larr; Prev</button>
      <span style={{fontSize:12,fontFamily:T.mono,color:T.cream,fontWeight:600}}>Page {currentPage+1} of {totalPages}</span>
      <button onClick={()=>onPageChange(Math.min(totalPages-1,currentPage+1))} disabled={currentPage>=totalPages-1} style={{padding:"6px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${currentPage>=totalPages-1?"transparent":T.border}`,color:currentPage>=totalPages-1?T.dim:T.cream,fontSize:12,cursor:currentPage>=totalPages-1?"default":"pointer",fontFamily:T.sans}}>Next &rarr;</button>
    </div>
  </div>;
}

/* ── Categories ── */
const SECTIONS=[
  {id:"decks",label:"Decks & Presentations",color:"#A259FF",icon:"\uD83D\uDCCA",desc:"Pitch decks, mood boards, client presentations"},
  {id:"graphic",label:"Graphic Design",color:"#F59E0B",icon:"\uD83C\uDFA8",desc:"Signage, branding, collateral, print files"},
  {id:"3d",label:"3D & Environmental",color:"#14B8A6",icon:"\uD83D\uDDBC\uFE0F",desc:"Renderings, floor plans, CAD, scenic design"},
  {id:"photo-video",label:"Photo & Video",color:"#F47264",icon:"\uD83C\uDFA5",desc:"Photography, videography, edits, social content"},
  {id:"other",label:"Other Files",color:T.dim,icon:"\uD83D\uDCC1",desc:"Anything else"},
];

const STATUS_META={draft:{label:"Draft",color:T.dim},review:{label:"In Review",color:"#F59E0B"},approved:{label:"Approved",color:T.pos},sent:{label:"Sent to Client",color:T.cyan}};
const Pill=({children,color=T.gold,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

const autoSection=(fileName)=>{
  const n=fileName.toLowerCase();
  if(n.includes("deck")||n.includes("pitch")||n.includes("presentation")||n.includes("mood")||n.includes("board")||n.includes("keynote")||n.includes(".key")||n.includes(".pptx")||n.includes(".ppt"))return"decks";
  if(n.includes("sign")||n.includes("banner")||n.includes("collateral")||n.includes("print")||n.includes("brochure")||n.includes("logo")||n.includes("brand")||n.includes("vinyl")||n.includes("wrap"))return"graphic";
  if(n.includes("render")||n.includes("3d")||n.includes("floor")||n.includes("plan")||n.includes("cad")||n.includes("scenic")||n.includes(".dwg")||n.includes(".skp")||n.includes(".stl"))return"3d";
  if(n.includes("photo")||n.includes("video")||n.includes(".mp4")||n.includes(".mov")||n.includes("edit")||n.includes("social")||n.includes("reel")||n.includes("tiktok"))return"photo-video";
  return"other";
};

const getFileType=(file)=>{
  const ext=(file.name||"").split(".").pop().toLowerCase();
  const mime=file.type||"";
  if(mime.startsWith("image/")||["png","jpg","jpeg","tiff","svg","webp"].includes(ext))return"image";
  if(mime.startsWith("video/")||["mp4","mov","prores","mxf"].includes(ext))return"video";
  if(ext==="pdf"||mime==="application/pdf")return"pdf";
  return"other";
};

function CreativeV({project,updateProject,canEdit}){
  const assets=project.creativeAssets||[];
  const[activeSection,setActiveSection]=useState(null);
  const[dragging,setDragging]=useState(false);
  const[viewingAsset,setViewingAsset]=useState(null);
  const[deckPage,setDeckPage]=useState(0);
  const[commentText,setCommentText]=useState("");
  const[commentFilter,setCommentFilter]=useState("page");
  const[totalPdfPages,setTotalPdfPages]=useState(0);
  const[showLinkInput,setShowLinkInput]=useState(false);
  const[linkUrl,setLinkUrl]=useState("");
  const[linkName,setLinkName]=useState("");
  const fileRef=useRef(null);
  const dragCounter=useRef(0);

  const sectionAssets=(sectionId)=>assets.filter(a=>(a.section||a.category||"other")===sectionId);

  const handleFiles=useCallback((files,targetSection)=>{
    const newAssets=[];
    Array.from(files).forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const section=targetSection||autoSection(file.name);
        const ft=getFileType(file);
        const ext=(file.name||"").split(".").pop().toLowerCase();
        const sizeKB=Math.round(file.size/1024);
        newAssets.push({
          id:uid(),name:file.name.replace(/\.[^/.]+$/,""),fileName:file.name,
          section,fileData:ev.target.result,
          fileType:ft,fileExt:ext,
          fileSize:sizeKB>1024?`${(sizeKB/1024).toFixed(1)} MB`:`${sizeKB} KB`,
          isImage:ft==="image",isVideo:ft==="video",isPdf:ft==="pdf",
          isFigma:false,isCanva:false,linkUrl:"",
          notes:"",status:"draft",
          comments:[],
          dateAdded:new Date().toLocaleDateString(),
          versions:[{id:uid(),fileName:file.name,fileData:ev.target.result,date:new Date().toLocaleDateString()}],
        });
        if(newAssets.length===files.length)updateProject({creativeAssets:[...assets,...newAssets]});
      };
      reader.readAsDataURL(file);
    });
  },[assets,updateProject]);

  const addLink=(targetSection)=>{
    if(!linkUrl.trim())return;
    const isFigma=linkUrl.includes("figma.com");
    const isCanva=linkUrl.includes("canva.com");
    const name=linkName.trim()||(isFigma?"Figma Design":isCanva?"Canva Design":"Design Link");
    const asset={
      id:uid(),name,fileName:linkUrl,section:targetSection||"decks",
      fileData:null,linkUrl:linkUrl.trim(),
      fileType:"link",fileExt:isFigma?"fig":isCanva?"canva":"link",
      fileSize:"",isImage:false,isVideo:false,isPdf:false,
      isFigma,isCanva,
      notes:"",status:"draft",comments:[],
      dateAdded:new Date().toLocaleDateString(),versions:[],
    };
    updateProject({creativeAssets:[...assets,asset]});
    setLinkUrl("");setLinkName("");setShowLinkInput(false);
  };

  const removeAsset=id=>updateProject({creativeAssets:assets.filter(a=>a.id!==id)});
  const updateAsset=(id,updates)=>updateProject({creativeAssets:assets.map(a=>a.id===id?{...a,...updates}:a)});

  const addComment=(assetId,page)=>{
    if(!commentText.trim())return;
    const comment={id:uid(),text:commentText.trim(),page,date:new Date().toLocaleDateString(),author:"You"};
    updateAsset(assetId,{comments:[...(assets.find(a=>a.id===assetId)?.comments||[]),comment]});
    setCommentText("");
  };

  const removeComment=(assetId,commentId)=>{
    const a=assets.find(a=>a.id===assetId);
    if(!a)return;
    updateAsset(assetId,{comments:(a.comments||[]).filter(c=>c.id!==commentId)});
  };

  // Drag handlers for section views
  const onDragEnter=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current++;setDragging(true)},[]);
  const onDragLeave=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current--;if(dragCounter.current===0)setDragging(false)},[]);
  const onDragOver=useCallback(e=>{e.preventDefault();e.stopPropagation()},[]);

  // Stats
  const totalAssets=assets.length;
  const reviewCount=assets.filter(a=>a.status==="review").length;
  const approvedCount=assets.filter(a=>a.status==="approved").length;

  const BackBtn=()=><button onClick={()=>{setActiveSection(null);setViewingAsset(null)}} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:12,fontFamily:T.sans,padding:0,marginBottom:16}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>&larr; Back to Creative</button>;

  /* ══ ASSET VIEWER (full screen overlay for PDFs/images with commenting) ══ */
  if(viewingAsset){
    const a=assets.find(x=>x.id===viewingAsset);
    if(!a)return<div><BackBtn/><p style={{color:T.dim}}>Asset not found</p></div>;
    const comments=(a.comments||[]);
    const visibleComments=a.isPdf&&commentFilter==="page"?comments.filter(c=>c.page===deckPage):comments;
    const statusM=STATUS_META[a.status||"draft"];

    return<div style={{position:"fixed",inset:0,zIndex:200,background:T.bg,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setViewingAsset(null)} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:16}}>&times;</button>
          <span style={{fontSize:14,fontWeight:600,color:T.cream}}>{a.name}</span>
          <Pill color={statusM.color} size="xs">{statusM.label}</Pill>
        </div>
        <div style={{display:"flex",gap:6}}>
          {canEdit&&Object.entries(STATUS_META).map(([k,v])=><button key={k} onClick={()=>updateAsset(a.id,{status:k})} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${(a.status||"draft")===k?v.color+"40":T.border}`,background:(a.status||"draft")===k?`${v.color}12`:"transparent",color:(a.status||"draft")===k?v.color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{v.label}</button>)}
          {a.linkUrl&&<button onClick={()=>window.open(a.linkUrl,"_blank")} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Open Link</button>}
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Main content */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto",padding:24,background:"rgba(0,0,0,.3)"}}>
          {a.isPdf&&(a.fileData||a.driveLink)?<PdfViewer fileData={a.fileData} driveLink={a.driveLink} currentPage={deckPage} onPageChange={setDeckPage} onTotalPages={n=>setTotalPdfPages(n)}/>
          :a.isImage&&a.fileData?<img src={a.fileData} alt={a.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8}}/>
          :a.isVideo&&a.fileData?<video src={a.fileData} controls style={{maxWidth:"100%",maxHeight:"100%",borderRadius:8}}/>
          :a.isFigma&&a.linkUrl?<iframe src={`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(a.linkUrl)}`} style={{width:"100%",height:"100%",border:"none",borderRadius:8}} title={a.name} allowFullScreen/>
          :<div style={{textAlign:"center",color:T.dim}}><div style={{fontSize:48,marginBottom:12,opacity:.2}}>{a.fileExt?.toUpperCase()||"FILE"}</div><div style={{fontSize:13}}>Preview not available</div>{a.linkUrl&&<button onClick={()=>window.open(a.linkUrl,"_blank")} style={{marginTop:12,padding:"8px 16px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Open Link</button>}</div>}
        </div>

        {/* Comments sidebar */}
        <div style={{width:320,borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:T.cream,textTransform:"uppercase",letterSpacing:".06em"}}>Comments ({comments.length})</div>
              {a.isPdf&&totalPdfPages>0&&<div style={{display:"flex",gap:4}}>
                <button onClick={()=>setCommentFilter("page")} style={{padding:"2px 8px",borderRadius:10,border:"none",fontSize:9,fontWeight:commentFilter==="page"?700:400,background:commentFilter==="page"?`${T.cyan}18`:"transparent",color:commentFilter==="page"?T.cyan:T.dim,cursor:"pointer",fontFamily:T.sans}}>Page {deckPage+1}</button>
                <button onClick={()=>setCommentFilter("all")} style={{padding:"2px 8px",borderRadius:10,border:"none",fontSize:9,fontWeight:commentFilter==="all"?700:400,background:commentFilter==="all"?`${T.gold}18`:"transparent",color:commentFilter==="all"?T.gold:T.dim,cursor:"pointer",fontFamily:T.sans}}>All</button>
              </div>}
            </div>
          </div>
          <div style={{flex:1,overflow:"auto",padding:"12px 16px"}}>
            {visibleComments.length===0&&<div style={{fontSize:11,color:T.dim,textAlign:"center",padding:20}}>{a.isPdf&&commentFilter==="page"?`No comments on page ${deckPage+1}`:"No comments yet"}</div>}
            {visibleComments.map(c=><div key={c.id} style={{padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:10,fontWeight:600,color:T.cyan}}>{c.author}</span>
                  {a.isPdf&&c.page!=null&&commentFilter==="all"&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:6,background:`${T.dim}18`,color:T.dim,fontWeight:600}}>p.{c.page+1}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:9,color:T.dim}}>{c.date}</span>
                  {canEdit&&<button onClick={()=>removeComment(a.id,c.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.3,padding:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.3}><TrashI size={9} color={T.neg}/></button>}
                </div>
              </div>
              <div style={{fontSize:12,color:T.cream,lineHeight:1.5}}>{c.text}</div>
            </div>)}
          </div>
          <div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`}}>
            {a.isPdf&&totalPdfPages>0&&<div style={{fontSize:9,color:T.dim,marginBottom:4}}>Commenting on page {deckPage+1}</div>}
            <textarea value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder={a.isPdf?`Comment on page ${deckPage+1}...`:"Add a comment..."} rows={2} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"none",marginBottom:6}}/>
            <button onClick={()=>addComment(a.id,deckPage)} disabled={!commentText.trim()} style={{width:"100%",padding:"7px 0",borderRadius:T.rS,background:commentText.trim()?T.goldSoft:"rgba(255,255,255,.05)",color:commentText.trim()?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${commentText.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:commentText.trim()?"pointer":"default",fontFamily:T.sans}}>Comment</button>
          </div>
        </div>
      </div>
    </div>;
  }

  /* ══ SECTION DETAIL VIEW ══ */
  if(activeSection){
    const sec=SECTIONS.find(s=>s.id===activeSection);
    const sAssets=sectionAssets(activeSection);
    const reviewInSection=sAssets.filter(a=>a.status==="review").length;

    return<div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);dragCounter.current=0;if(e.dataTransfer.files?.length)handleFiles(e.dataTransfer.files,activeSection)}} style={{position:"relative",minHeight:"50vh"}}>
      {dragging&&<div style={{position:"absolute",inset:0,zIndex:100,background:"rgba(8,8,12,.85)",backdropFilter:"blur(8px)",borderRadius:T.r,border:`3px dashed ${sec.color}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
        <div style={{fontSize:40,opacity:.6}}>&#8593;</div>
        <div style={{fontSize:18,fontWeight:600,color:sec.color}}>Drop files here</div>
        <div style={{fontSize:12,color:T.dim}}>{sec.desc}</div>
      </div>}
      <BackBtn/>
      <input ref={fileRef} type="file" multiple accept="*" onChange={e=>{if(e.target.files?.length)handleFiles(e.target.files,activeSection);e.target.value=""}} style={{display:"none"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,color:T.cream}}>{sec.label}</h2>
          <p style={{fontSize:12,color:T.dim,marginTop:4}}>{sAssets.length} files{reviewInSection>0?` · ${reviewInSection} awaiting review`:""}</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {activeSection==="decks"&&<button onClick={()=>setShowLinkInput(!showLinkInput)} style={{padding:"8px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>+ Figma / Link</button>}
          <button onClick={()=>fileRef.current.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color={T.gold}/> Upload</button>
        </div>
      </div>

      {showLinkInput&&<Card style={{padding:16,marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Add Figma, Canva, or URL</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr auto",gap:8,alignItems:"flex-end"}}>
          <div><div style={{fontSize:9,color:T.dim,marginBottom:4}}>URL</div><input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://figma.com/..." onKeyDown={e=>e.key==="Enter"&&addLink(activeSection)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
          <div><div style={{fontSize:9,color:T.dim,marginBottom:4}}>Name</div><input value={linkName} onChange={e=>setLinkName(e.target.value)} placeholder="Mood Board v2" onKeyDown={e=>e.key==="Enter"&&addLink(activeSection)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
          <button onClick={()=>addLink(activeSection)} disabled={!linkUrl.trim()} style={{padding:"8px 16px",borderRadius:T.rS,background:linkUrl.trim()?T.goldSoft:"rgba(255,255,255,.05)",color:linkUrl.trim()?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${linkUrl.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:linkUrl.trim()?"pointer":"default",fontFamily:T.sans}}>Add</button>
        </div>
      </Card>}

      {/* File list */}
      {sAssets.length>0?<Card style={{overflow:"hidden"}}>
        {sAssets.map((a,idx)=>{
          const statusM=STATUS_META[a.status||"draft"];
          const commentCount=(a.comments||[]).length;
          return<div key={a.id} onClick={()=>{setViewingAsset(a.id);setDeckPage(0)}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",borderBottom:idx<sAssets.length-1?`1px solid ${T.border}`:"none",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            {/* Thumbnail */}
            <div style={{width:48,height:48,borderRadius:T.rS,background:"rgba(0,0,0,.2)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {a.isImage&&a.fileData?<img src={a.fileData} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              :a.isFigma?<span style={{fontSize:10,fontWeight:800,color:"#A259FF",fontFamily:T.mono}}>FIG</span>
              :<span style={{fontSize:10,fontWeight:700,color:T.dim,fontFamily:T.mono}}>{(a.fileExt||"?").toUpperCase()}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
              <div style={{fontSize:10,color:T.dim,marginTop:2}}>{a.fileSize||a.fileName} · {a.dateAdded}</div>
            </div>
            {commentCount>0&&<span style={{fontSize:10,color:T.cyan,fontFamily:T.mono}}>{commentCount} comment{commentCount>1?"s":""}</span>}
            <Pill color={statusM.color} size="xs">{statusM.label}</Pill>
            {canEdit&&<select value={a.status||"draft"} onChange={e=>{e.stopPropagation();updateAsset(a.id,{status:e.target.value})}} onClick={e=>e.stopPropagation()} style={{padding:"3px 6px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.dim,fontSize:9,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none"}}>
              {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>}
            {canEdit&&<button onClick={e=>{e.stopPropagation();removeAsset(a.id)}} style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.12)",borderRadius:T.rS,cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,.15)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(248,113,113,.06)"}><TrashI size={11} color={T.neg}/></button>}
          </div>
        })}
      </Card>
      :<div onClick={()=>fileRef.current.click()} style={{textAlign:"center",padding:48,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=sec.color;e.currentTarget.style.background=`${sec.color}06`}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
        <div style={{fontSize:24,opacity:.2,marginBottom:8}}>{sec.icon}</div>
        <div style={{fontSize:14,fontWeight:500,color:T.cream,marginBottom:6}}>No files yet</div>
        <p style={{fontSize:12,color:T.dim}}>Drag and drop or click to upload</p>
      </div>}
    </div>;
  }

  /* ══ MAIN GRID VIEW ══ */
  const cardStyle=(color)=>({borderRadius:T.r,border:`1px solid ${T.border}`,background:T.surfEl,cursor:"pointer",transition:"all .2s",borderLeft:`3px solid ${color}`});
  const cardHover=e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=T.shadow;e.currentTarget.style.borderColor=T.borderGlow};
  const cardLeave=e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=T.border};

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:20,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>Creative & Design</h1><p style={{fontSize:13,color:T.dim,marginTop:6}}>{totalAssets} assets{reviewCount>0?` · ${reviewCount} awaiting review`:""}{approvedCount>0?` · ${approvedCount} approved`:""}</p></div>
    </div>

    {/* Progress */}
    {totalAssets>0&&<div style={{display:"flex",gap:6,marginBottom:20}}>
      {Object.entries(STATUS_META).map(([k,v])=>{
        const count=assets.filter(a=>(a.status||"draft")===k).length;
        if(!count)return null;
        return<div key={k} style={{flex:count,height:4,borderRadius:2,background:v.color,opacity:.6,transition:"flex .4s ease"}} title={`${v.label}: ${count}`}/>;
      })}
    </div>}

    {/* Section cards */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {SECTIONS.map(sec=>{
        const sAssets=sectionAssets(sec.id);
        const review=sAssets.filter(a=>a.status==="review").length;
        const approved=sAssets.filter(a=>a.status==="approved").length;
        return<div key={sec.id} onClick={()=>setActiveSection(sec.id)} style={cardStyle(sec.color)} onMouseEnter={cardHover} onMouseLeave={cardLeave}
          onDragEnter={e=>{e.preventDefault();e.currentTarget.style.borderColor=sec.color;e.currentTarget.style.background=`${sec.color}08`}}
          onDragLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surfEl}}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surfEl;if(e.dataTransfer.files?.length)handleFiles(e.dataTransfer.files,sec.id)}}>
          <div style={{padding:"24px 26px"}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>{sec.label}</div>
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:10}}>
              <span className="num" style={{fontSize:32,fontWeight:700,color:sec.color,fontFamily:T.mono}}>{sAssets.length}</span>
              <span style={{fontSize:12,color:T.dim}}>files</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {review>0&&<Pill color="#F59E0B" size="xs">{review} in review</Pill>}
              {approved>0&&<Pill color={T.pos} size="xs">{approved} approved</Pill>}
              {sAssets.length===0&&<span style={{fontSize:11,color:T.dim}}>{sec.desc}</span>}
            </div>
          </div>
        </div>
      })}
    </div>
  </div>;
}

export default CreativeV;
