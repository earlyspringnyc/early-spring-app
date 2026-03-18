import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { parseD, daysBetween } from '../utils/date.js';
import { ct, isOverdue, getVendorName } from '../utils/calc.js';
import { INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../constants/index.js';
import { Card, Metric, DonutChart } from '../components/primitives/index.js';

/* ── Slot geometry: each slot defines a grid position ── */
const SLOTS=[
  {col:"1/3",row:1},  // 0: 2-col
  {col:"3/5",row:1},  // 1: 2-col
  {col:"1/2",row:2},  // 2: 1-col
  {col:"2/3",row:2},  // 3: 1-col
  {col:"3/5",row:2},  // 4: 2-col
  // row 3 = alerts (fixed, not draggable)
  {col:"1/2",row:4},  // 5: 1-col
  {col:"2/3",row:4},  // 6: 1-col
  {col:"3/4",row:4},  // 7: 1-col
  {col:"4/5",row:4},  // 8: 1-col
  {col:"1/3",row:5},  // 9: 2-col
  {col:"3/5",row:5},  // 10: 2-col
];
const DEFAULT_ORDER=["budget","spend","owed","client","tasks","prod","margin","blended","profit","donut","comp"];

/* ── Helpers ── */
const Label=({children})=><div style={{fontSize:10,fontWeight:600,color:T.dim,letterSpacing:".12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:6}}>{children}</div>;
const Big=({children,color=T.cream,size=42})=><div className="num" style={{fontSize:size,fontWeight:700,color,fontFamily:T.mono,lineHeight:1,letterSpacing:"-0.04em"}}>{children}</div>;
const Slash=({children})=><span style={{fontSize:14,fontWeight:400,color:T.dim,fontFamily:T.mono,marginLeft:6}}>/ {children}</span>;
const Pill=({children,color=T.gold,bg})=><span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:bg||`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

function DashV({cats,comp,feeP,project,onNavigate,updateProject}){
  const docs=project?.docs||[];const tasks=project?.timeline||[];
  const overdueDocs=docs.filter(d=>(d.status==="overdue"||(d.status==="pending"&&isOverdue(d)))&&d.type==="invoice");
  const upcomingDocs=docs.filter(d=>{if(d.status==="paid"||!d.dueDate)return false;const p=d.dueDate.split("/");if(p.length!==3)return false;const due=new Date(p[2],p[0]-1,p[1]);const now=new Date();const diff=daysBetween(now,due);return diff>=0&&diff<=14&&d.status!=="paid"}).sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""));
  const upcomingTasks=tasks.filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=parseD(t.endDate);if(!d)return false;const diff=daysBetween(new Date(),d);return diff>=0&&diff<=7}).sort((a,b)=>(a.endDate||"").localeCompare(b.endDate||""));
  const overdueTasks=tasks.filter(t=>{if(t.status==="done"||!t.endDate)return false;const d=parseD(t.endDate);if(!d)return false;return daysBetween(new Date(),d)<0});
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
  const tasksDone=tasks.filter(t=>t.status==="done").length;
  const budgetPct=totalBudget>0?Math.round((spendToDate/totalBudget)*100):0;
  const overBudget=comp.grandTotal>totalBudget&&totalBudget>0;
  const hasAlerts=overdueDocs.length>0||unpaidInvoices.length>0||allUpcoming.length>0||overdueTasks.length>0;

  /* ── Drag-to-swap state ── */
  const initOrder=()=>{const saved=project?.dashLayout;if(saved&&Array.isArray(saved)&&saved.length===DEFAULT_ORDER.length&&DEFAULT_ORDER.every(k=>saved.includes(k)))return saved;return DEFAULT_ORDER};
  const[order,setOrder]=useState(initOrder);
  const dragRef=useRef({active:false,cardKey:null,slotIdx:-1,startX:0,startY:0,rects:[],el:null,pointerId:null});
  const[dragState,setDragState]=useState({dragging:false,dragIdx:-1,overIdx:-1});
  const cellRefs=useRef({});

  // Sync order if project.dashLayout changes externally
  useEffect(()=>{const saved=project?.dashLayout;if(saved&&Array.isArray(saved)&&saved.length===DEFAULT_ORDER.length&&DEFAULT_ORDER.every(k=>saved.includes(k))){setOrder(saved)}},[project?.dashLayout]);

  const onPointerDown=useCallback((e,cardKey,slotIdx)=>{
    if(e.button!==0)return;
    const el=e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragRef.current={active:false,cardKey,slotIdx,startX:e.clientX,startY:e.clientY,el,pointerId:e.pointerId,rects:[]};
    // Collect all slot rects
    const rects=[];
    for(let i=0;i<SLOTS.length;i++){const cel=cellRefs.current[i];if(cel)rects[i]=cel.getBoundingClientRect();else rects[i]=null}
    dragRef.current.rects=rects;
  },[]);

  const onPointerMove=useCallback((e)=>{
    const dr=dragRef.current;
    if(!dr.cardKey)return;
    const dx=e.clientX-dr.startX,dy=e.clientY-dr.startY;
    if(!dr.active){
      if(Math.abs(dx)<5&&Math.abs(dy)<5)return;
      dr.active=true;
      document.body.style.cursor="grabbing";
      setDragState({dragging:true,dragIdx:dr.slotIdx,overIdx:-1});
    }
    // Move the dragged element
    if(dr.el){dr.el.style.transform=`translate(${dx}px,${dy}px)`;dr.el.style.zIndex="100";dr.el.style.opacity=".85";dr.el.style.transition="none";dr.el.style.pointerEvents="none"}
    // Hit-test
    let overIdx=-1;
    for(let i=0;i<dr.rects.length;i++){
      if(i===dr.slotIdx||!dr.rects[i])continue;
      const r=dr.rects[i];
      if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){overIdx=i;break}
    }
    setDragState(prev=>prev.overIdx!==overIdx?{...prev,overIdx}:prev);
  },[]);

  const onPointerUp=useCallback((e)=>{
    const dr=dragRef.current;
    if(!dr.cardKey)return;
    // Reset element style
    if(dr.el){dr.el.style.transform="";dr.el.style.zIndex="";dr.el.style.opacity="";dr.el.style.transition="";dr.el.style.pointerEvents=""}
    document.body.style.cursor="";
    if(dr.active){
      // Find drop target
      let overIdx=-1;
      for(let i=0;i<dr.rects.length;i++){
        if(i===dr.slotIdx||!dr.rects[i])continue;
        const r=dr.rects[i];
        if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){overIdx=i;break}
      }
      if(overIdx>=0&&overIdx!==dr.slotIdx){
        setOrder(prev=>{
          const next=[...prev];
          [next[dr.slotIdx],next[overIdx]]=[next[overIdx],next[dr.slotIdx]];
          if(updateProject)updateProject({dashLayout:next});
          return next;
        });
      }
    } else {
      // It was a click, not a drag — trigger navigation
      const nav={budget:"budget",spend:"budget",owed:"vendors",client:"pnl",tasks:"timeline",prod:"budget",margin:"budget",blended:"budget",profit:"pnl",donut:"budget",comp:"budget"};
      if(onNavigate&&nav[dr.cardKey])onNavigate(nav[dr.cardKey]);
    }
    dragRef.current={active:false,cardKey:null,slotIdx:-1,startX:0,startY:0,rects:[],el:null,pointerId:null};
    setDragState({dragging:false,dragIdx:-1,overIdx:-1});
  },[updateProject,onNavigate]);

  /* ── Card renderers ── */
  const cards={
    budget:()=><>
      <Label>Client Budget Allocation</Label>
      <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:12}}><Big color={T.gold} size={48}>{f0(totalBudget)}</Big></div>
      <div style={{marginTop:16,height:3,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(budgetPct,100)}%`,background:comp.grandTotal>totalBudget?`linear-gradient(90deg,${T.neg},#FF6B6B)`:`linear-gradient(90deg,${T.gold},${T.cyan})`,borderRadius:2,transition:"width .6s ease"}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}><span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{budgetPct}% allocated</span><span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{f0(Math.max(0,totalBudget-comp.grandTotal))} remaining</span></div>
    </>,
    spend:()=><>
      <Label>Current Project Total</Label>
      <div style={{display:"flex",alignItems:"baseline",marginTop:12}}><Big size={40} color={overBudget?T.neg:T.pos}>{f0(comp.grandTotal)}</Big><Slash>{f0(totalBudget)}</Slash></div>
      <div style={{fontSize:11,color:overBudget?T.neg:T.pos,marginTop:14,fontFamily:T.mono}}>{overBudget?`${f0(comp.grandTotal-totalBudget)} over budget`:"Within budget"}</div>
    </>,
    owed:()=><>
      <Label>Owed to Vendors</Label>
      <div style={{marginTop:12}}><Big color={amountOwed>0?T.neg:T.dim} size={36}>{f0(amountOwed)}</Big></div>
      {overdueDocs.length>0&&<div style={{marginTop:12}}><Pill color={T.neg}>{overdueDocs.length} overdue</Pill></div>}
    </>,
    client:()=><>
      <Label>Due from Client</Label>
      <div style={{marginTop:12}}><Big color={amountDueFromClient>0?T.gold:T.pos} size={36}>{f0(Math.max(0,amountDueFromClient))}</Big></div>
      <div style={{fontSize:11,color:T.dim,marginTop:12,fontFamily:T.mono}}>{totalIncome>0?`${f0(totalIncome)} collected`:"No payments received"}</div>
    </>,
    tasks:()=><>
      <Label>Tasks</Label>
      <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:12}}><Big size={48}>{tasksDone}</Big><Slash>{tasks.length}</Slash></div>
      <div style={{display:"flex",gap:6,marginTop:14,flexWrap:"wrap"}}>
        {tasks.filter(t=>t.status==="progress").length>0&&<Pill color={T.cyan}>{tasks.filter(t=>t.status==="progress").length} in progress</Pill>}
        {tasks.filter(t=>t.status==="roadblocked").length>0&&<Pill color={T.neg}>{tasks.filter(t=>t.status==="roadblocked").length} blocked</Pill>}
        {tasks.filter(t=>t.status==="todo").length>0&&<Pill color={T.dim}>{tasks.filter(t=>t.status==="todo").length} to do</Pill>}
      </div>
    </>,
    prod:()=><><Label>Production Cost</Label><div style={{marginTop:10}}><Big size={32}>{f0(comp.productionSubtotal.actualCost)}</Big></div></>,
    margin:()=><><Label>Client Total</Label><div style={{marginTop:10}}><Big size={32} color={T.gold}>{f0(comp.grandTotal)}</Big></div></>,
    blended:()=><><Label>Blended Margin</Label><div style={{marginTop:10}}><Big size={32} color={T.cyan}>{blended.toFixed(1)}%</Big></div></>,
    profit:()=><><Label>Net Profit</Label><div style={{marginTop:10}}><Big size={32} color={T.pos}>{f0(comp.netProfit)}</Big></div></>,
    donut:()=><>
      <Label>Spend Distribution</Label>
      <div style={{display:"flex",justifyContent:"center",marginTop:16,marginBottom:16}}><DonutChart data={pieData} size={160} thickness={22}/></div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>{pieData.map((d,i)=><span key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.dim}}><span style={{width:7,height:7,borderRadius:"50%",background:d.color,display:"inline-block"}}/>{d.name.length>14?d.name.split(" ")[0]:d.name}</span>)}</div>
    </>,
    comp:()=><>
      <Label>Profit Composition</Label>
      <div style={{display:"flex",alignItems:"center",gap:28,marginTop:12}}>
        <DonutChart data={profitParts} size={150} thickness={20}/>
        <div style={{flex:1}}>
          {profitParts.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:i<profitParts.length-1?`1px solid ${T.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:8,height:8,borderRadius:3,background:d.color}}/><span style={{fontSize:13,color:T.cream}}>{d.name}</span></div>
            <span className="num" style={{fontSize:14,fontFamily:T.mono,fontWeight:600,color:T.cream}}>{f0(d.value)}</span>
          </div>)}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:16,marginTop:6,borderTop:`2px solid ${T.border}`}}>
            <span style={{fontSize:13,fontWeight:700,color:T.gold}}>Net Profit</span>
            <span className="num" style={{fontSize:22,fontFamily:T.mono,fontWeight:700,color:T.gold}}>{f0(comp.netProfit)}</span>
          </div>
        </div>
      </div>
    </>,
  };

  /* ── Per-card accent overrides ── */
  const cardAccent={budget:T.goldSoft};
  const cardBorderStyle={budget:{borderColor:T.borderGlow},spend:{borderLeft:overBudget?`3px solid ${T.neg}`:`3px solid ${T.pos}`}};
  const cardPadding={donut:"28px 32px",comp:"28px 32px"};

  return<div>
    <div style={{marginBottom:28}}><h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",fontFamily:T.sans}}>Dashboard</h1><p style={{fontSize:12,color:T.dim,marginTop:4}}>Project overview and financial snapshot</p></div>

    {/* ── Bento Grid ── */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>

      {/* Draggable cards */}
      {order.map((cardKey,slotIdx)=>{
        const slot=SLOTS[slotIdx];
        const isOver=dragState.dragging&&dragState.overIdx===slotIdx;
        const isDrag=dragState.dragging&&dragState.dragIdx===slotIdx;
        return<div key={cardKey} ref={el=>cellRefs.current[slotIdx]=el} data-slot={slotIdx}
          onPointerDown={e=>onPointerDown(e,cardKey,slotIdx)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            gridColumn:slot.col,gridRow:slot.row,
            background:cardAccent[cardKey]||T.surfEl,
            borderRadius:T.r,
            border:`1px solid ${isOver?T.borderGlow:T.border}`,
            padding:cardPadding[cardKey]||"24px 28px",
            display:"flex",flexDirection:"column",justifyContent:"space-between",
            transition:isDrag?"none":"all .2s",
            cursor:dragState.dragging?(isDrag?"grabbing":"default"):"pointer",
            touchAction:"none",
            boxShadow:isOver?`0 0 20px ${T.borderGlow}`:"none",
            outline:isOver?`2px solid ${T.borderGlow}`:"none",
            ...(cardBorderStyle[cardKey]||{}),
          }}>
          {cards[cardKey]()}
        </div>
      })}

      {/* ── Alerts row (fixed, not draggable) ── */}
      {hasAlerts?
      <div style={{gridColumn:"1/-1",gridRow:3,display:"flex",flexDirection:"column",gap:10}}>
        {(overdueDocs.length>0||unpaidInvoices.length>0)&&<div onClick={()=>onNavigate&&onNavigate("pnl")} style={{background:overdueDocs.length>0?"rgba(248,113,113,.04)":"rgba(148,163,184,.03)",borderRadius:T.r,border:`1px solid ${overdueDocs.length>0?"rgba(248,113,113,.15)":"rgba(148,163,184,.08)"}`,padding:"18px 22px",cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:11,fontWeight:700,color:overdueDocs.length>0?T.neg:T.gold,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em"}}>{overdueDocs.length>0?"Invoice Alerts":"Unpaid Invoices"}</span><Pill color={overdueDocs.length>0?T.neg:T.gold}>{overdueDocs.length+unpaidInvoices.length}</Pill></div>
          {overdueDocs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:4,borderRadius:T.rS,background:"rgba(248,113,113,.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Pill color={T.neg}>Overdue</Pill><span style={{fontSize:12,color:T.cream,fontWeight:500}}>{d.name}</span>{d.invoiceKind&&<Pill color={INVOICE_KIND_COLORS[d.invoiceKind]}>{INVOICE_KIND_LABELS[d.invoiceKind]}</Pill>}<span style={{fontSize:10,color:T.dim}}>{getVendorName(d.vendorId,project?.vendors)}</span></div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span><span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:700,color:T.neg}}>{f$(d.amount-(d.paidAmount||0))}</span></div>
          </div>)}
          {unpaidInvoices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:4,borderRadius:T.rS}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Pill color={T.gold}>Pending</Pill><span style={{fontSize:12,color:T.cream,fontWeight:500}}>{d.name}</span>{d.invoiceKind&&<Pill color={INVOICE_KIND_COLORS[d.invoiceKind]}>{INVOICE_KIND_LABELS[d.invoiceKind]}</Pill>}<span style={{fontSize:10,color:T.dim}}>{getVendorName(d.vendorId,project?.vendors)}</span></div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>{d.dueDate&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d.dueDate}</span>}<span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:600,color:T.gold}}>{f$(d.amount-(d.paidAmount||0))}</span></div>
          </div>)}
        </div>}
        {(allUpcoming.length>0||overdueTasks.length>0)&&<div onClick={()=>onNavigate&&onNavigate("timeline")} style={{background:"rgba(148,163,184,.03)",borderRadius:T.r,border:`1px solid rgba(148,163,184,.08)`,padding:"18px 22px",cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:11,fontWeight:700,color:T.gold,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em"}}>Upcoming Deadlines</span><Pill color={T.gold}>{overdueTasks.length+allUpcoming.length}</Pill></div>
          {overdueTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:4,borderRadius:T.rS,background:"rgba(248,113,113,.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Pill color={T.neg}>Late</Pill><span style={{fontSize:12,color:T.cream,fontWeight:500}}>{t.name}</span></div>
            <span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {t.endDate}</span>
          </div>)}
          {allUpcoming.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",marginBottom:4,borderRadius:T.rS}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Pill color={d._isTask?T.cyan:T.gold}>{d._isTask?"Task":"Invoice"}</Pill><span style={{fontSize:12,color:T.cream,fontWeight:500}}>{d.name}</span>{!d._isTask&&d.invoiceKind&&<Pill color={INVOICE_KIND_COLORS[d.invoiceKind]}>{INVOICE_KIND_LABELS[d.invoiceKind]}</Pill>}</div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>Due: {d._isTask?d.endDate:d.dueDate}</span>{!d._isTask&&<span className="num" style={{fontSize:13,fontFamily:T.mono,fontWeight:600,color:T.gold}}>{f$(d.amount)}</span>}</div>
          </div>)}
        </div>}
      </div>
      :<div style={{gridColumn:"1/-1",gridRow:3}}/>}
    </div>
  </div>;
}

export default DashV;
