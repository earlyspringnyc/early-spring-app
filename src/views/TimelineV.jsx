import { useState, useMemo } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { uid } from '../utils/uid.js';
import { STATUS_COLORS, STATUS_LABELS } from '../constants/index.js';
import { mkTask, mkMeeting } from '../data/factories.js';
import { PlusI, TrashI, DlI } from '../components/icons/index.js';
import { ESWordmark } from '../components/brand/index.js';
import { Card, DatePick } from '../components/primitives/index.js';
import GanttChart from './GanttChart.jsx';
import CalendarView from './CalendarView.jsx';

function TimelineV({project,updateProject,canEdit}){
  const tasks=project.timeline||[];
  const[filter,setFilter]=useState("all");
  const[showAdd,setShowAdd]=useState(false);
  const[viewMode,setViewMode]=useState("calendar");
  const[nN,setNN]=useState("");const[nC,setNC]=useState("General");const[nA,setNA]=useState("");const[nS,setNS]=useState("");const[nE,setNE]=useState("");
  const[showClientTL,setShowClientTL]=useState(false);
  const[clientIncluded,setClientIncluded]=useState(()=>new Set(tasks.map(t=>t.id)));
  const[clientFormat,setClientFormat]=useState("both");
  const[clientEmail,setClientEmail]=useState("");const[clientSending,setClientSending]=useState(false);const[clientSent,setClientSent]=useState("");
  const allBudgetItems=useMemo(()=>{const items=[];(project.cats||[]).forEach(c=>c.items.forEach(it=>items.push({...it,catName:c.name})));return items},[project.cats]);
  const[showSuggestions,setShowSuggestions]=useState(false);
  const[showMeetingForm,setShowMeetingForm]=useState(false);
  const meetings=project.meetings||[];
  const[meetingTitle,setMeetingTitle]=useState("");
  const[meetingDate,setMeetingDate]=useState("");
  const[meetingTime,setMeetingTime]=useState("");
  const[meetingDuration,setMeetingDuration]=useState("30m");
  const[meetingAttendees,setMeetingAttendees]=useState("");
  const[meetingAgenda,setMeetingAgenda]=useState("");
  const[meetingLocation,setMeetingLocation]=useState("");
  const[viewMeeting,setViewMeeting]=useState(null);
  const[meetingNotes,setMeetingNotes]=useState("");
  const[meetingSummary,setMeetingSummary]=useState("");
  const[newActionItem,setNewActionItem]=useState("");
  const filtered=filter==="all"?tasks:tasks.filter(t=>t.status===filter);
  const counts={all:tasks.length,todo:tasks.filter(t=>t.status==="todo").length,progress:tasks.filter(t=>t.status==="progress").length,done:tasks.filter(t=>t.status==="done").length};
  const pct=tasks.length?Math.round((counts.done/tasks.length)*100):0;
  const addTask=(name,cat,assignee,start,end,linkedItemId="")=>{
    const n=name||nN.trim();if(!n)return;
    updateProject({timeline:[...tasks,mkTask(n,cat||nC,assignee||nA,start||nS,end||nE,linkedItemId)]});
    setNN("");setNC("General");setNA("");setNS("");setNE("");setShowAdd(false);
  };
  const cycleStatus=idx=>{const order=["todo","progress","done"];const cur=tasks[idx].status;updateProject({timeline:tasks.map((t,i)=>i===idx?{...t,status:order[(order.indexOf(cur)+1)%3]}:t)})};
  const removeTask=idx=>updateProject({timeline:tasks.filter((_,i)=>i!==idx)});
  const addMeeting=()=>{
    if(!meetingTitle.trim())return;
    const m=mkMeeting(meetingTitle.trim(),meetingDate,meetingTime,meetingDuration,meetingAttendees.split(",").map(s=>s.trim()).filter(Boolean),meetingAgenda,meetingLocation);
    updateProject({meetings:[...(project.meetings||[]),m]});
    addTask(meetingTitle.trim(),"Meeting","",meetingDate,meetingDate);
    setMeetingTitle("");setMeetingDate("");setMeetingTime("");setMeetingDuration("30m");setMeetingAttendees("");setMeetingAgenda("");setMeetingLocation("");setShowMeetingForm(false);
  };
  const removeMeeting=id=>updateProject({meetings:(project.meetings||[]).filter(m=>m.id!==id)});
  const updateMeeting=(id,updates)=>updateProject({meetings:(project.meetings||[]).map(m=>m.id===id?{...m,...updates}:m)});
  const addActionItemToMeeting=(meetingId,item)=>{
    const m=(project.meetings||[]).find(m=>m.id===meetingId);if(!m)return;
    const actionItem={id:uid(),text:item,done:false};
    updateMeeting(meetingId,{actionItems:[...(m.actionItems||[]),actionItem]});
    addTask(item,"Meeting Action","",m.date,"");
  };
  const toggleActionItem=(meetingId,itemId)=>{
    const m=(project.meetings||[]).find(m=>m.id===meetingId);if(!m)return;
    updateMeeting(meetingId,{actionItems:(m.actionItems||[]).map(a=>a.id===itemId?{...a,done:!a.done}:a)});
  };
  const saveMeetingNotes=(meetingId)=>{
    updateMeeting(meetingId,{notes:meetingNotes,summary:meetingSummary});
  };
  const addTaskFromBudgetItem=(item)=>{
    addTask(item.name,item.catName,"","","",item.id);
  };
  const toggleClientTask=id=>setClientIncluded(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n});
  const clientSelectAll=()=>setClientIncluded(new Set(tasks.map(t=>t.id)));
  const clientSelectNone=()=>setClientIncluded(new Set());
  const clientTasks=tasks.filter(t=>clientIncluded.has(t.id));
  const sendClientTL=()=>{if(!clientEmail.trim())return;setClientSending(true);setTimeout(()=>{setClientSending(false);setClientSent(clientEmail);setClientEmail("")},1500)};

  /* Print-ready client gantt */
  const ClientGanttPrint=()=>{
    const dated=clientTasks.filter(t=>parseD(t.startDate));
    if(!dated.length)return<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No dated tasks selected.</div>;
    const allDates=[];dated.forEach(t=>{allDates.push(parseD(t.startDate));if(parseD(t.endDate))allDates.push(parseD(t.endDate));else allDates.push(parseD(t.startDate))});
    const minD=new Date(Math.min(...allDates));const maxD=new Date(Math.max(...allDates));
    minD.setDate(minD.getDate()-2);maxD.setDate(maxD.getDate()+2);
    const totalDays=Math.max(daysBetween(minD,maxD),7);
    const weeks=[];let cur=new Date(minD);while(cur<=maxD){weeks.push(new Date(cur));cur.setDate(cur.getDate()+7)}
    return<div>
      <div style={{display:"flex",borderBottom:"1px solid #E5E5E5",padding:"6px 0"}}><div style={{width:160,flexShrink:0,padding:"0 0 0 4px",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase"}}>Task</div><div style={{flex:1,position:"relative",height:18}}>{weeks.map((w,i)=>{const left=(daysBetween(minD,w)/totalDays)*100;return<span key={i} style={{position:"absolute",left:`${left}%`,fontSize:9,color:"#999",fontFamily:"monospace"}}>{fmtShort(w)}</span>})}</div></div>
      {dated.map(t=>{const start=parseD(t.startDate);const end=parseD(t.endDate)||start;const left=(daysBetween(minD,start)/totalDays)*100;const width=Math.max((daysBetween(start,end)+1)/totalDays*100,1.5);const barColor=t.status==="done"?"#34D399":t.status==="progress"?"#22D3EE":"#432D1C";
        return<div key={t.id} style={{display:"flex",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #F5F5F5"}}><div style={{width:160,flexShrink:0,padding:"0 0 0 4px",overflow:"hidden"}}><span style={{fontSize:11,color:"#333",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{t.name}</span></div><div style={{flex:1,position:"relative",height:18}}><div style={{position:"absolute",left:`${left}%`,width:`${width}%`,top:3,height:12,borderRadius:3,background:barColor,opacity:.8}}><span style={{position:"absolute",left:4,top:0,fontSize:8,color:"#fff",fontWeight:600,whiteSpace:"nowrap"}}>{fmtShort(start)}{end>start?` — ${fmtShort(end)}`:""}</span></div></div></div>})}
    </div>
  };
  const ClientCalendarPrint=()=>{
    const dated=clientTasks.filter(t=>parseD(t.startDate)).sort((a,b)=>(a.startDate||"").localeCompare(b.startDate||""));
    if(!dated.length)return<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No dated tasks selected.</div>;
    return<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{borderBottom:"2px solid #E5E5E5"}}>{["Task","Category","Start","End","Status"].map((h,i)=><th key={i} style={{textAlign:i>1?"center":"left",padding:"8px 4px",fontWeight:600,color:"#555",fontSize:10,textTransform:"uppercase",letterSpacing:".06em"}}>{h}</th>)}</tr></thead>
      <tbody>{dated.map(t=><tr key={t.id} style={{borderBottom:"1px solid #F0F0F0"}}><td style={{padding:"10px 4px",color:"#333"}}>{t.name}</td><td style={{padding:"10px 4px",color:"#777",fontSize:12}}>{t.category}</td><td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.startDate}</td><td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.endDate||"\u2014"}</td><td style={{padding:"10px 4px",textAlign:"center"}}><span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:t.status==="done"?"#E8F5E9":t.status==="progress"?"#E0F7FA":"#FFF8E1",color:t.status==="done"?"#2E7D32":t.status==="progress"?"#00838F":"#F57F17",textTransform:"uppercase"}}>{STATUS_LABELS[t.status]}</span></td></tr>)}</tbody></table>
  };

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>Timeline / Tracker</h1><p style={{fontSize:13,color:T.dim,marginTop:4}}>{tasks.length} tasks, {pct}% complete · Click a date on the calendar to add tasks</p></div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={()=>setShowClientTL(!showClientTL)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showClientTL?"transparent":"rgba(34,211,238,.1)",color:showClientTL?T.dim:T.cyan,border:`1px solid ${showClientTL?T.border:"rgba(34,211,238,.2)"}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showClientTL?"Close":"Create Client Timeline"}</button>
        <button onClick={()=>setShowMeetingForm(!showMeetingForm)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 14px",background:showMeetingForm?"transparent":"rgba(232,121,249,.1)",color:showMeetingForm?T.dim:T.magenta,border:`1px solid ${showMeetingForm?T.border:"rgba(232,121,249,.2)"}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showMeetingForm?"Close":"Schedule Meeting"}</button>
        <button onClick={()=>setShowSuggestions(!showSuggestions)} style={{padding:"10px 14px",background:"transparent",color:T.dim,border:`1px solid ${T.border}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showSuggestions?"Hide":"Budget Items"}</button>
        <div style={{display:"flex",background:T.surface,borderRadius:T.rS,padding:2}}>
          {[["calendar","Calendar"],["gantt","Gantt"]].map(([k,l])=><button key={k} onClick={()=>setViewMode(k)} style={{padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:viewMode===k?600:400,fontFamily:T.sans,background:viewMode===k?T.goldSoft:"transparent",color:viewMode===k?T.gold:T.dim,transition:"all .15s"}}>{l}</button>)}
        </div>
        {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 14px",background:"transparent",color:T.dim,border:`1px solid ${T.border}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Manual"}</button>}
      </div>
    </div>
    <div style={{height:4,background:T.surface,borderRadius:2,marginBottom:20,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${T.gold},${T.pos})`,borderRadius:2,transition:"width .4s ease"}}/></div>

    {/* Client Timeline Creator */}
    {showClientTL&&<Card style={{padding:20,marginBottom:16,borderColor:"rgba(34,211,238,.15)",background:"rgba(34,211,238,.02)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:T.cyan}}>Create Client Timeline</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:10,color:T.dim}}>Format:</span>
          {[["gantt","Gantt"],["calendar","Calendar"],["both","Both"]].map(([k,l])=><button key={k} onClick={()=>setClientFormat(k)} style={{padding:"5px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:clientFormat===k?600:400,fontFamily:T.sans,background:clientFormat===k?"rgba(34,211,238,.12)":"transparent",color:clientFormat===k?T.cyan:T.dim}}>{l}</button>)}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:11,color:T.dim}}>{clientIncluded.size} of {tasks.length} tasks included</span>
        <div style={{display:"flex",gap:6}}>
          <button onClick={clientSelectAll} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,cursor:"pointer",fontFamily:T.sans}}>Select All</button>
          <button onClick={clientSelectNone} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,cursor:"pointer",fontFamily:T.sans}}>Select None</button>
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:14}}>
        {tasks.map(t=><button key={t.id} onClick={()=>toggleClientTask(t.id)} style={{padding:"4px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontFamily:T.sans,background:clientIncluded.has(t.id)?"rgba(34,211,238,.12)":"rgba(255,255,255,.03)",color:clientIncluded.has(t.id)?T.cyan:T.dim,fontWeight:clientIncluded.has(t.id)?500:400}}>{t.name}</button>)}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",paddingTop:12,borderTop:`1px solid ${T.border}`}}>
        <input value={clientEmail} onChange={e=>setClientEmail(e.target.value)} placeholder="client@example.com" onKeyDown={e=>e.key==="Enter"&&sendClientTL()} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
        <button onClick={sendClientTL} disabled={!clientEmail.trim()||clientSending} style={{padding:"8px 16px",borderRadius:T.rS,border:"none",background:clientEmail.trim()&&!clientSending?"rgba(34,211,238,.15)":"rgba(255,255,255,.05)",color:clientEmail.trim()&&!clientSending?T.cyan:"rgba(255,255,255,.2)",fontSize:11,fontWeight:700,cursor:clientEmail.trim()&&!clientSending?"pointer":"default",fontFamily:T.sans}}>{clientSending?"Sending…":"Send Email"}</button>
        <button onClick={()=>window.print()} style={{padding:"8px 16px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}><span style={{display:"flex",alignItems:"center",gap:4}}><DlI size={12}/>PDF</span></button>
      </div>
      {clientSent&&<div style={{marginTop:8,fontSize:11,color:T.pos}}>Sent to {clientSent}</div>}

      {/* Preview */}
      <div style={{marginTop:14,background:"#fff",borderRadius:T.rS,padding:28,color:"#111",boxShadow:"0 2px 12px rgba(0,0,0,.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",paddingBottom:16,marginBottom:20,borderBottom:"2px solid #432D1C"}}>
          <div><div style={{marginBottom:8}}><ESWordmark height={12} color="#432D1C"/></div><div style={{fontSize:18,fontWeight:700,color:"#432D1C"}}>Project Timeline</div></div>
          <div style={{textAlign:"right",fontSize:11,color:"#777"}}><div>{project.name}</div><div>{project.client||""}</div>{project.eventDate&&<div>Event: {project.eventDate}</div>}</div>
        </div>
        {(clientFormat==="gantt"||clientFormat==="both")&&<div style={{marginBottom:clientFormat==="both"?20:0}}>{clientFormat==="both"&&<div style={{fontSize:11,fontWeight:600,color:"#432D1C",marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>Gantt View</div>}<ClientGanttPrint/></div>}
        {(clientFormat==="calendar"||clientFormat==="both")&&<div>{clientFormat==="both"&&<div style={{fontSize:11,fontWeight:600,color:"#432D1C",marginBottom:10,marginTop:8,textTransform:"uppercase",letterSpacing:".06em"}}>Calendar View</div>}<ClientCalendarPrint/></div>}
        {clientTasks.length===0&&<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No tasks selected.</div>}
      </div>
    </Card>}

    {showMeetingForm&&<Card style={{padding:20,marginBottom:16,borderColor:"rgba(232,121,249,.15)",background:"rgba(232,121,249,.02)"}}>
  <div style={{fontSize:13,fontWeight:600,color:T.magenta,marginBottom:14}}>Schedule Client Meeting</div>
  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
    <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Meeting Title</label><input autoFocus value={meetingTitle} onChange={e=>setMeetingTitle(e.target.value)} placeholder="Kickoff call" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>
    <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Time</label><input value={meetingTime} onChange={e=>setMeetingTime(e.target.value)} placeholder="14:00" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.mono,outline:"none"}}/></div>
    <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Duration</label>
      <select value={meetingDuration} onChange={e=>setMeetingDuration(e.target.value)} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
        {["15m","30m","45m","1h","1.5h","2h","3h"].map(d=><option key={d} value={d}>{d}</option>)}
      </select></div>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
    <DatePick label="Date" value={meetingDate} onChange={setMeetingDate} compact/>
    <div><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Location / Link</label><input value={meetingLocation} onChange={e=>setMeetingLocation(e.target.value)} placeholder="Zoom / Office" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
  </div>
  <div style={{marginBottom:12}}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Attendees (comma separated)</label><input value={meetingAttendees} onChange={e=>setMeetingAttendees(e.target.value)} placeholder="client@example.com, producer@earlyspring.nyc" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
  <div style={{marginBottom:12}}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Agenda</label><textarea value={meetingAgenda} onChange={e=>setMeetingAgenda(e.target.value)} placeholder="Topics to discuss..." rows={3} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical"}}/></div>
  <div style={{display:"flex",gap:8,alignItems:"center"}}>
    <button onClick={addMeeting} disabled={!meetingTitle.trim()} style={{padding:"9px 20px",background:meetingTitle.trim()?`linear-gradient(135deg,${T.magenta},#C084FC)`:"rgba(255,255,255,.05)",color:meetingTitle.trim()?"#fff":"rgba(255,255,255,.2)",border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:meetingTitle.trim()?"pointer":"default",fontFamily:T.sans}}>Schedule Meeting</button>
    <button onClick={()=>{}} style={{padding:"9px 16px",border:`1px solid rgba(34,211,238,.2)`,background:"rgba(34,211,238,.06)",borderRadius:T.rS,color:T.cyan,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} title="Requires Google Calendar OAuth — available after deployment">Send Google Calendar Invite</button>
    <span style={{fontSize:10,color:T.dim,fontFamily:T.serif}}>Calendar invite requires Google integration (coming soon)</span>
  </div>
</Card>}

    {showSuggestions&&<Card style={{padding:16,marginBottom:16}}>
  <div style={{fontSize:12,fontWeight:600,color:T.cream,marginBottom:10}}>Add Tasks from Budget Items</div>
  <p style={{fontSize:11,color:T.dim,marginBottom:12}}>Click to create a task from a budget line item. You can also add tasks manually or via the calendar.</p>
  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
    {allBudgetItems.map(it=>{const alreadyAdded=tasks.some(t=>t.linkedItemId===it.id);return<button key={it.id} onClick={()=>!alreadyAdded&&addTaskFromBudgetItem(it)} disabled={alreadyAdded} style={{padding:"6px 12px",borderRadius:T.rS,border:"none",cursor:alreadyAdded?"default":"pointer",fontSize:10,fontFamily:T.sans,background:alreadyAdded?"rgba(52,211,153,.08)":"rgba(255,234,151,.08)",color:alreadyAdded?T.pos:T.gold,fontWeight:alreadyAdded?400:500,opacity:alreadyAdded?.5:1}}>{alreadyAdded?"✓ ":""}{it.name}<span style={{fontSize:8,color:T.dim,marginLeft:4}}>({it.catName})</span></button>})}
  </div>
  {allBudgetItems.length===0&&<div style={{fontSize:11,color:T.dim,padding:12,textAlign:"center"}}>Add items to your budget first.</div>}
</Card>}

    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
        {[["Task",nN,setNN,"Task"],["Category",nC,setNC,"General"],["Assignee",nA,setNA,"Name"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input autoFocus={l==="Task"} value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addTask()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <DatePick label="Start Date" value={nS} onChange={setNS} compact/>
        <DatePick label="End Date" value={nE} onChange={setNE} compact/>
      </div>
      <button onClick={()=>addTask()} style={{padding:"9px 20px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add Task</button>
    </Card>}

    {/* Calendar / Gantt view */}
    {viewMode==="calendar"?<CalendarView tasks={tasks} onAddTask={addTask} canEdit={canEdit}/>:<GanttChart tasks={tasks}/>}

    {/* Task List - auto-generated from calendar input */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,marginTop:4}}>
      <span style={{fontSize:13,fontWeight:600,color:T.cream}}>Task List</span>
      <div style={{display:"flex",gap:4}}>
        {["all","todo","progress","done"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:filter===f?600:400,fontFamily:T.sans,background:filter===f?T.goldSoft:"transparent",color:filter===f?T.gold:T.dim}}>{f==="all"?"All":STATUS_LABELS[f]} ({counts[f]})</button>)}
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {filtered.map(t=>{const ri=tasks.indexOf(t);const dateStr=t.startDate?(t.endDate?`${t.startDate} — ${t.endDate}`:t.startDate):"";
        return<div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.surfEl,borderRadius:T.rS,border:`1px solid ${T.border}`,transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
        <button onClick={()=>cycleStatus(ri)} style={{width:20,height:20,borderRadius:t.status==="done"?10:4,border:`2px solid ${STATUS_COLORS[t.status]}`,background:t.status==="done"?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          {t.status==="done"&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
        </button>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,color:t.status==="done"?T.dim:T.cream,textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</div>
          <div style={{display:"flex",gap:10,marginTop:3}}>{t.category&&<span style={{fontSize:10,color:T.dim}}>{t.category}</span>}{t.assignee&&<span style={{fontSize:10,color:T.cyan}}>{t.assignee}</span>}</div></div>
        {dateStr&&<span style={{fontSize:10,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{dateStr}</span>}
        <span style={{fontSize:9,fontWeight:600,color:STATUS_COLORS[t.status],textTransform:"uppercase",letterSpacing:".06em",flexShrink:0,width:70,textAlign:"right"}}>{STATUS_LABELS[t.status]}</span>
        {canEdit&&<button onClick={()=>removeTask(ri)} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
      </div>})}
      {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:13}}>No tasks with this status.</div>}
    </div>

    {/* Meetings */}
{meetings.length>0&&<div style={{marginTop:24}}>
  <div style={{fontSize:13,fontWeight:600,color:T.cream,marginBottom:12}}>Meetings ({meetings.length})</div>
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    {meetings.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:viewMeeting===m.id?T.surfHov:T.surfEl,borderRadius:T.rS,border:`1px solid ${viewMeeting===m.id?"rgba(232,121,249,.15)":T.border}`,cursor:"pointer",transition:"all .15s"}} onClick={()=>{if(viewMeeting===m.id){saveMeetingNotes(m.id);setViewMeeting(null)}else{setViewMeeting(m.id);setMeetingNotes(m.notes||"");setMeetingSummary(m.summary||"")}}} onMouseEnter={e=>{if(viewMeeting!==m.id)e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{if(viewMeeting!==m.id)e.currentTarget.style.background=T.surfEl}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:T.magenta,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:500,color:T.cream}}>{m.title}</div>
        <div style={{display:"flex",gap:10,marginTop:3}}>
          {m.date&&<span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{m.date}</span>}
          {m.time&&<span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{m.time}</span>}
          {m.duration&&<span style={{fontSize:10,color:T.dim}}>{m.duration}</span>}
          {m.location&&<span style={{fontSize:10,color:T.cyan}}>{m.location}</span>}
        </div>
      </div>
      {m.attendees&&m.attendees.length>0&&<span style={{fontSize:10,color:T.dim}}>{m.attendees.length} attendee{m.attendees.length>1?"s":""}</span>}
      <span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:m.calendarSent?"rgba(52,211,153,.1)":"rgba(232,121,249,.1)",color:m.calendarSent?T.pos:T.magenta,textTransform:"uppercase"}}>{m.calendarSent?"Sent":"Scheduled"}</span>
      {canEdit&&<button onClick={e=>{e.stopPropagation();removeMeeting(m.id)}} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
    </div>)}
  </div>
</div>}

{/* Meeting Detail View */}
{viewMeeting&&(()=>{const m=meetings.find(mt=>mt.id===viewMeeting);if(!m)return null;return<Card style={{padding:20,marginTop:12,borderColor:"rgba(232,121,249,.15)",background:"rgba(232,121,249,.02)"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
    <div>
      <div style={{fontSize:16,fontWeight:600,color:T.cream}}>{m.title}</div>
      <div style={{display:"flex",gap:12,marginTop:6,flexWrap:"wrap"}}>
        {m.date&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{m.date}</span>}
        {m.time&&<span style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{m.time}</span>}
        {m.duration&&<span style={{fontSize:11,color:T.dim}}>{m.duration}</span>}
        {m.location&&<span style={{fontSize:11,color:T.cyan}}>{m.location}</span>}
      </div>
      {m.attendees&&m.attendees.length>0&&<div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>{m.attendees.map((a,i)=><span key={i} style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream}}>{a}</span>)}</div>}
    </div>
    <button onClick={()=>{saveMeetingNotes(viewMeeting);setViewMeeting(null)}} style={{background:"none",border:"none",color:T.dim,fontSize:18,cursor:"pointer",padding:4}}>×</button>
  </div>
  {m.agenda&&<div style={{marginBottom:16}}><div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Agenda</div><div style={{fontSize:12,color:T.dimH,lineHeight:1.6,whiteSpace:"pre-wrap",padding:"10px 14px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>{m.agenda}</div></div>}
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
    <div><div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Meeting Notes</div><textarea value={meetingNotes} onChange={e=>setMeetingNotes(e.target.value)} placeholder="Type notes during or after the meeting..." rows={6} style={{width:"100%",padding:"10px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical"}}/></div>
    <div><div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Summary</div><textarea value={meetingSummary} onChange={e=>setMeetingSummary(e.target.value)} placeholder="Key takeaways..." rows={6} style={{width:"100%",padding:"10px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical"}}/></div>
  </div>
  <button onClick={()=>saveMeetingNotes(viewMeeting)} style={{padding:"7px 16px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans,marginBottom:16}}>Save Notes</button>
  <div style={{marginBottom:16}}>
    <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Action Items</div>
    {(m.actionItems||[]).map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>toggleActionItem(m.id,a.id)} style={{width:16,height:16,borderRadius:a.done?8:3,border:`2px solid ${a.done?T.pos:T.dim}`,background:a.done?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {a.done&&<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
      </button>
      <span style={{fontSize:12,color:a.done?T.dim:T.cream,textDecoration:a.done?"line-through":"none",flex:1}}>{a.text}</span>
    </div>)}
    <div style={{display:"flex",gap:6,marginTop:8}}>
      <input value={newActionItem} onChange={e=>setNewActionItem(e.target.value)} placeholder="Add action item..." onKeyDown={e=>{if(e.key==="Enter"&&newActionItem.trim()){addActionItemToMeeting(m.id,newActionItem.trim());setNewActionItem("")}}} style={{flex:1,padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none"}}/>
      <button onClick={()=>{if(newActionItem.trim()){addActionItemToMeeting(m.id,newActionItem.trim());setNewActionItem("")}}} style={{padding:"7px 12px",borderRadius:T.rS,border:"none",background:T.goldSoft,color:T.gold,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add</button>
    </div>
    <p style={{fontSize:9,color:T.dim,marginTop:6}}>Action items are automatically added as tasks in the timeline.</p>
  </div>
  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14}}>
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>Integrations</div>
      <button onClick={()=>{}} style={{padding:"6px 12px",border:`1px solid rgba(34,211,238,.2)`,background:"rgba(34,211,238,.06)",borderRadius:T.rS,color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} title="Requires Google Calendar OAuth">Google Calendar</button>
      <button onClick={()=>{}} style={{padding:"6px 12px",border:`1px solid rgba(255,234,151,.2)`,background:"rgba(255,234,151,.06)",borderRadius:T.rS,color:T.gold,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} title="Requires Fireflies API key">Import Fireflies Recording</button>
      <span style={{fontSize:9,color:T.dim,fontFamily:T.serif}}>Available after deployment</span>
    </div>
  </div>
</Card>})()}

  </div>;
}

export default TimelineV;
