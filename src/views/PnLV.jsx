import { useState, useEffect, useRef, useCallback } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { isOverdue, getVendorName } from '../utils/calc.js';
import { DOC_TYPES, DOC_TYPE_COLORS } from '../constants/index.js';
import { mkDoc, mkTxn } from '../data/factories.js';
import { TrashI } from '../components/icons/index.js';
import { Card, Metric, DatePick, VendorSelect } from '../components/primitives/index.js';
import { toast } from '../lib/toast.js';
import { extractInvoiceData, renderPdfAllPagesToPngs, dataUrlToBlobUrl } from '../utils/pdfOcr.js';

function PnLV({project,updateProject,comp,canEdit,vendors,onAddVendor,onVendorClick,accessToken}){
  const txns=project.txns||[];
  const docs=project.docs||[];
  const[tab,setTab]=useState("transactions");
  const[showAdd,setShowAdd]=useState(false);

  // Transaction state
  const[nTy,setNTy]=useState("income");const[nDe,setNDe]=useState("");const[nAm,setNAm]=useState("");const[nDa,setNDa]=useState("");const[nCa,setNCa]=useState("");
  const[nVId,setNVId2]=useState("");const[matchDocId,setMatchDocId]=useState("");

  // Client invoice (Accounts Receivable) state — separate from
  // vendor invoices since these are SENT BY us TO the client.
  // Stored on project.docs with type='client_invoice'.
  const[showInvUpload,setShowInvUpload]=useState(false);
  const[clInvNum,setClInvNum]=useState("");
  const[clInvAmt,setClInvAmt]=useState("");
  const[clInvSent,setClInvSent]=useState("");
  const[clInvDue,setClInvDue]=useState("");
  const[clInvFile,setClInvFile]=useState(null);    // base64 data URL
  const[clInvFileName,setClInvFileName]=useState("");
  const clInvFileRef=useRef(null);

  // Document state
  const[showDocAdd,setShowDocAdd]=useState(false);const[docFilter,setDocFilter]=useState("all");
  // File-picker state for the Add Document form. fileData is the
  // base64 data URL we attach to the new doc when Add is clicked.
  // OCR runs as soon as a file is chosen so the producer doesn't
  // have to retype name / amount / due date.
  const[addDocFile,setAddDocFile]=useState(null);
  const[addDocFileName,setAddDocFileName]=useState("");
  const[addDocOcring,setAddDocOcring]=useState(false);
  const addDocFileRef=useRef(null);
  const[nN,setNN2]=useState("");const[nDTy,setNDTy]=useState("invoice");const[nDAm,setNDAm]=useState("");const[nDu,setNDu]=useState("");
  const[nLnkCat,setNLnkCat]=useState("");const[nLnkItem,setNLnkItem]=useState("");const[nDVId,setNDVId]=useState("");
  const[dragging,setDragging]=useState(false);
  const[showPaidAP,setShowPaidAP]=useState(false);
  const[viewingDoc,setViewingDoc]=useState(null);
  // Render PDFs inline via pdf.js (iframe + data/blob URL is blocked
  // by Chrome). Build a blob URL so "Open in new tab" works too.
  const[pdfPages,setPdfPages]=useState([]);
  const[pdfLoading,setPdfLoading]=useState(false);
  const[viewingBlobUrl,setViewingBlobUrl]=useState(null);
  // Editable fields surfaced in the viewer so the user can fix
  // amount/dueDate/vendor manually when OCR didn't fire or got it
  // wrong. Draft state lives here; persist on Save.
  const[draftAmount,setDraftAmount]=useState("");
  const[draftDueDate,setDraftDueDate]=useState("");
  const[draftVendorId,setDraftVendorId]=useState("");
  const[draftType,setDraftType]=useState("");
  useEffect(()=>{
    if(!viewingDoc){setPdfPages([]);setViewingBlobUrl(null);return}
    setDraftAmount(viewingDoc.amount?String(viewingDoc.amount):"");
    setDraftDueDate(viewingDoc.dueDate||"");
    setDraftVendorId(viewingDoc.vendorId||"");
    setDraftType(viewingDoc.type||"invoice");
    const url=viewingDoc.fileData?dataUrlToBlobUrl(viewingDoc.fileData):null;
    setViewingBlobUrl(url);
    const isPdf=viewingDoc.fileData?.startsWith("data:application/pdf")||viewingDoc.fileName?.toLowerCase().endsWith(".pdf");
    let cancelled=false;
    if(isPdf&&viewingDoc.fileData){
      setPdfLoading(true);setPdfPages([]);
      renderPdfAllPagesToPngs(viewingDoc.fileData).then(pages=>{
        if(!cancelled){setPdfPages(pages);setPdfLoading(false)}
      });
    }else{
      setPdfPages([]);setPdfLoading(false);
    }
    return ()=>{cancelled=true;if(url)URL.revokeObjectURL(url)};
  },[viewingDoc?.id,viewingDoc?.fileData,viewingDoc?.fileName]);
  // Escape closes the viewer (in addition to clicking the backdrop
  // or the × button). Bound only while a doc is open.
  useEffect(()=>{
    if(!viewingDoc)return;
    const onKey=(e)=>{if(e.key==='Escape'){e.stopPropagation();setViewingDoc(null)}};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[viewingDoc]);

  const saveDocEdits=()=>{
    if(!viewingDoc)return;
    updateProject(prev=>({docs:(prev.docs||[]).map(d=>{
      if(d.id!==viewingDoc.id)return d;
      const amount=parseFloat(draftAmount)||0;
      const updated={...d,amount,dueDate:draftDueDate||"",vendorId:draftVendorId||"",type:draftType||d.type||"invoice",ocrSuggestion:null};
      if(updated.status!=="paid"&&isOverdue(updated))updated.status="overdue";
      else if(updated.status==="overdue"&&!isOverdue(updated))updated.status="pending";
      return updated;
    })}));
    toast.success("Saved.");
  };
  const[analyzing,setAnalyzing]=useState(null); // {docId, fileName}
  const[analysisResult,setAnalysisResult]=useState(null); // {docId, type, amount, dueDate, vendor, number}
  const[analysisVendorId,setAnalysisVendorId]=useState("");
  const fileInputRef=useRef(null);
  const dragCounter=useRef(0);

  // Transaction computations
  const income=txns.filter(t=>t.type==="income");const expenses=txns.filter(t=>t.type==="expense");
  const totalIncome=income.reduce((a,t)=>a+t.amount,0);const totalExpenses=expenses.reduce((a,t)=>a+t.amount,0);
  const cashflow=totalIncome-totalExpenses;
  const collected=comp.grandTotal>0?Math.round((totalIncome/comp.grandTotal)*100):0;

  // Document computations
  const overdueCount=docs.filter(d=>d.status==="overdue").length;
  const pendingTotal=docs.filter(d=>d.status!=="paid").reduce((a,d)=>a+d.amount,0);

  // Auto-detect doc type from filename
  const autoDetectType=(fileName)=>{
    const n=fileName.toLowerCase();
    if(n.includes("invoice")||n.includes("inv"))return"invoice";
    if(n.includes("w9")||n.includes("w-9"))return"w9";
    if(n.includes("w2")||n.includes("w-2"))return"w2";
    if(n.includes("contract")||n.includes("agreement")||n.includes("sow")||n.includes("nda")||n.includes("msa"))return"contract";
    return"invoice";
  };

  // AI document analysis — delegates to the shared util that
  // handles auth header + pdf.js rendering. (Old inline version
  // was missing both, which is why OCR silently no-op'd.)
  const analyzeDoc=async(fileData,fileName,docId)=>{
    setAnalyzing({docId,fileName});
    try{
      const parsed=await extractInvoiceData(fileData,fileName);
      if(!parsed){
        toast.error(`Couldn't auto-analyze "${fileName}". The file is saved — fill in amount/due date manually by clicking the doc.`);
        return;
      }
      // Try to match vendor name to existing vendors
      let matchedVendorId="";
      if(parsed.vendor){const vName=parsed.vendor.toLowerCase();const found=(project.vendors||[]).find(v=>(v.name||"").toLowerCase().includes(vName)||vName.includes((v.name||"").toLowerCase()));if(found)matchedVendorId=found.id}
      // Auto-apply if we got good data — functional form so parallel
      // analyses don't clobber each other.
      if(parsed.amount>0||parsed.dueDate||matchedVendorId){
        updateProject(prev=>({docs:(prev.docs||[]).map(d=>{
          if(d.id!==docId)return d;
          const updates={};
          if(parsed.type)updates.type=parsed.type;
          if(parsed.amount&&parsed.amount>0)updates.amount=parsed.amount;
          if(parsed.dueDate)updates.dueDate=parsed.dueDate;
          if(parsed.number)updates.name=parsed.number;
          if(matchedVendorId)updates.vendorId=matchedVendorId;
          const updated={...d,...updates};
          if(isOverdue(updated))updated.status="overdue";
          return updated;
        })}));
      }
      setAnalysisResult({docId,...parsed,matchedVendorId});
      setAnalysisVendorId(matchedVendorId);
    }catch(e){
      toast.error(`AI analysis failed: ${e?.message || 'unknown error'}`);
    }finally{
      setAnalyzing(null);
    }
  };

  const confirmAnalysis=()=>{
    if(!analysisResult)return;
    const r=analysisResult;
    updateProject(prev=>({docs:(prev.docs||[]).map(d=>{
      if(d.id!==r.docId)return d;
      const updates={};
      if(r.type)updates.type=r.type;
      if(r.amount&&r.amount>0)updates.amount=r.amount;
      if(r.dueDate)updates.dueDate=r.dueDate;
      if(r.number)updates.name=r.number;
      if(r.terms)updates.terms=r.terms;
      if(r.notes)updates.notes=r.notes;
      if(analysisVendorId)updates.vendorId=analysisVendorId;
      const updated={...d,...updates};
      if(isOverdue(updated))updated.status="overdue";
      return updated;
    })}));
    setAnalysisResult(null);setAnalysisVendorId("");
  };

  const dismissAnalysis=()=>{setAnalysisResult(null);setAnalysisVendorId("")};

  // Scan all unanalyzed documents
  const[scanProgress,setScanProgress]=useState(null); // {current, total}
  const scanAllDocs=async()=>{
    const unscanned=docs.filter(d=>d.fileData&&d.amount===0&&d.status!=="paid");
    if(!unscanned.length)return;
    setScanProgress({current:0,total:unscanned.length});
    for(let i=0;i<unscanned.length;i++){
      setScanProgress({current:i+1,total:unscanned.length});
      await analyzeDoc(unscanned[i].fileData,unscanned[i].name||"document",unscanned[i].id);
      // Small delay to avoid rate limits
      if(i<unscanned.length-1)await new Promise(r=>setTimeout(r,500));
    }
    setScanProgress(null);
  };
  const unscannedCount=docs.filter(d=>d.fileData&&d.amount===0&&d.status!=="paid").length;

  // File handling for drag-and-drop / upload. Uses the functional updater
  // form of updateProject so concurrent file readers see fresh state, not
  // a stale closure of `docs` (which would clobber earlier files).
  const handleFiles=useCallback((files)=>{
    Array.from(files).forEach(file=>{
      const reader=new FileReader();
      reader.onload=async ev=>{
        const type=autoDetectType(file.name);
        const name=file.name.replace(/\.[^/.]+$/,"");
        const doc=mkDoc(name,type,"",0,"","pending","","","",ev.target.result);
        if(isOverdue(doc))doc.status="overdue";
        updateProject(prev=>({docs:[...(prev.docs||[]),doc]}));
        if(accessToken&&project.driveFolders){
          import('../utils/drive.js').then(async({uploadToDrive})=>{
            const result=await uploadToDrive(accessToken,ev.target.result,file.name,project.driveFolders,type,"finance");
            if(result){
              updateProject(prev=>({docs:(prev.docs||[]).map(d=>d.id===doc.id?{...d,driveId:result.driveId,driveLink:result.webViewLink,fileData:null}:d)}));
            }
          }).catch(e=>console.error('[drive]',e));
        }
        analyzeDoc(ev.target.result,file.name,doc.id);
      };
      reader.readAsDataURL(file);
    });
  },[updateProject,accessToken,project.driveFolders]);

  const onDragEnter=useCallback((e)=>{e.preventDefault();e.stopPropagation();dragCounter.current++;setDragging(true)},[]);
  const onDragLeave=useCallback((e)=>{e.preventDefault();e.stopPropagation();dragCounter.current--;if(dragCounter.current===0)setDragging(false)},[]);
  const onDragOver=useCallback((e)=>{e.preventDefault();e.stopPropagation()},[]);
  const onDrop=useCallback((e)=>{e.preventDefault();e.stopPropagation();setDragging(false);dragCounter.current=0;if(e.dataTransfer.files?.length)handleFiles(e.dataTransfer.files)},[handleFiles]);

  // Auto-mark overdue docs
  useEffect(()=>{const u=docs.map(d=>isOverdue(d)&&d.status==="pending"?{...d,status:"overdue"}:d);if(JSON.stringify(u)!==JSON.stringify(docs))updateProject({docs:u})},[]);

  // Transaction actions. Functional updates throughout so rapid
  // sequential edits (add txn, mark paid, save invoice…) don't
  // clobber each other by spreading a stale array.
  const addTxn=()=>{
    if(!nDe.trim()||!nAm)return;
    const amount=parseFloat(nAm)||0;
    const newTxn=mkTxn(nTy,nDe.trim(),amount,nDa,nCa,nVId,matchDocId);
    updateProject(prev=>{
      let updatedDocs=prev.docs||[];
      if(matchDocId&&nTy==="expense"){
        updatedDocs=updatedDocs.map(d=>{
          if(d.id!==matchDocId)return d;
          const newPaid=(d.paidAmount||0)+amount;
          return{...d,paidAmount:newPaid,status:newPaid>=d.amount?"paid":"partial"};
        });
      }
      return{txns:[...(prev.txns||[]),newTxn],docs:updatedDocs};
    });
    setNDe("");setNAm("");setNDa("");setNCa("");setNVId2("");setMatchDocId("");setShowAdd(false);
  };
  const removeTxn=id=>updateProject(prev=>({txns:(prev.txns||[]).filter(t=>t.id!==id)}));
  const sorted=[...txns].sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  // Document actions
  const handleAddDocFile=(e)=>{
    const f=e.target.files?.[0];
    e.target.value="";
    if(!f)return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      const data=ev.target.result;
      setAddDocFile(data);
      setAddDocFileName(f.name);
      // Auto-fill name from filename if user hasn't typed one yet
      if(!nN)setNN2(f.name.replace(/\.[^/.]+$/,""));
      // Auto-detect type from filename as a hint while OCR runs
      const detected=autoDetectType(f.name);
      if(detected)setNDTy(detected);
      // Run OCR to pre-fill amount / due date / vendor / final name
      setAddDocOcring(true);
      try{
        const parsed=await extractInvoiceData(data,f.name);
        if(parsed){
          if(parsed.type)setNDTy(parsed.type);
          if(parsed.amount&&parsed.amount>0&&!nDAm)setNDAm(String(parsed.amount));
          if(parsed.dueDate&&!nDu)setNDu(parsed.dueDate);
          if(parsed.number)setNN2(parsed.number);
          // Match vendor name to existing vendors
          if(parsed.vendor&&!nDVId){
            const vName=parsed.vendor.toLowerCase();
            const found=(project.vendors||[]).find(v=>(v.name||"").toLowerCase().includes(vName)||vName.includes((v.name||"").toLowerCase()));
            if(found)setNDVId(found.id);
          }
        }
      }catch(err){console.error("[add-doc-ocr]",err)}
      finally{setAddDocOcring(false)}
    };
    reader.readAsDataURL(f);
  };
  const addDoc=()=>{
    if(!nN.trim())return;
    const doc=mkDoc(nN.trim(),nDTy,nDVId,parseFloat(nDAm)||0,nDu,"pending",nLnkCat,nLnkItem,"",addDocFile);
    if(addDocFileName)doc.fileName=addDocFileName;
    if(isOverdue(doc))doc.status="overdue";
    updateProject(prev=>({docs:[...(prev.docs||[]),doc]}));
    setNN2("");setNDTy("invoice");setNDVId("");setNDAm("");setNDu("");setNLnkCat("");setNLnkItem("");
    setAddDocFile(null);setAddDocFileName("");setShowDocAdd(false);
  };
  const removeDoc=id=>updateProject(prev=>({docs:(prev.docs||[]).filter(d=>d.id!==id)}));
  const markPaid=(docId)=>{
    const doc=(docs||[]).find(d=>d.id===docId);
    if(!doc)return;
    const newTxn=mkTxn("expense",`Payment: ${doc.name}`,doc.amount,new Date().toLocaleDateString(),"",doc.vendorId,docId);
    updateProject(prev=>({
      docs:(prev.docs||[]).map(d=>d.id===docId?{...d,status:"paid",paidAmount:d.amount}:d),
      txns:[...(prev.txns||[]),newTxn],
    }));
  };

  // ── Client invoice (AR) helpers ─────────────────────────────
  // File → base64 data URL so it can live inline on the doc row,
  // matching the existing vendor-invoice upload pattern.
  const handleClientInvoiceFile=(e)=>{
    const f=e.target.files?.[0];
    e.target.value="";
    if(!f) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      const data=ev.target.result;
      setClInvFile(data);
      setClInvFileName(f.name);
      // Auto-fill the invoice number from filename if empty
      if(!clInvNum) {
        const base=f.name.replace(/\.[^/.]+$/, "");
        setClInvNum(base);
      }
      // Run OCR so amount/due date get pre-filled. User still has
      // to review + click Save to commit — same human-verification
      // pattern as the BooksView scanner.
      setAnalyzing({docId:"_clinv",fileName:f.name});
      try{
        const parsed=await extractInvoiceData(data,f.name);
        if(parsed){
          if(parsed.amount&&parsed.amount>0&&!clInvAmt)setClInvAmt(String(parsed.amount));
          if(parsed.dueDate&&!clInvDue)setClInvDue(parsed.dueDate);
          if(parsed.number&&(!clInvNum||clInvNum===f.name.replace(/\.[^/.]+$/, "")))setClInvNum(parsed.number);
        }
      }catch(err){console.error("[ar-ocr]",err)}
      finally{setAnalyzing(null)}
    };
    reader.readAsDataURL(f);
  };
  const addClientInvoice=()=>{
    if(!clInvNum.trim()||!parseFloat(clInvAmt)) return;
    const amt=parseFloat(clInvAmt);
    const sentDate=clInvSent || new Date().toLocaleDateString();
    const doc={
      id:crypto.randomUUID? crypto.randomUUID() : (Math.random().toString(36).slice(2)+Date.now()),
      name:clInvNum.trim(),
      type:'client_invoice',
      amount:amt,
      paidAmount:0,
      sentDate,
      dueDate:clInvDue||"",
      status:'sent',
      dateAdded:new Date().toLocaleDateString(),
      fileData:clInvFile||null,
      fileName:clInvFileName||null,
    };
    // Functional updater — prevents back-to-back uploads from
    // clobbering each other when the local `docs` closure is stale
    // (the prop hasn't re-rendered before the next save fires).
    updateProject(prev=>({docs:[...(prev.docs||[]),doc]}));
    setClInvNum("");setClInvAmt("");setClInvSent("");setClInvDue("");
    setClInvFile(null);setClInvFileName("");setShowInvUpload(false);
  };
  // Marking a client invoice paid creates an income txn AND flags
  // the doc as paid. Mirrors the vendor markPaid flow. Also pings
  // Slack so the team sees "money landed" in real time.
  const markClientInvoicePaid=(docId)=>{
    const doc=docs.find(d=>d.id===docId);
    if(!doc) return;
    const newTxn=mkTxn(
      "income",
      `Invoice ${doc.name} paid`,
      doc.amount,
      new Date().toLocaleDateString(),
      "client_invoice",
      "",
      docId
    );
    updateProject(prev=>({
      docs:(prev.docs||[]).map(d=>d.id===docId?{...d,status:"paid",paidAmount:d.amount,paidDate:new Date().toLocaleDateString()}:d),
      txns:[...(prev.txns||[]),newTxn],
    }));
    // Fire-and-forget Slack ping. Failures are silent.
    import('../lib/slack.js').then(({ notifySlack }) => {
      notifySlack(`💰 *Client paid invoice* ${doc.name} for *${project?.name || 'a project'}* — $${Number(doc.amount).toLocaleString()}`);
    }).catch(() => {});
  };
  const removeClientInvoice=(docId)=>{
    if(!confirm("Delete this client invoice? Any linked payment transaction stays.")) return;
    updateProject(prev=>({docs:(prev.docs||[]).filter(d=>d.id!==docId)}));
  };
  // Send a collections reminder email to the project's billing
  // contact (or client PM if no billing email is set). Server-side
  // template — no arbitrary HTML — so this can't be used as a relay.
  const sendReminder=async(doc)=>{
    const recipient=project.client_billing_email||project.fields?.client_billing_email||project.client_pm_email||project.fields?.client_pm_email||'';
    const to=window.prompt("Send reminder to:", recipient);
    if(!to||!to.trim()) return;
    try{
      const{getSession}=await import('../lib/db.js');
      const session=await getSession();
      const res=await fetch('/api/invoice-reminder',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          ...(session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{}),
        },
        body:JSON.stringify({
          to:to.trim(),
          fromName:'Kamil',
          invoice:{
            number:doc.name,
            amount:doc.amount,
            dueDate:doc.dueDate,
            sentDate:doc.sentDate,
            projectName:project.name,
            clientName:project.client,
          },
        }),
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data?.error||`HTTP ${res.status}`);
      toast.success(`Reminder sent to ${to.trim()}`);
    }catch(e){
      toast.error(`Reminder failed: ${e.message||'unknown'}`);
    }
  };
  const filteredDocs=docFilter==="all"?docs:docs.filter(d=>d.type===docFilter||d.status===docFilter);

  const pillStyle=(active)=>({padding:"8px 18px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:active?600:400,fontFamily:T.sans,background:active?T.goldSoft:"transparent",color:active?T.gold:T.dim,transition:"all .15s"});

  return<div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop} style={{position:"relative",minHeight:"50vh"}}>
    <input ref={fileInputRef} type="file" multiple accept="*" onChange={e=>{if(e.target.files?.length)handleFiles(e.target.files);e.target.value=""}} style={{display:"none"}}/>
    {dragging&&<div style={{position:"absolute",inset:0,zIndex:100,background:"rgba(8,8,12,.85)",backdropFilter:"blur(8px)",borderRadius:T.r,border:`3px dashed ${T.gold}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:40,opacity:.6}}>&#9639;</div>
      <div style={{fontSize:18,fontWeight:600,color:T.gold}}>Drop files here</div>
      <div style={{fontSize:12,color:T.dim}}>Invoices, contracts, W-9s, and more</div>
    </div>}

    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:20,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>Finance</h1><p style={{fontSize:13,color:T.dim,marginTop:6}}>P&L, cash flow, documents, and payments</p></div>
      <div style={{display:"flex",gap:8}}>
        {canEdit&&tab==="documents"&&<>
          {unscannedCount>0&&<button onClick={scanAllDocs} disabled={!!scanProgress} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:scanProgress?"transparent":`rgba(74,222,128,.08)`,color:scanProgress?T.dim:T.pos,border:`1px solid ${scanProgress?"transparent":"rgba(74,222,128,.2)"}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:scanProgress?"default":"pointer",fontFamily:T.sans}}>{scanProgress?`Scanning ${scanProgress.current}/${scanProgress.total}...`:`Scan All (${unscannedCount})`}</button>}
          <button onClick={()=>fileInputRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:"transparent",color:T.dim,border:`1px solid ${T.border}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}>Upload Files</button>
        </>}
        {canEdit&&tab==="transactions"&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showAdd?"transparent":T.ink,color:showAdd?T.dim:T.brown,border:showAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Add Entry"}</button>}
        {canEdit&&tab==="documents"&&<button onClick={()=>setShowDocAdd(!showDocAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showDocAdd?"transparent":T.ink,color:showDocAdd?T.dim:T.brown,border:showDocAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showDocAdd?"Cancel":"+ Add Document"}</button>}
      </div>
    </div>

    {/* Top metrics row */}
    <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:12,marginBottom:20}}>
      <Metric label="Revenue Collected" value={f0(totalIncome)} color={T.pos} sub={`${collected}% of ${f0(comp.grandTotal)}`}/>
      <Metric label="Expenses Paid" value={f0(totalExpenses)} color={T.neg}/>
      <Metric label="Net Cashflow" value={f0(cashflow)} color={cashflow>=0?T.pos:T.neg} glow/>
      <Metric label="Outstanding Invoices" value={f0(pendingTotal)} color={T.gold}/>
      <Metric label="Overdue" value={overdueCount} color={overdueCount>0?T.neg:T.dim} glow={overdueCount>0}/>
    </div>

    {/* Collection Progress */}
    <Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:11,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Collection Progress</span><span style={{fontSize:12,color:T.gold,fontFamily:T.mono,fontWeight:600}}>{collected}%</span></div>
      <div style={{height:8,background:T.surface,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(collected,100)}%`,background:T.ink,borderRadius:4,transition:"width .4s ease"}}/></div>
    </Card>

    {/* Tab toggle */}
    <div style={{display:"flex",gap:4,marginBottom:20,background:T.surface,borderRadius:20,padding:3,width:"fit-content"}}>
      <button onClick={()=>setTab("transactions")} style={pillStyle(tab==="transactions")}>Transactions</button>
      <button onClick={()=>setTab("documents")} style={pillStyle(tab==="documents")}>Documents</button>
    </div>

    {/* ===== TRANSACTIONS TAB ===== */}
    {tab==="transactions"&&<>
      {/* ── Accounts Receivable (client payments) ── */}
      {(()=>{
        const clientPayments=txns.filter(t=>t.type==="income");
        const clientInvoices=docs.filter(d=>d.type==="client_invoice");
        const sentInvoices=clientInvoices.filter(d=>d.status!=="paid");
        const paidInvoices=clientInvoices.filter(d=>d.status==="paid");
        const invoicedUnpaidTotal=sentInvoices.reduce((a,d)=>a+(d.amount-(d.paidAmount||0)),0);
        const totalDue=comp.grandTotal;
        const arOutstanding=Math.max(0,totalDue-totalIncome);
        return<Card style={{padding:"18px 20px",marginBottom:12,borderLeft:`3px solid ${T.pos}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:11,fontWeight:700,color:T.pos,textTransform:"uppercase",letterSpacing:".08em"}}>Accounts Receivable</div>
            <div style={{display:"flex",gap:16,alignItems:"baseline",flexWrap:"wrap"}}>
              <span style={{fontSize:10,color:T.dim}}>Collected: <span className="num" style={{color:T.pos,fontFamily:T.mono,fontWeight:600}}>{f0(totalIncome)}</span></span>
              {invoicedUnpaidTotal>0&&<span style={{fontSize:10,color:T.dim}}>Invoiced (unpaid): <span className="num" style={{color:T.gold,fontFamily:T.mono,fontWeight:600}}>{f0(invoicedUnpaidTotal)}</span></span>}
              <span style={{fontSize:10,color:T.dim}}>Outstanding: <span className="num" style={{color:arOutstanding>0?T.gold:T.pos,fontFamily:T.mono,fontWeight:600}}>{f0(arOutstanding)}</span></span>
              <span style={{fontSize:10,color:T.dim}}>Total: <span className="num" style={{color:T.cream,fontFamily:T.mono,fontWeight:600}}>{f0(totalDue)}</span></span>
              {canEdit&&<button onClick={()=>setShowInvUpload(s=>!s)} style={{padding:"5px 12px",borderRadius:T.rS,background:showInvUpload?"transparent":T.goldSoft,color:showInvUpload?T.dim:T.gold,border:`1px solid ${showInvUpload?T.border:T.borderGlow}`,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans,textTransform:"uppercase",letterSpacing:".06em"}}>{showInvUpload?"Cancel":"+ Upload Invoice"}</button>}
            </div>
          </div>

          {/* Upload form */}
          {showInvUpload&&<div style={{padding:14,marginBottom:12,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:T.dim,letterSpacing:".10em",textTransform:"uppercase",marginBottom:10}}>Upload invoice sent to client</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Invoice number / name</label><input value={clInvNum} onChange={e=>setClInvNum(e.target.value)} placeholder="INV-001 or Deposit invoice" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg||T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
              <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Amount</label><input value={clInvAmt} onChange={e=>setClInvAmt(e.target.value)} placeholder="105000" inputMode="decimal" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg||T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none"}}/></div>
              <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Sent date</label><input type="date" value={clInvSent} onChange={e=>setClInvSent(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg||T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none"}}/></div>
              <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Due date</label><input type="date" value={clInvDue} onChange={e=>setClInvDue(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg||T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none"}}/></div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <input ref={clInvFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleClientInvoiceFile} style={{display:"none"}}/>
              <button type="button" onClick={()=>clInvFileRef.current?.click()} style={{padding:"7px 14px",borderRadius:T.rS,background:"transparent",color:T.cream,border:`1px solid ${T.border}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>📎 {clInvFile?"Replace file":"Attach PDF / image"}</button>
              {clInvFileName&&<span style={{fontSize:11,color:T.dim,fontStyle:"italic"}}>{clInvFileName}</span>}
              <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                <button onClick={addClientInvoice} disabled={!clInvNum.trim()||!parseFloat(clInvAmt)} style={{padding:"7px 16px",borderRadius:T.rS,background:(clInvNum.trim()&&parseFloat(clInvAmt))?T.ink:T.surface,color:(clInvNum.trim()&&parseFloat(clInvAmt))?T.paper:T.dim,border:"none",fontSize:11,fontWeight:700,cursor:(clInvNum.trim()&&parseFloat(clInvAmt))?"pointer":"default",fontFamily:T.sans,textTransform:"uppercase",letterSpacing:".06em"}}>Save invoice</button>
              </div>
            </div>
            <div style={{marginTop:8,fontSize:10,color:T.dim,fontStyle:"italic"}}>
              Marking this as Paid later will auto-create a client payment transaction.
            </div>
          </div>}

          {/* Sent invoices list */}
          {sentInvoices.length>0&&<div style={{marginBottom:12}}>
            <div style={{fontSize:9,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Sent — awaiting payment</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {sentInvoices.map(d=>{
                const isOD=d.dueDate && (new Date(d.dueDate) < new Date());
                return<div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:T.rS,background:isOD?"rgba(122,31,31,.06)":"transparent",border:`1px solid ${isOD?"rgba(122,31,31,.10)":T.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:isOD?`${T.neg}18`:`${T.gold}18`,color:isOD?T.neg:T.gold,textTransform:"uppercase"}}>{isOD?"Overdue":"Sent"}</span>
                    <span style={{fontSize:12,color:T.cream,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
                    {d.sentDate&&<span style={{fontSize:10,color:T.dim}}>· sent {d.sentDate}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                    {d.dueDate&&<span style={{fontSize:11,color:isOD?T.neg:T.dim,fontFamily:T.mono}}>due {d.dueDate}</span>}
                    <button onClick={()=>setViewingDoc(d)} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>View</button>
                    <span className="num" style={{fontSize:14,fontFamily:T.mono,fontWeight:700,color:isOD?T.neg:T.gold}}>{f$(d.amount)}</span>
                    {canEdit&&<button onClick={()=>sendReminder(d)} title="Email a reminder to the client" style={{padding:"4px 10px",borderRadius:T.rS,background:"transparent",color:T.cream,border:`1px solid ${T.border}`,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.color=T.gold}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.cream}}>✉ Remind</button>}
                    {canEdit&&<button onClick={()=>markClientInvoicePaid(d.id)} style={{padding:"4px 10px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Mark Paid</button>}
                    {canEdit&&<button onClick={()=>removeClientInvoice(d.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
                  </div>
                </div>;
              })}
            </div>
          </div>}
          {/* Progress bar */}
          <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden",marginBottom:clientPayments.length>0?12:0}}><div style={{height:"100%",width:`${Math.min(collected,100)}%`,background:T.ink,borderRadius:2,transition:"width .4s ease"}}/></div>
          {clientPayments.length>0?<div style={{display:"flex",flexDirection:"column",gap:3}}>
            {clientPayments.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(t=><div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",borderRadius:T.rS}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov||"rgba(255,255,255,.02)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:T.pos}}/>
                <span style={{fontSize:12,color:T.cream}}>{t.description}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{t.date}</span>
                <span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:600,color:T.pos}}>+{f$(t.amount)}</span>
                {canEdit&&<button onClick={()=>removeTxn(t.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={10} color={T.neg}/></button>}
              </div>
            </div>)}
          </div>:<div style={{fontSize:11,color:T.dim}}>No client payments received yet</div>}
        </Card>;
      })()}

      {/* ── Accounts Payable (vendor invoices) ── */}
      {(()=>{
        const vendorInvoices=docs.filter(d=>d.type==="invoice"&&d.amount>0);
        const unpaid=vendorInvoices.filter(d=>d.status!=="paid");
        const paid=vendorInvoices.filter(d=>d.status==="paid");
        const overdue=unpaid.filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d)));
        const pending=unpaid.filter(d=>d.status==="pending"&&!isOverdue(d));
        const partial=unpaid.filter(d=>d.status==="partial");
        const allUnpaid=[...overdue,...partial,...pending];
        const totalPayable=vendorInvoices.reduce((a,d)=>a+d.amount,0);
        const totalPaidAmt=vendorInvoices.reduce((a,d)=>a+(d.paidAmount||0),0);
        const apOutstanding=totalPayable-totalPaidAmt;
        return<Card style={{padding:"18px 20px",marginBottom:12,borderLeft:`3px solid ${overdue.length>0?T.neg:T.gold}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:overdue.length>0?T.neg:T.gold,textTransform:"uppercase",letterSpacing:".08em"}}>Accounts Payable{overdue.length>0&&<span style={{marginLeft:6,fontSize:9,padding:"2px 6px",borderRadius:8,background:`${T.neg}18`,color:T.neg}}>{overdue.length} overdue</span>}</div>
            <div style={{display:"flex",gap:16,alignItems:"baseline"}}>
              <span style={{fontSize:10,color:T.dim}}>Paid: <span className="num" style={{color:T.pos,fontFamily:T.mono,fontWeight:600}}>{f0(totalPaidAmt)}</span></span>
              <span style={{fontSize:10,color:T.dim}}>Outstanding: <span className="num" style={{color:apOutstanding>0?T.neg:T.pos,fontFamily:T.mono,fontWeight:600}}>{f0(apOutstanding)}</span></span>
              <span style={{fontSize:10,color:T.dim}}>Total: <span className="num" style={{color:T.cream,fontFamily:T.mono,fontWeight:600}}>{f0(totalPayable)}</span></span>
            </div>
          </div>
          {allUnpaid.length>0?<div style={{display:"flex",flexDirection:"column",gap:4}}>
            {allUnpaid.map(d=>{
              const vendor=getVendorName(d.vendorId,project.vendors);
              const remaining=d.amount-(d.paidAmount||0);
              const isOD=d.status==="overdue"||(d.status==="pending"&&isOverdue(d));
              return<div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:T.rS,background:isOD?"rgba(122,31,31,.06)":"transparent",border:`1px solid ${isOD?"rgba(122,31,31,.10)":T.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:isOD?`${T.neg}18`:d.status==="partial"?`${T.cyan}18`:`${T.gold}18`,color:isOD?T.neg:d.status==="partial"?T.cyan:T.gold,textTransform:"uppercase"}}>{isOD?"Overdue":d.status==="partial"?"Partial":"Due"}</span>
                  <span style={{fontSize:12,color:T.cream,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
                  {vendor&&<span style={{fontSize:10,color:T.dim}}>{vendor}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
                  {d.dueDate&&<span style={{fontSize:11,color:isOD?T.neg:T.dim,fontFamily:T.mono}}>{d.dueDate}</span>}
                  <span className="num" style={{fontSize:14,fontFamily:T.mono,fontWeight:700,color:isOD?T.neg:T.gold}}>{f$(remaining)}</span>
                  <button onClick={()=>setViewingDoc(d)} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>View</button>
                  {canEdit&&<button onClick={()=>markPaid(d.id)} style={{padding:"4px 10px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Mark Paid</button>}
                </div>
              </div>
            })}
            {paid.length>0&&<div style={{marginTop:8}}><button onClick={()=>setShowPaidAP(!showPaidAP)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:T.dim,fontFamily:T.sans}}>
              {showPaidAP?"Hide":"Show"} {paid.length} paid invoice{paid.length>1?"s":""}
            </button>
            {showPaidAP&&paid.map(d=>{
              const vendor=getVendorName(d.vendorId,project.vendors);
              return<div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",borderRadius:T.rS,opacity:.5,marginTop:3}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:`${T.pos}18`,color:T.pos,textTransform:"uppercase"}}>Paid</span><span style={{fontSize:12,color:T.cream}}>{d.name}</span>{vendor&&<span style={{fontSize:10,color:T.dim}}>{vendor}</span>}</div>
                <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.dim}}>{f$(d.amount)}</span>
              </div>})}</div>}
          </div>:<div style={{fontSize:11,color:T.dim}}>{vendorInvoices.length>0?"All invoices paid":"No vendor invoices yet"}</div>}
        </Card>;
      })()}

      {/* ── Add Transaction ── */}
      {showAdd&&<Card style={{padding:20,marginBottom:12}}>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {["income","expense"].map(t=><button key={t} onClick={()=>setNTy(t)} style={{padding:"7px 16px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:nTy===t?600:400,fontFamily:T.sans,background:nTy===t?(t==="income"?"rgba(52,211,153,.15)":"rgba(122,31,31,.18)"):"transparent",color:nTy===t?(t==="income"?T.pos:T.neg):T.dim}}>{t==="income"?"Client Payment":"Vendor Payment"}</button>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
          {[["Description",nDe,setNDe,nTy==="income"?"Client payment":"Vendor payment"],["Amount",nAm,setNAm,"25000"],["Category",nCa,setNCa,""]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addTxn()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>)}
        </div>
        {nTy==="expense"&&<div style={{marginBottom:12,maxWidth:300}}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Vendor</label><VendorSelect value={nVId} onChange={v=>{setNVId2(v);setMatchDocId("")}} vendors={project.vendors} onAddVendor={v=>{updateProject(prev=>({vendors:[...(prev.vendors||[]),v]}))}} compact/></div>}
        {nTy==="expense"&&nVId&&(()=>{
          const outstanding=(project.docs||[]).filter(d=>d.vendorId===nVId&&d.status!=="paid"&&d.type==="invoice");
          if(!outstanding.length)return null;
          return<div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Match to Invoice</label>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {outstanding.map(d=><button key={d.id} onClick={()=>{setMatchDocId(d.id);setNAm(String(d.amount-(d.paidAmount||0)))}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:T.rS,background:matchDocId===d.id?"rgba(34,211,238,.1)":T.surface,border:`1px solid ${matchDocId===d.id?T.cyan:T.border}`,cursor:"pointer",transition:"all .15s"}}>
                <span style={{fontSize:12,color:T.cream}}>{d.name}</span>
                <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.gold}}>{f$(d.amount-(d.paidAmount||0))} remaining</span>
              </button>)}
            </div>
          </div>;
        })()}
        <div style={{marginBottom:12,maxWidth:260}}><DatePick label="Date" value={nDa} onChange={setNDa} compact/></div>
        <button onClick={addTxn} style={{padding:"9px 20px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Entry</button>
      </Card>}

      {/* ── Transaction Log ── */}
      {sorted.length>0&&<>
        <div style={{fontSize:11,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8,marginTop:8}}>Transaction Log</div>
        <Card style={{overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:".6fr 2fr 1fr 1fr .3fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
            {["Date","Description","Category","Amount",""].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i===3?"right":"left"}}>{h}</span>)}
          </div>
          {sorted.map((t,idx)=><div key={t.id} style={{display:"grid",gridTemplateColumns:".6fr 2fr 1fr 1fr .3fr",padding:"10px 18px",borderBottom:idx<sorted.length-1?`1px solid ${T.border}`:"none",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:12,color:T.dim,fontFamily:T.mono}}>{t.date||"\u2014"}</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:6,height:6,borderRadius:"50%",background:t.type==="income"?T.pos:T.neg}}/><span style={{fontSize:13,color:T.cream}}>{t.description}</span></div>
            <span style={{fontSize:12,color:T.dim}}>{t.category||"\u2014"}</span>
            <span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:600,color:t.type==="income"?T.pos:T.neg,textAlign:"right"}}>{t.type==="income"?"+":"-"}{f$(t.amount)}</span>
            {canEdit&&<button onClick={()=>removeTxn(t.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2,justifySelf:"end"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
          </div>)}
        </Card>
      </>}
    </>}

    {/* ===== DOCUMENTS TAB ===== */}
    {tab==="documents"&&<>
      {/* AI Analysis confirmation */}
      {analyzing&&<Card style={{padding:"14px 18px",marginBottom:12,borderLeft:`3px solid ${T.cyan}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:T.cyan,animation:`pulse 1.2s ease-in-out ${i*.2}s infinite`}}/>)}</div>
          <span style={{fontSize:11,color:T.cyan}}>Analyzing {analyzing.fileName}...</span>
        </div>
      </Card>}
      {analysisResult&&<Card style={{padding:"18px 20px",marginBottom:12,borderLeft:`3px solid ${T.pos}`,background:"rgba(74,222,128,.03)"}}>
        <div style={{fontSize:10,fontWeight:700,color:T.pos,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Document Analyzed</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
          <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Type</div><div style={{fontSize:12,color:T.cream,fontWeight:600,textTransform:"capitalize"}}>{analysisResult.type||"—"}</div></div>
          <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Amount</div><div style={{fontSize:12,color:T.gold,fontWeight:600,fontFamily:T.mono}}>{analysisResult.amount?f$(analysisResult.amount):"—"}</div></div>
          <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Due Date</div><div style={{fontSize:12,color:T.cream,fontFamily:T.mono}}>{analysisResult.dueDate||"—"}</div></div>
          <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Terms</div><div style={{fontSize:12,color:T.cream}}>{analysisResult.terms||"—"}</div></div>
          <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Number</div><div style={{fontSize:12,color:T.cream}}>{analysisResult.number||"—"}</div></div>
        </div>
        {analysisResult.vendor&&<div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Detected Vendor: <span style={{color:T.cream,fontWeight:600}}>{analysisResult.vendor}</span></div>
        </div>}
        {analysisResult.notes&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Description / Notes</div>
          <div style={{fontSize:11,color:T.cream,lineHeight:1.5}}>{analysisResult.notes}</div>
        </div>}
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",flexShrink:0}}>Assign to</span>
          <div style={{maxWidth:250}}><VendorSelect value={analysisVendorId} onChange={setAnalysisVendorId} vendors={project.vendors} onAddVendor={v=>{updateProject(prev=>({vendors:[...(prev.vendors||[]),v]}))}} compact/></div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={confirmAnalysis} style={{padding:"7px 16px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Confirm & Apply</button>
          <button onClick={dismissAnalysis} style={{padding:"7px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Dismiss</button>
        </div>
      </Card>}
      {showDocAdd&&<Card style={{padding:20,marginBottom:16}}>
        {/* File picker — runs OCR on selection to pre-fill the form below */}
        <div style={{marginBottom:14,padding:14,borderRadius:T.rS,border:`1px dashed ${addDocFile?T.pos:T.border}`,background:addDocFile?"rgba(52,211,153,.04)":"transparent",display:"flex",alignItems:"center",gap:12}}>
          <input ref={addDocFileRef} type="file" accept="*" onChange={handleAddDocFile} style={{display:"none"}}/>
          <button onClick={()=>addDocFileRef.current?.click()} style={{padding:"8px 14px",borderRadius:T.rS,background:addDocFile?"transparent":T.ink,color:addDocFile?T.dim:T.paper,border:addDocFile?`1px solid ${T.border}`:"none",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>{addDocFile?"Replace file":"Choose file"}</button>
          <div style={{flex:1,minWidth:0}}>
            {addDocFile?<>
              <div style={{fontSize:12,color:T.cream,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{addDocFileName}</div>
              <div style={{fontSize:10,color:addDocOcring?T.gold:T.pos,marginTop:2}}>{addDocOcring?"Reading with Claude — fields will auto-fill…":"File attached. Fields below were filled by OCR — review and edit before saving."}</div>
            </>:<div style={{fontSize:11,color:T.dim}}>Optional. PDF or image. Claude will read it and fill in name, amount, due date, vendor.</div>}
          </div>
          {addDocFile&&<button onClick={()=>{setAddDocFile(null);setAddDocFileName("")}} style={{background:"none",border:"none",color:T.dim,fontSize:18,cursor:"pointer",padding:4}} aria-label="Remove file">×</button>}
        </div>
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>{[...DOC_TYPES,"client_invoice","quote","estimate"].filter((v,i,a)=>a.indexOf(v)===i).map(t=><button key={t} onClick={()=>setNDTy(t)} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:nDTy===t?600:400,fontFamily:T.sans,background:nDTy===t?`${(DOC_TYPE_COLORS[t]||T.ink)}22`:"transparent",color:nDTy===t?(DOC_TYPE_COLORS[t]||T.cream):T.dim,textTransform:"capitalize"}}>{t==="w9"?"W-9":t==="w2"?"W-2":t==="client_invoice"?"Client Invoice":t}</button>)}</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Name</label><input value={nN} onChange={e=>setNN2(e.target.value)} placeholder="Invoice #1042" onKeyDown={e=>e.key==="Enter"&&addDoc()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Vendor</label><VendorSelect value={nDVId} onChange={setNDVId} vendors={project.vendors} onAddVendor={v=>{updateProject(prev=>({vendors:[...(prev.vendors||[]),v]}))}} compact/></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Amount</label><input value={nDAm} onChange={e=>setNDAm(e.target.value)} placeholder="15000" onKeyDown={e=>e.key==="Enter"&&addDoc()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
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
        <button onClick={addDoc} style={{padding:"9px 20px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Document</button>
      </Card>}
      <div style={{display:"flex",gap:4,marginBottom:16}}>
        {["all","invoice","w9","w2","contract","overdue"].map(f=><button key={f} onClick={()=>setDocFilter(f)} style={{padding:"7px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:docFilter===f?600:400,fontFamily:T.sans,background:docFilter===f?T.goldSoft:"transparent",color:docFilter===f?T.gold:T.dim,textTransform:"capitalize"}}>{f==="all"?"All":f==="w9"?"W-9":f==="w2"?"W-2":f}</button>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {filteredDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",background:d.status==="overdue"?"rgba(122,31,31,.06)":T.surfEl,borderRadius:T.rS,border:`1px solid ${d.status==="overdue"?"rgba(122,31,31,.18)":T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=d.status==="overdue"?"rgba(122,31,31,.06)":T.surfEl}>
          <span style={{fontSize:10,fontWeight:700,color:DOC_TYPE_COLORS[d.type],letterSpacing:".08em",width:110,flexShrink:0}}>{({invoice:"INVOICE",client_invoice:"CLIENT INVOICE",contract:"CONTRACT",estimate:"ESTIMATE",quote:"QUOTE",w9:"W-9",w2:"W-2",other:"OTHER"})[d.type]||(d.type||"DOC").replace(/_/g," ").toUpperCase()}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.cream}}>{d.name}</div><div style={{fontSize:11,color:T.dim,marginTop:2}}>{getVendorName(d.vendorId,project.vendors)||"No vendor"}{d.dueDate?` \u00b7 Due: ${d.dueDate}`:""}{d.linkedItemId?` \u00b7 Linked: ${(()=>{const cat=project.cats.find(c=>c.id===d.linkedCatId);const item=cat?.items.find(i=>i.id===d.linkedItemId);return item?`${cat.name} \u2192 ${item.name}`:""})()||""}`:""}</div></div>
          <button onClick={()=>setViewingDoc(d)} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,flexShrink:0}}>{d.fileData?"View":"Details"}</button>
          {d.amount>0&&<span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:600,color:T.cream,flexShrink:0}}>{f$(d.amount)}</span>}
          <span style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:10,textTransform:"uppercase",flexShrink:0,background:d.status==="paid"?"rgba(52,211,153,.1)":d.status==="overdue"?"rgba(122,31,31,.10)":"rgba(255,234,151,.06)",color:d.status==="paid"?T.pos:d.status==="overdue"?T.neg:T.gold}}>{d.status}</span>
          {canEdit&&d.status!=="paid"&&<button onClick={()=>markPaid(d.id)} style={{fontSize:10,padding:"5px 10px",borderRadius:T.rS,border:`1px solid ${T.pos}`,background:"transparent",color:T.pos,cursor:"pointer",fontFamily:T.sans,fontWeight:600,flexShrink:0}}>Mark Paid</button>}
          {canEdit&&<button title="Delete document" onClick={()=>removeDoc(d.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
        </div>)}
        {filteredDocs.length===0&&<div onClick={()=>canEdit&&fileInputRef.current?.click()} style={{textAlign:"center",padding:60,color:T.dim,fontSize:13,cursor:canEdit?"pointer":"default",border:`2px dashed ${T.border}`,borderRadius:T.r,transition:"all .2s"}} onMouseEnter={e=>{if(canEdit){e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surface}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>
          <div style={{fontSize:32,opacity:.2,marginBottom:8}}>&#9639;</div>
          <div style={{fontSize:13,color:T.dim,marginBottom:4}}>{docFilter!=="all"?"No documents match this filter":"No documents yet"}</div>
          {canEdit&&<div style={{fontSize:11,color:T.dim,opacity:.6}}>Drag & drop files here or click to upload</div>}
        </div>}
      </div>
    </>}

    {/* Document viewer modal */}
    {viewingDoc&&<><div onClick={()=>setViewingDoc(null)} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)"}}/>
    <div className="slide-in" onClick={e=>e.stopPropagation()} style={{position:"fixed",top:32,bottom:32,left:"50%",transform:"translateX(-50%)",width:"92vw",maxWidth:1100,zIndex:201,borderRadius:T.r,background:T.bg,border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(15,82,186,.14)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div><div style={{fontSize:14,fontWeight:600,color:T.cream}}>{viewingDoc.name}</div><div style={{fontSize:10,color:T.dim,marginTop:2}}>{viewingDoc.type==="w9"?"W-9":viewingDoc.type==="w2"?"W-2":viewingDoc.type}{viewingDoc.dueDate?` \u00b7 Due: ${viewingDoc.dueDate}`:""}{viewingDoc.amount?` \u00b7 ${f$(viewingDoc.amount)}`:""}</div></div>
          <div style={{display:"flex",gap:8}}>
            {viewingBlobUrl&&(viewingDoc.fileData?.startsWith("data:application/pdf")||viewingDoc.fileName?.toLowerCase().endsWith(".pdf"))&&<a href={viewingBlobUrl} target="_blank" rel="noopener noreferrer" style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none"}}>Open in new tab</a>}
            {viewingDoc.fileData&&<a href={viewingDoc.fileData} download={viewingDoc.name||"document"} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none"}}>Download</a>}
            <button onClick={()=>setViewingDoc(null)} aria-label="Close" style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4}}>&times;</button>
          </div>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* Preview pane */}
          <div style={{flex:1,overflow:"auto",background:"#111"}}>
            {viewingDoc.fileData?.startsWith("data:image")?
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100%"}}><img src={viewingDoc.fileData} alt={viewingDoc.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/></div>
            :(viewingDoc.fileData?.startsWith("data:application/pdf")||viewingDoc.fileName?.toLowerCase().endsWith(".pdf"))?
              (pdfLoading?<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:12}}>Rendering PDF\u2026</div>
              :pdfPages.length>0?<div style={{padding:16,display:"flex",flexDirection:"column",gap:16,alignItems:"center"}}>{pdfPages.map((p,i)=><img key={i} src={p} alt={`Page ${i+1}`} style={{maxWidth:"100%",height:"auto",boxShadow:"0 4px 16px rgba(0,0,0,.4)",background:"#fff",display:"block"}}/>)}</div>
              :<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:12}}>Could not render PDF. Use Download or Open in new tab.</div>)
            :viewingDoc.fileData?<div style={{textAlign:"center",padding:40}}><div style={{fontSize:48,opacity:.2,marginBottom:16}}>&#9639;</div><div style={{fontSize:14,color:T.cream,marginBottom:8}}>{viewingDoc.name}</div><p style={{fontSize:12,color:T.dim,marginBottom:16}}>Preview not available</p><a href={viewingDoc.fileData} download={viewingDoc.name||"document"} style={{padding:"10px 24px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:13,fontWeight:700,textDecoration:"none"}}>Download</a></div>
            :<div style={{textAlign:"center",padding:40,color:T.dim}}>No file attached to this document</div>}
          </div>
          {/* Edit pane \u2014 manual override for OCR/amount/due date */}
          {canEdit&&<div style={{width:280,flexShrink:0,borderLeft:`1px solid ${T.border}`,padding:18,display:"flex",flexDirection:"column",gap:12,background:T.surface,overflow:"auto"}}>
            {/* AI suggestion banner \u2014 shown when BooksView's batch
                scanner left a pending suggestion on this doc. User
                must Apply (fills draft fields) or Reject (clears
                suggestion) before save. */}
            {viewingDoc.ocrSuggestion&&<div style={{padding:"12px 14px",borderRadius:T.rS,background:"rgba(74,222,128,.06)",border:`1px solid rgba(74,222,128,.25)`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.pos,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>AI suggested</div>
              <div style={{fontSize:11,color:T.cream,lineHeight:1.6}}>
                {viewingDoc.ocrSuggestion.type&&<div>Type: <b>{viewingDoc.ocrSuggestion.type}</b></div>}
                {viewingDoc.ocrSuggestion.amount>0&&<div>Amount: <b>${viewingDoc.ocrSuggestion.amount.toLocaleString()}</b></div>}
                {viewingDoc.ocrSuggestion.dueDate&&<div>Due: <b>{viewingDoc.ocrSuggestion.dueDate}</b></div>}
                {viewingDoc.ocrSuggestion.number&&<div>Number: <b>{viewingDoc.ocrSuggestion.number}</b></div>}
                {viewingDoc.ocrSuggestion.vendor&&<div>Vendor: <b>{viewingDoc.ocrSuggestion.vendor}</b></div>}
              </div>
              <div style={{display:"flex",gap:6,marginTop:10}}>
                <button onClick={()=>{
                  const s=viewingDoc.ocrSuggestion;
                  if(s.type)setDraftType(s.type);
                  if(s.amount>0)setDraftAmount(String(s.amount));
                  if(s.dueDate)setDraftDueDate(s.dueDate);
                  if(s.vendorId)setDraftVendorId(s.vendorId);
                  // Apply leaves the suggestion until Save clears it.
                }} style={{flex:1,padding:"6px 10px",borderRadius:T.rS,background:T.pos,color:T.bg,border:"none",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>Apply</button>
                <button onClick={()=>{
                  updateProject(prev=>({docs:(prev.docs||[]).map(d=>d.id===viewingDoc.id?{...d,ocrSuggestion:null}:d)}));
                  setViewingDoc(prev=>prev?{...prev,ocrSuggestion:null}:prev);
                }} style={{flex:1,padding:"6px 10px",borderRadius:T.rS,background:"transparent",color:T.dim,border:`1px solid ${T.border}`,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>Reject</button>
              </div>
            </div>}
            <div style={{fontSize:10,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>Edit details</div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Type</label>
              <select value={draftType} onChange={e=>setDraftType(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",cursor:"pointer"}}>
                <option value="invoice">Vendor invoice (Accounts Payable)</option>
                <option value="client_invoice">Client invoice (Accounts Receivable)</option>
                <option value="quote">Quote / Proposal</option>
                <option value="estimate">Estimate</option>
                <option value="contract">Contract</option>
                <option value="w9">W-9</option>
                <option value="w2">W-2</option>
                <option value="other">Other</option>
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
              <label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Vendor</label>
              <select value={draftVendorId} onChange={e=>setDraftVendorId(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.bg,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",cursor:"pointer"}}>
                <option value="">\u2014 None \u2014</option>
                {(project.vendors||[]).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <button onClick={saveDocEdits} style={{marginTop:6,padding:"10px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}>Save</button>
            {viewingDoc.fileData&&<button onClick={()=>analyzeDoc(viewingDoc.fileData,viewingDoc.name||"document",viewingDoc.id)} disabled={!!analyzing} style={{padding:"8px 14px",borderRadius:T.rS,background:"transparent",color:T.dim,border:`1px solid ${T.border}`,fontSize:10,fontWeight:600,cursor:analyzing?"default":"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase",opacity:analyzing?0.5:1}}>{analyzing?"Analyzing\u2026":"Re-run OCR"}</button>}
          </div>}
        </div>
      </div>
    </>}
  </div>;
}

export default PnLV;
