import { useState, useMemo, useEffect, useCallback } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { parseD, daysBetween } from '../utils/date.js';
import { ct, isOverdue, getVendorName } from '../utils/calc.js';
import { INVOICE_KIND_COLORS, INVOICE_KIND_LABELS } from '../constants/index.js';
import { Card, Metric, DonutChart } from '../components/primitives/index.js';

/* ── Bento cell helper ── */
const Cell=({children,area,style={},accent,onClick})=>(
  <div onClick={onClick} onMouseEnter={e=>{if(onClick){e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow=T.shadow}}} onMouseLeave={e=>{if(onClick){e.currentTarget.style.borderColor=style.borderColor||T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}} style={{gridArea:area,background:accent||T.surfEl,borderRadius:T.r,border:`1px solid ${T.border}`,padding:"24px 28px",display:"flex",flexDirection:"column",justifyContent:"space-between",transition:"all .2s",cursor:onClick?"pointer":"default",...style}}>{children}</div>
);
const Label=({children})=><div style={{fontSize:10,fontWeight:600,color:T.dim,letterSpacing:".12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:6}}>{children}</div>;
const Big=({children,color=T.cream,size=42})=><div className="num" style={{fontSize:size,fontWeight:700,color,fontFamily:T.mono,lineHeight:1,letterSpacing:"-0.04em"}}>{children}</div>;
const Slash=({children})=><span style={{fontSize:14,fontWeight:400,color:T.dim,fontFamily:T.mono,marginLeft:6}}>/ {children}</span>;
const Pill=({children,color=T.gold,bg})=><span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:bg||`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

/* ── Widget definitions ── */
const WIDGETS={
  timezone:{id:"timezone",label:"Time Zones",icon:"\uD83C\uDF0D",color:"#06B6D4",desc:"Client & team time zones"},
  countdown:{id:"countdown",label:"Countdown",icon:"\u23F3",color:"#F59E0B",desc:"Days until event"},
  weather:{id:"weather",label:"Weather",icon:"\u2600\uFE0F",color:"#4ADE80",desc:"Event location forecast"},
  notes:{id:"notes",label:"Quick Notes",icon:"\uD83D\uDCDD",color:"#C4B5FD",desc:"Sticky notes for the project"},
  links:{id:"links",label:"Quick Links",icon:"\uD83D\uDD17",color:"#7DD3FC",desc:"Figma, Drive, Slack, etc."},
  activity:{id:"activity",label:"Recent Activity",icon:"\u26A1",color:"#F47264",desc:"Latest changes"},
  team:{id:"team",label:"Team",icon:"\uD83D\uDC65",color:"#8B5CF6",desc:"Who's on this project"},
  vendors:{id:"vendors",label:"Top Vendors",icon:"\u25C6",color:"#14B8A6",desc:"Vendors by spend"},
  burndown:{id:"burndown",label:"Task Burndown",icon:"\uD83D\uDCC9",color:"#EC4899",desc:"Completion over time"},
  collection:{id:"collection",label:"Collection",icon:"\uD83D\uDCB0",color:"#10B981",desc:"Revenue collected vs billed"},
  creative:{id:"creative",label:"Creative Review",icon:"\uD83C\uDFA8",color:"#8B5CF6",desc:"Assets awaiting approval"},
};

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

  /* ── Click-to-move state for card reorder ── */
  const DEFAULT_ORDER=["budget","spend","owed","client","tasks","alerts","prod","margin","blended","profit","donut","comp"];
  const[cardOrder,setCardOrder]=useState(()=>project?.dashCardOrder||DEFAULT_ORDER);
  const[movingCard,setMovingCard]=useState(null);

  const handleCardMove=useCallback((targetId)=>{
    if(!movingCard||movingCard===targetId)return;
    const order=[...cardOrder];
    const fromIdx=order.indexOf(movingCard);
    const toIdx=order.indexOf(targetId);
    if(fromIdx<0||toIdx<0)return;
    order.splice(fromIdx,1);
    order.splice(toIdx,0,movingCard);
    setCardOrder(order);
    updateProject&&updateProject({dashCardOrder:order});
    setMovingCard(null);
  },[movingCard,cardOrder,updateProject]);

  /* Escape key cancels move */
  useEffect(()=>{
    if(!movingCard)return;
    const handler=(e)=>{if(e.key==="Escape")setMovingCard(null)};
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[movingCard]);

  const removeCard=(id)=>{const next=cardOrder.filter(c=>c!==id);setCardOrder(next);updateProject&&updateProject({dashCardOrder:next})};
  const isMoving=(id)=>movingCard===id;
  const isDropTarget=(id)=>movingCard&&movingCard!==id;
  const DragCell=({id,span=1,children,style:sx={},onClick})=>(
    <div onClick={e=>{if(movingCard&&movingCard!==id){e.stopPropagation();handleCardMove(id)}else if(onClick)onClick(e)}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=isDropTarget(id)?T.gold:sx.borderColor||T.borderGlow;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow=T.shadow;const h=e.currentTarget.querySelector('.drag-grip');if(h)h.style.opacity='.5';const x=e.currentTarget.querySelector('.card-remove');if(x)x.style.opacity='1';if(isDropTarget(id)){e.currentTarget.style.borderTopColor=T.gold;e.currentTarget.style.borderTopWidth="3px"}}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=isMoving(id)?T.gold:sx.borderColor||T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";const h=e.currentTarget.querySelector('.drag-grip');if(h)h.style.opacity='0';const x=e.currentTarget.querySelector('.card-remove');if(x)x.style.opacity='0';if(isDropTarget(id)){e.currentTarget.style.borderTopWidth="1px"}}}
      style={{background:T.surfEl,borderRadius:T.r,border:isMoving(id)?`1px solid ${T.gold}`:`1px solid ${T.border}`,display:"flex",transition:"all .2s",cursor:movingCard?(movingCard===id?"default":"pointer"):(onClick?"pointer":"default"),animation:isMoving(id)?"dashPulse 1.5s ease-in-out infinite":"none",position:"relative",overflow:"hidden",minHeight:140,...sx,...(isMoving(id)?{border:`1px solid ${T.gold}`,boxShadow:`0 0 12px ${T.gold}33`}:{})}}>
      {/* Move handle */}
      <div className="drag-grip"
        style={{position:"absolute",left:0,top:0,bottom:0,width:16,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0,transition:"opacity .15s",zIndex:3,background:"linear-gradient(90deg,rgba(148,163,184,.08),transparent)"}}
        onMouseEnter={e=>{e.currentTarget.style.opacity='1'}}
        onMouseLeave={e=>{e.currentTarget.style.opacity='.5'}}
        onClick={e=>{e.stopPropagation();if(movingCard===id)setMovingCard(null);else setMovingCard(id)}}>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {[0,1,2].map(i=><div key={i} style={{display:"flex",gap:2}}><div style={{width:2,height:2,borderRadius:1,background:isMoving(id)?T.gold:T.dim}}/><div style={{width:2,height:2,borderRadius:1,background:isMoving(id)?T.gold:T.dim}}/></div>)}
        </div>
      </div>
      {/* Remove button — always slightly visible */}
      <button className="card-remove" onClick={e=>{e.stopPropagation();removeCard(id)}} style={{position:"absolute",top:8,right:8,width:20,height:20,borderRadius:10,background:"rgba(248,113,113,.12)",border:"1px solid rgba(248,113,113,.2)",color:T.neg,fontSize:11,fontWeight:700,cursor:"pointer",opacity:0,transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.25)";e.currentTarget.style.transform="scale(1.1)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.12)";e.currentTarget.style.transform="scale(1)"}}>&times;</button>
      {/* Content */}
      <div style={{padding:"20px 24px",flex:1,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
        {children}
      </div>
    </div>
  );

  /* ── Card renderers — all compact, uniform ── */
  const V=28; // standard number size
  const CARDS={
    budget:()=><DragCell id="budget" style={{borderLeft:`3px solid ${T.gold}`}} onClick={()=>onNavigate&&onNavigate("budget")}>
      <Label>Client Budget</Label>
      <Big color={T.gold} size={V}>{f0(totalBudget)}</Big>
      <div style={{marginTop:12,height:3,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(budgetPct,100)}%`,background:comp.grandTotal>totalBudget?T.neg:`linear-gradient(90deg,${T.gold},${T.cyan})`,borderRadius:2}}/></div>
      <div style={{fontSize:9,color:T.dim,fontFamily:T.mono,marginTop:6}}>{budgetPct}% · {f0(Math.max(0,totalBudget-comp.grandTotal))} left</div>
    </DragCell>,
    spend:()=>{const over=comp.grandTotal>totalBudget&&totalBudget>0;return<DragCell id="spend" style={{borderLeft:`3px solid ${over?T.neg:T.pos}`}} onClick={()=>onNavigate&&onNavigate("budget")}>
      <Label>Project Total</Label>
      <Big size={V} color={over?T.neg:T.pos}>{f0(comp.grandTotal)}</Big>
      <div style={{fontSize:9,color:over?T.neg:T.pos,marginTop:8,fontFamily:T.mono}}>{over?`${f0(comp.grandTotal-totalBudget)} over`:"Within budget"}</div>
    </DragCell>},
    owed:()=><DragCell id="owed" style={{borderLeft:`3px solid ${amountOwed>0?T.neg:T.dim}`}} onClick={()=>onNavigate&&onNavigate("vendors")}>
      <Label>Owed to Vendors</Label>
      <Big color={amountOwed>0?T.neg:T.dim} size={V}>{f0(amountOwed)}</Big>
      {overdueDocs.length>0&&<div style={{marginTop:8}}><Pill color={T.neg}>{overdueDocs.length} overdue</Pill></div>}
    </DragCell>,
    client:()=><DragCell id="client" style={{borderLeft:`3px solid ${T.gold}`}} onClick={()=>onNavigate&&onNavigate("pnl")}>
      <Label>Due from Client</Label>
      <Big color={amountDueFromClient>0?T.gold:T.pos} size={V}>{f0(Math.max(0,amountDueFromClient))}</Big>
      <div style={{fontSize:9,color:T.dim,marginTop:8,fontFamily:T.mono}}>{totalIncome>0?`${f0(totalIncome)} collected`:"None collected"}</div>
    </DragCell>,
    tasks:()=><DragCell id="tasks" style={{borderLeft:`3px solid ${T.cyan}`}} onClick={()=>onNavigate&&onNavigate("timeline")}>
      <Label>Tasks</Label>
      <div style={{display:"flex",alignItems:"baseline",gap:4}}><Big size={V}>{tasksDone}</Big><span style={{fontSize:12,color:T.dim,fontFamily:T.mono}}>/ {tasks.length}</span></div>
      <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
        {tasks.filter(t=>t.status==="progress").length>0&&<Pill color={T.cyan}>{tasks.filter(t=>t.status==="progress").length} active</Pill>}
        {tasks.filter(t=>t.status==="roadblocked").length>0&&<Pill color={T.neg}>{tasks.filter(t=>t.status==="roadblocked").length} blocked</Pill>}
      </div>
    </DragCell>,
    alerts:()=>{const count=overdueDocs.length+overdueTasks.length+allUpcoming.length;if(!count)return<DragCell id="alerts" style={{borderLeft:`3px solid ${T.pos}`}}><Label>Alerts</Label><Big size={V} color={T.pos}>0</Big><div style={{fontSize:9,color:T.dim,marginTop:8}}>No issues</div></DragCell>;
      return<DragCell id="alerts" style={{borderLeft:`3px solid ${T.neg}`}} onClick={()=>onNavigate&&onNavigate("pnl")}>
        <Label>Alerts</Label>
        <Big size={V} color={T.neg}>{overdueDocs.length+overdueTasks.length}</Big>
        <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
          {overdueDocs.length>0&&<Pill color={T.neg}>{overdueDocs.length} invoices</Pill>}
          {overdueTasks.length>0&&<Pill color={T.neg}>{overdueTasks.length} tasks</Pill>}
          {allUpcoming.length>0&&<Pill color={T.gold}>{allUpcoming.length} upcoming</Pill>}
        </div>
      </DragCell>},
    prod:()=><DragCell id="prod" style={{borderLeft:`3px solid ${T.dim}`}} onClick={()=>onNavigate&&onNavigate("budget")}><Label>Production Cost</Label><Big size={V}>{f0(comp.productionSubtotal.actualCost)}</Big></DragCell>,
    margin:()=><DragCell id="margin" style={{borderLeft:`3px solid ${T.gold}`}} onClick={()=>onNavigate&&onNavigate("budget")}><Label>Client Total</Label><Big size={V} color={T.gold}>{f0(comp.grandTotal)}</Big></DragCell>,
    blended:()=><DragCell id="blended" style={{borderLeft:`3px solid ${T.cyan}`}} onClick={()=>onNavigate&&onNavigate("budget")}><Label>Blended Margin</Label><Big size={V} color={T.cyan}>{blended.toFixed(1)}%</Big></DragCell>,
    profit:()=><DragCell id="profit" style={{borderLeft:`3px solid ${T.pos}`}} onClick={()=>onNavigate&&onNavigate("pnl")}><Label>Net Profit</Label><Big size={V} color={T.pos}>{f0(comp.netProfit)}</Big></DragCell>,
    donut:()=><DragCell id="donut" onClick={()=>onNavigate&&onNavigate("budget")}>
      <Label>Spend Distribution</Label>
      <div style={{display:"flex",justifyContent:"center",margin:"8px 0"}}><DonutChart data={pieData} size={100} thickness={14}/></div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>{pieData.slice(0,4).map((d,i)=><span key={i} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:T.dim}}><span style={{width:5,height:5,borderRadius:"50%",background:d.color}}/>{d.name.split(" ")[0]}</span>)}</div>
    </DragCell>,
    comp:()=><DragCell id="comp" onClick={()=>onNavigate&&onNavigate("budget")}>
      <Label>Profit Breakdown</Label>
      {profitParts.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:i<profitParts.length-1?`1px solid ${T.border}`:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:6,height:6,borderRadius:2,background:d.color}}/><span style={{fontSize:11,color:T.cream}}>{d.name}</span></div>
        <span style={{fontSize:11,fontFamily:T.mono,color:T.cream}}>{f0(d.value)}</span>
      </div>)}
      <div style={{display:"flex",justifyContent:"space-between",paddingTop:6,marginTop:4,borderTop:`1px solid ${T.border}`}}>
        <span style={{fontSize:11,fontWeight:700,color:T.gold}}>Net</span>
        <span style={{fontSize:13,fontFamily:T.mono,fontWeight:700,color:T.gold}}>{f0(comp.netProfit)}</span>
      </div>
    </DragCell>,
  };

  return<div>
    <style>{`@keyframes dashPulse{0%,100%{box-shadow:0 0 12px ${T.gold}33}50%{box-shadow:0 0 20px ${T.gold}55}}`}</style>
    <div style={{marginBottom:28}}><h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",fontFamily:T.sans}}>Dashboard</h1><p style={{fontSize:12,color:T.dim,marginTop:4}}>Project overview · click grip to reorder cards{movingCard&&<span style={{color:T.gold,marginLeft:8}}>Click a card to move here · Esc to cancel</span>}</p></div>

    {/* ── Reorderable Card Grid ── */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:20,gridAutoRows:"minmax(140px,auto)"}}>
      {cardOrder.filter(id=>CARDS[id]).map(id=>{const render=CARDS[id];return render?<div key={id}>{render()}</div>:null})}
    </div>

    {/* ── Custom Widgets ── */}
    {(()=>{
      const activeWidgets=project?.dashWidgets||[];
      const[showPicker,setShowPicker]=useState(false);
      const[noteText,setNoteText]=useState(project?.dashNotes||"");
      const[linkName,setLinkName]=useState("");
      const[linkUrl,setLinkUrl]=useState("");
      const[tzClient,setTzClient]=useState(project?.clientTimezone||"");

      const DEFAULT_CARD_META={budget:{label:"Client Budget",icon:"\uD83D\uDCB0",color:"#F59E0B",desc:"Budget allocation"},spend:{label:"Project Total",icon:"\uD83D\uDCCA",color:"#14B8A6",desc:"Current grand total"},owed:{label:"Owed to Vendors",icon:"\u25C6",color:"#F47264",desc:"Outstanding vendor invoices"},client:{label:"Due from Client",icon:"\uD83D\uDCB0",color:"#94A3B8",desc:"Client payment status"},tasks:{label:"Tasks",icon:"\u2611",color:"#06B6D4",desc:"Task completion overview"},alerts:{label:"Alerts",icon:"\u26A0",color:"#F87171",desc:"Overdue & upcoming deadlines"},prod:{label:"Production Cost",icon:"\u25C8",color:"#94A3B8",desc:"Total production spend"},margin:{label:"Client Total",icon:"\u25C8",color:"#F59E0B",desc:"Grand total at client price"},blended:{label:"Blended Margin",icon:"\u25C8",color:"#7DD3FC",desc:"Overall margin percentage"},profit:{label:"Net Profit",icon:"\u25C8",color:"#4ADE80",desc:"Bottom line"},donut:{label:"Spend Distribution",icon:"\uD83D\uDFE0",color:"#6366F1",desc:"Spend by category chart"},comp:{label:"Profit Composition",icon:"\uD83D\uDFE2",color:"#14B8A6",desc:"Margin breakdown chart"}};
      const removedDefaults=DEFAULT_ORDER.filter(id=>!cardOrder.includes(id));
      const addWidget=(id)=>{if(DEFAULT_CARD_META[id]){const next=[...cardOrder,id];setCardOrder(next);updateProject&&updateProject({dashCardOrder:next})}else if(!activeWidgets.includes(id)){updateProject&&updateProject({dashWidgets:[...activeWidgets,id]})}};
      const removeWidget=(id)=>{updateProject&&updateProject({dashWidgets:activeWidgets.filter(w=>w!==id)})};

      const renderWidget=(wid)=>{
        const w=WIDGETS[wid];if(!w)return null;
        const header=<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14}}>{w.icon}</span><span style={{fontSize:10,fontWeight:600,color:w.color,textTransform:"uppercase",letterSpacing:".06em"}}>{w.label}</span></div>
          <button onClick={()=>removeWidget(wid)} style={{background:"none",border:"none",color:T.dim,fontSize:12,cursor:"pointer",opacity:.3,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.3} title="Remove widget">&times;</button>
        </div>;

        if(wid==="countdown"){
          const ed=project?.eventDate?parseD(project.eventDate):null;
          const days=ed?Math.ceil((ed-new Date())/(1000*60*60*24)):null;
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
            {header}
            {days!==null?<div><Big size={36} color={days<=0?T.pos:days<=7?T.neg:T.cream}>{Math.abs(days)}</Big><div style={{fontSize:10,color:T.dim,marginTop:4}}>{days>0?`days until event`:days===0?"Event is today!":"days since event"}</div></div>
            :<div style={{fontSize:11,color:T.dim}}>Set event date in Settings</div>}
          </div>;
        }
        if(wid==="timezone"){
          const now=new Date();
          const localTime=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:true});
          const clientTime=tzClient?new Date(now.toLocaleString("en-US",{timeZone:tzClient})).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:true}):null;
          const tzLabel=tzClient?tzClient.split("/").pop().replace("_"," "):"";
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`,minHeight:140}}>
            {header}
            <div style={{display:"flex",gap:20}}>
              <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>You</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{localTime}</div></div>
              <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Client</div>
                {clientTime&&<div className="num" style={{fontSize:20,fontWeight:700,color:T.cyan,fontFamily:T.mono}}>{clientTime}</div>}
              </div>
            </div>
            <div style={{marginTop:8}}>
              <select value={tzClient} onChange={e=>{setTzClient(e.target.value);updateProject&&updateProject({clientTimezone:e.target.value})}} style={{padding:"5px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:tzClient?T.cream:T.dim,fontSize:10,fontFamily:T.sans,outline:"none",cursor:"pointer",width:"100%"}}>
                <option value="">Select client timezone</option>
                {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","Europe/London","Europe/Paris","Europe/Berlin","Asia/Dubai","Asia/Riyadh","Asia/Tokyo","Asia/Singapore","Asia/Hong_Kong","Australia/Sydney","Pacific/Auckland"].map(tz=><option key={tz} value={tz}>{tz.replace("_"," ").split("/").pop()} ({tz.split("/")[0]})</option>)}
              </select>
            </div>
          </div>;
        }
        if(wid==="notes"){
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
            {header}
            <textarea value={noteText} onChange={e=>{setNoteText(e.target.value);updateProject&&updateProject({dashNotes:e.target.value})}} placeholder="Jot something down..." rows={3} style={{width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical"}}/>
          </div>;
        }
        if(wid==="links"){
          const links=project?.dashLinks||[];
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
            {header}
            {links.map((l,i)=><a key={i} href={l.url} target="_blank" rel="noopener" style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",fontSize:12,color:T.cyan,textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.cyan}><span style={{fontSize:10}}>&#8599;</span>{l.name}</a>)}
            <div style={{display:"flex",gap:4,marginTop:6}}>
              <input value={linkName} onChange={e=>setLinkName(e.target.value)} placeholder="Name" style={{flex:1,padding:"5px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:10,fontFamily:T.sans,outline:"none"}}/>
              <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="URL" onKeyDown={e=>{if(e.key==="Enter"&&linkName&&linkUrl){updateProject&&updateProject({dashLinks:[...links,{name:linkName,url:linkUrl}]});setLinkName("");setLinkUrl("")}}} style={{flex:2,padding:"5px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:10,fontFamily:T.sans,outline:"none"}}/>
              <button onClick={()=>{if(linkName&&linkUrl){updateProject&&updateProject({dashLinks:[...links,{name:linkName,url:linkUrl}]});setLinkName("");setLinkUrl("")}}} style={{padding:"5px 10px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:9,fontWeight:700,cursor:"pointer"}}>+</button>
            </div>
          </div>;
        }
        if(wid==="team"){
          const vendors=project?.vendors||[];
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
            {header}
            <div style={{fontSize:11,color:T.dim}}>{vendors.length} vendors · {tasks.length} tasks · {docs.length} documents</div>
          </div>;
        }
        if(wid==="vendors"){
          const vendorSpend=(project?.vendors||[]).map(v=>{const spent=(project?.cats||[]).reduce((a,c)=>a+c.items.filter(i=>i.vendorId===v.id).reduce((s,i)=>s+i.actualCost,0),0);return{name:v.name,spent}}).filter(v=>v.spent>0).sort((a,b)=>b.spent-a.spent).slice(0,5);
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
            {header}
            {vendorSpend.map((v,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:11,color:T.cream}}>{v.name}</span>
              <span style={{fontSize:11,fontFamily:T.mono,color:T.dim}}>{f0(v.spent)}</span>
            </div>)}
            {vendorSpend.length===0&&<div style={{fontSize:10,color:T.dim}}>No vendor costs yet</div>}
          </div>;
        }
        if(wid==="collection"){
          const collected=txns.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);
          const pct=comp.grandTotal>0?Math.round(collected/comp.grandTotal*100):0;
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
            {header}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:T.dim}}>Collected</span><span style={{fontSize:10,color:T.gold,fontFamily:T.mono}}>{f0(collected)} / {f0(comp.grandTotal)}</span></div>
            <div style={{height:6,background:T.surface,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:`linear-gradient(90deg,${T.gold},${T.pos})`,borderRadius:3}}/></div>
            <div style={{fontSize:10,color:T.dim,marginTop:4}}>{pct}% collected</div>
          </div>;
        }
        if(wid==="creative"){
          const assets=project?.creativeAssets||[];
          const inReview=assets.filter(a=>a.status==="review");
          const approved=assets.filter(a=>a.status==="approved"||a.status==="sent");
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`,cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("creative")}>
            {header}
            {inReview.length>0?<div>
              <div style={{fontSize:18,fontWeight:700,color:"#F59E0B",fontFamily:T.mono,marginBottom:4}}>{inReview.length}</div>
              <div style={{fontSize:10,color:"#F59E0B"}}>awaiting review</div>
              {approved.length>0&&<div style={{fontSize:9,color:T.dim,marginTop:4}}>{approved.length} approved</div>}
            </div>
            :<div style={{fontSize:11,color:T.dim}}>{approved.length>0?`${approved.length} approved, none pending`:"No assets yet"}</div>}
          </div>;
        }
        if(wid==="weather"){
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`,minHeight:140}}>
            {header}
            <div style={{fontSize:11,color:T.dim}}>Enable location to see weather</div>
          </div>;
        }
        // Generic fallback
        return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`,minHeight:140}}>
          {header}
          <div style={{fontSize:11,color:T.dim}}>Coming soon</div>
        </div>;
      };

      return<>
        {activeWidgets.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:16,gridAutoRows:"minmax(140px,auto)"}}>
          {activeWidgets.map(wid=>renderWidget(wid))}
        </div>}

        {/* Add widget button + picker */}
        <div style={{position:"relative",display:"inline-block"}}>
          <button onClick={()=>setShowPicker(!showPicker)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:20,background:showPicker?T.goldSoft:"transparent",color:showPicker?T.gold:T.dim,border:`1px solid ${showPicker?T.borderGlow:T.border}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}} onMouseEnter={e=>{if(!showPicker){e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.color=T.cream}}} onMouseLeave={e=>{if(!showPicker){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}}>
            <span style={{fontSize:14,lineHeight:1}}>+</span> Add Widget
          </button>
          {showPicker&&<div style={{position:"absolute",left:0,bottom:"calc(100% + 6px)",zIndex:60,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.r,boxShadow:"0 12px 40px rgba(0,0,0,.5)",width:320,padding:12}}>
            <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Available Widgets</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {/* Removed default cards */}
              {removedDefaults.map(id=>{const m=DEFAULT_CARD_META[id];return<button key={id} onClick={()=>{addWidget(id);setShowPicker(false)}} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,cursor:"pointer",transition:"all .15s",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=m.color;e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surfEl}}>
                <span style={{fontSize:16}}>{m.icon}</span>
                <div><div style={{fontSize:11,fontWeight:600,color:T.cream}}>{m.label}</div><div style={{fontSize:9,color:T.dim}}>{m.desc}</div></div>
              </button>})}
              {/* Custom widgets */}
              {Object.values(WIDGETS).filter(w=>!activeWidgets.includes(w.id)).map(w=>
                <button key={w.id} onClick={()=>{addWidget(w.id);setShowPicker(false)}} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,cursor:"pointer",transition:"all .15s",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=w.color;e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surfEl}}>
                  <span style={{fontSize:16}}>{w.icon}</span>
                  <div><div style={{fontSize:11,fontWeight:600,color:T.cream}}>{w.label}</div><div style={{fontSize:9,color:T.dim}}>{w.desc}</div></div>
                </button>
              )}
            </div>
            {removedDefaults.length===0&&Object.values(WIDGETS).filter(w=>!activeWidgets.includes(w.id)).length===0&&<div style={{textAlign:"center",padding:12,color:T.dim,fontSize:11}}>All widgets added</div>}
          </div>}
        </div>
      </>;
    })()}
  </div>;
}

export default DashV;
