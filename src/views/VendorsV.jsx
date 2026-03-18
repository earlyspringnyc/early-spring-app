import { useState, useRef } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { isOverdue } from '../utils/calc.js';
import { VENDOR_TYPES, VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, INVOICE_KINDS, INVOICE_KIND_LABELS, INVOICE_KIND_COLORS } from '../constants/index.js';
import { mkVendor, mkDoc } from '../data/factories.js';
import { TrashI } from '../components/icons/index.js';
import { Card, Metric, DatePick } from '../components/primitives/index.js';

/* Auto-detect doc type from filename */
const detectDocType=(fileName)=>{
  const f=(fileName||"").toLowerCase();
  if(/w[\-_\s]?9|w9/i.test(f))return"w9";
  if(/contract|agreement|sow|scope/i.test(f))return"contract";
  return"invoice";
};
const DOC_TYPE_META={
  invoice:{label:"Invoice",color:"#FBBF24"},
  contract:{label:"Contract",color:"#60A5FA"},
  w9:{label:"W-9",color:"#22D3EE"},
};

function VendorsV({project,updateProject,canEdit,onVendorClick}){
  const vendors=project.vendors||[];const docs=project.docs||[];const txns=project.txns||[];
  const[showAdd,setShowAdd]=useState(false);const[typeFilter,setTypeFilter]=useState("all");const[vendorSearch,setVendorSearch]=useState("");
  const[nN,setNN3]=useState("");const[nE,setNE2]=useState("");const[nP,setNP]=useState("");const[nNo,setNNo2]=useState("");const[nType,setNType]=useState("other");const[nContact,setNContact]=useState("");const[nFinName,setNFinName]=useState("");const[nFinEmail,setNFinEmail]=useState("");
  const[uploadVendorId,setUploadVendorId]=useState(null);const[invName,setInvName]=useState("");const[invAmt,setInvAmt]=useState("");const[invDue,setInvDue]=useState("");const[invKind,setInvKind]=useState("deposit");const[invFile,setInvFile]=useState(null);const[invFileName,setInvFileName]=useState("");
  const[docType,setDocType]=useState("invoice");
  const[analyzing,setAnalyzing]=useState(null); // vendorId being analyzed
  const fileRefs=useRef({});
  const invFileRef=useRef(null);

  /* AI document analysis — extract invoice details */
  const analyzeDocument=async(fileData,fileName,vendorId)=>{
    setAnalyzing(vendorId);
    try{
      const isImage=fileData.startsWith("data:image");
      const isPdf=fileData.startsWith("data:application/pdf");
      if(!isImage&&!isPdf){setAnalyzing(null);return null}
      const content=isImage?[{type:"image",source:{type:"base64",media_type:fileData.split(";")[0].split(":")[1],data:fileData.split(",")[1]}},{type:"text",text:"Extract from this document: 1) document type (invoice/contract/w9), 2) total amount as a number, 3) due date in MM/DD/YYYY format, 4) invoice/document number, 5) vendor name. Return ONLY valid JSON like: {\"type\":\"invoice\",\"amount\":1234.56,\"dueDate\":\"03/15/2026\",\"number\":\"INV-001\",\"vendor\":\"ABC Co\"}"}]
      :[{type:"text",text:"The user uploaded a PDF named '"+fileName+"'. Based on the filename, determine: 1) document type (invoice/contract/w9), 2) any amount or date hints from the name. Return ONLY valid JSON like: {\"type\":\"invoice\",\"amount\":0,\"dueDate\":\"\",\"number\":\"\",\"vendor\":\"\"}"}];
      const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,messages:[{role:"user",content}]})});
      if(!res.ok){setAnalyzing(null);return null}
      const data=await res.json();
      const text=data.content[0].text;
      const jsonMatch=text.match(/\{[\s\S]*\}/);
      if(!jsonMatch){setAnalyzing(null);return null}
      const parsed=JSON.parse(jsonMatch[0]);
      setAnalyzing(null);
      return parsed;
    }catch(e){setAnalyzing(null);return null}
  };
  const totalOutstanding=vendors.reduce((a,v)=>{const vDocs=docs.filter(d=>d.vendorId===v.id&&d.type==="invoice"&&d.status!=="paid");return a+vDocs.reduce((s,d)=>s+(d.amount-(d.paidAmount||0)),0)},0);
  const addVendor=()=>{if(!nN.trim())return;updateProject({vendors:[...vendors,{...mkVendor(nN.trim(),nE,nP,nNo,"pending",nType,nContact),financeContactName:nFinName,financeContactEmail:nFinEmail}]});setNN3("");setNE2("");setNP("");setNNo2("");setNType("other");setNContact("");setNFinName("");setNFinEmail("");setShowAdd(false)};
  const handleFileUpload=async(vendorId,e)=>{
    const file=e.target.files[0];if(!file)return;
    const detected=detectDocType(file.name);
    const reader=new FileReader();
    reader.onload=async ev=>{
      const fileData=ev.target.result;
      const doc=mkDoc(file.name.replace(/\.[^/.]+$/,""),detected,vendorId,0,"","pending","","","",fileData);
      if(detected==="invoice")doc.invoiceKind="deposit";
      // Add doc immediately
      updateProject({docs:[...(project.docs||[]),doc]});
      // Analyze in background
      const analysis=await analyzeDocument(fileData,file.name,vendorId);
      if(analysis){
        // Update the doc with extracted data
        const updatedDocs=(project.docs||[]).concat(doc).map(d=>{
          if(d.id!==doc.id)return d;
          const updates={};
          if(analysis.type)updates.type=analysis.type;
          if(analysis.amount&&analysis.amount>0)updates.amount=analysis.amount;
          if(analysis.dueDate)updates.dueDate=analysis.dueDate;
          if(analysis.number)updates.name=analysis.number+" — "+(d.name||file.name);
          return{...d,...updates};
        });
        updateProject({docs:updatedDocs});
      }
    };
    reader.readAsDataURL(file);
    e.target.value="";
  };
  const handleInvFile=async(e)=>{const file=e.target.files[0];if(!file)return;setInvFileName(file.name);setDocType(detectDocType(file.name));if(!invName)setInvName(file.name.replace(/\.[^/.]+$/,""));const reader=new FileReader();reader.onload=async ev=>{setInvFile(ev.target.result);
    const analysis=await analyzeDocument(ev.target.result,file.name,uploadVendorId);
    if(analysis){
      if(analysis.amount&&analysis.amount>0)setInvAmt(String(analysis.amount));
      if(analysis.dueDate)setInvDue(analysis.dueDate);
      if(analysis.type)setDocType(analysis.type);
      if(analysis.number)setInvName(analysis.number);
    }
  };reader.readAsDataURL(file)};
  const submitInvoice=()=>{if(!invName.trim()||!uploadVendorId)return;const doc=mkDoc(invName.trim(),docType,uploadVendorId,parseFloat(invAmt)||0,invDue,"pending","","",invKind,invFile);if(docType==="invoice"&&isOverdue(doc))doc.status="overdue";updateProject({docs:[...(project.docs||[]),doc]});setInvName("");setInvAmt("");setInvDue("");setInvKind("deposit");setInvFile(null);setInvFileName("");setDocType("invoice");setUploadVendorId(null)};
  const removeVendor=id=>updateProject({vendors:vendors.filter(v=>v.id!==id)});
  const filtered=vendors.filter(v=>{const matchType=typeFilter==="all"||v.vendorType===typeFilter;if(!matchType)return false;if(!vendorSearch.trim())return true;const q=vendorSearch.toLowerCase();return(v.name||"").toLowerCase().includes(q)||(v.email||"").toLowerCase().includes(q)||(v.contactName||"").toLowerCase().includes(q)||(v.notes||"").toLowerCase().includes(q)});
  const getVendorStats=(v)=>{
    const vDocs=docs.filter(d=>d.vendorId===v.id);
    const invoices=vDocs.filter(d=>d.type==="invoice");
    const totalInvoiced=invoices.reduce((a,d)=>a+d.amount,0);
    const totalPaid=invoices.reduce((a,d)=>a+(d.paidAmount||0),0);
    const totalContracted=(project.cats||[]).reduce((a,c)=>a+c.items.filter(i=>i.vendorId===v.id).reduce((s,i)=>s+i.actualCost,0),0);
    const discrepancy=totalContracted>0&&totalInvoiced>0?Math.abs(totalInvoiced-totalContracted):0;
    const hasDiscrepancy=discrepancy>0&&(discrepancy/Math.max(totalContracted,totalInvoiced))>0.01; // >1% difference
    return{invoices:invoices.length,totalInvoiced,totalPaid,outstanding:totalInvoiced-totalPaid,docCount:vDocs.length,totalContracted,hasDiscrepancy,discrepancy};
  };
  const getVendorDocs=(v)=>docs.filter(d=>d.vendorId===v.id);

  const cols="2fr minmax(70px,.8fr) minmax(80px,1fr) minmax(100px,1.2fr) minmax(70px,.8fr) minmax(70px,.8fr) minmax(70px,.8fr) minmax(90px,.6fr)";

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:20,fontWeight:600,color:T.cream,letterSpacing:"-0.01em"}}>Vendors</h1><p style={{fontSize:13,color:T.dim,marginTop:6}}>{vendors.length} vendors</p></div>
    </div>
    <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
      <Metric label="Total Vendors" value={vendors.length}/>
      {(()=>{const allInvoices=docs.filter(d=>d.type==="invoice");const totalPaid=allInvoices.filter(d=>d.status==="paid").reduce((a,d)=>a+d.amount,0);return<><Metric label="Invoices Received" value={allInvoices.length} color={T.gold}/><Metric label="Invoices Paid" value={f0(totalPaid)} color={T.pos}/></>})()}
      <Metric label="Outstanding" value={f0(totalOutstanding)} color={totalOutstanding>0?T.neg:T.dim} glow={totalOutstanding>0}/>
    </div>
    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:12,marginBottom:12}}>
        {[["Vendor Name",nN,setNN3,"ABC Productions"],["Contact Name",nContact,setNContact,"Jane Smith"],["Email",nE,setNE2,"vendor@co.com"],["Phone",nP,setNP,"(555) 000-0000"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input autoFocus={l==="Vendor Name"} value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addVendor()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12,marginBottom:12}}>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Vendor Type</label>
          <select value={nType} onChange={e=>setNType(e.target.value)} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
            {VENDOR_TYPES.map(t=><option key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</option>)}
          </select></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Notes</label><input value={nNo} onChange={e=>setNNo2(e.target.value)} placeholder="Optional notes" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Finance Contact Name</label><input value={nFinName} onChange={e=>setNFinName(e.target.value)} placeholder="John Doe" onKeyDown={e=>e.key==="Enter"&&addVendor()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Finance Contact Email</label><input value={nFinEmail} onChange={e=>setNFinEmail(e.target.value)} placeholder="finance@co.com" onKeyDown={e=>e.key==="Enter"&&addVendor()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
      </div>
      <button onClick={addVendor} style={{padding:"9px 20px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Vendor</button>
    </Card>}
    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
      <input value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)} placeholder="Search vendors…" style={{padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${vendorSearch?T.borderGlow:T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none",width:180}}/>
      <div style={{position:"relative"}}>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{padding:"7px 28px 7px 10px",borderRadius:T.rS,background:typeFilter!=="all"?`${VENDOR_TYPE_COLORS[typeFilter]||T.gold}12`:T.surface,border:`1px solid ${typeFilter!=="all"?`${VENDOR_TYPE_COLORS[typeFilter]||T.gold}33`:T.border}`,color:typeFilter!=="all"?VENDOR_TYPE_COLORS[typeFilter]||T.gold:T.dim,fontSize:11,fontWeight:typeFilter!=="all"?600:400,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none"}}>
          <option value="all">All Types</option>
          {VENDOR_TYPES.map(t=><option key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</option>)}
        </select>
        <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:8,color:T.dim,pointerEvents:"none"}}>▼</span>
      </div>
      {typeFilter!=="all"&&<button onClick={()=>setTypeFilter("all")} style={{padding:"5px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontFamily:T.sans,background:"rgba(248,113,113,.08)",color:T.neg}}>Clear</button>}
      <span style={{fontSize:11,color:T.dim,marginLeft:"auto"}}>{filtered.length} vendor{filtered.length!==1?"s":""}</span>
      {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:showAdd?"transparent":T.goldSoft,color:showAdd?T.dim:T.gold,border:`1px solid ${showAdd?T.border:T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}}>{showAdd?"Cancel":"+ Add Vendor"}</button>}
    </div>
    <Card style={{overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:cols,padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface,alignItems:"center"}}>
        {["Vendor","Type","Contact","Email","Contracted","Invoiced","Outstanding",""].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i>=4?"right":"left"}}>{h}</span>)}
      </div>
      {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:T.dim,fontSize:13}}>No vendors{typeFilter!=="all"?" match this filter":""}.</div>}
      {filtered.map(v=>{const s=getVendorStats(v);const vDocs=getVendorDocs(v);return<div key={v.id}>
        <div style={{display:"grid",gridTemplateColumns:cols,padding:"14px 18px",borderBottom:uploadVendorId===v.id?"none":`1px solid ${T.border}`,alignItems:"center",cursor:"pointer",background:uploadVendorId===v.id?T.surfHov:"transparent",transition:"background .1s"}} onClick={()=>onVendorClick&&onVendorClick(v.id)} onMouseEnter={e=>{if(uploadVendorId!==v.id)e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{if(uploadVendorId!==v.id)e.currentTarget.style.background="transparent"}}>
          <div><div style={{fontSize:13,fontWeight:500,color:T.cream}}>{v.name}</div>{v.notes&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{v.notes}</div>}</div>
          <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${VENDOR_TYPE_COLORS[v.vendorType||"other"]}18`,color:VENDOR_TYPE_COLORS[v.vendorType||"other"],display:"inline-block",lineHeight:1.4,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis"}}>{VENDOR_TYPE_LABELS[v.vendorType||"other"]}</span>
          <div style={{fontSize:12,color:T.cream}}>{v.contactName||"\u2014"}</div>
          <div style={{fontSize:11,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>{v.email||"\u2014"}{!v.email&&<span title="Email required" style={{fontSize:10,fontWeight:700,color:"#F59E0B",background:"rgba(245,158,11,.12)",borderRadius:20,width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>!</span>}</div>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.cream}}>{s.totalContracted>0?f0(s.totalContracted):"\u2014"}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.cream}}>{s.totalInvoiced>0?f0(s.totalInvoiced):"\u2014"}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:s.outstanding>0?T.neg:T.dim,fontWeight:s.outstanding>0?600:400}}>{s.outstanding>0?f0(s.outstanding):"\u2014"}{s.hasDiscrepancy&&<span title={`Invoice total (${f0(s.totalInvoiced)}) differs from budget (${f0(s.totalContracted)}) by ${f0(s.discrepancy)}`} style={{marginLeft:4,fontSize:9,fontWeight:700,color:"#F59E0B",background:"rgba(245,158,11,.12)",borderRadius:20,width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>!</span>}</span>
          <div style={{display:"flex",gap:6,justifyContent:"flex-end",alignItems:"center"}}>
            {canEdit&&<><input ref={el=>{if(el)fileRefs.current[v.id]=el}} type="file" accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx" onChange={e=>handleFileUpload(v.id,e)} style={{display:"none"}}/>
            <button onClick={e=>{e.stopPropagation();fileRefs.current[v.id]?.click()}} style={{background:analyzing===v.id?"rgba(6,182,212,.08)":T.surface,border:`1px solid ${analyzing===v.id?"rgba(6,182,212,.3)":T.border}`,borderRadius:T.rS,padding:"5px 12px",cursor:analyzing===v.id?"default":"pointer",fontSize:10,fontWeight:600,color:analyzing===v.id?T.cyan:T.dim,transition:"all .15s",display:"flex",alignItems:"center",gap:4}} onMouseEnter={e=>{if(analyzing!==v.id){e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.color=T.gold}}} onMouseLeave={e=>{if(analyzing!==v.id){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}}>{analyzing===v.id?"Analyzing...":"↑ Upload"}</button></>}
            {canEdit&&<button title="Delete vendor" onClick={e=>{e.stopPropagation();if(confirm(`Remove "${v.name}"?`))removeVendor(v.id)}} style={{background:"rgba(248,113,113,.06)",border:`1px solid rgba(248,113,113,.15)`,borderRadius:T.rS,cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.15)";e.currentTarget.style.borderColor="rgba(248,113,113,.3)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.06)";e.currentTarget.style.borderColor="rgba(248,113,113,.15)"}}><TrashI size={12} color={T.neg}/></button>}
          </div>
        </div>
        {/* Show recently uploaded docs for this vendor */}
        {vDocs.length>0&&uploadVendorId===v.id&&<div style={{padding:"10px 18px 14px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Documents ({vDocs.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {vDocs.map(d=>{const meta=DOC_TYPE_META[d.type]||DOC_TYPE_META.invoice;return<span key={d.id} style={{fontSize:10,padding:"4px 10px",borderRadius:8,background:`${meta.color}15`,color:meta.color,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:meta.color}}/>{d.name}<span style={{fontWeight:400,opacity:.7,marginLeft:2}}>{meta.label}</span>
            </span>})}
          </div>
        </div>}
        {uploadVendorId===v.id&&<div style={{padding:"16px 18px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:11,fontWeight:600,color:T.cyan,marginBottom:12,textTransform:"uppercase",letterSpacing:".08em"}}>Add Document for {v.name}</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Document Name</label><input autoFocus value={invName} onChange={e=>setInvName(e.target.value)} placeholder="Invoice #1042" onKeyDown={e=>e.key==="Enter"&&submitInvoice()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Amount</label><input value={invAmt} onChange={e=>setInvAmt(e.target.value)} placeholder="25000" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none"}}/></div>
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Due Date</label><DatePick value={invDue} onChange={setInvDue} compact/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,marginBottom:12}}>
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Document Type</label>
              <div style={{display:"flex",gap:4}}>{["invoice","contract","w9"].map(t=>{const meta=DOC_TYPE_META[t];return<button key={t} onClick={()=>setDocType(t)} style={{flex:1,padding:"7px 0",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:docType===t?700:400,fontFamily:T.sans,background:docType===t?`${meta.color}22`:"transparent",color:docType===t?meta.color:T.dim,transition:"all .15s"}}>{meta.label}</button>})}</div></div>
            {docType==="invoice"&&<div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Invoice Type</label>
              <div style={{display:"flex",gap:4}}>{INVOICE_KINDS.map(k=><button key={k} onClick={()=>setInvKind(k)} style={{flex:1,padding:"7px 0",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:invKind===k?700:400,fontFamily:T.sans,background:invKind===k?`${INVOICE_KIND_COLORS[k]}22`:"transparent",color:invKind===k?INVOICE_KIND_COLORS[k]:T.dim,textTransform:"capitalize",transition:"all .15s"}}>{INVOICE_KIND_LABELS[k]}</button>)}</div></div>}
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Attach File (PDF, PNG, JPG)</label>
              <input ref={invFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx" onChange={handleInvFile} style={{display:"none"}}/>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>invFileRef.current.click()} style={{padding:"7px 14px",borderRadius:T.rS,border:`1px dashed ${invFile?T.pos:T.border}`,background:invFile?"rgba(52,211,153,.06)":"transparent",color:invFile?T.pos:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}}>{invFile?"Replace file":"Choose file…"}</button>
                {invFileName&&<span style={{fontSize:11,color:T.pos,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{invFileName}</span>}
              </div></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={submitInvoice} disabled={!invName.trim()} style={{padding:"8px 18px",background:invName.trim()?T.goldSoft:"rgba(255,255,255,.05)",color:invName.trim()?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${invName.trim()?T.borderGlow:"transparent"}`,borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:invName.trim()?"pointer":"default",fontFamily:T.sans}}>Add Document</button>
            <button onClick={()=>setUploadVendorId(null)} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
          </div>
        </div>}
      </div>})}
    </Card>
  </div>;
}

export default VendorsV;
