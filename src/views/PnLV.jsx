import { useState } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { mkTxn } from '../data/factories.js';
import { TrashI } from '../components/icons/index.js';
import { Card, Metric, DatePick, VendorSelect } from '../components/primitives/index.js';

function PnLV({project,updateProject,comp,canEdit,vendors,onAddVendor,onVendorClick}){
  const txns=project.txns||[];
  const[showAdd,setShowAdd]=useState(false);
  const[nTy,setNTy]=useState("income");const[nDe,setNDe]=useState("");const[nAm,setNAm]=useState("");const[nDa,setNDa]=useState("");const[nCa,setNCa]=useState("");
  const[nVId,setNVId2]=useState("");const[matchDocId,setMatchDocId]=useState("");
  const income=txns.filter(t=>t.type==="income");const expenses=txns.filter(t=>t.type==="expense");
  const totalIncome=income.reduce((a,t)=>a+t.amount,0);const totalExpenses=expenses.reduce((a,t)=>a+t.amount,0);
  const cashflow=totalIncome-totalExpenses;
  const collected=comp.grandTotal>0?Math.round((totalIncome/comp.grandTotal)*100):0;
  const addTxn=()=>{
    if(!nDe.trim()||!nAm)return;
    const amount=parseFloat(nAm)||0;
    const newTxn=mkTxn(nTy,nDe.trim(),amount,nDa,nCa,nVId,matchDocId);
    let updatedDocs=project.docs||[];
    if(matchDocId&&nTy==="expense"){
      updatedDocs=updatedDocs.map(d=>{
        if(d.id!==matchDocId)return d;
        const newPaid=(d.paidAmount||0)+amount;
        return{...d,paidAmount:newPaid,status:newPaid>=d.amount?"paid":"partial"};
      });
    }
    updateProject({txns:[...txns,newTxn],docs:updatedDocs});
    setNDe("");setNAm("");setNDa("");setNCa("");setNVId2("");setMatchDocId("");setShowAdd(false);
  };
  const removeTxn=id=>updateProject({txns:txns.filter(t=>t.id!==id)});
  const sorted=[...txns].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>P&L + Cashflow</h1><p style={{fontSize:13,color:T.dim,marginTop:6,fontFamily:T.serif,fontStyle:"italic"}}>Track payments received and expenses paid</p></div>
      {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showAdd?"transparent":`linear-gradient(135deg,${T.gold},#E8D080)`,color:showAdd?T.dim:T.brown,border:showAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Add Entry"}</button>}
    </div>
    <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
      <Metric label="Revenue Collected" value={f0(totalIncome)} color={T.pos} sub={`${collected}% of ${f0(comp.grandTotal)}`}/>
      <Metric label="Expenses Paid" value={f0(totalExpenses)} color={T.neg}/>
      <Metric label="Net Cashflow" value={f0(cashflow)} color={cashflow>=0?T.pos:T.neg} glow/>
      <Metric label="Budgeted Cost" value={f0(comp.productionSubtotal.actualCost+comp.agencyCostsSubtotal.actualCost+comp.agencyFee.actualCost)} sub="From budget"/>
    </div>
    <Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:11,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Collection Progress</span><span style={{fontSize:12,color:T.gold,fontFamily:T.mono,fontWeight:600}}>{collected}%</span></div>
      <div style={{height:8,background:T.surface,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(collected,100)}%`,background:`linear-gradient(90deg,${T.gold},${T.pos})`,borderRadius:4,transition:"width .4s ease"}}/></div>
    </Card>
    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {["income","expense"].map(t=><button key={t} onClick={()=>setNTy(t)} style={{padding:"7px 16px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:nTy===t?600:400,fontFamily:T.sans,background:nTy===t?(t==="income"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)"):"transparent",color:nTy===t?(t==="income"?T.pos:T.neg):T.dim}}>{t==="income"?"Income":"Expense"}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
        {[["Description",nDe,setNDe,"Client payment"],["Amount",nAm,setNAm,"25000"],["Category",nCa,setNCa,"Venue"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addTxn()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>)}
      </div>
      {nTy==="expense"&&<div style={{marginBottom:12,maxWidth:300}}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Vendor</label><VendorSelect value={nVId} onChange={v=>{setNVId2(v);setMatchDocId("")}} vendors={project.vendors} onAddVendor={v=>{updateProject({vendors:[...(project.vendors||[]),v]})}} compact/></div>}
      {nTy==="expense"&&nVId&&(()=>{
        const outstanding=(project.docs||[]).filter(d=>d.vendorId===nVId&&d.status!=="paid"&&d.type==="invoice");
        if(!outstanding.length)return null;
        return<div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:9,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Match to Invoice</label>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {outstanding.map(d=><button key={d.id} onClick={()=>{setMatchDocId(d.id);setNAm(String(d.amount-(d.paidAmount||0)))}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:T.rS,background:matchDocId===d.id?"rgba(34,211,238,.1)":T.surface,border:`1px solid ${matchDocId===d.id?T.cyan:T.border}`,cursor:"pointer",transition:"all .15s"}}>
              <span style={{fontSize:12,color:T.cream}}>{d.name}</span>
              <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.gold}}>{f$(d.amount-(d.paidAmount||0))} remaining</span>
            </button>)}
          </div>
        </div>;
      })()}
      <div style={{marginBottom:12,maxWidth:260}}><DatePick label="Date" value={nDa} onChange={setNDa} compact/></div>
      <button onClick={addTxn} style={{padding:"9px 20px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Entry</button>
    </Card>}
    <Card style={{overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:".6fr 2fr 1fr 1fr .3fr",padding:"12px 18px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        {["Date","Description","Category","Amount",""].map((h,i)=><span key={i} style={{fontSize:9.5,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i===3?"right":"left"}}>{h}</span>)}
      </div>
      {sorted.length===0&&<div style={{padding:40,textAlign:"center",color:T.dim,fontSize:13}}>No transactions yet.<div style={{fontSize:11,color:T.dim,marginTop:8,fontFamily:T.serif,fontStyle:"italic"}}>Add income or expense entries to track your project cashflow</div></div>}
      {sorted.map((t,idx)=><div key={t.id} style={{display:"grid",gridTemplateColumns:".6fr 2fr 1fr 1fr .3fr",padding:"10px 18px",borderBottom:idx<sorted.length-1?`1px solid ${T.border}`:"none",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <span style={{fontSize:12,color:T.dim,fontFamily:T.mono}}>{t.date||"\u2014"}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:6,height:6,borderRadius:"50%",background:t.type==="income"?T.pos:T.neg}}/><span style={{fontSize:13,color:T.cream}}>{t.description}</span></div>
        <span style={{fontSize:12,color:T.dim}}>{t.category||"\u2014"}</span>
        <span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:600,color:t.type==="income"?T.pos:T.neg,textAlign:"right"}}>{t.type==="income"?"+":"-"}{f$(t.amount)}</span>
        {canEdit&&<button onClick={()=>removeTxn(t.id)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2,justifySelf:"end"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
      </div>)}
    </Card>
  </div>;
}

export default PnLV;
