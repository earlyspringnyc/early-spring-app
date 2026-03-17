import T from '../../theme/tokens.js';
import { f$, f0 } from '../../utils/format.js';
import { getPayStatus } from '../../utils/calc.js';
import { VENDOR_TYPE_LABELS, VENDOR_TYPE_COLORS, W9_COLORS, PAYMENT_COLORS, PAYMENT_LABELS, DOC_TYPE_COLORS, INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../../constants/index.js';

function VendorDetailModal({vendorId,project,onClose,canEdit}){
  const v=(project.vendors||[]).find(v=>v.id===vendorId);
  if(!v)return null;
  const docs=(project.docs||[]).filter(d=>d.vendorId===vendorId);
  const txns=(project.txns||[]).filter(t=>t.vendorId===vendorId);
  const invoices=docs.filter(d=>d.type==="invoice");
  const otherDocs=docs.filter(d=>d.type!=="invoice");
  const totalInvoiced=invoices.reduce((a,d)=>a+d.amount,0);
  const totalPaid=invoices.reduce((a,d)=>a+(d.paidAmount||0),0);
  const outstanding=totalInvoiced-totalPaid;
  const budgetItems=[];
  (project.cats||[]).forEach(c=>c.items.forEach(it=>{if(it.vendorId===vendorId)budgetItems.push({...it,catName:c.name})}));
  const totalContracted=budgetItems.reduce((a,it)=>a+it.actualCost,0);
  return<div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={onClose}>
    <div className="slide-in modal-inner" onClick={e=>e.stopPropagation()} style={{width:620,maxHeight:"85vh",overflow:"auto",padding:36,borderRadius:T.r,background:"rgba(12,10,20,.95)",border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div><h2 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>{v.name}</h2>
          <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${VENDOR_TYPE_COLORS[v.vendorType||"other"]}18`,color:VENDOR_TYPE_COLORS[v.vendorType||"other"]}}>{VENDOR_TYPE_LABELS[v.vendorType||"other"]}</span>{v.email&&<span style={{fontSize:11,color:T.dim}}>{v.email}</span>}{v.phone&&<span style={{fontSize:11,color:T.dim}}>{v.phone}</span>}<span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${W9_COLORS[v.w9Status]}18`,color:W9_COLORS[v.w9Status],textTransform:"uppercase"}}>W-9: {v.w9Status}</span></div>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.dim,fontSize:20,cursor:"pointer",padding:4,lineHeight:1}}>×</button>
      </div>
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
      {invoices.length>0&&<div style={{marginBottom:20}}>
        <div style={{fontSize:12,fontWeight:600,color:T.cream,marginBottom:10}}>Invoices ({invoices.length})</div>
        {invoices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {d.fileData&&<button onClick={e=>{e.stopPropagation();window.open(d.fileData,"_blank")}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9,color:T.cyan,fontWeight:600}} title="View file">PDF</button>}
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
      {otherDocs.length>0&&<div style={{marginBottom:20}}>
        <div style={{fontSize:12,fontWeight:600,color:T.cream,marginBottom:10}}>Other Documents ({otherDocs.length})</div>
        {otherDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <span style={{fontSize:12,color:T.cream}}>{d.name}</span>
          <span style={{fontSize:9,fontWeight:700,color:DOC_TYPE_COLORS[d.type],textTransform:"uppercase"}}>{d.type==="w9"?"W-9":d.type==="w2"?"W-2":d.type}</span>
        </div>)}
      </div>}
      {txns.length>0&&<div>
        <div style={{fontSize:12,fontWeight:600,color:T.cream,marginBottom:10}}>Payment History ({txns.length})</div>
        {txns.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:3,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div><span style={{fontSize:12,color:T.cream}}>{t.description}</span><span style={{fontSize:10,color:T.dim,marginLeft:8}}>{t.date}</span></div>
          <span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:t.type==="income"?T.pos:T.neg}}>{t.type==="income"?"+":"-"}{f$(t.amount)}</span>
        </div>)}
      </div>}
      {budgetItems.length===0&&invoices.length===0&&txns.length===0&&<div style={{textAlign:"center",padding:30,color:T.dim,fontSize:13}}>No activity for this vendor yet.</div>}
    </div>
  </div>;
}


export default VendorDetailModal;
