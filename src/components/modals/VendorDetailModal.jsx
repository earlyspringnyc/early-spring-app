import { useState, useRef, useCallback, useEffect } from 'react';
import T from '../../theme/tokens.js';
import { f$, f0 } from '../../utils/format.js';
import { getPayStatus, isOverdue } from '../../utils/calc.js';
import { uid } from '../../utils/uid.js';
import { mkDoc } from '../../data/factories.js';
import { VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, VENDOR_TYPES, PAYMENT_COLORS, PAYMENT_LABELS, DOC_TYPE_COLORS, INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../../constants/index.js';
import { TrashI } from '../icons/index.js';
import { Card, DatePick } from '../primitives/index.js';
import { extractInvoiceData, dataUrlToBlobUrl, renderPdfAllPagesToPngs } from '../../utils/pdfOcr.js';
import { downloadFileData, publicFileUrl } from '../../lib/db.js';

const VENDOR_DOC_TYPES = ["invoice","contract","estimate","coi","w9","license","permit","other"];
const VENDOR_DOC_LABELS = {invoice:"Invoice",contract:"Contract",estimate:"Estimate",coi:"Certificate of Insurance",w9:"W-9",license:"License",permit:"Permit",other:"Other"};
const VENDOR_DOC_COLORS = {invoice:T.ink,contract:T.ink70,estimate:T.ink80,coi:T.ink60,w9:T.ink40,license:T.ink25,permit:T.ink70,other:T.fadedInk};

const Pill=({children,color=T.ink,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 8px":"3px 10px",borderRadius:999,background:"transparent",color,border:`1px solid ${color}`,textTransform:"uppercase",letterSpacing:".06em",whiteSpace:"nowrap"}}>{children}</span>;
const Label=({children})=><div style={{fontSize:10,fontWeight:700,color:T.ink70,textTransform:"uppercase",letterSpacing:".10em",marginBottom:5}}>{children}</div>;
const Section=({title,children,right})=><div style={{marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:T.cream}}>{title}</div>{right}</div>{children}</div>;
const Field=({label,value,onChange,placeholder,style={}})=><div style={style}><Label>{label}</Label><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>;

function VendorDetailModal({vendorId,project,onClose,canEdit,updateProject}){
  const v=(project.vendors||[]).find(v=>v.id===vendorId);
  if(!v)return null;

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
  const[editContactName,setEditContactName]=useState(v.contactName||"");
  const[editSecondaryName,setEditSecondaryName]=useState(v.secondaryContactName||"");
  const[editSecondaryEmail,setEditSecondaryEmail]=useState(v.secondaryContactEmail||"");
  const[editAddress,setEditAddress]=useState(v.address||"");
  const[editCity,setEditCity]=useState(v.city||"");
  const[editState,setEditState]=useState(v.state||"");
  const[editZip,setEditZip]=useState(v.zip||"");
  const[editType,setEditType]=useState(v.vendorType||"other");
  const fileRef=useRef(null);
  const[draggingDoc,setDraggingDoc]=useState(false);
  const dragCounter=useRef(0);
  const[viewingDoc,setViewingDoc]=useState(null);
  // For images we just inline the data URL. For PDFs we render every
  // page to PNG via pdf.js — iframe-based PDF viewing (data: or blob:)
  // is unreliable across browsers; inline canvas-rendered images
  // always work. We also still build a blob URL so the "Open in new
  // tab" button can hand Chrome's native PDF viewer something valid.
  const[viewingBlobUrl,setViewingBlobUrl]=useState(null);
  const[pdfPages,setPdfPages]=useState([]);
  const[pdfLoading,setPdfLoading]=useState(false);
  // Fetched-from-Storage data URL for docs whose inline fileData was
  // stripped on save. Populated by the viewer effect when the doc has
  // a storagePath but no fileData.
  const[storageFileData,setStorageFileData]=useState(null);
  // Editable drafts for the side pane so user can override OCR / fill
  // in details manually on docs that never got OCR'd.
  const[draftType,setDraftType]=useState("");
  const[draftAmount,setDraftAmount]=useState("");
  const[draftDueDate,setDraftDueDate]=useState("");
  const[draftStatus,setDraftStatus]=useState("");
  const[draftKind,setDraftKind]=useState("");
  useEffect(()=>{
    if(!viewingDoc){setViewingBlobUrl(null);setPdfPages([]);setStorageFileData(null);return}
    setDraftType(viewingDoc.type||"invoice");
    setDraftAmount(viewingDoc.amount?String(viewingDoc.amount):"");
    setDraftDueDate(viewingDoc.dueDate||"");
    setDraftStatus(viewingDoc.status||"pending");
    setDraftKind(viewingDoc.invoiceKind||"");

    let cancelled=false;
    let revokeUrl=null;
    const init=async()=>{
      // Prefer inline fileData (just-uploaded, before strip); fall back
      // to fetching from Storage when the doc's been persisted there.
      let fd=viewingDoc.fileData;
      if(!fd&&viewingDoc.storagePath){
        fd=await downloadFileData(viewingDoc.storagePath);
        if(cancelled)return;
        setStorageFileData(fd);
      }else{
        setStorageFileData(null);
      }
      if(!fd){setViewingBlobUrl(null);setPdfPages([]);return}
      const url=dataUrlToBlobUrl(fd);
      revokeUrl=url;
      setViewingBlobUrl(url);
      const isPdf=fd.startsWith("data:application/pdf")||viewingDoc.fileName?.toLowerCase().endsWith(".pdf");
      if(isPdf){
        setPdfLoading(true);setPdfPages([]);
        renderPdfAllPagesToPngs(fd).then(pages=>{
          if(!cancelled){setPdfPages(pages);setPdfLoading(false)}
        });
      }else{
        setPdfPages([]);setPdfLoading(false);
      }
    };
    init();
    return ()=>{cancelled=true;if(revokeUrl)URL.revokeObjectURL(revokeUrl);};
  },[viewingDoc?.id,viewingDoc?.fileData,viewingDoc?.fileName,viewingDoc?.storagePath]);
  // Close the doc viewer on Escape so it behaves like a real modal.
  // Bound only while a doc is open to avoid leaking listeners.
  useEffect(()=>{
    if(!viewingDoc)return;
    const onKey=(e)=>{if(e.key==='Escape'){e.stopPropagation();setViewingDoc(null)}};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[viewingDoc]);

  const saveDocEdits=useCallback(()=>{
    if(!viewingDoc)return;
    const amount=parseFloat(draftAmount)||0;
    updateProject({docs:(project.docs||[]).map(d=>{
      if(d.id!==viewingDoc.id)return d;
      const updated={...d,type:draftType||d.type||"invoice",amount,dueDate:draftDueDate||"",status:draftStatus||d.status||"pending",invoiceKind:draftKind||d.invoiceKind||""};
      // Auto-flip pending→overdue based on date, but never override paid
      if(updated.status==="pending"&&isOverdue(updated))updated.status="overdue";
      else if(updated.status==="overdue"&&!isOverdue(updated))updated.status="pending";
      return updated;
    })});
    setViewingDoc(null);
  },[viewingDoc,draftType,draftAmount,draftDueDate,draftStatus,draftKind,project.docs,updateProject]);

  const autoDetectDocType=(fileName)=>{const n=fileName.toLowerCase();if(n.includes("invoice")||n.includes("inv"))return"invoice";if(n.includes("contract")||n.includes("agreement")||n.includes("sow"))return"contract";if(n.includes("estimate")||n.includes("quote"))return"estimate";if(n.includes("coi")||n.includes("insurance")||n.includes("certificate"))return"coi";if(n.includes("w9")||n.includes("w-9"))return"w9";if(n.includes("license"))return"license";if(n.includes("permit"))return"permit";return"invoice"};

  const[docAnalyzing,setDocAnalyzing]=useState(false);
  const[docAnalysisResult,setDocAnalysisResult]=useState(null);

  // OCR returns suggested fields; surface them as a CONFIRM card with
  // editable inputs instead of silently mutating the doc. Producer
  // verifies / overrides / dismisses. Saving the confirm card writes
  // type/amount/dueDate/number back to project.docs in one shot.
  const analyzeAndAddDoc=useCallback(async(fileData,fileName,docId)=>{
    setDocAnalyzing(true);
    try{
      const parsed=await extractInvoiceData(fileData,fileName);
      if(parsed){
        // Show editable confirm card. Pre-populated with OCR
        // suggestions; producer can correct any field before saving.
        setDocAnalysisResult({
          docId,
          type: parsed.type || '',
          amount: parsed.amount && parsed.amount > 0 ? parsed.amount : '',
          dueDate: parsed.dueDate || '',
          number: parsed.number || '',
        });
      }
    }catch(e){console.error("[vendor-doc-analysis]",e)}
    setDocAnalyzing(false);
  },[]);

  // Commit the producer-confirmed OCR result to project.docs.
  const acceptDocAnalysis=useCallback(()=>{
    if(!docAnalysisResult)return;
    const{docId,type,amount,dueDate,number}=docAnalysisResult;
    const updates={};
    if(type)updates.type=type;
    if(amount!==''&&!Number.isNaN(Number(amount)))updates.amount=Number(amount);
    if(dueDate)updates.dueDate=dueDate;
    if(number)updates.name=String(number);
    updateProject({docs:(project.docs||[]).map(d=>d.id===docId?{...d,...updates,status:isOverdue({...d,...updates})?"overdue":"pending"}:d)});
    setDocAnalysisResult(null);
  },[docAnalysisResult,project.docs,updateProject]);
  const dismissDocAnalysis=useCallback(()=>setDocAnalysisResult(null),[]);
  const updateDocAnalysisField=useCallback((field,value)=>setDocAnalysisResult(prev=>prev?{...prev,[field]:value}:prev),[]);

  // Decide where a doc lives based on its type. Invoices need
  // amount/due-date/status tracking which is only on project.docs;
  // everything else (W9, COI, license, permit, contract, estimate,
  // other) is a vendor record kept on vendor.documents. Storing in
  // exactly one place fixes the long-running "uploaded twice" bug.
  const isFinanceDocType=(type)=>type==='invoice';

  const handleDropFiles=useCallback((files)=>{
    Array.from(files).forEach(file=>{const reader=new FileReader();reader.onload=ev=>{
      const type=autoDetectDocType(file.name);const name=file.name.replace(/\.[^/.]+$/,"");
      if(isFinanceDocType(type)){
        // Invoice — store on project.docs only.
        const financeDoc=mkDoc(name,type,vendorId,0,"","pending","","","",ev.target.result);
        updateProject({docs:[...(project.docs||[]),financeDoc]});
        analyzeAndAddDoc(ev.target.result,file.name,financeDoc.id);
      }else{
        // Vendor record (W9, COI, etc.) — store on vendor.documents only.
        const vendorDoc={id:uid(),name,type,notes:"",fileName:file.name,fileData:ev.target.result,expiryDate:"",dateAdded:new Date().toLocaleDateString()};
        const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:[...(vendor.documents||[]),vendorDoc]}:vendor);
        updateProject({vendors:updatedVendors});
      }
    };reader.readAsDataURL(file)});
  },[project.vendors,project.docs,vendorId,updateProject,analyzeAndAddDoc]);

  const onDocDragEnter=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current++;setDraggingDoc(true)},[]);
  const onDocDragLeave=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current--;if(dragCounter.current===0)setDraggingDoc(false)},[]);
  const onDocDragOver=useCallback(e=>{e.preventDefault();e.stopPropagation()},[]);
  const onDocDrop=useCallback(e=>{e.preventDefault();e.stopPropagation();setDraggingDoc(false);dragCounter.current=0;if(e.dataTransfer.files?.length)handleDropFiles(e.dataTransfer.files)},[handleDropFiles]);

  // Legacy double-storage left some uploads in BOTH lists. Dedupe by
  // matching fileName + type + dateAdded so old data still renders
  // cleanly. project.docs wins for invoices (finance fields live there);
  // vendor.documents wins for everything else (vendor record).
  const vendorDocsRaw=(v.documents||[]);
  const projectDocsRaw=(project.docs||[]).filter(d=>d.vendorId===vendorId);
  const keyFor=(d)=>`${d.fileName||d.name||''}|${d.type||''}|${d.dateAdded||''}`;
  const projectDocs=projectDocsRaw;
  const vendorDocs=vendorDocsRaw.filter(vd=>{
    if(vd.type==='invoice'){
      // If a matching invoice exists on project.docs, drop the duplicate.
      const dup=projectDocs.some(pd=>keyFor(pd)===keyFor(vd));
      return !dup;
    }
    return true;
  });
  const allDocs=[...vendorDocs,...projectDocs];
  const txns=(project.txns||[]).filter(t=>t.vendorId===vendorId);
  const invoices=projectDocs.filter(d=>d.type==="invoice");
  const totalInvoiced=invoices.reduce((a,d)=>a+d.amount,0);
  const totalPaid=invoices.reduce((a,d)=>a+(d.paidAmount||0),0);
  const outstanding=totalInvoiced-totalPaid;
  const budgetItems=[];
  (project.cats||[]).forEach(c=>c.items.forEach(it=>{if(it.vendorId===vendorId)budgetItems.push({...it,catName:c.name})}));
  const totalContracted=budgetItems.reduce((a,it)=>a+it.actualCost,0);
  const overdueInvoices=invoices.filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d)));

  const handleFile=(e)=>{const file=e.target.files[0];if(!file)return;setDocFileName(file.name);if(!docName)setDocName(file.name.replace(/\.[^/.]+$/,""));setDocType(autoDetectDocType(file.name));const reader=new FileReader();reader.onload=ev=>setDocFile(ev.target.result);reader.readAsDataURL(file)};

  const addVendorDoc=()=>{
    if(!docName.trim())return;
    if(isFinanceDocType(docType)){
      // Invoice — store on project.docs only.
      const financeDoc=mkDoc(docName.trim(),docType,vendorId,0,"","pending","","","",docFile);
      updateProject({docs:[...(project.docs||[]),financeDoc]});
      if(docFile)analyzeAndAddDoc(docFile,docFileName||docName.trim(),financeDoc.id);
    }else{
      // Vendor record — store on vendor.documents only.
      const doc={id:uid(),name:docName.trim(),type:docType,notes:docNotes,fileName:docFileName,fileData:docFile,expiryDate:docExpiry,dateAdded:new Date().toLocaleDateString()};
      const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:[...(vendor.documents||[]),doc]}:vendor);
      updateProject({vendors:updatedVendors});
    }
    setDocName("");setDocType("invoice");setDocNotes("");setDocFile(null);setDocFileName("");setDocExpiry("");setShowUpload(false);
  };

  const removeVendorDoc=(docId)=>{
    const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:(vendor.documents||[]).filter(d=>d.id!==docId)}:vendor);
    updateProject({vendors:updatedVendors});
  };

  const updateVendor=(updates)=>{
    const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,...updates}:vendor);
    updateProject({vendors:updatedVendors});
  };

  const saveEdit=()=>{
    updateVendor({name:editName.trim()||v.name,email:editEmail,phone:editPhone,notes:editNotes,contactName:editContactName,secondaryContactName:editSecondaryName,secondaryContactEmail:editSecondaryEmail,address:editAddress,city:editCity,state:editState,zip:editZip,vendorType:editType});
    setEditing(false);
  };

  const fullAddress=[v.address,v.city,v.state,v.zip].filter(Boolean).join(", ");
  const mapQuery=encodeURIComponent(fullAddress);

  return<div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,82,186,.18)",backdropFilter:"blur(8px)"}} onClick={onClose}>
    <div className="slide-in modal-inner" onClick={e=>e.stopPropagation()} style={{width:920,maxWidth:"95vw",maxHeight:"92vh",overflow:"auto",padding:0,borderRadius:T.r,background:T.bg,border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(15,82,186,.14)"}}>

      {/* ── Header ── */}
      <div style={{padding:"24px 32px 20px",borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,background:T.bg,zIndex:2,backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
            <h2 style={{fontSize:20,fontWeight:700,color:T.cream,letterSpacing:"-0.02em"}}>{v.name}</h2>
            <Pill color={VENDOR_TYPE_COLORS[v.vendorType||"other"]}>{VENDOR_TYPE_LABELS[v.vendorType||"other"]}</Pill>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
            {canEdit&&<button onClick={()=>setEditing(!editing)} style={{fontSize:10,color:editing?T.dim:T.gold,background:"none",border:`1px solid ${editing?T.border:T.borderGlow}`,borderRadius:T.rS,padding:"5px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600}}>{editing?"Cancel":"Edit"}</button>}
            <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4,lineHeight:1}}>×</button>
          </div>
        </div>
      </div>

      {/* ── Edit Mode ── */}
      {editing?<div style={{padding:"24px 32px 32px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.cream,marginBottom:12}}>Company</div>
            <div style={{display:"grid",gap:10}}>
              <Field label="Vendor Name" value={editName} onChange={setEditName} placeholder="ABC Productions"/>
              <div><Label>Vendor Type</Label>
                <select value={editType} onChange={e=>setEditType(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
                  {VENDOR_TYPES.map(t=><option key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <Field label="Phone" value={editPhone} onChange={setEditPhone} placeholder="(555) 000-0000"/>
            </div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.cream,marginBottom:12}}>Contacts</div>
            <div style={{display:"grid",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Field label="Primary Contact" value={editContactName} onChange={setEditContactName} placeholder="Jane Smith"/>
                <Field label="Email" value={editEmail} onChange={setEditEmail} placeholder="jane@vendor.com"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Field label="Secondary Contact" value={editSecondaryName} onChange={setEditSecondaryName} placeholder="John Doe"/>
                <Field label="Email" value={editSecondaryEmail} onChange={setEditSecondaryEmail} placeholder="john@vendor.com"/>
              </div>
            </div>
          </div>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:600,color:T.cream,marginBottom:12}}>Address</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr .6fr .6fr",gap:8}}>
            <Field label="Street" value={editAddress} onChange={setEditAddress} placeholder="123 Main St"/>
            <Field label="City" value={editCity} onChange={setEditCity} placeholder="New York"/>
            <Field label="State" value={editState} onChange={setEditState} placeholder="NY"/>
            <Field label="ZIP" value={editZip} onChange={setEditZip} placeholder="10001"/>
          </div>
        </div>
        <Field label="Notes" value={editNotes} onChange={setEditNotes} placeholder="Internal notes about this vendor" style={{marginBottom:16}}/>
        <button onClick={saveEdit} style={{padding:"9px 22px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Save Changes</button>
      </div>

      /* ── Single-page profile ── */
      :<div style={{padding:"24px 32px 32px"}}>

        {/* Financial summary bar */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:8,marginBottom:24}}>
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:10,fontWeight:700,color:T.ink70,textTransform:"uppercase",letterSpacing:".10em",marginBottom:5}}>Contracted</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{f0(totalContracted)}</div></div>
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:10,fontWeight:700,color:T.ink70,textTransform:"uppercase",letterSpacing:".10em",marginBottom:5}}>Invoiced</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(totalInvoiced)}</div></div>
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:10,fontWeight:700,color:T.ink70,textTransform:"uppercase",letterSpacing:".10em",marginBottom:5}}>Paid</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.pos,fontFamily:T.mono}}>{f0(totalPaid)}</div></div>
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:outstanding>0?"rgba(122,31,31,.06)":T.surfEl,border:`1px solid ${outstanding>0?"rgba(122,31,31,.18)":T.border}`}}><div style={{fontSize:10,fontWeight:700,color:T.ink70,textTransform:"uppercase",letterSpacing:".10em",marginBottom:5}}>Outstanding</div><div className="num" style={{fontSize:20,fontWeight:700,color:outstanding>0?T.neg:T.dim,fontFamily:T.mono}}>{f0(outstanding)}</div></div>
        </div>

        {/* Overdue alert */}
        {overdueInvoices.length>0&&<div style={{marginBottom:20,padding:"12px 16px",borderRadius:T.rS,background:"rgba(122,31,31,.06)",border:"1px solid rgba(122,31,31,.10)"}}>
          <div style={{fontSize:10,fontWeight:700,color:T.neg,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Overdue ({overdueInvoices.length})</div>
          {overdueInvoices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid rgba(122,31,31,.06)`}}>
            <span style={{fontSize:12,color:T.cream}}>{d.name}</span>
            <div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:T.neg}}>{f$(d.amount-(d.paidAmount||0))}</span></div>
          </div>)}
        </div>}

        {/* ── Two-column: Left (contacts/location) + Right (invoices/payments) ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24}}>

          {/* Left column */}
          <div>
            <Section title="Contacts">
              <div style={{padding:"12px 14px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:6}}>
                <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Primary</div>
                <div style={{fontSize:13,fontWeight:600,color:T.cream}}>{v.contactName||v.name}</div>
                {v.email&&<div style={{fontSize:11,color:T.cyan,marginTop:2}}>{v.email}</div>}
                {v.phone&&<div style={{fontSize:11,color:T.dim,marginTop:2}}>{v.phone}</div>}
              </div>
              {(v.secondaryContactName||v.secondaryContactEmail)&&<div style={{padding:"12px 14px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Secondary</div>
                <div style={{fontSize:13,fontWeight:600,color:T.cream}}>{v.secondaryContactName||"—"}</div>
                {v.secondaryContactEmail&&<div style={{fontSize:11,color:T.cyan,marginTop:2}}>{v.secondaryContactEmail}</div>}
              </div>}
            </Section>

            {fullAddress&&<Section title="Location">
              <div style={{borderRadius:T.rS,overflow:"hidden",border:`1px solid ${T.border}`,height:160,marginBottom:6}}>
                <iframe src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapQuery}&layer=mapnik`} width="100%" height="100%" style={{border:"none",filter:"saturate(.3) brightness(.8) contrast(1.1)",display:"block"}} title="Vendor location" loading="lazy"/>
              </div>
              <div style={{fontSize:11,color:T.dim}}>{fullAddress}</div>
            </Section>}

            {v.notes&&<Section title="Notes">
              <div style={{fontSize:12,color:T.dimH,lineHeight:1.5,padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>{v.notes}</div>
            </Section>}
          </div>

          {/* Right column */}
          <div>
            {/* Invoices */}
            {invoices.length>0&&<Section title={`Invoices (${invoices.length})`}>
              {invoices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,gap:8}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}><span style={{fontSize:12,color:T.cream,fontWeight:600}}>{d.name}</span>{d.invoiceKind&&<Pill color={INVOICE_KIND_COLORS[d.invoiceKind]||T.dim} size="xs">{INVOICE_KIND_LABELS[d.invoiceKind]||d.invoiceKind}</Pill>}</div>
                  {d.dueDate&&<div style={{fontSize:10,color:T.dim,fontFamily:T.mono,marginTop:2}}>Due: {d.dueDate}</div>}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                  <span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:T.cream}}>{f$(d.amount)}</span>
                  <Pill color={d.status==="paid"?T.pos:d.status==="overdue"?T.neg:T.gold} size="xs">{d.status}</Pill>
                </div>
              </div>)}
            </Section>}

            {/* Budget items */}
            {budgetItems.length>0&&<Section title={`Budget Items (${budgetItems.length})`}>
              {budgetItems.map(it=><div key={it.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
                <div><span style={{fontSize:12,color:T.cream,fontWeight:600}}>{it.name}</span><span style={{fontSize:10,color:T.dim,marginLeft:6}}>{it.catName}</span></div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.cream}}>{f$(it.actualCost)}</span>
                  <Pill color={PAYMENT_COLORS[getPayStatus(it.id,project.docs)]} size="xs">{PAYMENT_LABELS[getPayStatus(it.id,project.docs)]}</Pill>
                </div>
              </div>)}
            </Section>}

            {/* Payment history */}
            {txns.length>0&&<Section title={`Payment History (${txns.length})`}>
              {txns.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
                <div><span style={{fontSize:12,color:T.cream}}>{t.description}</span><span style={{fontSize:10,color:T.dim,fontFamily:T.mono,marginLeft:6}}>{t.date}</span></div>
                <span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:t.type==="income"?T.pos:T.neg}}>{t.type==="income"?"+":"-"}{f$(t.amount)}</span>
              </div>)}
            </Section>}

            {invoices.length===0&&budgetItems.length===0&&txns.length===0&&<div style={{padding:24,textAlign:"center",color:T.dim,fontSize:12,borderRadius:T.rS,border:`1px dashed ${T.border}`}}>No financial activity yet</div>}
          </div>
        </div>

        {/* ── Documents — full width ── */}
        <div onDragEnter={onDocDragEnter} onDragLeave={onDocDragLeave} onDragOver={onDocDragOver} onDrop={onDocDrop} style={{position:"relative"}}>
          {draggingDoc&&<div style={{position:"absolute",inset:0,zIndex:10,background:"rgba(8,8,12,.85)",backdropFilter:"blur(8px)",borderRadius:T.rS,border:`3px dashed ${T.gold}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}>
            <div style={{fontSize:28,opacity:.6}}>&#8593;</div>
            <div style={{fontSize:13,fontWeight:600,color:T.gold}}>Drop files here</div>
            <div style={{fontSize:10,color:T.dim}}>Auto-detected as invoice, contract, W-9, etc.</div>
          </div>}
          <input ref={fileRef} type="file" accept="*" onChange={handleFile} style={{display:"none"}}/>

          <Section title={`Documents (${allDocs.length})`} right={canEdit&&<button onClick={()=>setShowUpload(!showUpload)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",background:showUpload?"transparent":T.goldSoft,color:showUpload?T.dim:T.gold,border:`1px solid ${showUpload?T.border:T.borderGlow}`,borderRadius:T.rS,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showUpload?"Cancel":"+ Upload"}</button>}>

            {showUpload&&<div style={{padding:14,marginBottom:12,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                {VENDOR_DOC_TYPES.map(t=><button key={t} onClick={()=>setDocType(t)} style={{padding:"4px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:docType===t?600:400,fontFamily:T.sans,background:docType===t?`${VENDOR_DOC_COLORS[t]}22`:"transparent",color:docType===t?VENDOR_DOC_COLORS[t]:T.dim}}>{VENDOR_DOC_LABELS[t]}</button>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
                <Field label="Document Name" value={docName} onChange={setDocName} placeholder={VENDOR_DOC_LABELS[docType]}/>
                <div><Label>Expiry Date</Label><DatePick value={docExpiry} onChange={setDocExpiry} compact/></div>
                <Field label="Notes" value={docNotes} onChange={setDocNotes} placeholder="Optional"/>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>fileRef.current?.click()} style={{padding:"6px 12px",borderRadius:T.rS,border:`1px dashed ${docFile?T.pos:T.border}`,background:docFile?"rgba(52,211,153,.06)":"transparent",color:docFile?T.pos:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>{docFile?"Replace":"Choose file…"}</button>
                {docFileName&&<span style={{fontSize:10,color:T.pos,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{docFileName}</span>}
                <button onClick={addVendorDoc} disabled={!docName.trim()} style={{padding:"6px 14px",marginLeft:"auto",background:docName.trim()?T.goldSoft:T.inkSoft2,color:docName.trim()?T.gold:"rgba(15,82,186,.42)",border:`1px solid ${docName.trim()?T.borderGlow:"transparent"}`,borderRadius:T.rS,fontSize:10,fontWeight:700,cursor:docName.trim()?"pointer":"default",fontFamily:T.sans}}>Add</button>
              </div>
            </div>}

            {docAnalyzing&&<div style={{padding:"10px 14px",borderRadius:T.rS,background:"rgba(74,222,128,.04)",border:`1px solid rgba(74,222,128,.12)`,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:14,height:14,border:`2px solid ${T.pos}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
              <span style={{fontSize:11,color:T.pos}}>Analyzing document...</span>
            </div>}
            {docAnalysisResult&&<div style={{padding:"14px 16px",borderRadius:T.rS,background:"rgba(240,184,73,.06)",border:`1px solid rgba(240,184,73,.30)`,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:T.gold,textTransform:"uppercase",letterSpacing:".08em"}}>Confirm document details</div>
                <button onClick={dismissDocAnalysis} style={{background:"transparent",border:"none",color:T.dim,fontSize:14,cursor:"pointer",padding:2,lineHeight:1}}>×</button>
              </div>
              <p style={{fontSize:11,color:T.dim,lineHeight:1.5,margin:"0 0 12px"}}>
                Pulled from the upload. Review and adjust before saving so payment reminders fire on the right date.
              </p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:T.dim,letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>Type</label>
                  <select value={docAnalysisResult.type||""} onChange={e=>updateDocAnalysisField('type',e.target.value)} style={{width:"100%",padding:"7px 8px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
                    {VENDOR_DOC_TYPES.map(t=><option key={t} value={t}>{VENDOR_DOC_LABELS[t]||t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:T.dim,letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>Amount</label>
                  <input type="number" step="0.01" value={docAnalysisResult.amount} onChange={e=>updateDocAnalysisField('amount',e.target.value)} placeholder="0.00" style={{width:"100%",padding:"7px 8px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:T.dim,letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>Due date</label>
                  <input value={docAnalysisResult.dueDate} onChange={e=>updateDocAnalysisField('dueDate',e.target.value)} placeholder="MM/DD/YYYY" style={{width:"100%",padding:"7px 8px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:T.dim,letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>Number</label>
                  <input value={docAnalysisResult.number} onChange={e=>updateDocAnalysisField('number',e.target.value)} placeholder="INV-001" style={{width:"100%",padding:"7px 8px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={dismissDocAnalysis} style={{padding:"7px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>Skip</button>
                <button onClick={acceptDocAnalysis} style={{padding:"7px 18px",borderRadius:T.rS,background:T.ink,color:T.paper,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>Save</button>
              </div>
            </div>}
            {allDocs.length>0?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:6}}>
              {vendorDocs.map(d=><div key={d.id} onClick={()=>setViewingDoc(d)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
                <Pill color={VENDOR_DOC_COLORS[d.type]||VENDOR_DOC_COLORS.other} size="xs">{VENDOR_DOC_LABELS[d.type]||d.type}</Pill>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div><div style={{fontSize:9,color:T.dim,marginTop:1}}>{d.dateAdded}</div></div>
                {canEdit&&<button onClick={e=>{e.stopPropagation();removeVendorDoc(d.id)}} style={{background:"rgba(122,31,31,.06)",border:"1px solid rgba(122,31,31,.10)",borderRadius:T.rS,cursor:"pointer",padding:"3px 5px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(122,31,31,.18)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(122,31,31,.06)"}}><TrashI size={10} color={T.neg}/></button>}
              </div>)}
              {projectDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
                <Pill color={DOC_TYPE_COLORS[d.type]||T.dim} size="xs">{d.type==="w9"?"W-9":d.type}</Pill>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>{d.amount>0&&<div style={{fontSize:10,color:T.dim,fontFamily:T.mono,marginTop:1}}>{f$(d.amount)}</div>}</div>
                <Pill color={d.status==="paid"?T.pos:d.status==="overdue"?T.neg:T.gold} size="xs">{d.status}</Pill>
              </div>)}
            </div>
            :<div onClick={()=>canEdit&&setShowUpload(true)} style={{textAlign:"center",padding:30,border:`2px dashed ${T.border}`,borderRadius:T.r,cursor:canEdit?"pointer":"default"}} onMouseEnter={e=>{if(canEdit){e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
              <div style={{fontSize:20,opacity:.2,marginBottom:6}}>&#8593;</div>
              <div style={{fontSize:12,color:T.dim}}>No documents — drag & drop or click Upload</div>
            </div>}
          </Section>
        </div>
      </div>}
    </div>

    {/* ── Document Viewer ── */}
    {viewingDoc&&(()=>{
      // Resolve to whichever source has bytes: just-uploaded inline data,
      // or Storage-backed data fetched by the viewer effect above. For
      // simple <a href download> the public URL also works fine.
      const docFileData=viewingDoc.fileData||storageFileData;
      const docPublicUrl=viewingDoc.storagePath?publicFileUrl(viewingDoc.storagePath):null;
      const docFnLower=(viewingDoc.fileName||"").toLowerCase();
      const docIsPdf=docFileData?.startsWith("data:application/pdf")||docFnLower.endsWith(".pdf");
      const docIsImage=docFileData?.startsWith("data:image")||/\.(png|jpe?g|gif|webp|svg|tiff)$/i.test(docFnLower);
      const downloadHref=docFileData||docPublicUrl;
      return<><div onClick={()=>setViewingDoc(null)} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(15,82,186,.20)",backdropFilter:"blur(8px)"}}/>
    <div className="slide-in" onClick={e=>e.stopPropagation()} style={{position:"fixed",top:32,bottom:32,left:"50%",transform:"translateX(-50%)",width:"92vw",maxWidth:1100,zIndex:301,borderRadius:T.r,background:T.bg,border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(15,82,186,.14)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div><div style={{fontSize:14,fontWeight:600,color:T.cream}}>{viewingDoc.name||viewingDoc.fileName||"Document"}</div>{viewingDoc.fileName&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{viewingDoc.fileName}</div>}</div>
          <div style={{display:"flex",gap:8}}>
            {viewingBlobUrl&&docIsPdf&&<a href={viewingBlobUrl} target="_blank" rel="noopener noreferrer" style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none"}}>Open in new tab</a>}
            {downloadHref&&<a href={downloadHref} download={viewingDoc.fileName||viewingDoc.name||"document"} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none"}}>Download</a>}
            <button onClick={()=>setViewingDoc(null)} aria-label="Close" style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4}}>×</button>
          </div>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* Preview pane */}
          <div style={{flex:1,overflow:"auto",background:"#111"}}>
            {docIsImage?
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100%"}}><img src={docFileData||docPublicUrl} alt={viewingDoc.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/></div>
            :docIsPdf?
              (pdfLoading?<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:12}}>Rendering PDF…</div>
              :pdfPages.length>0?<div style={{padding:16,display:"flex",flexDirection:"column",gap:16,alignItems:"center"}}>{pdfPages.map((p,i)=><img key={i} src={p} alt={`Page ${i+1}`} style={{maxWidth:"100%",height:"auto",boxShadow:"0 4px 16px rgba(0,0,0,.4)",background:"#fff",display:"block"}}/>)}</div>
              :<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:12}}>Could not render PDF. Use Download or Open in new tab.</div>)
            :downloadHref?<div style={{textAlign:"center",padding:40}}><div style={{fontSize:48,opacity:.2,marginBottom:16}}>&#9634;</div><div style={{fontSize:14,color:T.cream,marginBottom:8}}>{viewingDoc.name}</div><p style={{fontSize:12,color:T.dim,marginBottom:16}}>Preview not available</p><a href={downloadHref} download={viewingDoc.fileName||"document"} style={{padding:"10px 24px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:13,fontWeight:700,textDecoration:"none"}}>Download</a></div>
            :<div style={{textAlign:"center",padding:40,color:T.dim}}>No file attached</div>}
          </div>
          {/* Edit pane */}
          {canEdit&&<div style={{width:280,flexShrink:0,borderLeft:`1px solid ${T.border}`,padding:18,display:"flex",flexDirection:"column",gap:12,background:T.surface,overflow:"auto"}}>
            <div style={{fontSize:10,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>Edit details</div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Type</label>
              <select value={draftType} onChange={e=>setDraftType(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",cursor:"pointer"}}>
                {VENDOR_DOC_TYPES.map(t=><option key={t} value={t}>{VENDOR_DOC_LABELS[t]||t}</option>)}
              </select>
            </div>
            {draftType==="invoice"&&<>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Invoice kind</label>
                <select value={draftKind} onChange={e=>setDraftKind(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",cursor:"pointer"}}>
                  <option value="">— None —</option>
                  {INVOICE_KIND_LABELS&&Object.entries(INVOICE_KIND_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Amount owed</label>
                <input value={draftAmount} onChange={e=>setDraftAmount(e.target.value)} placeholder="0.00" inputMode="decimal" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Due date</label>
                <input value={draftDueDate} onChange={e=>setDraftDueDate(e.target.value)} placeholder="MM/DD/YYYY" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Status</label>
                <select value={draftStatus} onChange={e=>setDraftStatus(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",cursor:"pointer"}}>
                  <option value="pending">Pending (unpaid)</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </>}
            <button onClick={saveDocEdits} style={{marginTop:6,padding:"10px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>Save</button>
            {docFileData&&<button onClick={()=>analyzeAndAddDoc(docFileData,viewingDoc.fileName||viewingDoc.name||"document",viewingDoc.id)} disabled={docAnalyzing} style={{padding:"8px 14px",borderRadius:T.rS,background:"transparent",color:T.dim,border:`1px solid ${T.border}`,fontSize:10,fontWeight:600,cursor:docAnalyzing?"default":"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase",opacity:docAnalyzing?0.5:1}}>{docAnalyzing?"Analyzing…":"Re-run OCR"}</button>}
          </div>}
        </div>
      </div>
    </>;
    })()}
  </div>;
}

export default VendorDetailModal;
