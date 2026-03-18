import { useState, useMemo } from 'react';
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

  return<div>
    <div style={{marginBottom:28}}><h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",fontFamily:T.sans}}>Dashboard</h1><p style={{fontSize:12,color:T.dim,marginTop:4}}>Project overview and financial snapshot</p></div>

    {/* ── Bento Grid ── */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gridTemplateRows:"auto",gridTemplateAreas:`
      "budget budget spend spend"
      "owed   client tasks  tasks"
      "alerts alerts alerts alerts"
      "prod   margin blended profit"
      "donut  donut  comp   comp"
    `,gap:10,marginBottom:20}}>

      {/* Hero: Client Budget Allocation */}
      <Cell area="budget" accent={T.goldSoft} style={{borderColor:T.borderGlow,cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("budget")}>
        <Label>Client Budget Allocation</Label>
        <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:12}}>
          <Big color={T.gold} size={48}>{f0(totalBudget)}</Big>
        </div>
        <div style={{marginTop:16,height:3,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(budgetPct,100)}%`,background:comp.grandTotal>totalBudget?`linear-gradient(90deg,${T.neg},#FF6B6B)`:`linear-gradient(90deg,${T.gold},${T.cyan})`,borderRadius:2,transition:"width .6s ease"}}/></div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}><span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{budgetPct}% allocated</span><span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{f0(Math.max(0,totalBudget-comp.grandTotal))} remaining</span></div>
      </Cell>

      {/* Current Project Total */}
      {(()=>{const overBudget=comp.grandTotal>totalBudget&&totalBudget>0;return<Cell area="spend" style={{cursor:"pointer",borderLeft:overBudget?`3px solid ${T.neg}`:`3px solid ${T.pos}`}} onClick={()=>onNavigate&&onNavigate("budget")}>
        <Label>Current Project Total</Label>
        <div style={{display:"flex",alignItems:"baseline",marginTop:12}}>
          <Big size={40} color={overBudget?T.neg:T.pos}>{f0(comp.grandTotal)}</Big>
          <Slash>{f0(totalBudget)}</Slash>
        </div>
        <div style={{fontSize:11,color:overBudget?T.neg:T.pos,marginTop:14,fontFamily:T.mono}}>{overBudget?`${f0(comp.grandTotal-totalBudget)} over budget`:"Within budget"}</div>
      </Cell>})()}

      {/* Amount Owed */}
      <Cell area="owed" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("vendors")}>
        <Label>Owed to Vendors</Label>
        <div style={{marginTop:12}}><Big color={amountOwed>0?T.neg:T.dim} size={36}>{f0(amountOwed)}</Big></div>
        {overdueDocs.length>0&&<div style={{marginTop:12}}><Pill color={T.neg}>{overdueDocs.length} overdue</Pill></div>}
      </Cell>

      {/* Due from Client */}
      <Cell area="client" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("pnl")}>
        <Label>Due from Client</Label>
        <div style={{marginTop:12}}><Big color={amountDueFromClient>0?T.gold:T.pos} size={36}>{f0(Math.max(0,amountDueFromClient))}</Big></div>
        <div style={{fontSize:11,color:T.dim,marginTop:12,fontFamily:T.mono}}>{totalIncome>0?`${f0(totalIncome)} collected`:"No payments received"}</div>
      </Cell>

      {/* Tasks overview */}
      <Cell area="tasks" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("timeline")}>
        <Label>Tasks</Label>
        <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:12}}>
          <Big size={48}>{tasksDone}</Big>
          <Slash>{tasks.length}</Slash>
        </div>
        <div style={{display:"flex",gap:6,marginTop:14,flexWrap:"wrap"}}>
          {tasks.filter(t=>t.status==="progress").length>0&&<Pill color={T.cyan}>{tasks.filter(t=>t.status==="progress").length} in progress</Pill>}
          {tasks.filter(t=>t.status==="roadblocked").length>0&&<Pill color={T.neg}>{tasks.filter(t=>t.status==="roadblocked").length} blocked</Pill>}
          {tasks.filter(t=>t.status==="todo").length>0&&<Pill color={T.dim}>{tasks.filter(t=>t.status==="todo").length} to do</Pill>}
        </div>
      </Cell>

      {/* ── Alerts row ── */}
      {(overdueDocs.length>0||unpaidInvoices.length>0||allUpcoming.length>0||overdueTasks.length>0)?
      <div style={{gridArea:"alerts",display:"flex",flexDirection:"column",gap:10}}>
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
      :<div style={{gridArea:"alerts"}}/>}

      {/* ── Secondary metrics row ── */}
      <Cell area="prod" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("budget")}>
        <Label>Production Cost</Label>
        <div style={{marginTop:10}}><Big size={32}>{f0(comp.productionSubtotal.actualCost)}</Big></div>
      </Cell>
      <Cell area="margin" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("budget")}>
        <Label>Client Total</Label>
        <div style={{marginTop:10}}><Big size={32} color={T.gold}>{f0(comp.grandTotal)}</Big></div>
      </Cell>
      <Cell area="blended" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("budget")}>
        <Label>Blended Margin</Label>
        <div style={{marginTop:10}}><Big size={32} color={T.cyan}>{blended.toFixed(1)}%</Big></div>
      </Cell>
      <Cell area="profit" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("pnl")}>
        <Label>Net Profit</Label>
        <div style={{marginTop:10}}><Big size={32} color={T.pos}>{f0(comp.netProfit)}</Big></div>
      </Cell>

      {/* ── Charts row ── */}
      <Cell area="donut" style={{padding:"28px 32px"}} onClick={()=>onNavigate&&onNavigate("budget")}>
        <Label>Spend Distribution</Label>
        <div style={{display:"flex",justifyContent:"center",marginTop:16,marginBottom:16}}><DonutChart data={pieData} size={160} thickness={22}/></div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>{pieData.map((d,i)=><span key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.dim}}><span style={{width:7,height:7,borderRadius:"50%",background:d.color,display:"inline-block"}}/>{d.name.length>14?d.name.split(" ")[0]:d.name}</span>)}</div>
      </Cell>

      <Cell area="comp" style={{padding:"28px 32px"}} onClick={()=>onNavigate&&onNavigate("budget")}>
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
      </Cell>
    </div>

    {/* ── Custom Widgets ── */}
    {(()=>{
      const activeWidgets=project?.dashWidgets||[];
      const[showPicker,setShowPicker]=useState(false);
      const[noteText,setNoteText]=useState(project?.dashNotes||"");
      const[linkName,setLinkName]=useState("");
      const[linkUrl,setLinkUrl]=useState("");
      const[tzClient,setTzClient]=useState(project?.clientTimezone||"");

      const addWidget=(id)=>{if(!activeWidgets.includes(id))updateProject&&updateProject({dashWidgets:[...activeWidgets,id]})};
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
          return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
            {header}
            <div style={{display:"flex",gap:16}}>
              <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>You</div><div className="num" style={{fontSize:20,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{localTime}</div></div>
              <div><div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Client</div>
                {clientTime?<div className="num" style={{fontSize:20,fontWeight:700,color:T.cyan,fontFamily:T.mono}}>{clientTime}</div>
                :<select value={tzClient} onChange={e=>{setTzClient(e.target.value);updateProject&&updateProject({clientTimezone:e.target.value})}} style={{padding:"4px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:10,fontFamily:T.sans,outline:"none",cursor:"pointer"}}>
                  <option value="">Set timezone</option>
                  {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","Europe/London","Europe/Paris","Europe/Berlin","Asia/Dubai","Asia/Riyadh","Asia/Tokyo","Asia/Singapore","Asia/Hong_Kong","Australia/Sydney","Pacific/Auckland"].map(tz=><option key={tz} value={tz}>{tz.replace("_"," ").split("/").pop()}</option>)}
                </select>}
              </div>
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
        // Generic fallback
        return<div key={wid} style={{padding:"20px 22px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:`3px solid ${w.color}`}}>
          {header}
          <div style={{fontSize:11,color:T.dim}}>Coming soon</div>
        </div>;
      };

      return<>
        {activeWidgets.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:16}}>
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
              {Object.values(WIDGETS).filter(w=>!activeWidgets.includes(w.id)).map(w=>
                <button key={w.id} onClick={()=>{addWidget(w.id);setShowPicker(false)}} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,cursor:"pointer",transition:"all .15s",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=w.color;e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surfEl}}>
                  <span style={{fontSize:16}}>{w.icon}</span>
                  <div><div style={{fontSize:11,fontWeight:600,color:T.cream}}>{w.label}</div><div style={{fontSize:9,color:T.dim}}>{w.desc}</div></div>
                </button>
              )}
            </div>
            {Object.values(WIDGETS).filter(w=>!activeWidgets.includes(w.id)).length===0&&<div style={{textAlign:"center",padding:12,color:T.dim,fontSize:11}}>All widgets added</div>}
          </div>}
        </div>
      </>;
    })()}
  </div>;
}

export default DashV;
