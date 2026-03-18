import { useState, useRef, useCallback } from 'react';
import T from '../../theme/tokens.js';
import { f$, f0 } from '../../utils/format.js';
import { getPayStatus, isOverdue } from '../../utils/calc.js';
import { uid } from '../../utils/uid.js';
import { mkDoc } from '../../data/factories.js';
import { VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, VENDOR_TYPES, PAYMENT_COLORS, PAYMENT_LABELS, DOC_TYPE_COLORS, INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../../constants/index.js';
import { TrashI } from '../icons/index.js';
import { Card, DatePick } from '../primitives/index.js';

const VENDOR_DOC_TYPES = ["invoice","contract","estimate","coi","w9","license","permit","other"];
const VENDOR_DOC_LABELS = {invoice:"Invoice",contract:"Contract",estimate:"Estimate",coi:"Certificate of Insurance",w9:"W-9",license:"License",permit:"Permit",other:"Other"};
const VENDOR_DOC_COLORS = {invoice:"#FBBF24",contract:"#60A5FA",estimate:"#4ADE80",coi:"#22D3EE",w9:"#C4B5FD",license:"#FB923C",permit:"#FDBA74",other:"rgba(250,250,249,.5)"};

const Pill=({children,color=T.gold,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;
const Label=({children})=><div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{children}</div>;
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

  const autoDetectDocType=(fileName)=>{const n=fileName.toLowerCase();if(n.includes("invoice")||n.includes("inv"))return"invoice";if(n.includes("contract")||n.includes("agreement")||n.includes("sow"))return"contract";if(n.includes("estimate")||n.includes("quote"))return"estimate";if(n.includes("coi")||n.includes("insurance")||n.includes("certificate"))return"coi";if(n.includes("w9")||n.includes("w-9"))return"w9";if(n.includes("license"))return"license";if(n.includes("permit"))return"permit";return"invoice"};

  const[docAnalyzing,setDocAnalyzing]=useState(false);
  const[docAnalysisResult,setDocAnalysisResult]=useState(null);

  const analyzeAndAddDoc=useCallback(async(fileData,fileName,docId)=>{
    setDocAnalyzing(true);
    try{
      const isImage=fileData.startsWith("data:image");
      const content=isImage?[
        {type:"image",source:{type:"base64",media_type:fileData.split(";")[0].split(":")[1],data:fileData.split(",")[1]}},
        {type:"text",text:"Extract from this document: 1) type (invoice/contract/w9/estimate), 2) total amount as number, 3) due date in MM/DD/YYYY, 4) invoice/doc number. Return ONLY JSON: {\"type\":\"invoice\",\"amount\":0,\"dueDate\":\"\",\"number\":\"\"}"}
      ]:[{type:"text",text:`File: "${fileName}". Determine: type (invoice/contract/w9/estimate), any amount/date hints. Return ONLY JSON: {"type":"invoice","amount":0,"dueDate":"","number":""}`}];
      const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,messages:[{role:"user",content}]})});
      if(res.ok){
        const data=await res.json();const text=data.content[0].text;
        const match=text.match(/\{[\s\S]*\}/);
        if(match){
          const parsed=JSON.parse(match[0]);
          // Auto-apply to the doc in project.docs
          const updates={};
          if(parsed.type)updates.type=parsed.type;
          if(parsed.amount&&parsed.amount>0)updates.amount=parsed.amount;
          if(parsed.dueDate)updates.dueDate=parsed.dueDate;
          if(parsed.number)updates.name=`${parsed.number}`;
          updateProject({docs:(project.docs||[]).map(d=>d.id===docId?{...d,...updates,status:isOverdue({...d,...updates})?"overdue":"pending"}:d)});
          setDocAnalysisResult({docId,...parsed});
          setTimeout(()=>setDocAnalysisResult(null),5000);
        }
      }
    }catch(e){console.error("[vendor-doc-analysis]",e)}
    setDocAnalyzing(false);
  },[project.docs,updateProject]);

  const handleDropFiles=useCallback((files)=>{
    Array.from(files).forEach(file=>{const reader=new FileReader();reader.onload=ev=>{
      const type=autoDetectDocType(file.name);const name=file.name.replace(/\.[^/.]+$/,"");
      // Add to vendor.documents
      const vendorDoc={id:uid(),name,type,notes:"",fileName:file.name,fileData:ev.target.result,expiryDate:"",dateAdded:new Date().toLocaleDateString()};
      const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:[...(vendor.documents||[]),vendorDoc]}:vendor);
      // Also add to project.docs for finance tracking
      const financeDoc=mkDoc(name,type,vendorId,0,"","pending","","","",ev.target.result);
      updateProject({vendors:updatedVendors,docs:[...(project.docs||[]),financeDoc]});
      // Run AI analysis
      analyzeAndAddDoc(ev.target.result,file.name,financeDoc.id);
    };reader.readAsDataURL(file)});
  },[project.vendors,project.docs,vendorId,updateProject,analyzeAndAddDoc]);

  const onDocDragEnter=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current++;setDraggingDoc(true)},[]);
  const onDocDragLeave=useCallback(e=>{e.preventDefault();e.stopPropagation();dragCounter.current--;if(dragCounter.current===0)setDraggingDoc(false)},[]);
  const onDocDragOver=useCallback(e=>{e.preventDefault();e.stopPropagation()},[]);
  const onDocDrop=useCallback(e=>{e.preventDefault();e.stopPropagation();setDraggingDoc(false);dragCounter.current=0;if(e.dataTransfer.files?.length)handleDropFiles(e.dataTransfer.files)},[handleDropFiles]);

  const vendorDocs=(v.documents||[]);
  const projectDocs=(project.docs||[]).filter(d=>d.vendorId===vendorId);
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
    const doc={id:uid(),name:docName.trim(),type:docType,notes:docNotes,fileName:docFileName,fileData:docFile,expiryDate:docExpiry,dateAdded:new Date().toLocaleDateString()};
    const updatedVendors=(project.vendors||[]).map(vendor=>vendor.id===vendorId?{...vendor,documents:[...(vendor.documents||[]),doc]}:vendor);
    // Also add to project.docs for finance tracking
    const financeDoc=mkDoc(docName.trim(),docType,vendorId,0,"","pending","","","",docFile);
    updateProject({vendors:updatedVendors,docs:[...(project.docs||[]),financeDoc]});
    // Run AI analysis if we have file data
    if(docFile)analyzeAndAddDoc(docFile,docFileName||docName.trim(),financeDoc.id);
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

  return<div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={onClose}>
    <div className="slide-in modal-inner" onClick={e=>e.stopPropagation()} style={{width:920,maxWidth:"95vw",maxHeight:"92vh",overflow:"auto",padding:0,borderRadius:T.r,background:"rgba(12,10,20,.96)",border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>

      {/* ── Header ── */}
      <div style={{padding:"24px 32px 20px",borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,background:"rgba(12,10,20,.96)",zIndex:2,backdropFilter:"blur(12px)"}}>
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
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Contracted</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{f0(totalContracted)}</div></div>
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Invoiced</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(totalInvoiced)}</div></div>
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Paid</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.pos,fontFamily:T.mono}}>{f0(totalPaid)}</div></div>
          <div style={{padding:"14px 16px",borderRadius:T.rS,background:outstanding>0?"rgba(248,113,113,.04)":T.surfEl,border:`1px solid ${outstanding>0?"rgba(248,113,113,.15)":T.border}`}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Outstanding</div><div className="num" style={{fontSize:20,fontWeight:700,color:outstanding>0?T.neg:T.dim,fontFamily:T.mono}}>{f0(outstanding)}</div></div>
        </div>

        {/* Overdue alert */}
        {overdueInvoices.length>0&&<div style={{marginBottom:20,padding:"12px 16px",borderRadius:T.rS,background:"rgba(248,113,113,.04)",border:"1px solid rgba(248,113,113,.12)"}}>
          <div style={{fontSize:10,fontWeight:700,color:T.neg,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Overdue ({overdueInvoices.length})</div>
          {overdueInvoices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid rgba(248,113,113,.06)`}}>
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
                <div style={{fontSize:13,fontWeight:500,color:T.cream}}>{v.contactName||v.name}</div>
                {v.email&&<div style={{fontSize:11,color:T.cyan,marginTop:2}}>{v.email}</div>}
                {v.phone&&<div style={{fontSize:11,color:T.dim,marginTop:2}}>{v.phone}</div>}
              </div>
              {(v.secondaryContactName||v.secondaryContactEmail)&&<div style={{padding:"12px 14px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Secondary</div>
                <div style={{fontSize:13,fontWeight:500,color:T.cream}}>{v.secondaryContactName||"—"}</div>
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
                  <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}><span style={{fontSize:12,color:T.cream,fontWeight:500}}>{d.name}</span>{d.invoiceKind&&<Pill color={INVOICE_KIND_COLORS[d.invoiceKind]||T.dim} size="xs">{INVOICE_KIND_LABELS[d.invoiceKind]||d.invoiceKind}</Pill>}</div>
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
                <div><span style={{fontSize:12,color:T.cream,fontWeight:500}}>{it.name}</span><span style={{fontSize:10,color:T.dim,marginLeft:6}}>{it.catName}</span></div>
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
                <button onClick={addVendorDoc} disabled={!docName.trim()} style={{padding:"6px 14px",marginLeft:"auto",background:docName.trim()?T.goldSoft:"rgba(255,255,255,.05)",color:docName.trim()?T.gold:"rgba(255,255,255,.2)",border:`1px solid ${docName.trim()?T.borderGlow:"transparent"}`,borderRadius:T.rS,fontSize:10,fontWeight:700,cursor:docName.trim()?"pointer":"default",fontFamily:T.sans}}>Add</button>
              </div>
            </div>}

            {docAnalyzing&&<div style={{padding:"10px 14px",borderRadius:T.rS,background:"rgba(74,222,128,.04)",border:`1px solid rgba(74,222,128,.12)`,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:14,height:14,border:`2px solid ${T.pos}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
              <span style={{fontSize:11,color:T.pos}}>Analyzing document...</span>
            </div>}
            {docAnalysisResult&&<div style={{padding:"10px 14px",borderRadius:T.rS,background:"rgba(74,222,128,.04)",border:`1px solid rgba(74,222,128,.12)`,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:T.pos,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Auto-detected</div>
              <div style={{display:"flex",gap:16,fontSize:11}}>
                {docAnalysisResult.type&&<span style={{color:T.cream}}>Type: <b style={{textTransform:"capitalize"}}>{docAnalysisResult.type}</b></span>}
                {docAnalysisResult.amount>0&&<span style={{color:T.gold,fontFamily:T.mono,fontWeight:600}}>{f$(docAnalysisResult.amount)}</span>}
                {docAnalysisResult.dueDate&&<span style={{color:T.dim}}>Due: {docAnalysisResult.dueDate}</span>}
                {docAnalysisResult.number&&<span style={{color:T.dim}}>#{docAnalysisResult.number}</span>}
              </div>
            </div>}
            {allDocs.length>0?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:6}}>
              {vendorDocs.map(d=><div key={d.id} onClick={()=>setViewingDoc(d)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
                <Pill color={VENDOR_DOC_COLORS[d.type]||VENDOR_DOC_COLORS.other} size="xs">{VENDOR_DOC_LABELS[d.type]||d.type}</Pill>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div><div style={{fontSize:9,color:T.dim,marginTop:1}}>{d.dateAdded}</div></div>
                {canEdit&&<button onClick={e=>{e.stopPropagation();removeVendorDoc(d.id)}} style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.12)",borderRadius:T.rS,cursor:"pointer",padding:"3px 5px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.15)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.06)"}}><TrashI size={10} color={T.neg}/></button>}
              </div>)}
              {projectDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
                <Pill color={DOC_TYPE_COLORS[d.type]||T.dim} size="xs">{d.type==="w9"?"W-9":d.type}</Pill>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,color:T.cream,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>{d.amount>0&&<div style={{fontSize:10,color:T.dim,fontFamily:T.mono,marginTop:1}}>{f$(d.amount)}</div>}</div>
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
    {viewingDoc&&<div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)"}} onClick={()=>setViewingDoc(null)}>
      <div className="slide-in" onClick={e=>e.stopPropagation()} style={{width:"90vw",maxWidth:900,height:"85vh",borderRadius:T.r,background:"rgba(12,10,20,.95)",border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div><div style={{fontSize:14,fontWeight:600,color:T.cream}}>{viewingDoc.name||viewingDoc.fileName||"Document"}</div>{viewingDoc.fileName&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{viewingDoc.fileName}</div>}</div>
          <div style={{display:"flex",gap:8}}>{viewingDoc.fileData&&<a href={viewingDoc.fileData} download={viewingDoc.fileName||viewingDoc.name||"document"} style={{padding:"6px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,textDecoration:"none"}}>Download</a>}<button onClick={()=>setViewingDoc(null)} aria-label="Close" style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4}}>×</button></div>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:"#111"}}>
          {viewingDoc.fileData?.startsWith("data:image")?<img src={viewingDoc.fileData} alt={viewingDoc.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
          :viewingDoc.fileData?.startsWith("data:application/pdf")||viewingDoc.fileName?.endsWith(".pdf")?<iframe src={viewingDoc.fileData} style={{width:"100%",height:"100%",border:"none"}} title={viewingDoc.name}/>
          :viewingDoc.fileData?<div style={{textAlign:"center",padding:40}}><div style={{fontSize:48,opacity:.2,marginBottom:16}}>&#9634;</div><div style={{fontSize:14,color:T.cream,marginBottom:8}}>{viewingDoc.name}</div><p style={{fontSize:12,color:T.dim,marginBottom:16}}>Preview not available</p><a href={viewingDoc.fileData} download={viewingDoc.fileName||"document"} style={{padding:"10px 24px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:13,fontWeight:700,textDecoration:"none"}}>Download</a></div>
          :<div style={{textAlign:"center",padding:40,color:T.dim}}>No file attached</div>}
        </div>
      </div>
    </div>}
  </div>;
}

export default VendorDetailModal;
