import { useState, useEffect, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { isOverdue, getVendorName } from '../utils/calc.js';
import { DOC_TYPES, DOC_TYPE_COLORS } from '../constants/index.js';
import { mkDoc } from '../data/factories.js';
import { TrashI } from '../components/icons/index.js';
import { Card, Metric, DatePick, VendorSelect } from '../components/primitives/index.js';

function DocsV({project,updateProject,canEdit,vendors,onAddVendor,onVendorClick}){
  const docs=project.docs||[];
  const[showAdd,setShowAdd]=useState(false);const[filter,setFilter]=useState("all");
  const[nN,setNN2]=useState("");const[nTy,setNTy2]=useState("invoice");const[nAm,setNAm2]=useState("");const[nDu,setNDu]=useState("");
  const[nLnkCat,setNLnkCat]=useState("");const[nLnkItem,setNLnkItem]=useState("");const[nVId,setNVId]=useState("");
  const[dragging,setDragging]=useState(false);
  const[viewingDoc,setViewingDoc]=useState(null);
  const fileInputRef=useRef(null);
  const dragCounter=useRef(0);

  const autoDetectType=(fileName)=>{
    const n=fileName.toLowerCase();
    if(n.includes("invoice")||n.includes("inv"))return"invoice";
    if(n.includes("w9")||n.includes("w-9"))return"w9";
    if(n.includes("w2")||n.includes("w-2"))return"w2";
    if(n.includes("contract")||n.includes("agreement")||n.includes("sow")||n.includes("nda")||n.includes("msa"))return"contract";
    return"invoice";
  };

  const handleFiles=useCallback((files)=>{
    Array.from(files).forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const type=autoDetectType(file.name);
        const name=file.name.replace(/\.[^/.]+$/,"");
        const doc=mkDoc(name,type,"",0,"","pending","","","",ev.target.result);
        if(isOverdue(doc))doc.status="overdue";
        updateProject({docs:[...docs,doc]});
      };
      reader.readAsDataURL(file);
    });
  },[docs,updateProject]);

  const onDragEnter=useCallback((e)=>{e.preventDefault();e.stopPropagation();dragCounter.current++;setDragging(true)},[]);
  const onDragLeave=useCallback((e)=>{e.preventDefault();e.stopPropagation();dragCounter.current--;if(dragCounter.current===0)setDragging(false)},[]);
  const onDragOver=useCallback((e)=>{e.preventDefault();e.stopPropagation()},[]);
  const onDrop=useCallback((e)=>{e.preventDefault();e.stopPropagation();setDragging(false);dragCounter.current=0;if(e.dataTransfer.files?.length)handleFiles(e.dataTransfer.files)},[handleFiles]);
  useEffect(()=>{const u=docs.map(d=>isOverdue(d)&&d.status==="pending"?{...d,status:"overdue"}:d);if(JSON.stringify(u)!==JSON.stringify(docs))updateProject({docs:u})},[]);
  const filtered=filter==="all"?docs:docs.filter(d=>d.type===filter||d.status===filter);
  const overdueCount=docs.filter(d=>d.status==="overdue").length;
  const pendingTotal=docs.filter(d=>d.status!=="paid").reduce((a,d)=>a+d.amount,0);
  const paidTotal=docs.filter(d=>d.status==="paid").reduce((a,d)=>a+d.amount,0);
  const addDoc=()=>{if(!nN.trim())return;const doc=mkDoc(nN.trim(),nTy,nVId,parseFloat(nAm)||0,nDu,"pending",nLnkCat,nLnkItem);if(isOverdue(doc))doc.status="overdue";updateProject({docs:[...docs,doc]});setNN2("");setNTy2("invoice");setNVId("");setNAm2("");setNDu("");setNLnkCat("");setNLnkItem("");setShowAdd(false)};
  const removeDoc=id=>updateProject({docs:docs.filter(d=>d.id!==id)});
  const markPaid=id=>updateProject({docs:docs.map(d=>d.id===id?{...d,status:"paid",paidAmount:d.amount}:d)});
  return<div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop} style={{position:"relative",minHeight:"50vh"}}>
    <input ref={fileInputRef} type="file" multiple accept="*" onChange={e=>{if(e.target.files?.length)handleFiles(e.target.files);e.target.value=""}} style={{display:"none"}}/>
    {dragging&&<div style={{position:"absolute",inset:0,zIndex:100,background:"rgba(8,8,12,.85)",backdropFilter:"blur(8px)",borderRadius:T.r,border:`3px dashed ${T.gold}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:40,opacity:.6}}>▧</div>
      <div style={{fontSize:18,fontWeight:600,color:T.gold}}>Drop files here</div>
      <div style={{fontSize:12,color:T.dim}}>Invoices, contracts, W-9s, and more</div>
    </div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:20,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>Documents</h1><p style={{fontSize:13,color:T.dim,marginTop:6}}>{docs.length} documents{overdueCount>0?<span style={{color:T.neg,fontWeight:600}}> · {overdueCount} overdue</span>:""}</p></div>
      <div style={{display:"flex",gap:8}}>
        {canEdit&&<button onClick={()=>fileInputRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:"transparent",color:T.dim,border:`1px solid ${T.border}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}>Upload Files</button>}
        {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showAdd?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showAdd?T.dim:T.brown,border:showAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Add Document"}</button>}
      </div>
    </div>
    <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
      <Metric label="Total Documents" value={docs.length}/><Metric label="Outstanding" value={f0(pendingTotal)} color={T.gold}/><Metric label="Paid" value={f0(paidTotal)} color={T.pos}/><Metric label="Overdue" value={overdueCount} color={overdueCount>0?T.neg:T.dim} glow={overdueCount>0}/>
    </div>
    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"flex",gap:6,marginBottom:14}}>{DOC_TYPES.map(t=><button key={t} onClick={()=>setNTy2(t)} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:nTy===t?600:400,fontFamily:T.sans,background:nTy===t?`${DOC_TYPE_COLORS[t]}22`:"transparent",color:nTy===t?DOC_TYPE_COLORS[t]:T.dim,textTransform:"capitalize"}}>{t==="w9"?"W-9":t==="w2"?"W-2":t}</button>)}</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Name</label><input value={nN} onChange={e=>setNN2(e.target.value)} placeholder="Invoice #1042" onKeyDown={e=>e.key==="Enter"&&addDoc()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Vendor</label><VendorSelect value={nVId} onChange={setNVId} vendors={project.vendors} onAddVendor={v=>{updateProject({vendors:[...(project.vendors||[]),v]})}} compact/></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Amount</label><input value={nAm} onChange={e=>setNAm2(e.target.value)} placeholder="15000" onKeyDown={e=>e.key==="Enter"&&addDoc()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Link to Budget Category</label>
          <select value={nLnkCat} onChange={e=>{setNLnkCat(e.target.value);setNLnkItem("")}} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:nLnkCat?T.cream:T.dim,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
            <option value="">None</option>
            {(project.cats||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Line Item</label>
          <select value={nLnkItem} onChange={e=>setNLnkItem(e.target.value)} disabled={!nLnkCat} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:nLnkItem?T.cream:T.dim,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:nLnkCat?"pointer":"default"}}>
            <option value="">None</option>
            {nLnkCat&&(project.cats.find(c=>c.id===nLnkCat)?.items||[]).map(it=><option key={it.id} value={it.id}>{it.name}</option>)}
          </select></div>
      </div>
      <div style={{marginBottom:12,maxWidth:260}}><DatePick label="Due Date" value={nDu} onChange={setNDu} compact/></div>
      <button onClick={addDoc} style={{padding:"9px 20px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Document</button>
    </Card>}
    <div style={{display:"flex",gap:4,marginBottom:16}}>
      {["all","invoice","w9","w2","contract","overdue"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{padding:"7px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:filter===f?600:400,fontFamily:T.sans,background:filter===f?T.goldSoft:"transparent",color:filter===f?T.gold:T.dim,textTransform:"capitalize"}}>{f==="all"?"All":f==="w9"?"W-9":f==="w2"?"W-2":f}</button>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {filtered.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",background:d.status==="overdue"?"rgba(122,31,31,.06)":T.surfEl,borderRadius:T.rS,border:`1px solid ${d.status==="overdue"?"rgba(122,31,31,.18)":T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=d.status==="overdue"?"rgba(122,31,31,.06)":T.surfEl}>
        <span style={{fontSize:10,fontWeight:700,color:DOC_TYPE_COLORS[d.type],textTransform:"uppercase",letterSpacing:".08em",width:60}}>{d.type==="w9"?"W-9":d.type==="w2"?"W-2":d.type}</span>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.cream}}>{d.name}</div><div style={{fontSize:11,color:T.dim,marginTop:2}}>{getVendorName(d.vendorId,project.vendors)||"No vendor"}{d.dueDate?` · Due: ${d.dueDate}`:""}{d.linkedItemId?` · Linked: ${(()=>{const cat=project.cats.find(c=>c.id===d.linkedCatId);const item=cat?.items.find(i=>i.id===d.linkedItemId);return item?`${cat.name} → ${item.name}`:""})()||""}`:""}</div></div>
        <button onClick={()=>setViewingDoc(d)} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,flexShrink:0}}>{d.fileData?"View":"Details"}</button>
        {d.amount>0&&<span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:600,color:T.cream,flexShrink:0}}>{f$(d.amount)}</span>}
        <span style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:10,textTransform:"uppercase",flexShrink:0,background:d.status==="paid"?"rgba(52,211,153,.1)":d.status==="overdue"?"rgba(122,31,31,.10)":"rgba(255,234,151,.06)",color:d.status==="paid"?T.pos:d.status==="overdue"?T.neg:T.gold}}>{d.status}</span>
        {canEdit&&d.status!=="paid"&&<button onClick={()=>markPaid(d.id)} style={{fontSize:10,padding:"5px 10px",borderRadius:T.rS,border:`1px solid ${T.pos}`,background:"transparent",color:T.pos,cursor:"pointer",fontFamily:T.sans,fontWeight:600,flexShrink:0}}>Mark Paid</button>}
        {canEdit&&<button title="Delete document" onClick={()=>removeDoc(d.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
      </div>)}
      {filtered.length===0&&<div onClick={()=>canEdit&&fileInputRef.current?.click()} style={{textAlign:"center",padding:60,color:T.dim,fontSize:13,cursor:canEdit?"pointer":"default",border:`2px dashed ${T.border}`,borderRadius:T.r,transition:"all .2s"}} onMouseEnter={e=>{if(canEdit){e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
        <div style={{fontSize:32,opacity:.2,marginBottom:8}}>▧</div>
        <div style={{fontSize:13,color:T.dim,marginBottom:4}}>{filter!=="all"?"No documents match this filter":"No documents yet"}</div>
        {canEdit&&<div style={{fontSize:11,color:T.dim,opacity:.6}}>Drag & drop files here or click to upload</div>}
      </div>}
    </div>
    {viewingDoc&&<div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)"}} onClick={()=>setViewingDoc(null)}>
      <div className="slide-in" onClick={e=>e.stopPropagation()} style={{width:"90vw",maxWidth:900,height:"85vh",borderRadius:T.r,background:T.bg,border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(15,82,186,.14)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div><div style={{fontSize:14,fontWeight:600,color:T.cream}}>{viewingDoc.name}</div><div style={{fontSize:10,color:T.dim,marginTop:2}}>{viewingDoc.type==="w9"?"W-9":viewingDoc.type==="w2"?"W-2":viewingDoc.type}{viewingDoc.dueDate?` · Due: ${viewingDoc.dueDate}`:""}{viewingDoc.amount?` · ${f$(viewingDoc.amount)}`:""}</div></div>
          <div style={{display:"flex",gap:8}}>{viewingDoc.fileData&&<a href={viewingDoc.fileData} download={viewingDoc.name||"document"} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none"}}>Download</a>}<button onClick={()=>setViewingDoc(null)} aria-label="Close" style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4}}>×</button></div>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:"#111"}}>
          {viewingDoc.fileData?.startsWith("data:image")?<img src={viewingDoc.fileData} alt={viewingDoc.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
          :viewingDoc.fileData?.startsWith("data:application/pdf")||viewingDoc.fileName?.endsWith(".pdf")?<iframe src={viewingDoc.fileData} style={{width:"100%",height:"100%",border:"none"}} title={viewingDoc.name}/>
          :viewingDoc.fileData?<div style={{textAlign:"center",padding:40}}><div style={{fontSize:48,opacity:.2,marginBottom:16}}>▧</div><div style={{fontSize:14,color:T.cream,marginBottom:8}}>{viewingDoc.name}</div><p style={{fontSize:12,color:T.dim,marginBottom:16}}>Preview not available</p><a href={viewingDoc.fileData} download={viewingDoc.name||"document"} style={{padding:"10px 24px",borderRadius:T.rS,background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,fontSize:13,fontWeight:700,textDecoration:"none"}}>Download</a></div>
          :<div style={{textAlign:"center",padding:40,color:T.dim}}>No file attached to this document</div>}
        </div>
      </div>
    </div>}
  </div>;
}

export default DocsV;
