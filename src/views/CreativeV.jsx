import { useState, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { TrashI } from '../components/icons/index.js';
import { Card } from '../components/primitives/index.js';

const CATS=[
  {id:"floorplan",label:"Floor Plans",color:"#6366F1"},
  {id:"rendering",label:"Renderings",color:"#14B8A6"},
  {id:"moodboard",label:"Mood Boards",color:"#EC4899"},
  {id:"signage",label:"Signage",color:"#F59E0B"},
  {id:"collateral",label:"Collateral",color:"#8B5CF6"},
  {id:"social",label:"Social",color:"#06B6D4"},
  {id:"video",label:"Video",color:"#F47264"},
  {id:"print",label:"Print-Ready",color:"#10B981"},
  {id:"other",label:"Other",color:T.dim},
];

const Pill=({children,color=T.gold,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

const autoCategory=(fileName)=>{
  const n=fileName.toLowerCase();
  if(n.includes("floor")||n.includes("plan")||n.includes("layout")||n.includes("cad"))return"floorplan";
  if(n.includes("render")||n.includes("3d")||n.includes("visual"))return"rendering";
  if(n.includes("mood")||n.includes("board")||n.includes("inspo")||n.includes("reference"))return"moodboard";
  if(n.includes("sign")||n.includes("banner")||n.includes("wayfind"))return"signage";
  if(n.includes("collateral")||n.includes("brochure")||n.includes("pamphlet"))return"collateral";
  if(n.includes("social")||n.includes("instagram")||n.includes("story")||n.includes("reel")||n.includes("tiktok"))return"social";
  if(n.includes("video")||n.includes("edit")||n.includes("cut")||n.includes(".mp4")||n.includes(".mov"))return"video";
  if(n.includes("print")||n.includes("artwork")||n.includes("bleed")||n.includes("cmyk"))return"print";
  return"other";
};

function CreativeV({project,updateProject,canEdit}){
  const assets=project.creativeAssets||[];
  const[filter,setFilter]=useState("all");
  const[viewMode,setViewMode]=useState("grid");
  const[dragging,setDragging]=useState(false);
  const[viewing,setViewing]=useState(null);
  const[editingAsset,setEditingAsset]=useState(null);
  const[editName,setEditName]=useState("");
  const[editCat,setEditCat]=useState("");
  const[editNotes,setEditNotes]=useState("");
  const[editClientVisible,setEditClientVisible]=useState(false);
  const fileRef=useRef(null);
  const dragCounter=useRef(0);

  const[statusFilter,setStatusFilter]=useState("all");
  const STATUS_META={draft:{label:"Draft",color:T.dim},review:{label:"In Review",color:"#F59E0B"},approved:{label:"Approved",color:T.pos},sent:{label:"Sent to Client",color:T.cyan}};
  const preFiltered=filter==="all"?assets:assets.filter(a=>a.category===filter);
  const filtered=statusFilter==="all"?preFiltered:preFiltered.filter(a=>(a.status||"draft")===statusFilter);
  const catCounts=CATS.reduce((a,c)=>{a[c.id]=assets.filter(f=>f.category===c.id).length;return a},{});

  const handleFiles=useCallback((files)=>{
    const newAssets=[];
    Array.from(files).forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const cat=autoCategory(file.name);
        const isImage=file.type.startsWith("image/");
        const isVideo=file.type.startsWith("video/");
        const isPdf=file.type==="application/pdf";
        newAssets.push({
          id:uid(),name:file.name.replace(/\.[^/.]+$/,""),fileName:file.name,
          category:cat,fileData:ev.target.result,
          isImage,isVideo,isPdf,
          notes:"",clientVisible:false,status:"draft",
          dateAdded:new Date().toLocaleDateString(),
          versions:[{id:uid(),fileName:file.name,fileData:ev.target.result,date:new Date().toLocaleDateString()}],
        });
        if(newAssets.length===files.length){
          updateProject({creativeAssets:[...assets,...newAssets]});
        }
      };
      reader.readAsDataURL(file);
    });
  },[assets,updateProject]);

  const removeAsset=id=>updateProject({creativeAssets:assets.filter(a=>a.id!==id)});
  const updateAsset=(id,updates)=>updateProject({creativeAssets:assets.map(a=>a.id===id?{...a,...updates}:a)});
  const toggleClientVisible=id=>updateAsset(id,{clientVisible:!assets.find(a=>a.id===id)?.clientVisible});

  const openEdit=(a)=>{setEditingAsset(a.id);setEditName(a.name);setEditCat(a.category);setEditNotes(a.notes||"");setEditClientVisible(a.clientVisible||false)};
  const saveEdit=()=>{if(!editingAsset)return;updateAsset(editingAsset,{name:editName,category:editCat,notes:editNotes,clientVisible:editClientVisible});setEditingAsset(null)};

  // Upload new version
  const uploadVersion=(assetId,file)=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      const asset=assets.find(a=>a.id===assetId);if(!asset)return;
      const newVersion={id:uid(),fileName:file.name,fileData:ev.target.result,date:new Date().toLocaleDateString()};
      updateAsset(assetId,{fileData:ev.target.result,fileName:file.name,versions:[...(asset.versions||[]),newVersion]});
    };
    reader.readAsDataURL(file);
  };

  const onDragEnter=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current++;setDragging(true)},[]);
  const onDragLeave=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current--;if(dragCounter.current===0)setDragging(false)},[]);
  const onDragOver=useCallback(e=>{e.preventDefault();e.stopPropagation()},[]);
  const onDrop=useCallback(e=>{e.preventDefault();e.stopPropagation();setDragging(false);dragCounter.current=0;if(e.dataTransfer.files?.length)handleFiles(e.dataTransfer.files)},[handleFiles]);

  const catColor=(cat)=>(CATS.find(c=>c.id===cat)||CATS[CATS.length-1]).color;
  const catLabel=(cat)=>(CATS.find(c=>c.id===cat)||CATS[CATS.length-1]).label;

  return<div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop} style={{position:"relative",minHeight:"50vh"}}>
    <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.psd,.ai,.fig,.sketch,.indd,.svg" onChange={e=>{if(e.target.files?.length)handleFiles(e.target.files);e.target.value=""}} style={{display:"none"}}/>

    {/* Drag overlay */}
    {dragging&&<div style={{position:"absolute",inset:0,zIndex:100,background:"rgba(8,8,12,.85)",backdropFilter:"blur(8px)",borderRadius:T.r,border:`3px dashed ${T.magenta}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:40,opacity:.6}}>&#9733;</div>
      <div style={{fontSize:18,fontWeight:600,color:T.magenta}}>Drop creative assets</div>
      <div style={{fontSize:12,color:T.dim}}>Images, videos, PDFs, design files</div>
    </div>}

    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
      <div>
        <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em"}}>Creative</h1>
        <p style={{fontSize:12,color:T.dim,marginTop:4}}>{assets.length} asset{assets.length!==1?"s":""}</p>
      </div>
      {canEdit&&<button onClick={()=>fileRef.current?.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>+ Upload</button>}
    </div>

    {/* Category filters */}
    <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={()=>setFilter("all")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:filter==="all"?600:400,fontFamily:T.sans,background:filter==="all"?T.goldSoft:"transparent",color:filter==="all"?T.gold:T.dim}}>All ({assets.length})</button>
      {CATS.map(c=>catCounts[c.id]>0&&<button key={c.id} onClick={()=>setFilter(c.id)} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:filter===c.id?600:400,fontFamily:T.sans,background:filter===c.id?`${c.color}18`:"transparent",color:filter===c.id?c.color:T.dim}}>{c.label} ({catCounts[c.id]})</button>)}
      <span style={{width:1,height:16,background:T.border,margin:"0 4px",alignSelf:"center"}}/>
      {Object.entries(STATUS_META).map(([k,v])=><button key={k} onClick={()=>setStatusFilter(statusFilter===k?"all":k)} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:statusFilter===k?600:400,fontFamily:T.sans,background:statusFilter===k?`${v.color}18`:"transparent",color:statusFilter===k?v.color:T.dim}}>{v.label}</button>)}
    </div>

    {/* Asset cards — large format like Client section */}
    {filtered.length>0?
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {filtered.map(a=>{const cc=catColor(a.category);const sm=STATUS_META[a.status||"draft"];
          return<div key={a.id} style={{borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${cc}`,overflow:"hidden",cursor:"pointer",transition:"all .2s",background:T.surfEl}} onClick={()=>setViewing(a)} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=T.shadow}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
            {/* Large thumbnail */}
            <div style={{height:200,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
              {a.isImage&&a.fileData?<img src={a.fileData} alt={a.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              :a.isVideo?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><div style={{width:48,height:48,borderRadius:"50%",background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:20,color:T.cream,marginLeft:3}}>&#9654;</span></div><span style={{fontSize:10,color:T.dim}}>{a.fileName}</span></div>
              :a.isPdf?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><div style={{fontSize:28,fontWeight:800,color:T.dim,opacity:.2}}>PDF</div><span style={{fontSize:10,color:T.dim}}>{a.fileName}</span></div>
              :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><div style={{fontSize:28,color:T.dim,opacity:.15}}>&#9634;</div><span style={{fontSize:10,color:T.dim}}>{a.fileName}</span></div>}
              {/* Status + category overlay */}
              <div style={{position:"absolute",top:10,right:10,display:"flex",gap:4}}>
                {a.status&&a.status!=="draft"&&<Pill color={sm?.color||T.dim} size="xs">{sm?.label||"Draft"}</Pill>}
              </div>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px",background:"linear-gradient(transparent,rgba(0,0,0,.75))",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <Pill color={cc} size="xs">{catLabel(a.category)}</Pill>
                {a.versions?.length>1&&<span style={{fontSize:9,color:"rgba(255,255,255,.5)",fontFamily:T.mono}}>v{a.versions.length}</span>}
              </div>
            </div>
            {/* Info */}
            <div style={{padding:"16px 18px"}}>
              <div style={{fontSize:14,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{a.name}</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:10,color:T.dim}}>{a.dateAdded}</span>
                {a.notes&&<span style={{fontSize:10,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>· {a.notes}</span>}
              </div>
            </div>
          </div>})}
      </div>

    :<div onClick={()=>canEdit&&fileRef.current?.click()} style={{textAlign:"center",padding:60,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:canEdit?"pointer":"default"}} onMouseEnter={e=>{if(canEdit){e.currentTarget.style.borderColor=T.magenta;e.currentTarget.style.background=`rgba(236,72,153,.03)`}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
      <div style={{fontSize:40,opacity:.15,marginBottom:12}}>&#9733;</div>
      <div style={{fontSize:15,fontWeight:500,color:T.cream,marginBottom:6}}>No creative assets yet</div>
      <p style={{fontSize:12,color:T.dim}}>Upload floor plans, renderings, mood boards, signage, video, and more.</p>
      {canEdit&&<p style={{fontSize:11,color:T.dim,marginTop:8,opacity:.6}}>Drag & drop files or click to upload</p>}
    </div>}

    {/* Asset viewer/editor modal */}
    {viewing&&<div style={{position:"fixed",inset:0,zIndex:200,display:"flex",background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)"}} onClick={()=>{setViewing(null);setEditingAsset(null)}}>
      <div className="slide-in" onClick={e=>e.stopPropagation()} style={{display:"flex",flex:1,maxWidth:1100,margin:"auto",height:"90vh",borderRadius:T.r,overflow:"hidden",background:"rgba(12,10,20,.95)",border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
        {/* Preview */}
        <div style={{flex:1,background:"#0A0A0C",display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto"}}>
          {viewing.isImage&&viewing.fileData?<img src={viewing.fileData} alt={viewing.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
          :viewing.isPdf&&viewing.fileData?<iframe src={viewing.fileData} style={{width:"100%",height:"100%",border:"none"}} title={viewing.name}/>
          :viewing.isVideo&&viewing.fileData?<video src={viewing.fileData} controls style={{maxWidth:"100%",maxHeight:"100%"}}/>
          :<div style={{textAlign:"center",padding:40}}><div style={{fontSize:48,opacity:.15,marginBottom:16}}>&#9634;</div><div style={{fontSize:14,color:T.cream}}>{viewing.name}</div><p style={{fontSize:12,color:T.dim,marginTop:8}}>Preview not available</p></div>}
        </div>
        {/* Side panel */}
        <div style={{width:300,borderLeft:`1px solid ${T.border}`,padding:24,overflow:"auto",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              {editingAsset===viewing.id?<input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} style={{width:"100%",background:"transparent",border:"none",borderBottom:`1px solid ${T.cyan}`,color:T.cream,fontSize:16,fontWeight:600,fontFamily:T.sans,outline:"none",padding:"2px 0",marginBottom:4}}/>
              :<div style={{fontSize:16,fontWeight:600,color:T.cream,marginBottom:4}}>{viewing.name}</div>}
              <Pill color={catColor(editingAsset===viewing.id?editCat:viewing.category)} size="xs">{catLabel(editingAsset===viewing.id?editCat:viewing.category)}</Pill>
            </div>
            <button onClick={()=>{setViewing(null);setEditingAsset(null)}} style={{background:"none",border:"none",color:T.dim,fontSize:18,cursor:"pointer"}}>×</button>
          </div>

          {editingAsset===viewing.id?<>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>Category</div>
              <select value={editCat} onChange={e=>setEditCat(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",cursor:"pointer"}}>
                {CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>Notes</div>
              <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="Add notes..." rows={3} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <button onClick={()=>setEditClientVisible(!editClientVisible)} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:editClientVisible?600:400,background:editClientVisible?"rgba(6,182,212,.12)":"rgba(255,255,255,.04)",color:editClientVisible?T.cyan:T.dim}}>{editClientVisible?"Client Visible":"Make Client Visible"}</button>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={saveEdit} style={{padding:"7px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Save</button>
              <button onClick={()=>setEditingAsset(null)} style={{padding:"7px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
            </div>
          </>:<>
            <div style={{fontSize:10,color:T.dim,marginBottom:16,lineHeight:1.5}}>
              <div>{viewing.fileName}</div>
              <div style={{marginTop:4}}>Added {viewing.dateAdded}</div>
              {viewing.notes&&<div style={{marginTop:8,padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.dimH}}>{viewing.notes}</div>}
            </div>
            {/* Versions */}
            {viewing.versions?.length>1&&<div style={{marginBottom:16}}>
              <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Versions ({viewing.versions.length})</div>
              {viewing.versions.map((v,i)=><div key={v.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:10,color:i===viewing.versions.length-1?T.cream:T.dim}}>v{i+1} — {v.date}</span>
                {i===viewing.versions.length-1&&<Pill color={T.pos} size="xs">Current</Pill>}
              </div>)}
            </div>}
            {/* Approval status */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Status</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {Object.entries(STATUS_META).map(([k,v])=><button key={k} onClick={()=>{updateAsset(viewing.id,{status:k,clientVisible:k==="approved"||k==="sent"});setViewing({...viewing,status:k,clientVisible:k==="approved"||k==="sent"})}} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:9,fontWeight:(viewing.status||"draft")===k?700:400,background:(viewing.status||"draft")===k?`${v.color}22`:"rgba(255,255,255,.03)",color:(viewing.status||"draft")===k?v.color:T.dim,fontFamily:T.sans}}>{v.label}</button>)}
              </div>
              <div style={{fontSize:9,color:T.dim,marginTop:6}}>
                {(viewing.status==="approved"||viewing.status==="sent")?"This asset is visible in the Client section.":"Approve to make visible to clients."}
              </div>
            </div>

            <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:6}}>
              {canEdit&&<button onClick={()=>openEdit(viewing)} style={{width:"100%",padding:"8px 0",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:T.sans}}>Edit Details</button>}
              {canEdit&&<label style={{width:"100%",padding:"8px 0",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:T.sans,textAlign:"center",display:"block"}}>
                Upload New Version
                <input type="file" style={{display:"none"}} onChange={e=>{if(e.target.files?.[0]){uploadVersion(viewing.id,e.target.files[0]);e.target.value=""}}}/>
              </label>}
              {viewing.fileData&&<a href={viewing.fileData} download={viewing.fileName||viewing.name} style={{width:"100%",padding:"8px 0",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:11,fontWeight:500,textDecoration:"none",textAlign:"center",display:"block"}}>Download</a>}
              {canEdit&&<button onClick={()=>{removeAsset(viewing.id);setViewing(null)}} style={{width:"100%",padding:"8px 0",borderRadius:T.rS,border:`1px solid rgba(248,113,113,.2)`,background:"transparent",color:T.neg,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:T.sans}}>Delete</button>}
            </div>
          </>}
        </div>
      </div>
    </div>}
  </div>;
}

export default CreativeV;
