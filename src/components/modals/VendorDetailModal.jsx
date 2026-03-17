import { useState, useRef, useCallback } from 'react';
import T from '../../theme/tokens.js';
import { f$, f0 } from '../../utils/format.js';
import { getPayStatus } from '../../utils/calc.js';
import { uid } from '../../utils/uid.js';
import { VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, VENDOR_TYPES, W9_COLORS, PAYMENT_COLORS, PAYMENT_LABELS, DOC_TYPE_COLORS, INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../../constants/index.js';
import { TrashI } from '../icons/index.js';
import { Card, DatePick } from '../primitives/index.js';

const VENDOR_DOC_TYPES = ["invoice","contract","estimate","coi","w9","license","permit","other"];
const VENDOR_DOC_LABELS = {invoice:"Invoice",contract:"Contract",estimate:"Estimate",coi:"Certificate of Insurance",w9:"W-9",license:"License",permit:"Permit",other:"Other"};
const VENDOR_DOC_COLORS = {invoice:"#FFEA97",contract:"#93C5FD",estimate:"#6EE7B7",coi:"#67E8F9",w9:"#D8B4FE",license:"#FB923C",permit:"#FBBF24",other:"rgba(250,250,249,.5)"};

function VendorDetailModal({vendorId,project,onClose,canEdit,updateProject}){
  const v=(project.vendors||[]).find(v=>v.id===vendorId);
  if(!v)return null;

  const[tab,setTab]=useState("overview");
  const[showUpload,setShowUpload]=useState(false);
  const[docName,setDocName]=useState("");
  const[docType,setDocType]=useState("invoice");
  const[docNotes,setDocNotes]=useState("");
  const[docFile,setDocFile]=useState(null);
  const[docFileName,setDocFileName]=useState("");
  const[docExpiry,setDocExpiry]=useState("");
  const[editing,setEditing]=useState(false);
  const[editName,setEditName]=useState(v.name);
  const[editEmail,setEditEmail]=useState(v.email||"");
  const[editPhone,setEditPhone]=useState(v.phone||"");
  const[editNotes,setEditNotes]=useState(v.notes||"");
  const fileRef=useRef(null);
  const[draggingDoc,setDraggingDoc]=useState(false);
  const dragCounter=useRef(0);
  const[viewingDoc,setViewingDoc]=useState(null);

  const autoDetectDocType=(fileName)=>{const n=fileName.toLowerCase();if(n.includes("invoice")||n.includes("inv"))return"invoice";if(n.includes("contract")||n.includes("agreement")||n.includes("sow"))return"contract";if(n.includes("estimate")||n.includes("quote"))return"estimate";if(n.includes("coi")||n.includes("insurance")||n.includes("certificate"))return"coi";if(n.includes("w9")||n.includes("w-9"))return"w9";if(n.includes("license"))return"license";if(n.includes("permit"))return"permit";return"invoice"};

  const handleDropFiles=useCallback((files)=>{
    Array.from(files).forEach(file=>{const reader=new FileReader();reader.onload=ev=>{
      const type=autoDetectDocType(file.name);const name=file.name.replace(/\.[^/.]+$/,"");
      const doc={id:uid(),name,type,notes:"",fileName:file.name,fileData:ev.target.result,expiryDate:"",dateAdded:new Date().toLocaleDateString()};
      const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:[...(vendor.documents||[]),doc]}:vendor);
      updateProject({vendors:updatedVendors});
    };reader.readAsDataURL(file)});
  },[project.vendors,vendorId,updateProject]);

  const onDocDragEnter=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current++;setDraggingDoc(true)},[]);
  const onDocDragLeave=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current--;if(dragCounter.current===0)setDraggingDoc(false)},[]);
  const onDocDragOver=useCallback(e=>{e.preventDefault();e.stopPropagation()},[]);
  const onDocDrop=useCallback(e=>{e.preventDefault();e.stopPropagation();setDraggingDoc(false);dragCounter.current=0;if(e.dataTransfer.files?.length)handleDropFiles(e.dataTransfer.files)},[handleDropFiles]);

  const vendorDocs=(v.documents||[]);
  const projectDocs=(project.docs||[]).filter(d=>d.vendorId===vendorId);
  const txns=(project.txns||[]).filter(t=>t.vendorId===vendorId);
  const invoices=projectDocs.filter(d=>d.type==="invoice");
  const otherProjectDocs=projectDocs.filter(d=>d.type!=="invoice");
  const totalInvoiced=invoices.reduce((a,d)=>a+d.amount,0);
  const totalPaid=invoices.reduce((a,d)=>a+(d.paidAmount||0),0);
  const outstanding=totalInvoiced-totalPaid;
  const budgetItems=[];
  (project.cats||[]).forEach(c=>c.items.forEach(it=>{if(it.vendorId===vendorId)budgetItems.push({...it,catName:c.name})}));
  const totalContracted=budgetItems.reduce((a,it)=>a+it.actualCost,0);

  const handleFile=(e)=>{const file=e.target.files[0];if(!file)return;setDocFileName(file.name);if(!docName)setDocName(file.name.replace(/\.[^/.]+$/,""));const reader=new FileReader();reader.onload=ev=>setDocFile(ev.target.result);reader.readAsDataURL(file)};

  const addVendorDoc=()=>{
    if(!docName.trim())return;
    const doc={id:uid(),name:docName.trim(),type:docType,notes:docNotes,fileName:docFileName,fileData:docFile,expiryDate:docExpiry,dateAdded:new Date().toLocaleDateString()};
    const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:[...(vendor.documents||[]),doc]}:vendor);
    updateProject({vendors:updatedVendors});
    setDocName("");setDocType("w9");setDocNotes("");setDocFile(null);setDocFileName("");setDocExpiry("");setShowUpload(false);
  };

  const removeVendorDoc=(docId)=>{
    const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:(vendor.documents||[]).filter(d=>d.id!==docId)}:vendor);
    updateProject({vendors:updatedVendors});
  };

  const saveEdit=()=>{
    const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,name:editName.trim()||v.name,email:editEmail,phone:editPhone,notes:editNotes}:vendor);
    updateProject({vendors:updatedVendors});
    setEditing(false);
  };

  const cycleW9=()=>{
    const order=["pending","received","approved"];
    const next=order[(order.indexOf(v.w9Status)+1)%3];
    const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,w9Status:next}:vendor);
    updateProject({vendors:updatedVendors});
  };

  return<div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={onClose}>
    <div className="slide-in modal-inner" onClick={e=>e.stopPropagation()} style={{width:680,maxHeight:"90vh",overflow:"auto",padding:0,borderRadius:T.r,background:"rgba(12,10,20,.95)",border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>

      {/* Header */}
      <div style={{padding:"28px 36px 20px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            {editing?<div style={{marginBottom:12}}>
              <input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.cyan}`,color:T.cream,fontSize:20,fontWeight:600,fontFamily:T.sans,outline:"none",marginBottom:8}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <input value={editEmail} onChange={e=>setEditEmail(e.target.value)} placeholder="Email" style={{padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
                <input value={editPhone} onChange={e=>setEditPhone(e.target.value)} placeholder="Phone" style={{padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
              </div>
              <input value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="Notes" style={{width:"100%",marginTop:8,padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <button onClick={saveEdit} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Save</button>
                <button onClick={()=>setEditing(false)} style={{padding:"6px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
              </div>
            </div>:<div>
              <h2 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>{v.name}</h2>
              <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${VENDOR_TYPE_COLORS[v.vendorType||"other"]}18`,color:VENDOR_TYPE_COLORS[v.vendorType||"other"]}}>{VENDOR_TYPE_LABELS[v.vendorType||"other"]}</span>
                {v.email&&<span style={{fontSize:11,color:T.dim}}>{v.email}</span>}
                {v.phone&&<span style={{fontSize:11,color:T.dim}}>{v.phone}</span>}
                <button onClick={cycleW9} style={{background:"none",border:"none",cursor:canEdit?"pointer":"default",padding:0}}><span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${W9_COLORS[v.w9Status]}18`,color:W9_COLORS[v.w9Status],textTransform:"uppercase"}}>W-9: {v.w9Status}</span></button>
                {canEdit&&<button onClick={()=>setEditing(true)} style={{fontSize:10,color:T.dim,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Edit</button>}
              </div>
              {v.notes&&<p style={{fontSize:11,color:T.dim,marginTop:6,fontFamily:T.serif,fontStyle:"italic"}}>{v.notes}</p>}
            </div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4,lineHeight:1}}>×</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,borderBottom:`1px solid ${T.border}`}}>
        {[["overview","Overview"],["documents","Documents"],["financials","Financials"]].map(([id,label])=>
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"12px 0",background:"none",border:"none",borderBottom:tab===id?`2px solid ${T.gold}`:"2px solid transparent",cursor:"pointer",fontSize:11,fontWeight:tab===id?600:400,color:tab===id?T.gold:T.dim,fontFamily:T.sans,transition:"all .15s"}}>{label}{id==="documents"&&vendorDocs.length>0?` (${vendorDocs.length})`:""}</button>
        )}
      </div>

      <div style={{padding:"24px 36px 36px"}}>

        {/* Overview Tab */}
        {tab==="overview"&&<div>
          <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:24}}>
            <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Contracted</div><div className="num" style={{fontSize:18,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{f0(totalContracted)}</div></div>
            <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Invoiced</div><div className="num" style={{fontSize:18,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(totalInvoiced)}</div></div>
            <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Paid</div><div className="num" style={{fontSize:18,fontWeight:700,color:T.pos,fontFamily:T.mono}}>{f0(totalPaid)}</div></div>
            <div style={{padding:"14px 16px",borderRadius:T.rS,background:outstanding>0?"rgba(248,113,113,.04)":T.surfEl,border:`1px solid ${outstanding>0?"rgba(248,113,113,.15)":T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Outstanding</div><div className="num" style={{fontSize:18,fontWeight:700,color:outstanding>0?T.neg:T.dim,fontFamily:T.mono}}>{f0(outstanding)}</div></div>
          </div>
          {budgetItems.length>0&&<div style={{marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:600,color:T.cream,marginBottom:10}}>Budget Items ({budgetItems.length})</div>
            {budgetItems.map(it=><div key={it.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
              <div><span style={{fontSize:12,color:T.cream}}>{it.name}</span><span style={{fontSize:10,color:T.dim,marginLeft:8}}>{it.catName}</span></div>
              <div style={{display:"flex",gap:16,alignItems:"center"}}>
                <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.cream}}>{f$(it.actualCost)}</span>
                <span style={{fontSize:8,fontWeight:700,padding:"3px 7px",borderRadius:8,background:`${PAYMENT_COLORS[getPayStatus(it.id,project.docs)]}18`,color:PAYMENT_COLORS[getPayStatus(it.id,project.docs)],textTransform:"uppercase"}}>{PAYMENT_LABELS[getPayStatus(it.id,project.docs)]}</span>
              </div>
            </div>)}
          </div>}
          {budgetItems.length===0&&projectDocs.length===0&&txns.length===0&&vendorDocs.length===0&&<div style={{textAlign:"center",padding:30,color:T.dim,fontSize:13}}>No activity for this vendor yet.</div>}
        </div>}

        {/* Documents Tab */}
        {tab==="documents"&&<div onDragEnter={onDocDragEnter} onDragLeave={onDocDragLeave} onDragOver={onDocDragOver} onDrop={onDocDrop} style={{position:"relative",minHeight:200}}>
          {draggingDoc&&<div style={{position:"absolute",inset:0,zIndex:10,background:"rgba(8,8,12,.85)",backdropFilter:"blur(8px)",borderRadius:T.rS,border:`3px dashed ${T.gold}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
            <div style={{fontSize:32,opacity:.6}}>▧</div>
            <div style={{fontSize:14,fontWeight:600,color:T.gold}}>Drop files here</div>
            <div style={{fontSize:11,color:T.dim}}>Auto-detected as invoice, contract, W-9, etc.</div>
          </div>}
          <input ref={fileRef} type="file" accept="*" onChange={handleFile} style={{display:"none"}}/>
          {canEdit&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:T.cream}}>Vendor Documents</div>
            <button onClick={()=>setShowUpload(!showUpload)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:showUpload?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showUpload?T.dim:T.brown,border:showUpload?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showUpload?"Cancel":"+ Upload Document"}</button>
          </div>}

          {showUpload&&<div style={{padding:16,marginBottom:16,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
              {VENDOR_DOC_TYPES.map(t=><button key={t} onClick={()=>setDocType(t)} style={{padding:"5px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:docType===t?600:400,fontFamily:T.sans,background:docType===t?`${VENDOR_DOC_COLORS[t]}22`:"transparent",color:docType===t?VENDOR_DOC_COLORS[t]:T.dim}}>{VENDOR_DOC_LABELS[t]}</button>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Document Name</label><input autoFocus value={docName} onChange={e=>setDocName(e.target.value)} placeholder={VENDOR_DOC_LABELS[docType]} onKeyDown={e=>e.key==="Enter"&&addVendorDoc()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
              <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Expiry Date</label><DatePick value={docExpiry} onChange={setDocExpiry} compact/></div>
            </div>
            <div style={{marginBottom:10}}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Notes</label><input value={docNotes} onChange={e=>setDocNotes(e.target.value)} placeholder="Optional notes about this document" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>fileRef.current?.click()} style={{padding:"7px 14px",borderRadius:T.rS,border:`1px dashed ${docFile?T.pos:T.border}`,background:docFile?"rgba(52,211,153,.06)":"transparent",color:docFile?T.pos:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>{docFile?"Replace file":"Choose file…"}</button>
              {docFileName&&<span style={{fontSize:10,color:T.pos,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{docFileName}</span>}
              <button onClick={addVendorDoc} disabled={!docName.trim()} style={{padding:"7px 16px",marginLeft:"auto",background:docName.trim()?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(255,255,255,.05)",color:docName.trim()?T.brown:"rgba(255,255,255,.2)",border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:docName.trim()?"pointer":"default",fontFamily:T.sans}}>Add</button>
            </div>
          </div>}

          {vendorDocs.length>0?<div style={{display:"flex",flexDirection:"column",gap:4}}>
            {vendorDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
              <span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:6,background:`${VENDOR_DOC_COLORS[d.type]||VENDOR_DOC_COLORS.other}22`,color:VENDOR_DOC_COLORS[d.type]||VENDOR_DOC_COLORS.other,textTransform:"uppercase",flexShrink:0}}>{VENDOR_DOC_LABELS[d.type]||d.type}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:T.cream}}>{d.name}</div>
                <div style={{display:"flex",gap:8,marginTop:2}}>
                  {d.notes&&<span style={{fontSize:10,color:T.dim}}>{d.notes}</span>}
                  {d.expiryDate&&<span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>Expires: {d.expiryDate}</span>}
                  <span style={{fontSize:10,color:T.dim}}>Added: {d.dateAdded}</span>
                </div>
              </div>
              {d.fileData&&<button onClick={()=>setViewingDoc(d)} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,flexShrink:0}}>View</button>}
              {canEdit&&<button onClick={()=>removeVendorDoc(d.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.3,padding:2,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.3}><TrashI size={11} color={T.neg}/></button>}
            </div>)}
          </div>
          :<div onClick={()=>canEdit&&setShowUpload(true)} style={{textAlign:"center",padding:40,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:canEdit?"pointer":"default"}} onMouseEnter={e=>{if(canEdit){e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
            <div style={{fontSize:24,opacity:.2,marginBottom:8}}>▧</div>
            <div style={{fontSize:13,color:T.dim}}>No documents uploaded</div>
            {canEdit&&<div style={{fontSize:11,color:T.dim,marginTop:4,opacity:.6}}>Drag & drop files here or click Upload</div>}
            {canEdit&&<div style={{fontSize:11,color:T.dim,marginTop:4,opacity:.6}}>Upload W-9s, COIs, contracts, estimates, permits</div>}
          </div>}

          {/* Project-level docs linked to this vendor */}
          {projectDocs.length>0&&<div style={{marginTop:20}}>
            <div style={{fontSize:11,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Project Documents</div>
            {projectDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
              <span style={{fontSize:9,fontWeight:700,color:DOC_TYPE_COLORS[d.type],textTransform:"uppercase",width:50}}>{d.type==="w9"?"W-9":d.type==="w2"?"W-2":d.type}</span>
              <span style={{fontSize:12,color:T.cream,flex:1}}>{d.name}</span>
              {d.amount>0&&<span className="num" style={{fontSize:11,fontFamily:T.mono,color:T.cream}}>{f$(d.amount)}</span>}
              <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:d.status==="paid"?"rgba(52,211,153,.1)":"rgba(255,234,151,.06)",color:d.status==="paid"?T.pos:T.gold,textTransform:"uppercase"}}>{d.status}</span>
            </div>)}
          </div>}
        </div>}

        {/* Financials Tab */}
        {tab==="financials"&&<div>
          {invoices.length>0&&<div style={{marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:600,color:T.cream,marginBottom:10}}>Invoices ({invoices.length})</div>
            {invoices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {d.fileData&&<button onClick={()=>window.open(d.fileData,"_blank")} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9,color:T.cyan,fontWeight:600}}>PDF</button>}
                <div><span style={{fontSize:12,color:T.cream}}>{d.name}</span>
                  {d.invoiceKind&&<span style={{fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:6,marginLeft:6,background:`${INVOICE_KIND_COLORS[d.invoiceKind]||T.dim}22`,color:INVOICE_KIND_COLORS[d.invoiceKind]||T.dim,textTransform:"uppercase"}}>{INVOICE_KIND_LABELS[d.invoiceKind]||d.invoiceKind}</span>}
                  {d.dueDate&&<span style={{fontSize:10,color:T.dim,marginLeft:8}}>Due: {d.dueDate}</span>}</div>
              </div>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.cream}}>{f$(d.amount)}</span>
                {(d.paidAmount||0)>0&&<span className="num" style={{fontSize:10,fontFamily:T.mono,color:T.pos}}>Paid: {f$(d.paidAmount)}</span>}
                <span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:d.status==="paid"?"rgba(52,211,153,.1)":d.status==="overdue"?"rgba(248,113,113,.1)":"rgba(255,234,151,.06)",color:d.status==="paid"?T.pos:d.status==="overdue"?T.neg:T.gold,textTransform:"uppercase"}}>{d.status}</span>
              </div>
            </div>)}
          </div>}
          {txns.length>0&&<div>
            <div style={{fontSize:12,fontWeight:600,color:T.cream,marginBottom:10}}>Payment History ({txns.length})</div>
            {txns.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
              <div><span style={{fontSize:12,color:T.cream}}>{t.description}</span><span style={{fontSize:10,color:T.dim,marginLeft:8}}>{t.date}</span></div>
              <span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:t.type==="income"?T.pos:T.neg}}>{t.type==="income"?"+":"-"}{f$(t.amount)}</span>
            </div>)}
          </div>}
          {invoices.length===0&&txns.length===0&&<div style={{textAlign:"center",padding:30,color:T.dim,fontSize:13}}>No financial activity yet.</div>}
        </div>}
      </div>
    </div>
    {viewingDoc&&<div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)"}} onClick={()=>setViewingDoc(null)}>
      <div className="slide-in" onClick={e=>e.stopPropagation()} style={{width:"90vw",maxWidth:900,height:"85vh",borderRadius:T.r,background:"rgba(12,10,20,.95)",border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div><div style={{fontSize:14,fontWeight:600,color:T.cream}}>{viewingDoc.name||viewingDoc.fileName||"Document"}</div>{viewingDoc.fileName&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{viewingDoc.fileName}</div>}</div>
          <div style={{display:"flex",gap:8}}>{viewingDoc.fileData&&<a href={viewingDoc.fileData} download={viewingDoc.fileName||viewingDoc.name||"document"} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none"}}>Download</a>}<button onClick={()=>setViewingDoc(null)} aria-label="Close" style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4}}>×</button></div>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:"#111"}}>
          {viewingDoc.fileData?.startsWith("data:image")?<img src={viewingDoc.fileData} alt={viewingDoc.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
          :viewingDoc.fileData?.startsWith("data:application/pdf")||viewingDoc.fileName?.endsWith(".pdf")?<iframe src={viewingDoc.fileData} style={{width:"100%",height:"100%",border:"none"}} title={viewingDoc.name}/>
          :viewingDoc.fileData?<div style={{textAlign:"center",padding:40}}><div style={{fontSize:48,opacity:.2,marginBottom:16}}>▧</div><div style={{fontSize:14,color:T.cream,marginBottom:8}}>{viewingDoc.name}</div><p style={{fontSize:12,color:T.dim,marginBottom:16}}>Preview not available</p><a href={viewingDoc.fileData} download={viewingDoc.fileName||"document"} style={{padding:"10px 24px",borderRadius:T.rS,background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,fontSize:13,fontWeight:700,textDecoration:"none"}}>Download</a></div>
          :<div style={{textAlign:"center",padding:40,color:T.dim}}>No file attached</div>}
        </div>
      </div>
    </div>}
  </div>;
}

export default VendorDetailModal;
