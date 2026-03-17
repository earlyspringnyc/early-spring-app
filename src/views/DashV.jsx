import { useMemo } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { parseD, daysBetween } from '../utils/date.js';
import { ct, isOverdue, getVendorName } from '../utils/calc.js';
import { INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../constants/index.js';
import { Card, Metric, DonutChart } from '../components/primitives/index.js';

function DashV({cats,comp,feeP,project}){
  const docs=project?.docs||[];const tasks=project?.timeline||[];
  const overdueDocs=docs.filter(d=>(d.status==="overdue"||(d.status==="pending"&&isOverdue(d)))&&d.type==="invoice");
  const upcomingDocs=docs.filter(d=>{if(d.status==="paid"||!d.dueDate)return false;const p=d.dueDate.split("/");if(p.length!==3)return false;const due=new Date(p[2],p[0]-1,p[1]);const now=new Date();const diff=daysBetween(now,due);return diff>=0&&diff<=14&&d.status!=="paid"}).sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""));
  const upcomingTasks=tasks.filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=parseD(t.endDate);if(!d)return false;const diff=daysBetween(new Date(),d);return diff>=0&&diff<=7}).sort((a,b)=>(a.endDate||"").localeCompare(b.endDate||""));
  const overdueTasks=tasks.filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=parseD(t.endDate);if(!d)return false;return daysBetween(new Date(),d)<0});
  const catData=cats.map(c=>{const t=ct(c.items).totals;return{name:c.name.length>10?c.name.split(" ")[0]:c.name,actual:t.actualCost,client:t.clientPrice}}).filter(d=>d.actual>0||d.client>0);
  const pieData=cats.map((c,i)=>({name:c.name,value:ct(c.items).totals.actualCost,color:T.colors[i%T.colors.length]})).filter(d=>d.value>0);
  const profitParts=[{name:"Production Margin",value:comp.productionSubtotal.variance,color:T.gold},{name:"Agency Margin",value:comp.agencyCostsSubtotal.variance,color:T.cyan},{name:"Agency Fee",value:comp.agencyFee.clientPrice,color:T.pos}].filter(d=>d.value>0);
  const blended=(comp.productionSubtotal.actualCost+comp.agencyCostsSubtotal.actualCost)>0?((comp.grandTotal-comp.productionSubtotal.actualCost-comp.agencyCostsSubtotal.actualCost)/(comp.productionSubtotal.actualCost+comp.agencyCostsSubtotal.actualCost)*100):0;
  const txns=project?.txns||[];
  const totalIncome=txns.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);
  const totalExpensesPaid=txns.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
  const totalBudget=(project?.clientBudget||0)>0?project.clientBudget:comp.grandTotal;
  const spendToDate=comp.productionSubtotal.actualCost+comp.agencyCostsSubtotal.actualCost+comp.agencyFee.actualCost;
  const amountOwed=docs.filter(d=>d.type==="invoice"&&d.status!=="paid").reduce((a,d)=>a+(d.amount-(d.paidAmount||0)),0);
  const amountDueFromClient=totalBudget-totalIncome;
  const unpaidInvoices=docs.filter(d=>d.type==="invoice"&&d.status!=="paid"&&!isOverdue(d));
  const allUpcoming=[...upcomingDocs,...upcomingTasks.map(t=>({...t,_isTask:true}))].sort((a,b)=>(a.dueDate||a.endDate||"").localeCompare(b.dueDate||b.endDate||""));
  return<div>
    <div style={{marginBottom:24}}><h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>Dashboard</h1><p style={{fontSize:13,color:T.dim,marginTop:6,fontFamily:T.serif,fontStyle:"italic"}}>Project overview and financial snapshot</p></div>
    <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
      <Metric label="Total Project Budget" value={f0(totalBudget)} color={T.gold} glow/>
      <Metric label="Spend to Date" value={f0(spendToDate)} sub={totalBudget>0?`${Math.round((spendToDate/totalBudget)*100)}% of budget`:""}/>
      <Metric label="Amount Owed to Vendors" value={f0(amountOwed)} color={amountOwed>0?T.neg:T.dim} glow={amountOwed>0}/>
      <Metric label="Due from Client" value={f0(Math.max(0,amountDueFromClient))} color={amountDueFromClient>0?"#FBBF24":T.pos} sub={totalIncome>0?`${f0(totalIncome)} collected`:"No payments received"}/>
    </div>
{(overdueDocs.length>0||unpaidInvoices.length>0)&&<Card style={{padding:18,marginBottom:16,borderColor:overdueDocs.length>0?"rgba(248,113,113,.2)":"rgba(255,234,151,.12)",background:overdueDocs.length>0?"rgba(248,113,113,.03)":"rgba(255,234,151,.02)"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}><span style={{fontSize:12,fontWeight:700,color:overdueDocs.length>0?T.neg:T.gold}}>{overdueDocs.length>0?"Unpaid Invoice Alerts":"Unpaid Invoices"}</span><span style={{fontSize:10,color:T.dim}}>({overdueDocs.length+unpaidInvoices.length})</span></div>
      {overdueDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",marginBottom:3,borderRadius:T.rS,background:"rgba(248,113,113,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"rgba(248,113,113,.15)",color:T.neg}}>OVERDUE</span><span style={{fontSize:12,color:T.cream}}>{d.name}</span>{d.invoiceKind&&<span style={{fontSize:8,color:INVOICE_KIND_COLORS[d.invoiceKind],fontWeight:600,textTransform:"uppercase"}}>{INVOICE_KIND_LABELS[d.invoiceKind]}</span>}<span style={{fontSize:10,color:T.dim}}>{getVendorName(d.vendorId,project?.vendors)}</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:T.neg}}>{f$(d.amount-(d.paidAmount||0))}</span></div>
      </div>)}
      {unpaidInvoices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",marginBottom:3,borderRadius:T.rS}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"rgba(255,234,151,.1)",color:T.gold}}>PENDING</span><span style={{fontSize:12,color:T.cream}}>{d.name}</span>{d.invoiceKind&&<span style={{fontSize:8,color:INVOICE_KIND_COLORS[d.invoiceKind],fontWeight:600,textTransform:"uppercase"}}>{INVOICE_KIND_LABELS[d.invoiceKind]}</span>}<span style={{fontSize:10,color:T.dim}}>{getVendorName(d.vendorId,project?.vendors)}</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>{d.dueDate&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span>}<span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.gold}}>{f$(d.amount-(d.paidAmount||0))}</span></div>
      </div>)}
    </Card>}
    {(allUpcoming.length>0||overdueTasks.length>0)&&<Card style={{padding:18,marginBottom:16,borderColor:"rgba(255,234,151,.12)",background:"rgba(255,234,151,.02)"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}><span style={{fontSize:12,fontWeight:700,color:T.gold}}>Upcoming Deadlines</span></div>
      {overdueTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",marginBottom:3,borderRadius:T.rS,background:"rgba(248,113,113,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"rgba(248,113,113,.15)",color:T.neg}}>LATE</span><span style={{fontSize:12,color:T.cream}}>{t.name}</span></div>
        <span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {t.endDate}</span>
      </div>)}
      {allUpcoming.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",marginBottom:3,borderRadius:T.rS}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:d._isTask?"rgba(34,211,238,.1)":"rgba(255,234,151,.1)",color:d._isTask?T.cyan:T.gold}}>{d._isTask?"TASK":"INVOICE"}</span><span style={{fontSize:12,color:T.cream}}>{d._isTask?d.name:d.name}</span>{!d._isTask&&d.invoiceKind&&<span style={{fontSize:8,color:INVOICE_KIND_COLORS[d.invoiceKind],fontWeight:600,textTransform:"uppercase"}}>{INVOICE_KIND_LABELS[d.invoiceKind]}</span>}</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d._isTask?d.endDate:d.dueDate}</span>{!d._isTask&&<span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.gold}}>{f$(d.amount)}</span>}</div>
      </div>)}
    </Card>}
    <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
      <Metric label="Production Cost" value={f0(comp.productionSubtotal.actualCost)}/><Metric label="Client Total" value={f0(comp.grandTotal)} color={T.gold}/><Metric label="Blended Margin" value={`${blended.toFixed(1)}%`} color={T.cyan}/><Metric label="Net Profit" value={f0(comp.netProfit)} color={T.pos}/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
      <Card style={{padding:24}}><div style={{fontSize:13,fontWeight:600,color:T.cream,marginBottom:18}}>Spend Distribution</div>
        <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><DonutChart data={pieData} size={150} thickness={20}/></div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>{pieData.map((d,i)=><span key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:T.dim}}><span style={{width:6,height:6,borderRadius:"50%",background:d.color,display:"inline-block"}}/>{d.name.split(" ")[0]}</span>)}</div></Card>
      <Card style={{padding:24}}><div style={{fontSize:13,fontWeight:600,color:T.cream,marginBottom:18}}>Profit Composition</div>
      <div style={{display:"flex",alignItems:"center",gap:28}}>
        <DonutChart data={profitParts} size={150} thickness={20}/>
        <div style={{flex:1}}>
          {profitParts.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 0",borderBottom:i<profitParts.length-1?`1px solid ${T.border}`:"none"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:8,height:8,borderRadius:3,background:d.color}}/><span style={{fontSize:13,color:T.cream}}>{d.name}</span></div><span className="num" style={{fontSize:14,fontFamily:T.mono,fontWeight:600,color:T.cream}}>{f0(d.value)}</span></div>)}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:14,marginTop:4,borderTop:`2px solid ${T.border}`}}><span style={{fontSize:13,fontWeight:600,color:T.gold}}>Total Net Profit</span><span className="num" style={{fontSize:18,fontFamily:T.mono,fontWeight:700,color:T.gold}}>{f0(comp.netProfit)}</span></div>
        </div>
      </div>
    </Card>
    </div>
  </div>;
}

export default DashV;
