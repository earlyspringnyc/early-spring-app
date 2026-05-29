import { useState, useRef, useCallback, useEffect } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { PlusI, TrashI } from '../components/icons/index.js';
import { Card } from '../components/primitives/index.js';
import WardrobeTable from '../components/WardrobeTable.jsx';
import { restFetch, publicFileUrl } from '../lib/db.js';

// Resolve an asset to a usable URL for img/video/iframe src + download.
// Order of preference: inline base64 fileData → Storage public URL via
// storagePath → Google Drive link. Falls back to null when none exist.
function assetUrl(a) {
  if (!a) return null;
  if (a.fileData) return a.fileData;
  if (a.storagePath) return publicFileUrl(a.storagePath);
  if (a.driveLink) return a.driveLink;
  return null;
}

/* ── PDF page renderer using pdf.js ── */
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function PdfViewer({fileData,driveLink,currentPage,onPageChange,onTotalPages}){
  const canvasRef=useRef(null);
  const[pdf,setPdf]=useState(null);
  const[totalPages,setTotalPages]=useState(0);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState(null);

  useEffect(()=>{
    if(!fileData&&!driveLink)return;
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
        const doc=await pdfjsLib.getDocument(loadArg).promise;
        setPdf(doc);
        setTotalPages(doc.numPages);
        if(onTotalPages)onTotalPages(doc.numPages);
        setLoading(false);
      }catch(e){console.error("[pdf]",e);setError("Could not load PDF");setLoading(false)}
    };
    loadPdf();
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
// "from-client" is a virtual section \u2014 its contents live in the
// client_asset_links table (URLs the client pasted into their portal),
// not in project.creativeAssets. Rendered with a dedicated card view
// so staff can copy/open the links without polluting the regular
// section flows.
const SECTIONS=[
  {id:"decks",label:"Decks & Presentations",color:T.ink,icon:"\uD83D\uDCCA",desc:"Pitch decks, mood boards, client presentations"},
  {id:"graphic",label:"Graphic Design",color:T.ink70,icon:"\uD83C\uDFA8",desc:"Signage, branding, collateral, print files"},
  {id:"3d",label:"3D & Environmental",color:T.ink60,icon:"\uD83D\uDDBC\uFE0F",desc:"Renderings, floor plans, CAD, scenic design"},
  {id:"photo-video",label:"Photo & Video",color:T.ink40,icon:"\uD83C\uDFA5",desc:"Photography, videography, edits, social content"},
  {id:"from-client",label:"From the Client",color:T.gold,icon:"\u2197",desc:"Drive, Dropbox & Figma links shared via the client portal"},
  {id:"documents",label:"Documents",color:T.cyan,icon:"\uD83D\uDCDD",desc:"Working docs \u2014 briefs, scripts, treatments, run-of-show. Paste Google Docs / Notion links."},
  {id:"wardrobe",label:"Talent Wardrobe",color:T.ink,icon:"\uD83D\uDC54",desc:"Sizes, addresses, what's been purchased per person. Import from a StaffConnect link."},
  {id:"other",label:"Other Files",color:T.dim,icon:"\uD83D\uDCC1",desc:"Anything else"},
];

const STATUS_META={draft:{label:"Draft",color:T.fadedInk},review:{label:"In Review",color:T.ink70},approved:{label:"Approved",color:T.ink},sent:{label:"Sent to Client",color:T.ink40}};
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

function CreativeV({project,updateProject,canEdit,accessToken,user}){
  const assets=project.creativeAssets||[];
  const[activeSection,setActiveSection]=useState(null);
  // ── Client-shared asset links (Drive/Dropbox/Figma URLs the client
  // pasted into their portal). Loaded once on mount + refreshed when
  // the user navigates into the "From the Client" section so we see
  // newly-shared links without a full page refresh. ──
  const[clientLinks,setClientLinks]=useState([]);
  const[clientUploads,setClientUploads]=useState([]);
  const[clientLinksLoading,setClientLinksLoading]=useState(false);
  const loadClientLinks=useCallback(async()=>{
    if(!project?.id)return;
    setClientLinksLoading(true);
    try{
      const{restFetch}=await import('../lib/db.js');
      const[links,uploads]=await Promise.all([
        restFetch(`/client_asset_links?project_id=eq.${project.id}&order=added_at.desc&limit=200`),
        restFetch(`/client_file_uploads?project_id=eq.${project.id}&order=created_at.desc&limit=200`).catch(()=>[]),
      ]);
      setClientLinks(links||[]);
      setClientUploads(uploads||[]);
    }catch(e){console.warn('[creative] client contributions load failed:',e?.message)}
    finally{setClientLinksLoading(false)}
  },[project?.id]);
  useEffect(()=>{loadClientLinks()},[loadClientLinks]);
  useEffect(()=>{if(activeSection==='from-client')loadClientLinks()},[activeSection,loadClientLinks]);

  // ── Wardrobe row count for the section grid card. Light fetch
  // (just id + the 5 purchase booleans) so we can show "X talent ·
  // Y/Z items". Refreshed when the user comes back from the table.
  const[wardrobeStats,setWardrobeStats]=useState({total:0,done:0,checks:0});
  const loadWardrobeStats=useCallback(async()=>{
    if(!project?.id)return;
    try{
      const rows=await restFetch(`/project_wardrobe?select=id,purchased_shorts,purchased_shirt,purchased_sunglasses,purchased_scarf,purchased_shoes&project_id=eq.${project.id}`);
      const list=rows||[];
      const gKeys=['purchased_shorts','purchased_shirt','purchased_sunglasses','purchased_scarf','purchased_shoes'];
      const checks=list.length*gKeys.length;
      const done=list.reduce((acc,r)=>acc+gKeys.filter(k=>r[k]).length,0);
      setWardrobeStats({total:list.length,done,checks});
    }catch(e){/* table may not exist yet; ignore */}
  },[project?.id]);
  useEffect(()=>{loadWardrobeStats()},[loadWardrobeStats]);
  useEffect(()=>{if(activeSection===null)loadWardrobeStats()},[activeSection,loadWardrobeStats]);
  const[dragging,setDragging]=useState(false);
  const[viewingAsset,setViewingAsset]=useState(null);
  const[deckPage,setDeckPage]=useState(0);
  const[commentText,setCommentText]=useState("");
  const[commentFilter,setCommentFilter]=useState("page");

  // Arrow-key navigation between assets while the viewer is open.
  // Walks the section the user was browsing if there is one, otherwise
  // the whole creative-assets list. Ignored when focus is in a text
  // input so users can still type in the comment box.
  useEffect(()=>{
    if(!viewingAsset)return;
    const onKey=(e)=>{
      if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
      const tag=(e.target?.tagName||'').toUpperCase();
      if(tag==='INPUT'||tag==='TEXTAREA'||e.target?.isContentEditable)return;
      const list=activeSection?sectionAssets(activeSection):assets;
      if(!list.length)return;
      const idx=list.findIndex(a=>a.id===viewingAsset);
      if(idx===-1)return;
      const next=e.key==='ArrowRight'
        ?list[(idx+1)%list.length]
        :list[(idx-1+list.length)%list.length];
      if(next?.id){setViewingAsset(next.id);setDeckPage(0)}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[viewingAsset,activeSection,assets]);
  const[totalPdfPages,setTotalPdfPages]=useState(0);
  const[showLinkInput,setShowLinkInput]=useState(false);
  const[linkUrl,setLinkUrl]=useState("");
  const[linkName,setLinkName]=useState("");
  const fileRef=useRef(null);
  const dragCounter=useRef(0);

  const sectionAssets=(sectionId)=>assets.filter(a=>(a.section||a.category||"other")===sectionId);

  const handleFiles=useCallback((files,targetSection)=>{
    const fileList=Array.from(files);
    const total=fileList.length;
    const newAssets=[];
    let errored=0;
    fileList.forEach(file=>{
      const reader=new FileReader();
      reader.onerror=err=>{
        console.error('[creative] FileReader error for',file.name,err);
        errored++;
        import('../lib/toast.js').then(({toast})=>toast.error(`Could not read ${file.name}: ${reader.error?.message||'unknown error'}`));
        // Still count this toward completion so the batch doesn't hang
        if(newAssets.length+errored===total&&newAssets.length>0){
          commitAssets();
        }
      };
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
        if(newAssets.length+errored===total){
          commitAssets();
        }
      };
      reader.readAsDataURL(file);
    });

    function commitAssets(){
      if(newAssets.length===0)return;
      try{
        updateProject(prev=>({creativeAssets:[...(prev.creativeAssets||[]),...newAssets]}));
        import('../lib/toast.js').then(({toast})=>{
          toast.success(`Added ${newAssets.length} file${newAssets.length===1?'':'s'}${errored>0?` (${errored} failed)`:''}`);
        });
      }catch(e){
        console.error('[creative] updateProject threw:',e);
        import('../lib/toast.js').then(({toast})=>toast.error(`Could not save files: ${e.message||e}`));
      }
      // Background upload to Google Drive — functional updater so
      // parallel completions don't clobber each other.
      if(accessToken&&project.driveFolders){
        import('../utils/drive.js').then(({uploadToDrive})=>{
          newAssets.forEach(async(a)=>{
            if(!a.fileData)return;
            try{
              const result=await uploadToDrive(accessToken,a.fileData,a.fileName,project.driveFolders,null,"creative");
              if(result){
                updateProject(prev=>({creativeAssets:(prev.creativeAssets||[]).map(x=>x.id===a.id?{...x,driveId:result.driveId,driveLink:result.webViewLink}:x)}));
              }
            }catch(e){console.error('[creative] drive upload failed for',a.fileName,e)}
          });
        });
      }
    }
  },[assets,updateProject,accessToken,project.driveFolders]);

  // Per-provider URL → iframe-embeddable URL. Most platforms ship
  // a distinct embed/preview endpoint (X-Frame-Options blocks the
  // canonical /edit or /watch URLs). Falls back to the raw URL for
  // unknown providers — the iframe will just show a blank page
  // when the target blocks framing, and the user can fall back to
  // the existing "Open Link" button.
  const toEmbedUrl = (url, provider) => {
    if (!url) return url;
    try {
      switch (provider) {
        case 'drive':
          // Docs / Sheets / Slides / Drive — /preview is embeddable.
          return url.replace(/\/(edit|view|viewform)(\?[^#]*)?(#.*)?$/, '/preview');
        case 'figma':
          return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
        case 'canva': {
          // Canva share URLs accept ?embed appended to /view.
          const u = url.replace(/\/(edit|view)(\?[^#]*)?(#.*)?$/, '/view');
          return u.includes('?embed') ? u : `${u}?embed`;
        }
        case 'youtube': {
          // youtu.be/<id>, youtube.com/watch?v=<id>, /shorts/<id> → /embed/<id>
          const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
          return m ? `https://www.youtube.com/embed/${m[1]}` : url;
        }
        case 'vimeo': {
          const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
          return m ? `https://player.vimeo.com/video/${m[1]}` : url;
        }
        case 'loom': {
          // loom.com/share/<id> → loom.com/embed/<id>
          return url.replace('/share/', '/embed/');
        }
        case 'miro': {
          // miro.com/app/board/<id>/ → miro.com/app/live-embed/<id>/
          const m = url.match(/miro\.com\/app\/board\/([\w-]+=?)/);
          return m ? `https://miro.com/app/live-embed/${m[1]}/?embedAutoplay=true` : url;
        }
        case 'dropbox':
          // ?raw=1 forces a direct preview where supported.
          return url.includes('?') ? url.replace(/[?&]dl=\d/, '') + '&raw=1' : url + '?raw=1';
        case 'notion':
          // Public Notion pages embed directly. Private ones won't.
          return url;
        default:
          return url;
      }
    } catch (e) { return url; }
  };
  const detectLinkProvider = (url) => {
    const u = (url || '').toLowerCase();
    if (u.includes('figma.com')) return { provider: 'figma', label: 'Figma', ext: 'fig' };
    if (u.includes('canva.com')) return { provider: 'canva', label: 'Canva', ext: 'canva' };
    if (u.includes('dropbox.com')) return { provider: 'dropbox', label: 'Dropbox', ext: 'dropbox' };
    if (u.includes('drive.google.com') || u.includes('docs.google.com')) return { provider: 'drive', label: 'Google Drive', ext: 'drive' };
    if (u.includes('notion.so') || u.includes('notion.site')) return { provider: 'notion', label: 'Notion', ext: 'notion' };
    if (u.includes('miro.com')) return { provider: 'miro', label: 'Miro', ext: 'miro' };
    if (u.includes('youtube.com') || u.includes('youtu.be')) return { provider: 'youtube', label: 'YouTube', ext: 'yt' };
    if (u.includes('vimeo.com')) return { provider: 'vimeo', label: 'Vimeo', ext: 'vimeo' };
    if (u.includes('loom.com')) return { provider: 'loom', label: 'Loom', ext: 'loom' };
    return { provider: 'link', label: 'Link', ext: 'link' };
  };

  const addLink=async(targetSection)=>{
    if(!linkUrl.trim())return;
    const meta = detectLinkProvider(linkUrl);
    let name = linkName.trim();
    if (!name) {
      try {
        const { deriveLinkName } = await import('../utils/linkMeta.js');
        name = (await deriveLinkName(linkUrl, accessToken)) || '';
      } catch (e) {}
    }
    if (!name) name = `${meta.label} ${targetSection ? targetSection.charAt(0).toUpperCase()+targetSection.slice(1) : 'Asset'}`;
    const asset={
      id:uid(),name,fileName:linkUrl,section:targetSection||"decks",
      fileData:null,linkUrl:linkUrl.trim(),
      fileType:"link",fileExt:meta.ext,
      fileSize:"",isImage:false,isVideo:false,isPdf:false,
      // Keep legacy boolean flags so existing render paths still work,
      // while linkProvider is the canonical identifier going forward.
      isFigma: meta.provider === 'figma',
      isCanva: meta.provider === 'canva',
      linkProvider: meta.provider,
      // Linked assets are intentional client-facing references — mark
      // them client-visible so they surface in the portal without a
      // separate approval step.
      clientVisible: true,
      notes:"",status:"approved",comments:[],
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

    return<div style={{position:"fixed",top:0,right:0,bottom:0,left:0,width:"100vw",height:"100vh",zIndex:200,background:T.bg,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Header — flex constraints + wrap so long titles and status pills
           don't push action buttons offscreen. */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0,gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0,flex:"1 1 auto"}}>
          <button onClick={()=>setViewingAsset(null)} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:16,flexShrink:0}}>&times;</button>
          <span style={{fontSize:14,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{a.name}</span>
          <span style={{flexShrink:0}}><Pill color={statusM.color} size="xs">{statusM.label}</Pill></span>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",flexShrink:0}}>
          {canEdit&&Object.entries(STATUS_META).map(([k,v])=><button key={k} onClick={()=>updateAsset(a.id,{status:k})} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${(a.status||"draft")===k?v.color+"40":T.border}`,background:(a.status||"draft")===k?`${v.color}12`:"transparent",color:(a.status||"draft")===k?v.color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}}>{v.label}</button>)}
          {a.linkUrl&&<button onClick={()=>window.open(a.linkUrl,"_blank")} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}}>Open Link</button>}
          {assetUrl(a)&&<a href={assetUrl(a)} download={a.fileName||a.name||"file"} target="_blank" rel="noopener noreferrer" style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>↓ Download</a>}
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Main content */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto",padding:24,background:"rgba(0,0,0,.3)"}}>
          {(() => {
            const url = assetUrl(a);
            if (a.isPdf && url) return <PdfViewer fileData={a.fileData} driveLink={a.fileData?null:url} currentPage={deckPage} onPageChange={setDeckPage} onTotalPages={n=>setTotalPdfPages(n)}/>;
            if (a.isImage && url) return <img src={url} alt={a.name} onError={(e)=>{console.error('[creative-viewer] image failed to load:',url);e.currentTarget.alt='Image failed to load — try Download in the header.'}} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8}}/>;
            if (a.isVideo && url) return <video src={url} controls style={{maxWidth:"100%",maxHeight:"100%",borderRadius:8}}/>;
            if (a.linkUrl) return <iframe src={toEmbedUrl(a.linkUrl,a.linkProvider)} style={{width:"100%",height:"100%",border:"none",borderRadius:8,background:"#fff"}} title={a.name} allow="autoplay; fullscreen; clipboard-write" allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"/>;
            if (url) return <div style={{textAlign:"center",color:T.dim}}><div style={{fontSize:48,marginBottom:12,opacity:.2}}>{a.fileExt?.toUpperCase()||"FILE"}</div><div style={{fontSize:13,marginBottom:14}}>No inline preview for .{a.fileExt||'this'} files</div><a href={url} download={a.fileName||a.name||"file"} target="_blank" rel="noopener noreferrer" style={{padding:"8px 16px",borderRadius:T.rS,background:T.ink,color:T.paper,fontSize:11,fontWeight:700,letterSpacing:".04em",textDecoration:"none",fontFamily:T.sans}}>Download</a></div>;
            return <div style={{textAlign:"center",color:T.dim}}><div style={{fontSize:48,marginBottom:12,opacity:.2}}>{a.fileExt?.toUpperCase()||"FILE"}</div><div style={{fontSize:13}}>Preview not available</div></div>;
          })()}
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
                  {a.isPdf&&c.page!=null&&commentFilter==="all"&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:999,border:`1px solid ${T.faintRule}`,color:T.ink70,fontWeight:700,letterSpacing:".04em"}}>p.{c.page+1}</span>}
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
            <button onClick={()=>addComment(a.id,deckPage)} disabled={!commentText.trim()} style={{width:"100%",padding:"7px 0",borderRadius:T.rS,background:commentText.trim()?T.goldSoft:T.inkSoft2,color:commentText.trim()?T.gold:T.fadedInk,border:`1px solid ${commentText.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:commentText.trim()?"pointer":"default",fontFamily:T.sans}}>Comment</button>
          </div>
        </div>
      </div>
    </div>;
  }

  /* ══ FROM-THE-CLIENT detail view ══
     Renders client-supplied Drive/Dropbox/Figma URLs from
     client_asset_links. No upload UI — these are read-only references
     populated by the client portal. */
  if(activeSection==='from-client'){
    const sec=SECTIONS.find(s=>s.id==='from-client');
    const providerLabel=(p)=>{
      const m={dropbox:'Dropbox',drive:'Google Drive',figma:'Figma',notion:'Notion',miro:'Miro',other:'Link',link:'Link'};
      return m[p]||'Link';
    };
    return<div>
      <BackBtn/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",margin:0}}>From the Client</h1>
          <div style={{fontSize:12,color:T.dim,marginTop:4}}>Drive, Dropbox &amp; Figma links shared via the client portal.</div>
        </div>
        <button onClick={loadClientLinks} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{clientLinksLoading?'Refreshing…':'Refresh'}</button>
      </div>

      {clientLinks.length===0&&clientUploads.length===0?<div style={{padding:"40px 20px",textAlign:"center",color:T.dim,fontSize:13,border:`1px dashed ${T.border}`,borderRadius:T.r}}>
        Nothing yet. When the client uploads a file or pastes a link in their portal, it shows up here.
      </div>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12}}>
        {clientUploads.map(up=>{
          const publicUrl=`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/client-uploads/${up.storage_path.split('/').map(encodeURIComponent).join('/')}`;
          return<div key={`u-${up.id}`} style={{padding:"16px 18px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.gold}40`,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
              <span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:".08em",textTransform:"uppercase"}}>Upload</span>
              <span style={{fontSize:10,color:T.dim,fontFamily:T.mono,whiteSpace:"nowrap"}}>{new Date(up.created_at).toLocaleDateString()}</span>
            </div>
            <div style={{fontSize:13,fontWeight:600,color:T.cream,lineHeight:1.4,wordBreak:"break-all"}}>{up.file_name}</div>
            {up.file_size&&<div style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{(up.file_size/1024).toFixed(1)} KB · {up.content_type||'file'}</div>}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={()=>window.open(publicUrl,'_blank','noopener')} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",background:T.ink,color:T.paper,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans}}>Open</button>
              <a href={publicUrl} download={up.file_name} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans,textDecoration:"none"}}>Download</a>
            </div>
          </div>;
        })}
        {clientLinks.map(link=>{
          const provider=link.provider||'link';
          return<div key={link.id} style={{padding:"16px 18px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
              <span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:".08em",textTransform:"uppercase"}}>{providerLabel(provider)}</span>
              <span style={{fontSize:10,color:T.dim,fontFamily:T.mono,whiteSpace:"nowrap"}}>{new Date(link.added_at).toLocaleDateString()}</span>
            </div>
            {link.label&&<div style={{fontSize:13,fontWeight:600,color:T.cream,lineHeight:1.4}}>{link.label}</div>}
            <a href={link.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:T.cyan,wordBreak:"break-all",textDecoration:"underline",lineHeight:1.5}}>{link.url}</a>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={()=>window.open(link.url,'_blank','noopener')} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",background:T.ink,color:T.paper,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans}}>Open</button>
              <button onClick={()=>{navigator.clipboard?.writeText(link.url)}} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans}}>Copy URL</button>
            </div>
          </div>;
        })}
      </div>}
    </div>;
  }

  /* ══ TALENT WARDROBE detail view ══
     Structured-data section: a table of talent w/ sizes, addresses,
     purchase checkboxes. Not file-based, so it bypasses the asset
     pipeline entirely. */
  if(activeSection==='wardrobe'){
    return <WardrobeTable project={project} updateProject={updateProject} user={user} onBack={()=>setActiveSection(null)}/>;
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
          <button onClick={()=>setShowLinkInput(!showLinkInput)} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:T.rS,background:showLinkInput?T.inkSoft:T.cyan+"18",border:`1px solid ${showLinkInput?T.ink:T.cyan+"40"}`,color:showLinkInput?T.ink:T.cyan,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color="currentColor"/> Paste Link</button>
          <button onClick={()=>fileRef.current.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color={T.gold}/> Upload File</button>
        </div>
      </div>

      {showLinkInput&&<Card style={{padding:16,marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Paste a link — Google Docs / Sheets / Slides, Drive, Figma, Canva, Notion, Dropbox, Miro</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr auto",gap:8,alignItems:"flex-end"}}>
          <div><div style={{fontSize:9,color:T.dim,marginBottom:4}}>URL</div><input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://docs.google.com/document/d/... or any URL" onKeyDown={e=>e.key==="Enter"&&addLink(activeSection)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
          <div><div style={{fontSize:9,color:T.dim,marginBottom:4}}>Name</div><input value={linkName} onChange={e=>setLinkName(e.target.value)} placeholder="Mood Board v2" onKeyDown={e=>e.key==="Enter"&&addLink(activeSection)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
          <button onClick={()=>addLink(activeSection)} disabled={!linkUrl.trim()} style={{padding:"8px 16px",borderRadius:T.rS,background:linkUrl.trim()?T.goldSoft:T.inkSoft2,color:linkUrl.trim()?T.gold:T.fadedInk,border:`1px solid ${linkUrl.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:linkUrl.trim()?"pointer":"default",fontFamily:T.sans}}>Add</button>
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
              {a.isImage&&assetUrl(a)?<img src={assetUrl(a)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              :a.isFigma?<span style={{fontSize:10,fontWeight:800,color:T.ink,fontFamily:T.mono}}>FIG</span>
              :<span style={{fontSize:10,fontWeight:700,color:T.dim,fontFamily:T.mono}}>{(a.fileExt||"?").toUpperCase()}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
              <div style={{fontSize:10,color:T.dim,marginTop:2}}>{a.fileSize||a.fileName} · {a.dateAdded}</div>
            </div>
            {commentCount>0&&<span style={{fontSize:10,color:T.cyan,fontFamily:T.mono}}>{commentCount} comment{commentCount>1?"s":""}</span>}
            <Pill color={statusM.color} size="xs">{statusM.label}</Pill>
            {canEdit&&<select value={a.status||"draft"} onChange={e=>{e.stopPropagation();updateAsset(a.id,{status:e.target.value})}} onClick={e=>e.stopPropagation()} style={{padding:"3px 6px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.dim,fontSize:9,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none"}}>
              {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>}
            {canEdit&&<button onClick={e=>{e.stopPropagation();removeAsset(a.id)}} style={{background:"rgba(122,31,31,.06)",border:"1px solid rgba(122,31,31,.10)",borderRadius:T.rS,cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background="rgba(122,31,31,.18)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(122,31,31,.06)"}><TrashI size={11} color={T.neg}/></button>}
          </div>
        })}
      </Card>
      :<div onClick={()=>fileRef.current.click()} style={{textAlign:"center",padding:48,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=sec.color;e.currentTarget.style.background=`${sec.color}06`}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
        <div style={{fontSize:24,opacity:.2,marginBottom:8}}>{sec.icon}</div>
        <div style={{fontSize:14,fontWeight:600,color:T.cream,marginBottom:6}}>No files yet</div>
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
        // "From the Client" is sourced from client_asset_links rather
        // than project.creativeAssets, so the count uses the loaded
        // rows. It also doesn't accept file drops.
        const isClient=sec.id==='from-client';
        const isWardrobe=sec.id==='wardrobe';
        const sAssets=(isClient||isWardrobe)?[]:sectionAssets(sec.id);
        const count=isClient?(clientLinks.length+clientUploads.length):isWardrobe?wardrobeStats.total:sAssets.length;
        const review=(isClient||isWardrobe)?0:sAssets.filter(a=>a.status==="review").length;
        const approved=(isClient||isWardrobe)?0:sAssets.filter(a=>a.status==="approved").length;
        const noDrop=isClient||isWardrobe;
        return<div key={sec.id} onClick={()=>setActiveSection(sec.id)} style={cardStyle(sec.color)} onMouseEnter={cardHover} onMouseLeave={cardLeave}
          onDragEnter={e=>{if(noDrop)return;e.preventDefault();e.currentTarget.style.borderColor=sec.color;e.currentTarget.style.background=`${sec.color}08`}}
          onDragLeave={e=>{if(noDrop)return;e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surfEl}}
          onDragOver={e=>{if(!noDrop)e.preventDefault()}}
          onDrop={e=>{if(noDrop)return;e.preventDefault();e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surfEl;if(e.dataTransfer.files?.length)handleFiles(e.dataTransfer.files,sec.id)}}>
          <div style={{padding:"24px 26px"}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>{sec.label}</div>
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:10}}>
              <span className="num" style={{fontSize:32,fontWeight:700,color:sec.color,fontFamily:T.mono}}>{count}</span>
              <span style={{fontSize:12,color:T.dim}}>{isClient?(count===1?'item':'items'):isWardrobe?(count===1?'person':'people'):'files'}</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {review>0&&<Pill color="#F59E0B" size="xs">{review} in review</Pill>}
              {approved>0&&<Pill color={T.pos} size="xs">{approved} approved</Pill>}
              {isClient&&count>0&&<Pill color={T.gold} size="xs">From client</Pill>}
              {isWardrobe&&wardrobeStats.total>0&&<Pill color={T.ink} size="xs">{wardrobeStats.done}/{wardrobeStats.checks} items</Pill>}
              {count===0&&<span style={{fontSize:11,color:T.dim}}>{sec.desc}</span>}
            </div>
          </div>
        </div>
      })}
    </div>
  </div>;
}

export default CreativeV;
