import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { parseD, daysBetween } from '../utils/date.js';
import { ct, isOverdue, getVendorName } from '../utils/calc.js';
import { INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../constants/index.js';
import { Card, Metric, DonutChart } from '../components/primitives/index.js';
import { PlusI } from '../components/icons/index.js';

/* ── All available card definitions ── */
const ALL_CARDS={
  budget:{label:"Client Budget Allocation",size:2,nav:"budget"},
  spend:{label:"Current Project Total",size:2,nav:"budget"},
  owed:{label:"Owed to Vendors",size:1,nav:"vendors"},
  client:{label:"Due from Client",size:1,nav:"pnl"},
  tasks:{label:"Tasks",size:2,nav:"timeline"},
  prod:{label:"Production Cost",size:1,nav:"budget"},
  margin:{label:"Client Total",size:1,nav:"budget"},
  blended:{label:"Blended Margin",size:1,nav:"budget"},
  profit:{label:"Net Profit",size:1,nav:"pnl"},
  donut:{label:"Spend Distribution",size:2,nav:"budget"},
  comp:{label:"Profit Composition",size:2,nav:"budget"},
  countdown:{label:"Event Countdown",size:1,nav:null},
  vendors:{label:"Vendor Summary",size:1,nav:"vendors"},
  cashflow:{label:"Cash Flow",size:2,nav:"pnl"},
  meetings:{label:"Upcoming Meetings",size:2,nav:"timeline"},
  agencyfee:{label:"Agency Fee",size:1,nav:"budget"},
  recenttxns:{label:"Recent Transactions",size:2,nav:"pnl"},
};

const DEFAULT_ORDER=["budget","spend","owed","client","tasks","prod","margin","blended","profit","donut","comp"];

/* ── Build slot positions from an order array ── */
function buildSlots(order){
  const slots=[];let col=1,row=1;
  for(const key of order){
    const size=ALL_CARDS[key]?.size||1;
    if(col+size-1>4){row++;col=1}
    slots.push({col:`${col}/${col+size}`,row});
    col+=size;
    if(col>4){row++;col=1}
  }
  return slots;
}

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

  /* ── Layout state ── */
  const initOrder=()=>{const saved=project?.dashLayout;if(saved&&Array.isArray(saved)&&saved.length>0&&saved.every(k=>ALL_CARDS[k]))return saved;return DEFAULT_ORDER};
  const[order,setOrder]=useState(initOrder);
  const[editing,setEditing]=useState(false);
  const[showAddMenu,setShowAddMenu]=useState(false);

  useEffect(()=>{const saved=project?.dashLayout;if(saved&&Array.isArray(saved)&&saved.length>0&&saved.every(k=>ALL_CARDS[k])){setOrder(saved)}},[project?.dashLayout]);

  const saveOrder=useCallback(next=>{setOrder(next);if(updateProject)updateProject({dashLayout:next})},[updateProject]);

  const removeCard=useCallback((cardKey)=>{const next=order.filter(k=>k!==cardKey);saveOrder(next)},[order,saveOrder]);
  const addCard=useCallback((cardKey)=>{if(order.includes(cardKey))return;const next=[...order,cardKey];saveOrder(next);setShowAddMenu(false)},[order,saveOrder]);
  const resetLayout=useCallback(()=>{saveOrder([...DEFAULT_ORDER]);setEditing(false)},[saveOrder]);

  /* ── Drag-to-swap ── */
  const slots=useMemo(()=>buildSlots(order),[order]);
  const dragRef=useRef({active:false,cardKey:null,slotIdx:-1,startX:0,startY:0,rects:[],el:null});
  const[dragState,setDragState]=useState({dragging:false,dragIdx:-1,overIdx:-1});
  const cellRefs=useRef({});

  const onPointerDown=useCallback((e,cardKey,slotIdx)=>{
    if(e.button!==0||!editing)return;
    const el=e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rects=[];
    for(let i=0;i<order.length;i++){const cel=cellRefs.current[i];if(cel)rects[i]=cel.getBoundingClientRect();else rects[i]=null}
    dragRef.current={active:false,cardKey,slotIdx,startX:e.clientX,startY:e.clientY,el,rects};
  },[order.length,editing]);

  const onPointerMove=useCallback((e)=>{
    const dr=dragRef.current;if(!dr.cardKey)return;
    const dx=e.clientX-dr.startX,dy=e.clientY-dr.startY;
    if(!dr.active){if(Math.abs(dx)<5&&Math.abs(dy)<5)return;dr.active=true;document.body.style.cursor="grabbing";setDragState({dragging:true,dragIdx:dr.slotIdx,overIdx:-1})}
    if(dr.el){dr.el.style.transform=`translate(${dx}px,${dy}px)`;dr.el.style.zIndex="100";dr.el.style.opacity=".85";dr.el.style.transition="none";dr.el.style.pointerEvents="none"}
    let overIdx=-1;
    for(let i=0;i<dr.rects.length;i++){if(i===dr.slotIdx||!dr.rects[i])continue;const r=dr.rects[i];if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){overIdx=i;break}}
    setDragState(prev=>prev.overIdx!==overIdx?{...prev,overIdx}:prev);
  },[]);

  const onPointerUp=useCallback((e)=>{
    const dr=dragRef.current;if(!dr.cardKey)return;
    if(dr.el){dr.el.style.transform="";dr.el.style.zIndex="";dr.el.style.opacity="";dr.el.style.transition="";dr.el.style.pointerEvents=""}
    document.body.style.cursor="";
    if(dr.active){
      let overIdx=-1;
      for(let i=0;i<dr.rects.length;i++){if(i===dr.slotIdx||!dr.rects[i])continue;const r=dr.rects[i];if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){overIdx=i;break}}
      if(overIdx>=0&&overIdx!==dr.slotIdx){
        const next=[...order];[next[dr.slotIdx],next[overIdx]]=[next[overIdx],next[dr.slotIdx]];
        saveOrder(next);
      }
    } else {
      const nav=ALL_CARDS[dr.cardKey]?.nav;
      if(onNavigate&&nav)onNavigate(nav);
    }
    dragRef.current={active:false,cardKey:null,slotIdx:-1,startX:0,startY:0,rects:[],el:null};
    setDragState({dragging:false,dragIdx:-1,overIdx:-1});
  },[order,saveOrder,onNavigate,editing]);

  /* ── Computed data for new widgets ── */
  const eventDate=project?.eventDate?parseD(project.eventDate):null;
  const daysUntilEvent=eventDate?daysBetween(new Date(),eventDate):null;
  const vendorList=project?.vendors||[];
  const meetingList=(project?.meetings||[]).filter(m=>{const d=parseD(m.date);return d&&daysBetween(new Date(),d)>=0}).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,5);
  const recentTxns=txns.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,5);

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
    countdown:()=>{
      const isPast=daysUntilEvent!==null&&daysUntilEvent<0;
      return<>
        <Label>Event Countdown</Label>
        <div style={{marginTop:10}}><Big size={48} color={isPast?T.dim:daysUntilEvent!==null&&daysUntilEvent<=7?T.neg:T.cyan}>{daysUntilEvent!==null?Math.abs(daysUntilEvent):"\u2014"}</Big></div>
        <div style={{fontSize:11,color:T.dim,marginTop:10,fontFamily:T.mono}}>{daysUntilEvent===null?"No event date set":isPast?`${Math.abs(daysUntilEvent)} days ago`:daysUntilEvent===0?"Today!":"days to go"}</div>
        {project?.eventDate&&<div style={{fontSize:10,color:T.dim,marginTop:4}}>{project.eventDate}</div>}
      </>;
    },
    vendors:()=><>
      <Label>Vendor Summary</Label>
      <div style={{marginTop:10}}><Big size={36}>{vendorList.length}</Big></div>
      <div style={{fontSize:11,color:T.dim,marginTop:10,fontFamily:T.mono}}>{vendorList.length===1?"vendor":"vendors"} on this project</div>
      {vendorList.length>0&&<div style={{display:"flex",gap:4,marginTop:10,flexWrap:"wrap"}}>{vendorList.slice(0,4).map((v,i)=><span key={i} style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:`${T.cyan}12`,color:T.dim}}>{v.name}</span>)}{vendorList.length>4&&<span style={{fontSize:10,color:T.dim}}>+{vendorList.length-4}</span>}</div>}
    </>,
    cashflow:()=>{
      const net=totalIncome-totalExpensesPaid;
      return<>
        <Label>Cash Flow</Label>
        <div style={{display:"flex",gap:24,marginTop:12}}>
          <div><div style={{fontSize:9,color:T.pos,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Income</div><Big size={28} color={T.pos}>{f0(totalIncome)}</Big></div>
          <div><div style={{fontSize:9,color:T.neg,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Expenses</div><Big size={28} color={T.neg}>{f0(totalExpensesPaid)}</Big></div>
          <div><div style={{fontSize:9,color:net>=0?T.pos:T.neg,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Net</div><Big size={28} color={net>=0?T.pos:T.neg}>{f0(net)}</Big></div>
        </div>
      </>;
    },
    meetings:()=><>
      <Label>Upcoming Meetings</Label>
      {meetingList.length===0?<div style={{marginTop:12,fontSize:12,color:T.dim}}>No upcoming meetings</div>
      :<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6}}>
        {meetingList.map(m=><div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:T.rS,background:T.surfHov||"rgba(255,255,255,.02)"}}>
          <div><div style={{fontSize:12,color:T.cream,fontWeight:500}}>{m.title}</div><div style={{fontSize:10,color:T.dim,marginTop:2}}>{m.location||"No location"}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:11,color:T.cyan,fontFamily:T.mono,fontWeight:600}}>{m.date}</div><div style={{fontSize:10,color:T.dim}}>{m.time}</div></div>
        </div>)}
      </div>}
    </>,
    agencyfee:()=><>
      <Label>Agency Fee</Label>
      <div style={{marginTop:10}}><Big size={32} color={T.gold}>{fp(feeP)}</Big></div>
      <div style={{fontSize:11,color:T.dim,marginTop:10,fontFamily:T.mono}}>{f0(comp.agencyFee.clientPrice)}</div>
    </>,
    recenttxns:()=><>
      <Label>Recent Transactions</Label>
      {recentTxns.length===0?<div style={{marginTop:12,fontSize:12,color:T.dim}}>No transactions yet</div>
      :<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
        {recentTxns.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:T.rS,background:T.surfHov||"rgba(255,255,255,.02)"}}>
          <div style={{fontSize:12,color:T.cream,fontWeight:500}}>{t.description}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{t.date}</span>
            <span className="num" style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:t.type==="income"?T.pos:T.neg}}>{t.type==="income"?"+":"-"}{f0(t.amount)}</span>
          </div>
        </div>)}
      </div>}
    </>,
  };

  const cardAccent={budget:T.goldSoft};
  const cardBorderStyle={budget:{borderColor:T.borderGlow},spend:{borderLeft:overBudget?`3px solid ${T.neg}`:`3px solid ${T.pos}`}};
  const cardPadding={donut:"28px 32px",comp:"28px 32px"};

  const hiddenCards=Object.keys(ALL_CARDS).filter(k=>!order.includes(k));

  /* ── Compute the alerts row position ── */
  const alertsRow=useMemo(()=>{
    // Find which row the first "secondary" card (after the first 5 slots) starts on
    const s=buildSlots(order);
    // Insert alerts after the first 2 rows of cards (find max row in first 5 cards or row 2)
    let maxRow=0;for(let i=0;i<Math.min(5,s.length);i++){if(s[i].row>maxRow)maxRow=s[i].row}
    return maxRow+1;
  },[order]);

  // Offset card rows that come after the alerts row
  const adjustedSlots=useMemo(()=>{
    const s=buildSlots(order);
    return s.map(sl=>sl.row>=alertsRow?{...sl,row:sl.row+1}:sl);
  },[order,alertsRow]);

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
      <div><h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",fontFamily:T.sans}}>Dashboard</h1><p style={{fontSize:12,color:T.dim,marginTop:4}}>Project overview and financial snapshot</p></div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setEditing(!editing)} style={{padding:"7px 14px",borderRadius:T.rS,background:editing?`${T.cyan}18`:"transparent",border:`1px solid ${editing?`${T.cyan}40`:T.border}`,color:editing?T.cyan:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}}>{editing?"Done":"Customize"}</button>
      </div>
    </div>

    {/* ── Bento Grid ── */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>

      {order.map((cardKey,slotIdx)=>{
        const slot=adjustedSlots[slotIdx];
        if(!slot||!cards[cardKey])return null;
        const isOver=dragState.dragging&&dragState.overIdx===slotIdx;
        const isDrag=dragState.dragging&&dragState.dragIdx===slotIdx;
        return<div key={cardKey} ref={el=>cellRefs.current[slotIdx]=el} data-slot={slotIdx}
          onPointerDown={e=>onPointerDown(e,cardKey,slotIdx)}
          onPointerMove={editing?onPointerMove:undefined}
          onPointerUp={editing?onPointerUp:undefined}
          onClick={!editing?()=>{const nav=ALL_CARDS[cardKey]?.nav;if(onNavigate&&nav)onNavigate(nav)}:undefined}
          onMouseEnter={e=>{if(!editing&&!dragState.dragging){e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow=T.shadow}}}
          onMouseLeave={e=>{if(!editing&&!dragState.dragging){e.currentTarget.style.borderColor=(cardBorderStyle[cardKey]||{}).borderColor||T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}}
          style={{
            gridColumn:slot.col,gridRow:slot.row,
            background:cardAccent[cardKey]||T.surfEl,
            borderRadius:T.r,
            border:`1px solid ${isOver?T.borderGlow:editing?`${T.cyan}25`:T.border}`,
            padding:cardPadding[cardKey]||"24px 28px",
            display:"flex",flexDirection:"column",justifyContent:"space-between",
            transition:isDrag?"none":"all .2s",
            cursor:editing?(dragState.dragging?(isDrag?"grabbing":"default"):"grab"):"pointer",
            touchAction:editing?"none":"auto",
            boxShadow:isOver?`0 0 20px ${T.borderGlow}`:"none",
            outline:isOver?`2px solid ${T.borderGlow}`:"none",
            position:"relative",
            ...(cardBorderStyle[cardKey]||{}),
          }}>
          {editing&&<button onClick={e=>{e.stopPropagation();removeCard(cardKey)}} style={{position:"absolute",top:8,right:8,width:22,height:22,borderRadius:"50%",background:"rgba(248,113,113,.12)",border:"1px solid rgba(248,113,113,.25)",color:T.neg,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,zIndex:10,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.3)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.12)"}}>×</button>}
          {cards[cardKey]()}
        </div>
      })}

      {/* ── Alerts row (fixed) ── */}
      {hasAlerts?
      <div style={{gridColumn:"1/-1",gridRow:alertsRow,display:"flex",flexDirection:"column",gap:10}}>
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
      :<div style={{gridColumn:"1/-1",gridRow:alertsRow}}/>}
    </div>

    {/* ── Add widget / reset controls ── */}
    {editing&&<div style={{display:"flex",gap:8,alignItems:"center",marginBottom:20,flexWrap:"wrap"}}>
      <div style={{position:"relative"}}>
        <button onClick={()=>setShowAddMenu(!showAddMenu)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={12} color={T.gold}/> Add Widget</button>
        {showAddMenu&&<div style={{position:"absolute",bottom:"100%",left:0,marginBottom:6,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.r,boxShadow:"0 8px 32px rgba(0,0,0,.5)",overflow:"hidden",zIndex:30,minWidth:220,maxHeight:320,overflowY:"auto"}}>
          {hiddenCards.length===0?<div style={{padding:"16px 20px",fontSize:12,color:T.dim}}>All widgets are visible</div>
          :hiddenCards.map(key=><button key={key} onClick={()=>addCard(key)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",fontFamily:T.sans,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov||"rgba(255,255,255,.03)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div><div style={{fontSize:12,fontWeight:500,color:T.cream}}>{ALL_CARDS[key].label}</div><div style={{fontSize:10,color:T.dim,marginTop:2}}>{ALL_CARDS[key].size===2?"Wide card":"Standard card"}</div></div>
            <PlusI size={12} color={T.cyan}/>
          </button>)}
        </div>}
      </div>
      <button onClick={resetLayout} style={{padding:"8px 14px",borderRadius:T.rS,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Reset Layout</button>
    </div>}
  </div>;
}

export default DashV;
