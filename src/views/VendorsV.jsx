import { useState, useRef } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { isOverdue } from '../utils/calc.js';
import { VENDOR_TYPES, VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, W9_COLORS, INVOICE_KINDS, INVOICE_KIND_LABELS, INVOICE_KIND_COLORS } from '../constants/index.js';
import { mkVendor, mkDoc } from '../data/factories.js';
import { TrashI } from '../components/icons/index.js';
import { Card, Metric, DatePick } from '../components/primitives/index.js';

function VendorsV({project,updateProject,canEdit,onVendorClick}){
  const vendors=project.vendors||[];const docs=project.docs||[];const txns=project.txns||[];
  const[showAdd,setShowAdd]=useState(false);const[filter,setFilter]=useState("all");const[typeFilter,setTypeFilter]=useState("all");
  const[nN,setNN3]=useState("");const[nE,setNE2]=useState("");const[nP,setNP]=useState("");const[nNo,setNNo2]=useState("");const[nType,setNType]=useState("other");
  const[uploadVendorId,setUploadVendorId]=useState(null);const[invName,setInvName]=useState("");const[invAmt,setInvAmt]=useState("");const[invDue,setInvDue]=useState("");const[invKind,setInvKind]=useState("deposit");const[invFile,setInvFile]=useState(null);const[invFileName,setInvFileName]=useState("");
  const invFileRef=useRef(null);
  const w9Received=vendors.filter(v=>v.w9Status==="received"||v.w9Status==="approved").length;
  const w9Pending=vendors.filter(v=>v.w9Status==="pending").length;
  const totalOutstanding=vendors.reduce((a,v)=>{const vDocs=docs.filter(d=>d.vendorId===v.id&&d.type==="invoice"&&d.status!=="paid");return a+vDocs.reduce((s,d)=>s+(d.amount-(d.paidAmount||0)),0)},0);
  const addVendor=()=>{if(!nN.trim())return;updateProject({vendors:[...vendors,mkVendor(nN.trim(),nE,nP,nNo,"pending",nType)]});setNN3("");setNE2("");setNP("");setNNo2("");setNType("other");setShowAdd(false)};
  const handleInvFile=(e)=>{const file=e.target.files[0];if(!file)return;setInvFileName(file.name);const reader=new FileReader();reader.onload=ev=>setInvFile(ev.target.result);reader.readAsDataURL(file)};
  const submitInvoice=()=>{if(!invName.trim()||!uploadVendorId)return;const doc=mkDoc(invName.trim(),"invoice",uploadVendorId,parseFloat(invAmt)||0,invDue,"pending","","",invKind,invFile);if(isOverdue(doc))doc.status="overdue";updateProject({docs:[...(project.docs||[]),doc]});setInvName("");setInvAmt("");setInvDue("");setInvKind("deposit");setInvFile(null);setInvFileName("");setUploadVendorId(null)};
  const removeVendor=id=>updateProject({vendors:vendors.filter(v=>v.id!==id)});
  const cycleW9=id=>updateProject({vendors:vendors.map(v=>{if(v.id!==id)return v;const order=["pending","received","approved"];return{...v,w9Status:order[(order.indexOf(v.w9Status)+1)%3]}})});
  const filtered=(filter==="all"?vendors:vendors.filter(v=>v.w9Status===filter)).filter(v=>typeFilter==="all"||v.vendorType===typeFilter);
  const getVendorStats=(v)=>{
    const vDocs=docs.filter(d=>d.vendorId===v.id);
    const invoices=vDocs.filter(d=>d.type==="invoice");
    const totalInvoiced=invoices.reduce((a,d)=>a+d.amount,0);
    const totalPaid=invoices.reduce((a,d)=>a+(d.paidAmount||0),0);
    const itemCount=(project.cats||[]).reduce((a,c)=>a+c.items.filter(i=>i.vendorId===v.id).length,0);
    return{invoices:invoices.length,totalInvoiced,totalPaid,outstanding:totalInvoiced-totalPaid,itemCount,docCount:vDocs.length};
  };
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>Vendors</h1><p style={{fontSize:13,color:T.dim,marginTop:4}}>{vendors.length} vendors{w9Pending>0?<span style={{color:"#FBBF24"}}> · {w9Pending} W-9 pending</span>:""}</p></div>
      {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showAdd?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showAdd?T.dim:T.brown,border:showAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Add Vendor"}</button>}
    </div>
    <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
      <Metric label="Total Vendors" value={vendors.length}/>
      <Metric label="W-9 Received" value={w9Received} color={T.pos}/>
      <Metric label="W-9 Pending" value={w9Pending} color="#FBBF24"/>
      <Metric label="Outstanding" value={f0(totalOutstanding)} color={totalOutstanding>0?T.neg:T.dim} glow={totalOutstanding>0}/>
    </div>
    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
        {[["Vendor Name",nN,setNN3,"ABC Productions"],["Email",nE,setNE2,"vendor@co.com"],["Phone",nP,setNP,"(555) 000-0000"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input autoFocus={l==="Vendor Name"} value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addVendor()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12,marginBottom:12}}>
        <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Vendor Type</label>
          <select value={nType} onChange={e=>setNType(e.target.value)} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
            {VENDOR_TYPES.map(t=><option key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</option>)}
          </select></div>
        <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Notes</label><input value={nNo} onChange={e=>setNNo2(e.target.value)} placeholder="Optional notes" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
      </div>
      <button onClick={addVendor} style={{padding:"9px 20px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Vendor</button>
    </Card>}
    <div style={{display:"flex",gap:4,marginBottom:8}}>
      {["all","pending","received","approved"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{padding:"7px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:filter===f?600:400,fontFamily:T.sans,background:filter===f?T.goldSoft:"transparent",color:filter===f?T.gold:T.dim,textTransform:"capitalize"}}>{f==="all"?"All":`W-9 ${f}`}</button>)}
    </div>
    <div style={{display:"flex",gap:3,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={()=>setTypeFilter("all")} style={{padding:"5px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:typeFilter==="all"?600:400,fontFamily:T.sans,background:typeFilter==="all"?T.surfEl:"transparent",color:typeFilter==="all"?T.cream:T.dim}}>All Types</button>
      {VENDOR_TYPES.map(t=><button key={t} onClick={()=>setTypeFilter(t)} style={{padding:"5px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:typeFilter===t?600:400,fontFamily:T.sans,background:typeFilter===t?`${VENDOR_TYPE_COLORS[t]}18`:"transparent",color:typeFilter===t?VENDOR_TYPE_COLORS[t]:T.dim}}>{VENDOR_TYPE_LABELS[t]}</button>)}
    </div>
    <Card style={{overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:"1.8fr .7fr .6fr .5fr .6fr .7fr .7fr .5fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        {["Vendor","Type","Contact","W-9","Items","Invoiced","Outstanding",""].map((h,i)=><span key={i} style={{fontSize:9.5,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i>3?"right":"left"}}>{h}</span>)}
      </div>
      {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:T.dim,fontSize:13}}>No vendors{filter!=="all"||typeFilter!=="all"?" match this filter":""}.</div>}
      {filtered.map(v=>{const s=getVendorStats(v);return<div key={v.id}>
        <div style={{display:"grid",gridTemplateColumns:"1.8fr .7fr .6fr .5fr .6fr .7fr .7fr .5fr",padding:"12px 18px",borderBottom:uploadVendorId===v.id?"none":`1px solid ${T.border}`,alignItems:"center",cursor:"pointer",background:uploadVendorId===v.id?T.surfHov:"transparent"}} onClick={()=>onVendorClick&&onVendorClick(v.id)} onMouseEnter={e=>{if(uploadVendorId!==v.id)e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{if(uploadVendorId!==v.id)e.currentTarget.style.background="transparent"}}>
          <div><div style={{fontSize:13,fontWeight:500,color:T.cream}}>{v.name}</div>{v.notes&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{v.notes}</div>}</div>
          <span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${VENDOR_TYPE_COLORS[v.vendorType||"other"]}18`,color:VENDOR_TYPE_COLORS[v.vendorType||"other"],whiteSpace:"nowrap"}}>{VENDOR_TYPE_LABELS[v.vendorType||"other"]}</span>
          <div style={{fontSize:11,color:T.dim}}>{v.email||v.phone||"\u2014"}</div>
          <button onClick={e=>{e.stopPropagation();canEdit&&cycleW9(v.id)}} style={{background:"none",border:"none",cursor:canEdit?"pointer":"default",padding:0}}><span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${W9_COLORS[v.w9Status]}18`,color:W9_COLORS[v.w9Status],textTransform:"capitalize"}}>{v.w9Status}</span></button>
          <span className="num" style={{textAlign:"right",fontSize:12,color:T.dim}}>{s.itemCount}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:T.cream}}>{s.totalInvoiced>0?f0(s.totalInvoiced):"\u2014"}</span>
          <span className="num" style={{textAlign:"right",fontSize:12,fontFamily:T.mono,color:s.outstanding>0?T.neg:T.dim,fontWeight:s.outstanding>0?600:400}}>{s.outstanding>0?f0(s.outstanding):"\u2014"}</span>
          <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
            {canEdit&&<button onClick={e=>{e.stopPropagation();setUploadVendorId(uploadVendorId===v.id?null:v.id);setInvName("");setInvAmt("");setInvDue("");setInvKind("deposit");setInvFile(null);setInvFileName("")}} style={{background:"none",border:`1px solid ${uploadVendorId===v.id?T.cyan:T.border}`,borderRadius:T.rS,padding:"3px 8px",cursor:"pointer",fontSize:9,fontWeight:600,color:uploadVendorId===v.id?T.cyan:T.dim,transition:"all .15s"}} onMouseEnter={e=>{if(uploadVendorId!==v.id)e.currentTarget.style.borderColor=T.cyan;e.currentTarget.style.color=T.cyan}} onMouseLeave={e=>{if(uploadVendorId!==v.id){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}}>{uploadVendorId===v.id?"Cancel":"+ Invoice"}</button>}
            {canEdit&&<button onClick={e=>{e.stopPropagation();if(confirm(`Remove "${v.name}"?`))removeVendor(v.id)}} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
          </div>
        </div>
        {uploadVendorId===v.id&&<div style={{padding:"16px 18px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:11,fontWeight:600,color:T.cyan,marginBottom:12,textTransform:"uppercase",letterSpacing:".08em"}}>Upload Invoice for {v.name}</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
            <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Invoice Name</label><input autoFocus value={invName} onChange={e=>setInvName(e.target.value)} placeholder="Invoice #1042" onKeyDown={e=>e.key==="Enter"&&submitInvoice()} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
            <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Amount</label><input value={invAmt} onChange={e=>setInvAmt(e.target.value)} placeholder="25000" style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.mono,outline:"none"}}/></div>
            <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Due Date</label><DatePick value={invDue} onChange={setInvDue} compact/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:12}}>
            <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Invoice Type</label>
              <div style={{display:"flex",gap:4}}>{INVOICE_KINDS.map(k=><button key={k} onClick={()=>setInvKind(k)} style={{flex:1,padding:"7px 0",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:invKind===k?700:400,fontFamily:T.sans,background:invKind===k?`${INVOICE_KIND_COLORS[k]}22`:"transparent",color:invKind===k?INVOICE_KIND_COLORS[k]:T.dim,textTransform:"capitalize",transition:"all .15s"}}>{INVOICE_KIND_LABELS[k]}</button>)}</div></div>
            <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Attach File (PDF, PNG, JPG)</label>
              <input ref={invFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.heic" onChange={handleInvFile} style={{display:"none"}}/>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>invFileRef.current.click()} style={{padding:"7px 14px",borderRadius:T.rS,border:`1px dashed ${invFile?T.pos:T.border}`,background:invFile?"rgba(52,211,153,.06)":"transparent",color:invFile?T.pos:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}}>{invFile?"Replace file":"Choose file…"}</button>
                {invFileName&&<span style={{fontSize:11,color:T.pos,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{invFileName}</span>}
              </div></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={submitInvoice} disabled={!invName.trim()} style={{padding:"8px 18px",background:invName.trim()?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(255,255,255,.05)",color:invName.trim()?T.brown:"rgba(255,255,255,.2)",border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:invName.trim()?"pointer":"default",fontFamily:T.sans}}>Add Invoice</button>
            <button onClick={()=>setUploadVendorId(null)} style={{padding:"8px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
          </div>
        </div>}
      </div>})}
    </Card>
  </div>;
}

export default VendorsV;
