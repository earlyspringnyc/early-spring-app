import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
import { createCalendarEvent, searchContacts } from '../utils/google.js';
import { addTaskToHistory, searchTaskHistory } from '../utils/taskHistory.js';

/* ── helpers ── */
const Pill=({children,color=T.gold,bg,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:bg||`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

/* category → color map for colorful task cards */
const CAT_COLORS={
  "General":T.gold,"Meeting":"#C4B5FD","Production":"#7DD3FC","Design":"#F472B6",
  "Logistics":"#FDBA74","Catering":"#4ADE80","Venue":"#FBBF24","AV":"#22D3EE",
  "Talent":"#E879F9","Print":"#FB923C","Photo":"#F87171","Video":"#F87171",
  "Staffing":"#60A5FA","Budget":"#BEF264","Creative":"#F472B6","Marketing":"#C084FC",
  "Meeting Action":"#C4B5FD","Freelance":"#F472B6","Other":T.dim,
};
const catColor=(cat)=>{
  if(!cat)return T.gold;
  const key=Object.keys(CAT_COLORS).find(k=>cat.toLowerCase().includes(k.toLowerCase()));
  return key?CAT_COLORS[key]:T.colors[Math.abs([...cat].reduce((a,c)=>a+c.charCodeAt(0),0))%T.colors.length];
};

/* ── Drag handle component ── */
const DragHandle=({onDragStart})=><div
  draggable
  onDragStart={onDragStart}
  style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"grab",padding:"0 6px",opacity:0,transition:"opacity .15s",userSelect:"none",fontSize:14,color:T.dim,letterSpacing:2,lineHeight:1}}
  className="drag-handle"
>⋮⋮</div>;

function TimelineV({project,updateProject,canEdit,accessToken,requestCalendarAccess}){
  const tasks=project.timeline||[];
  const[filter,setFilter]=useState("all");
  const[showAdd,setShowAdd]=useState(false);
  const[viewMode,setViewMode]=useState("calendar");
  const[taskView,setTaskView]=useState("card"); // card | block | table
  const[nN,setNN]=useState("");const[nC,setNC]=useState("General");const[nA,setNA]=useState("");const[nS,setNS]=useState("");const[nE,setNE]=useState("");
  const[showClientTL,setShowClientTL]=useState(false);
  const[clientIncluded,setClientIncluded]=useState(()=>new Set(tasks.map(t=>t.id)));
  const[clientFormat,setClientFormat]=useState("both");
  const[clientEmail,setClientEmail]=useState("");const[clientSending,setClientSending]=useState(false);const[clientSent,setClientSent]=useState("");
  const allBudgetItems=useMemo(()=>{const items=[];(project.cats||[]).forEach(c=>c.items.forEach(it=>items.push({...it,catName:c.name})));return items},[project.cats]);
  const[showSuggestions,setShowSuggestions]=useState(false);
  const[isMeeting,setIsMeeting]=useState(false);
  const[taskSugs,setTaskSugs]=useState([]);const[sugIdx2,setSugIdx2]=useState(-1);
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
  const[calSending,setCalSending]=useState(false);const[calStatus,setCalStatus]=useState("");
  const[customTime,setCustomTime]=useState(false);
  const[contactSuggestions,setContactSuggestions]=useState([]);const[showContactSug,setShowContactSug]=useState(false);
  const[newActionItem,setNewActionItem]=useState("");
  const filtered=filter==="all"?tasks:tasks.filter(t=>t.status===filter);
  const counts={all:tasks.length,todo:tasks.filter(t=>t.status==="todo").length,progress:tasks.filter(t=>t.status==="progress").length,roadblocked:tasks.filter(t=>t.status==="roadblocked").length,done:tasks.filter(t=>t.status==="done").length};
  const[layout,setLayout]=useState("stacked");
  const[splitWidth,setSplitWidth]=useState(380);
  const[dragging,setDragging]=useState(false);
  const splitRef=useRef(null);

  /* ── Section order drag state ── */
  const[sectionOrder,setSectionOrder]=useState(["calendar","tasks","meetings"]);
  const[draggedSection,setDraggedSection]=useState(null);
  const[dropTarget,setDropTarget]=useState(null);

  const handleSectionDragStart=(e,sectionKey)=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",sectionKey);setDraggedSection(sectionKey)};
  const handleSectionDragOver=(e,sectionKey)=>{e.preventDefault();e.dataTransfer.dropEffect="move";if(sectionKey!==draggedSection)setDropTarget(sectionKey)};
  const handleSectionDrop=(e,sectionKey)=>{e.preventDefault();if(!draggedSection||draggedSection===sectionKey){setDraggedSection(null);setDropTarget(null);return}
    setSectionOrder(prev=>{const newOrder=[...prev];const fromIdx=newOrder.indexOf(draggedSection);const toIdx=newOrder.indexOf(sectionKey);newOrder.splice(fromIdx,1);newOrder.splice(toIdx,0,draggedSection);return newOrder});
    setDraggedSection(null);setDropTarget(null)};
  const handleSectionDragEnd=()=>{setDraggedSection(null);setDropTarget(null)};

  useEffect(()=>{
    if(!dragging)return;
    const onMove=(e)=>{if(!splitRef.current)return;const rect=splitRef.current.getBoundingClientRect();const newWidth=rect.right-e.clientX;setSplitWidth(Math.max(280,Math.min(600,newWidth)))};
    const onUp=()=>setDragging(false);
    window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);
    return()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)};
  },[dragging]);
  const pct=tasks.length?Math.round((counts.done/tasks.length)*100):0;
  const addTask=(name,cat,assignee,start,end,linkedItemId="")=>{
    const n=name||nN.trim();if(!n)return;
    addTaskToHistory(n);
    updateProject({timeline:[...tasks,mkTask(n,cat||nC,assignee||nA,start||nS,end||nE,linkedItemId)]});
    setNN("");setNC("General");setNA("");setNS("");setNE("");setShowAdd(false);setTaskSugs([]);
  };
  const cycleStatus=idx=>{const order=["todo","progress","roadblocked","done"];const cur=tasks[idx].status;updateProject({timeline:tasks.map((t,i)=>i===idx?{...t,status:order[(order.indexOf(cur)+1)%order.length]}:t)})};
  const setTaskStatus=(idx,status)=>{updateProject({timeline:tasks.map((t,i)=>i===idx?{...t,status}:t)})};
  const removeTask=idx=>updateProject({timeline:tasks.filter((_,i)=>i!==idx)});
  const[editDateId,setEditDateId]=useState(null);
  const updateTaskDates=(taskId,startDate,endDate)=>{updateProject({timeline:tasks.map(t=>t.id===taskId?{...t,startDate:startDate||t.startDate,endDate:endDate||t.endDate}:t)});setEditDateId(null)};
  const addMeeting=(titleOverride)=>{
    const title=(titleOverride||meetingTitle).trim();
    if(!title)return;
    const m=mkMeeting(title,meetingDate,meetingTime,meetingDuration,meetingAttendees.split(",").map(s=>s.trim()).filter(Boolean),meetingAgenda,meetingLocation);
    updateProject({meetings:[...(project.meetings||[]),m]});
    addTask(title,"Meeting","",meetingDate,meetingDate);
    setMeetingTitle("");setMeetingDate("");setMeetingTime("");setMeetingDuration("30m");setMeetingAttendees("");setMeetingAgenda("");setMeetingLocation("");setIsMeeting(false);
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
  const sendClientTL=async()=>{if(!clientEmail.trim())return;if(!accessToken){setClientSent("");alert("Google access token required to send emails. Please sign in with Google OAuth.");return}setClientSending(true);try{const{sendEmail}=await import('../utils/google.js');const htmlBody=`<h2>Project Timeline — ${project.name||""}</h2><p>Please find the updated project timeline attached.</p><p>Client: ${project.client||""}</p><p>${clientTasks.length} tasks included.</p><p>— Early Spring</p>`;await sendEmail(accessToken,clientEmail.trim(),`Project Timeline: ${project.name||"Update"}`,htmlBody);setClientSent(clientEmail);setClientEmail("")}catch(e){setClientSent("");alert("Failed to send: "+(e.message||"Unknown error"))}finally{setClientSending(false)}};

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
      <div style={{display:"flex",borderBottom:"1px solid #E5E5E5",padding:"6px 0"}}><div style={{width:160,flexShrink:0,padding:"0 0 0 4px",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase"}}>Task</div><div style={{flex:1,position:"relative",height:18}}>{weeks.map((w,i)=>{const left=(daysBetween(minD,w)/totalDays)*100;return<span key={i} style={{position:"absolute",left:`${left}%`,fontSize:10,color:"#999",fontFamily:"monospace"}}>{fmtShort(w)}</span>})}</div></div>
      {dated.map(t=>{const start=parseD(t.startDate);const end=parseD(t.endDate)||start;const left=(daysBetween(minD,start)/totalDays)*100;const width=Math.max((daysBetween(start,end)+1)/totalDays*100,1.5);const barColor=t.status==="done"?"#34D399":t.status==="progress"?"#22D3EE":"#432D1C";
        return<div key={t.id} style={{display:"flex",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #F5F5F5"}}><div style={{width:160,flexShrink:0,padding:"0 0 0 4px",overflow:"hidden"}}><span style={{fontSize:11,color:"#333",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{t.name}</span></div><div style={{flex:1,position:"relative",height:18}}><div style={{position:"absolute",left:`${left}%`,width:`${width}%`,top:3,height:12,borderRadius:3,background:barColor,opacity:.8}}><span style={{position:"absolute",left:4,top:0,fontSize:10,color:"#fff",fontWeight:600,whiteSpace:"nowrap"}}>{fmtShort(start)}{end>start?` — ${fmtShort(end)}`:""}</span></div></div></div>})}
    </div>
  };
  const ClientCalendarPrint=()=>{
    const dated=clientTasks.filter(t=>parseD(t.startDate)).sort((a,b)=>(a.startDate||"").localeCompare(b.startDate||""));
    if(!dated.length)return<div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>No dated tasks selected.</div>;
    return<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{borderBottom:"2px solid #E5E5E5"}}>{["Task","Category","Start","End","Status"].map((h,i)=><th key={i} style={{textAlign:i>1?"center":"left",padding:"8px 4px",fontWeight:600,color:"#555",fontSize:10,textTransform:"uppercase",letterSpacing:".06em"}}>{h}</th>)}</tr></thead>
      <tbody>{dated.map(t=><tr key={t.id} style={{borderBottom:"1px solid #F0F0F0"}}><td style={{padding:"10px 4px",color:"#333"}}>{t.name}</td><td style={{padding:"10px 4px",color:"#777",fontSize:12}}>{t.category}</td><td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.startDate}</td><td style={{padding:"10px 4px",color:"#555",textAlign:"center",fontFamily:"monospace",fontSize:12}}>{t.endDate||"\u2014"}</td><td style={{padding:"10px 4px",textAlign:"center"}}><span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:t.status==="done"?"#E8F5E9":t.status==="progress"?"#E0F7FA":"#FFF8E1",color:t.status==="done"?"#2E7D32":t.status==="progress"?"#00838F":"#F57F17",textTransform:"uppercase"}}>{STATUS_LABELS[t.status]}</span></td></tr>)}</tbody></table>
  };

  /* ── Card / Block / Table task renderers ── */
  const renderTaskCard=(t,ri)=>{
    const cc=catColor(t.category);
    const dateStr=t.startDate?(t.endDate&&t.endDate!==t.startDate?`${t.startDate} — ${t.endDate}`:t.startDate):"";
    const isEditingDate=editDateId===t.id;
    return<div key={t.id} style={{position:"relative"}}>
      <div style={{background:T.surfEl,borderRadius:T.r,border:`1px solid ${T.border}`,borderTop:`3px solid ${cc}`,padding:"16px 18px",transition:"all .15s",cursor:"default"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.borderColor=T.borderGlow}} onMouseLeave={e=>{e.currentTarget.style.background=T.surfEl;e.currentTarget.style.borderColor=T.border;e.currentTarget.style.borderTopColor=cc}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>cycleStatus(ri)} style={{width:18,height:18,borderRadius:t.status==="done"?9:4,border:`2px solid ${STATUS_COLORS[t.status]}`,background:t.status==="done"?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
              {t.status==="done"&&<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
            </button>
            <span style={{fontSize:13,fontWeight:600,color:t.status==="done"?T.dim:T.cream,textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</span>
          </div>
          {canEdit&&<button onClick={()=>removeTask(ri)} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></button>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:dateStr?10:0}}>
          {t.category&&<Pill color={cc}>{t.category}</Pill>}
          {t.assignee&&<Pill color={T.cyan} size="xs">{t.assignee}</Pill>}
          <Pill color={STATUS_COLORS[t.status]} size="xs">{STATUS_LABELS[t.status]}</Pill>
        </div>
        {dateStr&&<div onClick={()=>canEdit&&setEditDateId(isEditingDate?null:t.id)} style={{fontSize:10,color:T.dim,fontFamily:T.mono,cursor:canEdit?"pointer":"default",display:"flex",alignItems:"center",gap:4}}>
          <span style={{opacity:.6}}>&#9716;</span> {dateStr}
        </div>}
      </div>
      {isEditingDate&&canEdit&&<div style={{display:"flex",gap:12,padding:"10px 16px",background:T.surface,border:`1px solid ${T.borderGlow}`,borderTop:"none",borderRadius:`0 0 ${T.rS} ${T.rS}`,marginTop:-2}}>
        <DatePick value={t.startDate||""} onChange={v=>updateTaskDates(t.id,v,t.endDate)} label="Start" compact/>
        <DatePick value={t.endDate||""} onChange={v=>updateTaskDates(t.id,t.startDate,v)} label="End" compact/>
        <button onClick={()=>setEditDateId(null)} style={{alignSelf:"flex-end",padding:"6px 14px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Save</button>
      </div>}
    </div>;
  };

  const renderTaskBlock=(t,ri)=>{
    const cc=catColor(t.category);
    const dateStr=t.startDate?(t.endDate&&t.endDate!==t.startDate?`${t.startDate} — ${t.endDate}`:t.startDate):"";
    const isEditingDate=editDateId===t.id;
    return<div key={t.id}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.surfEl,borderRadius:isEditingDate?`${T.rS} ${T.rS} 0 0`:T.rS,borderLeft:`3px solid ${cc}`,border:`1px solid ${isEditingDate?T.borderGlow:T.border}`,borderLeftWidth:3,borderLeftColor:cc,borderBottom:isEditingDate?"none":`1px solid ${T.border}`,transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
        <button onClick={()=>cycleStatus(ri)} style={{width:18,height:18,borderRadius:t.status==="done"?9:4,border:`2px solid ${STATUS_COLORS[t.status]}`,background:t.status==="done"?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
          {t.status==="done"&&<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontSize:13,fontWeight:500,color:t.status==="done"?T.dim:T.cream,textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {t.category&&<Pill color={cc} size="xs">{t.category}</Pill>}
          {t.assignee&&<Pill color={T.cyan} size="xs">{t.assignee}</Pill>}
        </div>
        <span onClick={()=>canEdit&&setEditDateId(isEditingDate?null:t.id)} style={{fontSize:10,color:t.startDate?T.dim:"rgba(255,255,255,.2)",fontFamily:T.mono,flexShrink:0,cursor:canEdit?"pointer":"default",padding:"2px 6px",borderRadius:4}} onMouseEnter={e=>{if(canEdit)e.currentTarget.style.color=T.cream}} onMouseLeave={e=>e.currentTarget.style.color=t.startDate?T.dim:"rgba(255,255,255,.2)"}>{dateStr||"No date"}</span>
        {canEdit?<select value={t.status} onChange={e=>setTaskStatus(ri,e.target.value)} style={{padding:"3px 4px",borderRadius:T.rS,background:`${STATUS_COLORS[t.status]}18`,border:`1px solid ${STATUS_COLORS[t.status]}33`,color:STATUS_COLORS[t.status],fontSize:10,fontWeight:600,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none",textTransform:"uppercase",letterSpacing:".04em",flexShrink:0}}>{["todo","progress","roadblocked","done"].map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
        :<span style={{fontSize:10,fontWeight:600,color:STATUS_COLORS[t.status],textTransform:"uppercase",letterSpacing:".06em",flexShrink:0,width:70,textAlign:"right"}}>{STATUS_LABELS[t.status]}</span>}
        {canEdit&&<button onClick={()=>removeTask(ri)} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></button>}
      </div>
      {isEditingDate&&canEdit&&<div style={{display:"flex",gap:12,padding:"10px 16px",background:T.surface,border:`1px solid ${T.borderGlow}`,borderTop:"none",borderRadius:`0 0 ${T.rS} ${T.rS}`,marginBottom:4}}>
        <DatePick value={t.startDate||""} onChange={v=>updateTaskDates(t.id,v,t.endDate)} label="Start" compact/>
        <DatePick value={t.endDate||""} onChange={v=>updateTaskDates(t.id,t.startDate,v)} label="End" compact/>
        <button onClick={()=>setEditDateId(null)} style={{alignSelf:"flex-end",padding:"6px 14px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Save</button>
      </div>}
    </div>;
  };

  /* ── Inline meeting block for block view ── */
  const renderMeetingBlock=(m)=>{
    return<div key={`meeting-${m.id}`}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.surfEl,borderRadius:T.rS,borderLeft:"3px solid #C4B5FD",border:`1px solid ${T.border}`,borderLeftWidth:3,borderLeftColor:"#C4B5FD",transition:"all .15s",cursor:"pointer"}} onClick={()=>{if(viewMeeting===m.id){saveMeetingNotes(m.id);setViewMeeting(null)}else{setViewMeeting(m.id);setMeetingNotes(m.notes||"");setMeetingSummary(m.summary||"")}}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
        <div style={{width:8,height:8,borderRadius:"50%",background:"#C4B5FD",flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontSize:13,fontWeight:500,color:T.cream}}>{m.title}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          <Pill color="#C4B5FD" size="xs">Meeting</Pill>
          {m.time&&<span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>{m.time}</span>}
          {m.duration&&<span style={{fontSize:10,color:T.dim}}>{m.duration}</span>}
        </div>
        <span style={{fontSize:10,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{m.date||"No date"}</span>
        {canEdit&&<button onClick={e=>{e.stopPropagation();removeMeeting(m.id)}} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></button>}
      </div>
    </div>;
  };

  const renderTaskTable=()=>(
    <div style={{borderRadius:T.r,border:`1px solid ${T.border}`,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr style={{background:T.surface}}>
          {["","Task","Category","Assignee","Dates","Status",""].map((h,i)=><th key={i} style={{padding:"10px 12px",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",fontFamily:T.mono,textAlign:i===0||i===6?"center":"left",borderBottom:`1px solid ${T.border}`,width:i===0?36:i===6?36:undefined}}>{h}</th>)}
        </tr></thead>
        <tbody>{filtered.map(t=>{const ri=tasks.indexOf(t);const cc=catColor(t.category);const dateStr=t.startDate?(t.endDate&&t.endDate!==t.startDate?`${t.startDate} — ${t.endDate}`:t.startDate):"—";
          return<tr key={t.id} style={{borderBottom:`1px solid ${T.border}`,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <td style={{padding:"10px 12px",textAlign:"center"}}><button onClick={()=>cycleStatus(ri)} style={{width:16,height:16,borderRadius:t.status==="done"?8:3,border:`2px solid ${STATUS_COLORS[t.status]}`,background:t.status==="done"?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{t.status==="done"&&<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}</button></td>
            <td style={{padding:"10px 12px",fontSize:13,fontWeight:500,color:t.status==="done"?T.dim:T.cream,textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</td>
            <td style={{padding:"10px 12px"}}>{t.category&&<Pill color={cc} size="xs">{t.category}</Pill>}</td>
            <td style={{padding:"10px 12px",fontSize:11,color:T.cyan}}>{t.assignee||""}</td>
            <td style={{padding:"10px 12px",fontSize:10,color:T.dim,fontFamily:T.mono}}>{dateStr}</td>
            <td style={{padding:"10px 12px"}}>{canEdit?<select value={t.status} onChange={e=>setTaskStatus(ri,e.target.value)} style={{padding:"3px 6px",borderRadius:T.rS,background:`${STATUS_COLORS[t.status]}18`,border:`1px solid ${STATUS_COLORS[t.status]}33`,color:STATUS_COLORS[t.status],fontSize:9,fontWeight:600,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none",textTransform:"uppercase",letterSpacing:".04em"}}>{["todo","progress","roadblocked","done"].map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>:<Pill color={STATUS_COLORS[t.status]} size="xs">{STATUS_LABELS[t.status]}</Pill>}</td>
            <td style={{padding:"10px 12px",textAlign:"center"}}>{canEdit&&<button onClick={()=>removeTask(ri)} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={10} color={T.neg}/></button>}</td>
          </tr>})}</tbody>
      </table>
      {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:13}}>No tasks with this status.</div>}
    </div>
  );

  /* ── Status filter pill colors ── */
  const filterPillStyle=(f)=>{
    const active=filter===f;
    const colorMap={all:T.gold,todo:"rgba(250,250,249,.6)",progress:"#22D3EE",roadblocked:"#F87171",done:"#34D399"};
    const bgMap={all:T.goldSoft,todo:"rgba(250,250,249,.08)",progress:"rgba(34,211,238,.1)",roadblocked:"rgba(248,113,113,.1)",done:"rgba(52,211,153,.1)"};
    const activeBgMap={all:`${T.gold}28`,todo:"rgba(250,250,249,.15)",progress:"rgba(34,211,238,.2)",roadblocked:"rgba(248,113,113,.2)",done:"rgba(52,211,153,.2)"};
    return{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:active?700:500,fontFamily:T.sans,background:active?activeBgMap[f]:bgMap[f],color:active?colorMap[f]:T.dim,transition:"all .15s"};
  };

  /* ── Section wrapper with drag handle ── */
  const SectionWrap=({sectionKey,children})=>(
    <div
      onDragOver={e=>handleSectionDragOver(e,sectionKey)}
      onDrop={e=>handleSectionDrop(e,sectionKey)}
      onDragEnd={handleSectionDragEnd}
      style={{position:"relative",opacity:draggedSection===sectionKey?.5:1,transition:"opacity .15s"}}
      onMouseEnter={e=>{const h=e.currentTarget.querySelector('.drag-handle');if(h)h.style.opacity="0.5"}}
      onMouseLeave={e=>{const h=e.currentTarget.querySelector('.drag-handle');if(h)h.style.opacity="0"}}
    >
      {dropTarget===sectionKey&&<div style={{height:3,background:`linear-gradient(90deg,${T.gold},${T.cyan})`,borderRadius:2,marginBottom:4}}/>}
      <div style={{display:"flex",alignItems:"flex-start"}}>
        <DragHandle onDragStart={e=>handleSectionDragStart(e,sectionKey)}/>
        <div style={{flex:1,minWidth:0}}>{children}</div>
      </div>
    </div>
  );

  /* ── Build merged list for block view (tasks + inline meetings) ── */
  const getMergedBlockItems=()=>{
    const items=[];
    filtered.forEach(t=>{items.push({type:"task",data:t,sortDate:t.startDate||"9999"})});
    if(taskView==="block"&&meetings.length>0){
      meetings.forEach(m=>{items.push({type:"meeting",data:m,sortDate:m.date||"9999"})});
    }
    items.sort((a,b)=>(a.sortDate||"").localeCompare(b.sortDate||""));
    return items;
  };

  return<div>
    {/* inject hover style for drag handles */}
    <style>{`.drag-handle:hover{opacity:0.8!important}`}</style>

    {/* ── Header ── */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"baseline",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",fontFamily:T.sans,margin:0}}>Production</h1>
        <span style={{fontSize:12,color:T.dim}}>{tasks.length} task{tasks.length!==1?"s":""}</span>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:showAdd?"transparent":`linear-gradient(135deg,${T.gold},${T.cyan})`,color:showAdd?T.dim:"#fff",border:showAdd?`1px solid ${T.border}`:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{showAdd?"Cancel":"+ Task"}</button>}
      </div>
    </div>

    {/* ── Progress section ── */}
    <div style={{display:"flex",alignItems:"center",gap:24,marginBottom:20,padding:"16px 20px",background:T.surface,borderRadius:T.r,border:`1px solid ${T.border}`}}>
      <span style={{fontSize:36,fontWeight:700,fontFamily:T.mono,color:T.cream,lineHeight:1,minWidth:70,letterSpacing:"-0.02em"}}>{pct}%</span>
      <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        {[["todo","To Do",STATUS_COLORS.todo],["progress","In Progress",STATUS_COLORS.progress],["roadblocked","Blocked",STATUS_COLORS.roadblocked],["done","Done",STATUS_COLORS.done]].map(([key,label,color])=>
          counts[key]>0&&<div key={key} style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0}}/>
            <span style={{fontSize:12,color:T.dimH,fontFamily:T.sans}}>{counts[key]} {label}</span>
          </div>
        )}
      </div>
    </div>

    {/* ── Status filter pills ── */}
    <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
      {["all","todo","progress","roadblocked","done"].map(f=>
        <button key={f} onClick={()=>setFilter(f)} style={filterPillStyle(f)}>
          {f==="all"?"All":STATUS_LABELS[f]} ({counts[f]})
        </button>
      )}
    </div>

    {/* Client Timeline Creator */}
    {showClientTL&&<Card style={{padding:20,marginBottom:16,borderColor:"rgba(34,211,238,.15)",background:"rgba(34,211,238,.02)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cyan}}>Create Client Timeline</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:10,color:T.dim}}>Format:</span>
          {[["gantt","Gantt"],["calendar","Calendar"],["both","Both"]].map(([k,l])=><button key={k} onClick={()=>setClientFormat(k)} style={{padding:"5px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:clientFormat===k?600:400,fontFamily:T.sans,background:clientFormat===k?"rgba(34,211,238,.12)":"transparent",color:clientFormat===k?T.cyan:T.dim}}>{l}</button>)}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:11,color:T.dim}}>{clientIncluded.size} of {tasks.length} tasks included</span>
        <div style={{display:"flex",gap:6}}>
          <button onClick={clientSelectAll} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Select All</button>
          <button onClick={clientSelectNone} style={{padding:"4px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Select None</button>
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:14}}>
        {tasks.map(t=><button key={t.id} onClick={()=>toggleClientTask(t.id)} style={{padding:"4px 10px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontFamily:T.sans,background:clientIncluded.has(t.id)?"rgba(34,211,238,.12)":"rgba(255,255,255,.03)",color:clientIncluded.has(t.id)?T.cyan:T.dim,fontWeight:clientIncluded.has(t.id)?500:400}}>{t.name}</button>)}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",paddingTop:12,borderTop:`1px solid ${T.border}`}}>
        <input value={clientEmail} onChange={e=>setClientEmail(e.target.value)} placeholder="client@example.com" onKeyDown={e=>e.key==="Enter"&&sendClientTL()} style={{flex:1,padding:"8px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
        <button onClick={sendClientTL} disabled={!clientEmail.trim()||clientSending} style={{padding:"8px 16px",borderRadius:T.rS,border:"none",background:clientEmail.trim()&&!clientSending?"rgba(34,211,238,.15)":"rgba(255,255,255,.05)",color:clientEmail.trim()&&!clientSending?T.cyan:"rgba(255,255,255,.2)",fontSize:11,fontWeight:700,cursor:clientEmail.trim()&&!clientSending?"pointer":"default",fontFamily:T.sans}}>{clientSending?"Sending...":"Send Email"}</button>
        <button onClick={()=>window.print()} style={{padding:"8px 16px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}><span style={{display:"flex",alignItems:"center",gap:4}}><DlI size={12}/>PDF</span></button>
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


    {showSuggestions&&<Card style={{padding:16,marginBottom:16}}>
  <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:10}}>Add Tasks from Budget Items</div>
  <p style={{fontSize:11,color:T.dim,marginBottom:12}}>Click to create a task from a budget line item. You can also add tasks manually or via the calendar.</p>
  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
    {allBudgetItems.map(it=>{const alreadyAdded=tasks.some(t=>t.linkedItemId===it.id);return<button key={it.id} onClick={()=>!alreadyAdded&&addTaskFromBudgetItem(it)} disabled={alreadyAdded} style={{padding:"6px 12px",borderRadius:T.rS,border:"none",cursor:alreadyAdded?"default":"pointer",fontSize:10,fontFamily:T.sans,background:alreadyAdded?"rgba(52,211,153,.08)":"rgba(255,234,151,.08)",color:alreadyAdded?T.pos:T.gold,fontWeight:alreadyAdded?400:500,opacity:alreadyAdded?.5:1}}>{alreadyAdded?"✓ ":""}{it.name}<span style={{fontSize:10,color:T.dim,marginLeft:4}}>({it.catName})</span></button>})}
  </div>
  {allBudgetItems.length===0&&<div style={{fontSize:11,color:T.dim,padding:12,textAlign:"center"}}>Add items to your budget first.</div>}
</Card>}

    {showAdd&&<Card style={{padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
        <div style={{position:"relative"}}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Task</label><input autoFocus value={nN} onChange={e=>{setNN(e.target.value);setTaskSugs(searchTaskHistory(e.target.value));setSugIdx2(-1)}} placeholder="Task" onKeyDown={e=>{if(e.key==="Enter"){if(sugIdx2>=0&&taskSugs[sugIdx2]){setNN(taskSugs[sugIdx2]);setTaskSugs([]);setSugIdx2(-1)}else{addTask()}}else if(e.key==="ArrowDown"){e.preventDefault();setSugIdx2(i=>Math.min(i+1,taskSugs.length-1))}else if(e.key==="ArrowUp"){e.preventDefault();setSugIdx2(i=>Math.max(i-1,-1))}else if(e.key==="Escape"){setTaskSugs([]);setSugIdx2(-1)}}} onBlur={()=>setTimeout(()=>{setTaskSugs([]);setSugIdx2(-1)},200)} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
          {taskSugs.length>0&&<div style={{position:"absolute",left:0,right:0,top:"100%",zIndex:50,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxHeight:160,overflow:"auto"}}>
            {taskSugs.map((s,i)=><button key={i} onMouseDown={e=>{e.preventDefault();setNN(s);setTaskSugs([]);setSugIdx2(-1)}} style={{width:"100%",display:"block",padding:"8px 12px",background:sugIdx2===i?T.surfHov:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:sugIdx2===i?T.cream:T.dim,fontFamily:T.sans,fontWeight:sugIdx2===i?500:400}} onMouseEnter={()=>setSugIdx2(i)}>{s}</button>)}
          </div>}
        </div>
        {[["Category",nC,setNC,"General"],["Assignee",nA,setNA,"Name"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addTask()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <DatePick label="Start Date" value={nS} onChange={setNS} compact/>
        <DatePick label="End Date" value={nE} onChange={setNE} compact/>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>Type:</span>
        <button onClick={()=>setIsMeeting(!isMeeting)} style={{padding:"5px 12px",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:10,fontWeight:isMeeting?600:400,background:isMeeting?"rgba(232,121,249,.12)":"transparent",color:isMeeting?T.magenta:T.dim}}>Meeting</button>
      </div>
      {isMeeting&&<div style={{marginBottom:12,padding:14,borderRadius:T.rS,border:`1px solid rgba(232,121,249,.15)`,background:"rgba(232,121,249,.02)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Time</label>{customTime?<input value={meetingTime} onChange={e=>setMeetingTime(e.target.value)} onBlur={()=>{if(!meetingTime)setCustomTime(false)}} placeholder="14:00" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.cyan}`,color:T.cream,fontSize:13,fontFamily:T.mono,outline:"none"}}/>:<select value={meetingTime||""} onChange={e=>{if(e.target.value==="__custom__"){setCustomTime(true);setMeetingTime("")}else setMeetingTime(e.target.value)}} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:meetingTime?T.cream:T.dim,fontSize:13,fontFamily:T.mono,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}><option value="">Select time</option>{[...Array(30)].map((_,i)=>{const h=7+Math.floor(i/2);const m=i%2===0?"00":"30";const t=`${String(h).padStart(2,"0")}:${m}`;return<option key={t} value={t}>{h>12?h-12:h}:{m}{h>=12?" PM":" AM"}</option>})}<option value="__custom__">Custom time...</option></select>}</div>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Duration</label><select value={meetingDuration} onChange={e=>setMeetingDuration(e.target.value)} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>{["15m","30m","45m","1h","1.5h","2h","3h"].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Location / Link</label><input value={meetingLocation} onChange={e=>setMeetingLocation(e.target.value)} placeholder="Zoom / Office" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>
        </div>
        <div style={{marginBottom:12,position:"relative"}}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Attendees</label>
          {(()=>{const attendeeList=meetingAttendees?meetingAttendees.split(",").map(s=>s.trim()).filter(Boolean):[];
          const onInput=async(e)=>{setMeetingAttendees(e.target.value);const parts=e.target.value.split(",");const current=parts[parts.length-1].trim();if(current.length>=2&&accessToken){const results=await searchContacts(accessToken,current);setContactSuggestions(results);setShowContactSug(results.length>0)}else{setShowContactSug(false)}};
          const pickSuggestion=(email)=>{const parts=meetingAttendees.split(",");parts[parts.length-1]=email;setMeetingAttendees(parts.join(", ")+", ");setShowContactSug(false)};
          return<div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:attendeeList.length>0?6:0}}>{attendeeList.map((a,i)=>a.includes("@")&&<span key={i} style={{fontSize:10,padding:"3px 8px",borderRadius:8,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,display:"flex",alignItems:"center",gap:4}}>{a}<button onClick={()=>{const parts=attendeeList.filter((_,j)=>j!==i);setMeetingAttendees(parts.join(", "))}} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:10,padding:0,lineHeight:1}}>x</button></span>)}</div>
            <input value={meetingAttendees} onChange={onInput} onFocus={()=>{if(contactSuggestions.length)setShowContactSug(true)}} onBlur={()=>setTimeout(()=>setShowContactSug(false),200)} onKeyDown={e=>{if(e.key==="Tab"||e.key===","){const parts=meetingAttendees.split(",");const current=parts[parts.length-1].trim();if(current&&current.includes("@")){e.preventDefault();setMeetingAttendees(meetingAttendees.trim()+(meetingAttendees.trim().endsWith(",")?"":", "))}}}} placeholder="Start typing a name or email..." style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
            {showContactSug&&<div style={{position:"absolute",left:0,right:0,top:"100%",zIndex:50,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxHeight:160,overflow:"auto"}}>
              {contactSuggestions.map((c,i)=><button key={i} onMouseDown={e=>{e.preventDefault();pickSuggestion(c.email)}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:T.cream,fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{flex:1}}>{c.name&&<span style={{marginRight:6}}>{c.name}</span>}<span style={{color:T.dim}}>{c.email}</span></span>
              </button>)}
            </div>}
          </div>})()}</div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Agenda</label><textarea value={meetingAgenda} onChange={e=>setMeetingAgenda(e.target.value)} placeholder="Topics to discuss..." rows={2} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical"}}/></div>
      </div>}
      <button onClick={()=>{if(isMeeting){addMeeting(nN)}else{addTask()}}} style={{padding:"9px 20px",background:isMeeting?`linear-gradient(135deg,${T.magenta},#C084FC)`:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{isMeeting?"Schedule Meeting":"Add Task"}</button>
    </Card>}

    {/* ── Draggable sections ── */}
    {(()=>{
      const calendarMeeting=(title,date,time,duration,attendees,agenda)=>{addMeeting(title);};
      const editTask=(taskId,updates)=>{updateProject({timeline:tasks.map(t=>t.id===taskId?{...t,...updates}:t)})};
      const deleteTask=(taskId)=>{updateProject({timeline:tasks.filter(t=>t.id!==taskId)})};
      const calendarContent=viewMode==="calendar"?<CalendarView tasks={tasks} onAddTask={addTask} onAddMeeting={(title,date,time,dur,att,agenda)=>{setMeetingTime(time);setMeetingDuration(dur);setMeetingAttendees(att);setMeetingAgenda(agenda);setMeetingDate(date);addMeeting(title)}} onEditTask={editTask} onDeleteTask={deleteTask} canEdit={canEdit}/>:viewMode==="gantt"?<GanttChart tasks={tasks}/>:null;

      /* ── Card/Block/Table toggle + filter bar ── */
      const taskListHeader=<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {viewMode!=="off"&&<span onClick={()=>setLayout(l=>l==="split"?"stacked":"split")} style={{fontSize:13,fontWeight:600,color:T.cream,cursor:"pointer"}} title="Toggle side-by-side">{layout==="split"?"◧ ":""}Task List</span>}
          {viewMode==="off"&&<span style={{fontSize:13,fontWeight:600,color:T.cream}}>Task List</span>}
          {/* Card / Block / Table toggle */}
          <div style={{display:"flex",background:T.surface,borderRadius:20,padding:2}}>
            {[["card","Card"],["block","Block"],["table","Table"]].map(([k,l])=><button key={k} onClick={()=>setTaskView(k)} style={{padding:"4px 12px",borderRadius:18,border:"none",cursor:"pointer",fontSize:10,fontWeight:taskView===k?600:400,fontFamily:T.sans,background:taskView===k?T.goldSoft:"transparent",color:taskView===k?T.gold:T.dim,transition:"all .15s"}}>{l}</button>)}
          </div>
          <button onClick={()=>setShowClientTL(!showClientTL)} style={{padding:"4px 12px",borderRadius:18,border:`1px solid ${showClientTL?"rgba(34,211,238,.3)":T.border}`,cursor:"pointer",fontSize:10,fontWeight:showClientTL?600:400,fontFamily:T.sans,background:showClientTL?"rgba(34,211,238,.1)":"transparent",color:showClientTL?T.cyan:T.dim}}>{showClientTL?"Close Client TL":"Client Timeline"}</button>
          <button onClick={()=>setShowSuggestions(!showSuggestions)} style={{padding:"4px 12px",borderRadius:18,border:`1px solid ${showSuggestions?`${T.gold}33`:T.border}`,cursor:"pointer",fontSize:10,fontWeight:showSuggestions?600:400,fontFamily:T.sans,background:showSuggestions?T.goldSoft:"transparent",color:showSuggestions?T.gold:T.dim}}>{showSuggestions?"Hide Suggestions":"Budget Items"}</button>
        </div>
      </div>;

      /* ── Render tasks based on view mode ── */
      const taskListContent=<>
        {taskListHeader}
        {tasks.length===0&&!showAdd?
          <div style={{textAlign:"center",padding:"48px 20px",color:T.dim}}>
            <div style={{fontSize:14,marginBottom:12}}>No tasks yet. Add your first task to start tracking production.</div>
            {canEdit&&<button onClick={()=>setShowAdd(true)} style={{padding:"10px 20px",background:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>+ Add Task</button>}
          </div>
        :taskView==="table"?renderTaskTable():
        <div style={taskView==="card"?{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}:{display:"flex",flexDirection:"column",gap:4}}>
          {taskView==="block"?
            getMergedBlockItems().map(item=>item.type==="task"?renderTaskBlock(item.data,tasks.indexOf(item.data)):renderMeetingBlock(item.data))
          :filtered.map(t=>{const ri=tasks.indexOf(t);return taskView==="card"?renderTaskCard(t,ri):renderTaskBlock(t,ri)})}
          {filtered.length===0&&tasks.length>0&&<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:13,gridColumn:"1/-1"}}>No tasks with this status.</div>}
        </div>}
      </>;

      /* ── Calendar section with embedded toggle ── */
      const calendarSection=<div style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:600,color:T.cream}}>Calendar</span>
          <div style={{display:"flex",background:T.surface,borderRadius:T.rS,padding:2}}>
            {[["calendar","Calendar"],["gantt","Gantt"],["off","Off"]].map(([k,l])=><button key={k} onClick={()=>setViewMode(k)} style={{padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:10,fontWeight:viewMode===k?600:400,fontFamily:T.sans,background:viewMode===k?T.goldSoft:"transparent",color:viewMode===k?T.gold:T.dim,transition:"all .15s"}}>{l}</button>)}
          </div>
        </div>
        {calendarContent}
      </div>;

      /* ── Meetings section ── */
      const meetingsSection=meetings.length>0?<div>
        <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:12}}>Meetings ({meetings.length})</div>
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
            <Pill color={m.calendarSent?T.pos:T.magenta}>{m.calendarSent?"Sent":"Scheduled"}</Pill>
            {canEdit&&<button onClick={e=>{e.stopPropagation();removeMeeting(m.id)}} style={{background:"none",border:"none",cursor:"pointer",opacity:.2,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.2}><TrashI size={11} color={T.neg}/></button>}
          </div>)}
        </div>
      </div>:null;

      /* ── Section map ── */
      const sectionMap={
        calendar:calendarSection,
        tasks:taskListContent,
        meetings:meetingsSection,
      };

      /* ── Split layout for calendar + tasks ── */
      if(calendarContent&&layout==="split"){
        return<>
          <SectionWrap sectionKey="calendar">
            <div ref={splitRef} style={{display:"flex",gap:0,alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:600,color:T.cream}}>Calendar</span>
                  <div style={{display:"flex",background:T.surface,borderRadius:T.rS,padding:2}}>
                    {[["calendar","Calendar"],["gantt","Gantt"],["off","Off"]].map(([k,l])=><button key={k} onClick={()=>setViewMode(k)} style={{padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:10,fontWeight:viewMode===k?600:400,fontFamily:T.sans,background:viewMode===k?T.goldSoft:"transparent",color:viewMode===k?T.gold:T.dim,transition:"all .15s"}}>{l}</button>)}
                  </div>
                </div>
                {calendarContent}
              </div>
              <div onMouseDown={()=>setDragging(true)} style={{width:6,cursor:"col-resize",background:dragging?T.gold:"transparent",borderRadius:3,flexShrink:0,alignSelf:"stretch",minHeight:200,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.border} onMouseLeave={e=>{if(!dragging)e.currentTarget.style.background="transparent"}}/>
              <div style={{width:splitWidth,flexShrink:0,maxHeight:"70vh",overflow:"auto",position:"sticky",top:28}}>{taskListContent}</div>
            </div>
          </SectionWrap>
          {meetingsSection&&<SectionWrap sectionKey="meetings"><div style={{marginTop:24}}>{meetingsSection}</div></SectionWrap>}
        </>;
      }

      /* ── Stacked layout with draggable sections ── */
      return<div style={{display:"flex",flexDirection:"column",gap:16}}>
        {sectionOrder.map(key=>{
          const content=sectionMap[key];
          if(!content)return null;
          return<SectionWrap key={key} sectionKey={key}>{content}</SectionWrap>;
        })}
      </div>;
    })()}

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
  <button onClick={()=>saveMeetingNotes(viewMeeting)} style={{padding:"7px 16px",background:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans,marginBottom:16}}>Save Notes</button>
  <div style={{marginBottom:16}}>
    <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Action Items</div>
    {(m.actionItems||[]).map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>toggleActionItem(m.id,a.id)} style={{width:16,height:16,borderRadius:a.done?8:3,border:`2px solid ${a.done?T.pos:T.dim}`,background:a.done?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
        {a.done&&<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
      </button>
      <span style={{fontSize:12,color:a.done?T.dim:T.cream,textDecoration:a.done?"line-through":"none",flex:1}}>{a.text}</span>
    </div>)}
    <div style={{display:"flex",gap:6,marginTop:8}}>
      <input value={newActionItem} onChange={e=>setNewActionItem(e.target.value)} placeholder="Add action item..." onKeyDown={e=>{if(e.key==="Enter"&&newActionItem.trim()){addActionItemToMeeting(m.id,newActionItem.trim());setNewActionItem("")}}} style={{flex:1,padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none"}}/>
      <button onClick={()=>{if(newActionItem.trim()){addActionItemToMeeting(m.id,newActionItem.trim());setNewActionItem("")}}} style={{padding:"7px 12px",borderRadius:T.rS,border:"none",background:T.goldSoft,color:T.gold,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Add</button>
    </div>
    <p style={{fontSize:10,color:T.dim,marginTop:6}}>Action items are automatically added as tasks in the timeline.</p>
  </div>
  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14}}>
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em"}}>Integrations</div>
      <button onClick={async()=>{if(!accessToken){setCalStatus("Connect Google first");return}setCalSending(true);setCalStatus("");try{await createCalendarEvent(accessToken,{title:m.title,date:m.date,time:m.time,duration:m.duration,attendees:m.attendees||[],agenda:m.agenda,location:m.location});updateMeeting(m.id,{calendarSent:true});setCalStatus("Calendar invite sent!")}catch(e){setCalStatus("Error: "+(e.message||"Failed"))}finally{setCalSending(false)}}} disabled={calSending||m.calendarSent} style={{padding:"6px 12px",border:`1px solid rgba(34,211,238,.2)`,background:m.calendarSent?"rgba(52,211,153,.06)":"rgba(34,211,238,.06)",borderRadius:T.rS,color:m.calendarSent?T.pos:T.cyan,fontSize:10,fontWeight:600,cursor:calSending||m.calendarSent?"default":"pointer",fontFamily:T.sans}}>{m.calendarSent?"Sent to Calendar":calSending?"Sending...":"Google Calendar"}</button>
      <button onClick={()=>{}} style={{padding:"6px 12px",border:`1px solid rgba(255,234,151,.2)`,background:"rgba(255,234,151,.06)",borderRadius:T.rS,color:T.gold,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} title="Requires Fireflies API key">Import Fireflies Recording</button>
      {calStatus&&<span style={{fontSize:10,color:calStatus.startsWith("Error")?T.neg:T.pos,fontFamily:T.sans}}>{calStatus}</span>}
      {!calStatus&&!accessToken&&<span style={{fontSize:10,color:T.dim,fontFamily:T.sans}}>Requires Google OAuth</span>}
    </div>
  </div>
</Card>})()}

  </div>;
}

export default TimelineV;
