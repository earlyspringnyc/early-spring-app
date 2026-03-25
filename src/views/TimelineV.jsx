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

/* category → color map — two color families + meetings + general */
const CAT_COLORS={
  /* Production family — teal/cyan shades */
  "Production":"#14B8A6","Catering":"#0D9488","Venue":"#2DD4BF","AV":"#5EEAD4",
  "Fabrication":"#0D9488","Staffing":"#99F6E4","Print":"#5EEAD4","Logistics":"#2DD4BF",
  "Freight":"#14B8A6","Rental":"#0D9488","Talent":"#2DD4BF",
  /* Creative family — purple/violet shades */
  "Design":"#8B5CF6","Creative":"#A78BFA","Content":"#7C3AED","Photo":"#A78BFA",
  "Video":"#7C3AED","Marketing":"#8B5CF6","Freelance":"#A78BFA",
  /* Meetings — soft lavender */
  "Meeting":"#C4B5FD","Meeting Action":"#C4B5FD",
  /* General — steel blue */
  "General":T.gold,"Budget":T.gold,"Other":T.dim,
};
const catColor=(cat)=>{
  if(!cat)return T.gold;
  const key=Object.keys(CAT_COLORS).find(k=>cat.toLowerCase().includes(k.toLowerCase()));
  return key?CAT_COLORS[key]:T.gold;
};

function TimelineV({project,updateProject,canEdit,accessToken,requestCalendarAccess}){
  const tasks=project.timeline||[];
  const[filter,setFilter]=useState("all");
  const[showAdd,setShowAdd]=useState(false);
  const[viewMode,setViewMode]=useState("calendar");
  const[calBelow,setCalBelow]=useState(false);
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
  const[isClientMeetingFlag,setIsClientMeetingFlag]=useState(false);
  const[viewMeeting,setViewMeeting]=useState(null);
  const[meetingNotes,setMeetingNotes]=useState("");
  const[meetingSummary,setMeetingSummary]=useState("");
  const[calSending,setCalSending]=useState(false);const[calStatus,setCalStatus]=useState("");
  const[customTime,setCustomTime]=useState(false);
  const[gcalEvents,setGcalEvents]=useState([]);
  const[gcalLoading,setGcalLoading]=useState(false);
  const gcalFetched=useRef(false);

  // Fetch Google Calendar events
  useEffect(()=>{
    if(!accessToken||gcalFetched.current)return;
    gcalFetched.current=true;
    setGcalLoading(true);
    const now=new Date();
    const min=now; // Only fetch future events
    const max=new Date(now.getFullYear(),now.getMonth()+3,0);
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${min.toISOString()}&timeMax=${max.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=100`,{headers:{Authorization:`Bearer ${accessToken}`}})
      .then(r=>{if(!r.ok)throw new Error("Calendar fetch failed");return r.json()})
      .then(data=>{
        const events=(data.items||[]).map(e=>{
          const start=e.start?.dateTime?new Date(e.start.dateTime):e.start?.date?new Date(e.start.date):null;
          const end=e.end?.dateTime?new Date(e.end.dateTime):e.end?.date?new Date(e.end.date):null;
          const fmtD=d=>d?`${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`:"";
          return{
            id:`gcal_${e.id}`,name:e.summary||"(No title)",
            category:"Meeting",status:"todo",
            startDate:fmtD(start),endDate:fmtD(end||start),
            assignee:"",linkedItemId:"",
            _gcal:true,_gcalLocation:e.location||"",_gcalTime:e.start?.dateTime?new Date(e.start.dateTime).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"All day",
          };
        });
        setGcalEvents(events);
      })
      .catch(e=>console.error("[gcal]",e))
      .finally(()=>setGcalLoading(false));
  },[accessToken]);

  const[contactSuggestions,setContactSuggestions]=useState([]);const[showContactSug,setShowContactSug]=useState(false);
  const[newActionItem,setNewActionItem]=useState("");
  const[showMenu,setShowMenu]=useState(false);
  const[editingTaskId,setEditingTaskId]=useState(null);
  const[etName,setEtName]=useState("");
  const[etCat,setEtCat]=useState("");
  const[etAssignee,setEtAssignee]=useState("");
  const[etStart,setEtStart]=useState("");
  const[etEnd,setEtEnd]=useState("");
  const[etNotes,setEtNotes]=useState("");
  const menuRef=useRef(null);
  const filtered=filter==="all"?tasks:tasks.filter(t=>t.status===filter);
  const counts={all:tasks.length,todo:tasks.filter(t=>t.status==="todo").length,progress:tasks.filter(t=>t.status==="progress").length,roadblocked:tasks.filter(t=>t.status==="roadblocked").length,done:tasks.filter(t=>t.status==="done").length};

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
  const[selectedTasks,setSelectedTasks]=useState(new Set());
  const[bulkMode,setBulkMode]=useState(false);
  const[editDateId,setEditDateId]=useState(null);
  const updateTaskDates=(taskId,startDate,endDate)=>{updateProject({timeline:tasks.map(t=>t.id===taskId?{...t,startDate:startDate||t.startDate,endDate:endDate||t.endDate}:t)});setEditDateId(null)};
  const addMeeting=(titleOverride)=>{
    const title=(titleOverride||meetingTitle).trim();
    if(!title)return;
    const m=mkMeeting(title,meetingDate,meetingTime,meetingDuration,meetingAttendees.split(",").map(s=>s.trim()).filter(Boolean),meetingAgenda,meetingLocation,isClientMeetingFlag);
    updateProject({meetings:[...(project.meetings||[]),m]});
    addTask(title,"Meeting","",meetingDate,meetingDate);
    setMeetingTitle("");setMeetingDate("");setMeetingTime("");setMeetingDuration("30m");setMeetingAttendees("");setMeetingAgenda("");setMeetingLocation("");setIsMeeting(false);setIsClientMeetingFlag(false);
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
  const openEditTask=(t)=>{setEditingTaskId(t.id);setEtName(t.name);setEtCat(t.category||"General");setEtAssignee(t.assignee||"");setEtStart(t.startDate||"");setEtEnd(t.endDate||"");setEtNotes(t.notes||"")};
  const saveEditTask=()=>{if(!editingTaskId)return;updateProject({timeline:tasks.map(t=>t.id===editingTaskId?{...t,name:etName||t.name,category:etCat,assignee:etAssignee,startDate:etStart,endDate:etEnd,notes:etNotes}:t)});setEditingTaskId(null)};
  const addTaskFromBudgetItem=(item)=>{
    addTask(item.name,item.catName,"","","",item.id);
  };
  const toggleSelectTask=(id)=>setSelectedTasks(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n});
  const selectAllFiltered=()=>setSelectedTasks(new Set(filtered.map(t=>t.id)));
  const clearSelection=()=>setSelectedTasks(new Set());
  const bulkSetStatus=(status)=>{updateProject({timeline:tasks.map(t=>selectedTasks.has(t.id)?{...t,status}:t)});clearSelection();setBulkMode(false)};
  const bulkDelete=()=>{if(!confirm(`Delete ${selectedTasks.size} tasks?`))return;updateProject({timeline:tasks.filter(t=>!selectedTasks.has(t.id))});clearSelection();setBulkMode(false)};
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
      <div onClick={()=>bulkMode?toggleSelectTask(t.id):openEditTask(t)} style={{background:bulkMode&&selectedTasks.has(t.id)?`${T.gold}12`:T.surfEl,borderRadius:T.r,border:`1px solid ${bulkMode&&selectedTasks.has(t.id)?T.gold:T.border}`,borderTop:`3px solid ${cc}`,padding:"16px 18px",transition:"all .15s",cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.borderColor=T.borderGlow}} onMouseLeave={e=>{e.currentTarget.style.background=bulkMode&&selectedTasks.has(t.id)?`${T.gold}12`:T.surfEl;e.currentTarget.style.borderColor=bulkMode&&selectedTasks.has(t.id)?T.gold:T.border;e.currentTarget.style.borderTopColor=cc}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {bulkMode&&<input type="checkbox" checked={selectedTasks.has(t.id)} onChange={()=>toggleSelectTask(t.id)} onClick={e=>e.stopPropagation()} style={{accentColor:T.gold,cursor:"pointer",width:14,height:14,flexShrink:0}}/>}
            <button onClick={e=>{e.stopPropagation();cycleStatus(ri)}} style={{width:18,height:18,borderRadius:t.status==="done"?9:4,border:`2px solid ${STATUS_COLORS[t.status]}`,background:t.status==="done"?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
              {t.status==="done"&&<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
            </button>
            <span style={{fontSize:13,fontWeight:600,color:t.status==="done"?T.dim:T.cream,textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</span>
          </div>
          {canEdit&&<button onClick={e=>{e.stopPropagation();removeTask(ri)}} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></button>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:dateStr?10:0}}>
          {t.category&&<Pill color={cc}>{t.category}</Pill>}
          {t.assignee&&<Pill color={T.cyan} size="xs">{t.assignee}</Pill>}
          <Pill color={STATUS_COLORS[t.status]} size="xs">{STATUS_LABELS[t.status]}</Pill>
        </div>
        {dateStr&&<div onClick={e=>{e.stopPropagation();canEdit&&setEditDateId(isEditingDate?null:t.id)}} style={{fontSize:10,color:T.dim,fontFamily:T.mono,cursor:canEdit?"pointer":"default",display:"flex",alignItems:"center",gap:4}}>
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
      <div onClick={()=>bulkMode?toggleSelectTask(t.id):openEditTask(t)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:bulkMode&&selectedTasks.has(t.id)?`${T.gold}12`:T.surfEl,borderRadius:isEditingDate?`${T.rS} ${T.rS} 0 0`:T.rS,borderLeft:`3px solid ${cc}`,border:`1px solid ${bulkMode&&selectedTasks.has(t.id)?T.gold:isEditingDate?T.borderGlow:T.border}`,borderLeftWidth:3,borderLeftColor:cc,borderBottom:isEditingDate?"none":`1px solid ${T.border}`,transition:"all .15s",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=bulkMode&&selectedTasks.has(t.id)?`${T.gold}12`:T.surfEl}>
        {bulkMode&&<input type="checkbox" checked={selectedTasks.has(t.id)} onChange={()=>toggleSelectTask(t.id)} onClick={e=>e.stopPropagation()} style={{accentColor:T.gold,cursor:"pointer",width:14,height:14,flexShrink:0}}/>}
        <button onClick={e=>{e.stopPropagation();cycleStatus(ri)}} style={{width:18,height:18,borderRadius:t.status==="done"?9:4,border:`2px solid ${STATUS_COLORS[t.status]}`,background:t.status==="done"?T.pos:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
          {t.status==="done"&&<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontSize:13,fontWeight:500,color:t.status==="done"?T.dim:T.cream,textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {t.category&&<Pill color={cc} size="xs">{t.category}</Pill>}
          {t.assignee&&<Pill color={T.cyan} size="xs">{t.assignee}</Pill>}
        </div>
        <span onClick={e=>{e.stopPropagation();canEdit&&setEditDateId(isEditingDate?null:t.id)}} style={{fontSize:10,color:t.startDate?T.dim:"rgba(255,255,255,.2)",fontFamily:T.mono,flexShrink:0,cursor:canEdit?"pointer":"default",padding:"2px 6px",borderRadius:4}} onMouseEnter={e=>{if(canEdit)e.currentTarget.style.color=T.cream}} onMouseLeave={e=>e.currentTarget.style.color=t.startDate?T.dim:"rgba(255,255,255,.2)"}>{dateStr||"No date"}</span>
        {canEdit?<select onClick={e=>e.stopPropagation()} value={t.status} onChange={e=>setTaskStatus(ri,e.target.value)} style={{padding:"3px 4px",borderRadius:T.rS,background:`${STATUS_COLORS[t.status]}18`,border:`1px solid ${STATUS_COLORS[t.status]}33`,color:STATUS_COLORS[t.status],fontSize:10,fontWeight:600,fontFamily:T.sans,outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none",textTransform:"uppercase",letterSpacing:".04em",flexShrink:0}}>{["todo","progress","roadblocked","done"].map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
        :<span style={{fontSize:10,fontWeight:600,color:STATUS_COLORS[t.status],textTransform:"uppercase",letterSpacing:".06em",flexShrink:0,width:70,textAlign:"right"}}>{STATUS_LABELS[t.status]}</span>}
        {canEdit&&<button onClick={e=>{e.stopPropagation();removeTask(ri)}} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></button>}
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
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.surfEl,borderRadius:T.rS,borderLeft:"3px solid #C4B5FD",border:`1px solid ${T.border}`,borderLeftWidth:3,borderLeftColor:"#C4B5FD",transition:"all .15s",cursor:"pointer"}} onClick={()=>{setViewMeeting(m.id);setMeetingNotes(m.notes||"");setMeetingSummary(m.summary||"")}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background=T.surfEl}>
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

  /* ── Close menu on outside click ── */
  useEffect(()=>{
    if(!showMenu)return;
    const handler=(e)=>{if(menuRef.current&&!menuRef.current.contains(e.target))setShowMenu(false)};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[showMenu]);

  const editTask=(taskId,updates)=>{updateProject({timeline:tasks.map(t=>t.id===taskId?{...t,...updates}:t)})};
  const deleteTask=(taskId)=>{updateProject({timeline:tasks.filter(t=>t.id!==taskId)})};
  const isListView=viewMode==="list";
  const showCalOrGantt=viewMode==="calendar"||viewMode==="gantt";

  return<div>
    {/* ══ LAYER 1 — Header ══ */}
    <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
      <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em",fontFamily:T.sans,margin:0}}>Production</h1>
      <span style={{fontSize:28,fontWeight:700,fontFamily:T.mono,color:T.cream,lineHeight:1,letterSpacing:"-0.02em"}}>{pct}%</span>
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        {[["todo","To Do",STATUS_COLORS.todo],["progress","In Progress",STATUS_COLORS.progress],["roadblocked","Blocked",STATUS_COLORS.roadblocked],["done","Done",STATUS_COLORS.done]].map(([key,label,color])=>
          counts[key]>0&&<div key={key} style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0}}/>
            <span style={{fontSize:12,color:T.dimH,fontFamily:T.sans}}>{counts[key]} {label}</span>
          </div>
        )}
      </div>
    </div>

    {/* ══ Bulk action bar ══ */}
    {bulkMode&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",marginBottom:8,background:T.surface,borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:600,color:T.cream,fontFamily:T.sans}}>{selectedTasks.size} selected</span>
      <button onClick={selectAllFiltered} style={{padding:"4px 10px",borderRadius:14,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Select All</button>
      <button onClick={clearSelection} style={{padding:"4px 10px",borderRadius:14,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Clear</button>
      <span style={{width:1,height:16,background:T.border,margin:"0 4px"}}/>
      {["todo","progress","done"].map(s=><button key={s} onClick={()=>bulkSetStatus(s)} disabled={!selectedTasks.size} style={{padding:"4px 10px",borderRadius:14,border:`1px solid ${STATUS_COLORS[s]}44`,background:`${STATUS_COLORS[s]}18`,color:STATUS_COLORS[s],fontSize:10,fontWeight:600,cursor:selectedTasks.size?"pointer":"default",opacity:selectedTasks.size?1:.4,fontFamily:T.sans}}>{STATUS_LABELS[s]}</button>)}
      <button onClick={bulkDelete} disabled={!selectedTasks.size} style={{padding:"4px 10px",borderRadius:14,border:`1px solid ${T.neg}44`,background:`${T.neg}18`,color:T.neg,fontSize:10,fontWeight:600,cursor:selectedTasks.size?"pointer":"default",opacity:selectedTasks.size?1:.4,fontFamily:T.sans}}>Delete</button>
      <button onClick={()=>{setBulkMode(false);clearSelection()}} style={{marginLeft:"auto",padding:"4px 10px",borderRadius:14,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
    </div>}

    {/* ══ LAYER 2 — Toolbar ══ */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      {/* Left: status filter pills */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {canEdit&&<button onClick={()=>{setBulkMode(b=>!b);clearSelection()}} style={{padding:"4px 12px",borderRadius:14,border:`1px solid ${bulkMode?T.gold:T.border}`,background:bulkMode?T.goldSoft:"transparent",color:bulkMode?T.gold:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,transition:"all .15s"}}>Select</button>}
        {["all","todo","progress","roadblocked","done"].map(f=>
          <button key={f} onClick={()=>setFilter(f)} style={filterPillStyle(f)}>
            {f==="all"?"All":STATUS_LABELS[f]} ({counts[f]})
          </button>
        )}
      </div>
      {/* Right: view switcher + menu */}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {/* Calendar / Gantt / List pill toggle */}
        <div style={{display:"flex",background:T.surface,borderRadius:20,padding:2}}>
          {[["calendar","Calendar"],["gantt","Gantt"],["list","List"]].map(([k,l])=><button key={k} onClick={()=>setViewMode(k)} style={{padding:"5px 14px",borderRadius:18,border:"none",cursor:"pointer",fontSize:10,fontWeight:viewMode===k?600:400,fontFamily:T.sans,background:viewMode===k?T.goldSoft:"transparent",color:viewMode===k?T.gold:T.dim,transition:"all .15s"}}>{l}</button>)}
        </div>
        {gcalEvents.length>0&&<span style={{fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:10,background:"rgba(66,133,244,.12)",color:"#4285F4"}}>Google Calendar ({gcalEvents.length})</span>}
        {gcalLoading&&<span style={{fontSize:9,color:T.dim}}>Syncing calendar...</span>}
        {/* Card/Block/Table sub-toggle when List is active */}
        {isListView&&<div style={{display:"flex",background:T.surface,borderRadius:20,padding:2}}>
          {[["card","Card"],["block","Block"],["table","Table"]].map(([k,l])=><button key={k} onClick={()=>setTaskView(k)} style={{padding:"4px 12px",borderRadius:18,border:"none",cursor:"pointer",fontSize:10,fontWeight:taskView===k?600:400,fontFamily:T.sans,background:taskView===k?T.goldSoft:"transparent",color:taskView===k?T.gold:T.dim,transition:"all .15s"}}>{l}</button>)}
        </div>}
        {/* Swap calendar/tasks order */}
        {showCalOrGantt&&<button onClick={()=>setCalBelow(b=>!b)} title={calBelow?"Move calendar up":"Move calendar down"} style={{width:32,height:32,borderRadius:20,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}>{calBelow?"↑":"↓"}</button>}
        {/* "..." menu */}
        <div ref={menuRef} style={{position:"relative"}}>
          <button onClick={()=>setShowMenu(!showMenu)} style={{width:32,height:32,borderRadius:20,border:`1px solid ${T.border}`,background:showMenu?T.surfHov:"transparent",color:T.dim,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,letterSpacing:2,lineHeight:1}}>...</button>
          {showMenu&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:60,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",minWidth:180,overflow:"hidden"}}>
            <button onClick={()=>{setShowClientTL(!showClientTL);setShowMenu(false)}} style={{width:"100%",padding:"10px 14px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:showClientTL?T.cyan:T.cream,fontFamily:T.sans,fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{showClientTL?"Close Client Timeline":"Create Client Timeline"}</button>
            <button onClick={()=>{setShowSuggestions(!showSuggestions);setShowMenu(false)}} style={{width:"100%",padding:"10px 14px",background:"transparent",border:"none",cursor:"pointer",textAlign:"left",fontSize:11,color:showSuggestions?T.gold:T.cream,fontFamily:T.sans,fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{showSuggestions?"Hide Budget Items":"Budget Items"}</button>
          </div>}
        </div>
      </div>
    </div>

    {/* ══ Client Timeline (toggled from menu) ══ */}
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

    {/* ══ Budget Items (toggled from menu) ══ */}
    {showSuggestions&&<Card style={{padding:16,marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:600,fontFamily:T.mono,textTransform:"uppercase",letterSpacing:".08em",color:T.cream,marginBottom:10}}>Add Tasks from Budget Items</div>
      <p style={{fontSize:11,color:T.dim,marginBottom:12}}>Click to create a task from a budget line item. You can also add tasks manually or via the calendar.</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {allBudgetItems.map(it=>{const alreadyAdded=tasks.some(t=>t.linkedItemId===it.id);return<button key={it.id} onClick={()=>!alreadyAdded&&addTaskFromBudgetItem(it)} disabled={alreadyAdded} style={{padding:"6px 12px",borderRadius:T.rS,border:"none",cursor:alreadyAdded?"default":"pointer",fontSize:10,fontFamily:T.sans,background:alreadyAdded?"rgba(52,211,153,.08)":"rgba(255,234,151,.08)",color:alreadyAdded?T.pos:T.gold,fontWeight:alreadyAdded?400:500,opacity:alreadyAdded?.5:1}}>{alreadyAdded?"✓ ":""}{it.name}<span style={{fontSize:10,color:T.dim,marginLeft:4}}>({it.catName})</span></button>})}
      </div>
      {allBudgetItems.length===0&&<div style={{fontSize:11,color:T.dim,padding:12,textAlign:"center"}}>Add items to your budget first.</div>}
    </Card>}

    {/* ══ + Task form (between toolbar and content, hidden in calendar/gantt views) ══ */}
    {showAdd&&isListView&&<Card style={{padding:20,marginBottom:16,borderColor:isMeeting?"rgba(196,181,253,.15)":T.border}}>
      {/* Task / Meeting toggle */}
      <div style={{display:"flex",gap:2,marginBottom:14,background:T.surface,borderRadius:20,padding:2,width:"fit-content"}}>
        <button onClick={()=>setIsMeeting(false)} style={{padding:"5px 16px",borderRadius:18,border:"none",cursor:"pointer",fontSize:10,fontWeight:!isMeeting?600:400,background:!isMeeting?T.goldSoft:"transparent",color:!isMeeting?T.gold:T.dim}}>Task</button>
        <button onClick={()=>setIsMeeting(true)} style={{padding:"5px 16px",borderRadius:18,border:"none",cursor:"pointer",fontSize:10,fontWeight:isMeeting?600:400,background:isMeeting?"rgba(196,181,253,.15)":"transparent",color:isMeeting?T.magenta:T.dim}}>Meeting</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
        <div style={{position:"relative"}}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{isMeeting?"Meeting":"Task"}</label><input autoFocus value={nN} onChange={e=>{setNN(e.target.value);setTaskSugs(searchTaskHistory(e.target.value));setSugIdx2(-1)}} placeholder={isMeeting?"Meeting name":"Task name"} onKeyDown={e=>{if(e.key==="Enter"){if(sugIdx2>=0&&taskSugs[sugIdx2]){setNN(taskSugs[sugIdx2]);setTaskSugs([]);setSugIdx2(-1)}else if(isMeeting){addMeeting(nN)}else{addTask()}}else if(e.key==="ArrowDown"){e.preventDefault();setSugIdx2(i=>Math.min(i+1,taskSugs.length-1))}else if(e.key==="ArrowUp"){e.preventDefault();setSugIdx2(i=>Math.max(i-1,-1))}else if(e.key==="Escape"){setTaskSugs([]);setSugIdx2(-1)}}} onBlur={()=>setTimeout(()=>{setTaskSugs([]);setSugIdx2(-1)},200)} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${isMeeting?"rgba(196,181,253,.3)":T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
          {taskSugs.length>0&&<div style={{position:"absolute",left:0,right:0,top:"100%",zIndex:50,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxHeight:160,overflow:"auto"}}>
            {taskSugs.map((s,i)=><button key={i} onMouseDown={e=>{e.preventDefault();setNN(s);setTaskSugs([]);setSugIdx2(-1)}} style={{width:"100%",display:"block",padding:"8px 12px",background:sugIdx2===i?T.surfHov:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:sugIdx2===i?T.cream:T.dim,fontFamily:T.sans,fontWeight:sugIdx2===i?500:400}} onMouseEnter={()=>setSugIdx2(i)}>{s}</button>)}
          </div>}
        </div>
        {!isMeeting&&[["Category",nC,setNC,"General"],["Assignee",nA,setNA,"Name"]].map(([l,v,fn,ph])=><div key={l}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{l}</label><input value={v} onChange={e=>fn(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&addTask()} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/></div>)}
        {isMeeting&&<><div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Time</label>{customTime?<input value={meetingTime} onChange={e=>setMeetingTime(e.target.value)} onBlur={()=>{if(!meetingTime)setCustomTime(false)}} placeholder="14:00" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.mono,outline:"none"}}/>:<select value={meetingTime||""} onChange={e=>{if(e.target.value==="__custom__"){setCustomTime(true);setMeetingTime("")}else setMeetingTime(e.target.value)}} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:meetingTime?T.cream:T.dim,fontSize:13,fontFamily:T.mono,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}><option value="">Select time</option>{[...Array(30)].map((_,i)=>{const h=7+Math.floor(i/2);const m=i%2===0?"00":"30";const t=`${String(h).padStart(2,"0")}:${m}`;return<option key={t} value={t}>{h>12?h-12:h}:{m}{h>=12?" PM":" AM"}</option>})}<option value="__custom__">Custom time...</option></select>}</div><div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Duration</label><select value={meetingDuration} onChange={e=>setMeetingDuration(e.target.value)} style={{width:"100%",padding:"9px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>{["15m","30m","45m","1h","1.5h","2h","3h"].map(d=><option key={d} value={d}>{d}</option>)}</select></div></>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMeeting?"1fr 1fr 1fr":"1fr 1fr",gap:12,marginBottom:12}}>
        <DatePick label="Date" value={nS} onChange={setNS} compact/>
        {!isMeeting&&<DatePick label="End Date" value={nE} onChange={setNE} compact/>}
        {isMeeting&&<div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Location / Link</label><input value={meetingLocation} onChange={e=>setMeetingLocation(e.target.value)} placeholder="Zoom / Office" style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/></div>}
      </div>
      {isMeeting&&<div style={{marginBottom:12,padding:14,borderRadius:T.rS,border:`1px solid rgba(196,181,253,.12)`,background:"rgba(196,181,253,.02)"}}>
        <div style={{marginBottom:12,position:"relative"}}><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Attendees</label>
          {(()=>{const attendeeList=meetingAttendees?meetingAttendees.split(",").map(s=>s.trim()).filter(Boolean):[];
          const onInput=async(e)=>{setMeetingAttendees(e.target.value);const parts=e.target.value.split(",");const current=parts[parts.length-1].trim();if(current.length>=2&&accessToken){const results=await searchContacts(accessToken,current);setContactSuggestions(results);setShowContactSug(results.length>0)}else{setShowContactSug(false)}};
          const pickSuggestion=(email)=>{const parts=meetingAttendees.split(",");parts[parts.length-1]=email;setMeetingAttendees(parts.join(", ")+", ");setShowContactSug(false)};
          return<div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:attendeeList.length>0?6:0}}>{attendeeList.map((a,i)=>a.includes("@")&&<span key={i} style={{fontSize:10,padding:"3px 8px",borderRadius:8,background:T.surfEl,border:`1px solid ${T.border}`,color:T.cream,display:"flex",alignItems:"center",gap:4}}>{a}<button onClick={()=>{const parts=attendeeList.filter((_,j)=>j!==i);setMeetingAttendees(parts.join(", "))}} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:10,padding:0,lineHeight:1}}>x</button></span>)}</div>
            <input value={meetingAttendees} onChange={onInput} onFocus={()=>{if(contactSuggestions.length)setShowContactSug(true)}} onBlur={()=>setTimeout(()=>setShowContactSug(false),200)} onKeyDown={e=>{if(e.key==="Tab"||e.key===","){const parts=meetingAttendees.split(",");const current=parts[parts.length-1].trim();if(current&&current.includes("@")){e.preventDefault();setMeetingAttendees(meetingAttendees.trim()+(meetingAttendees.trim().endsWith(",")?"":", "))}}}} placeholder="Start typing a name or email..." style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
            {showContactSug&&<div style={{position:"absolute",left:0,right:0,top:"100%",zIndex:50,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxHeight:160,overflow:"auto"}}>
              {contactSuggestions.map((c,i)=><button key={i} onMouseDown={e=>{e.preventDefault();pickSuggestion(c.email)}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:T.cream,fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{flex:1}}>{c.name&&<span style={{marginRight:6}}>{c.name}</span>}<span style={{color:T.dim}}>{c.email}</span></span>
              </button>)}
            </div>}
          </div>})()}</div>
        <div><label style={{display:"block",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Agenda</label><textarea value={meetingAgenda} onChange={e=>setMeetingAgenda(e.target.value)} placeholder="Topics to discuss..." rows={2} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none",resize:"vertical"}}/></div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
          <button onClick={()=>setIsClientMeetingFlag(!isClientMeetingFlag)} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:10,fontWeight:isClientMeetingFlag?600:400,background:isClientMeetingFlag?"rgba(6,182,212,.12)":"rgba(255,255,255,.04)",color:isClientMeetingFlag?T.cyan:T.dim,fontFamily:T.sans}}>{isClientMeetingFlag?"Client Meeting":"Mark as Client Meeting"}</button>
          {isClientMeetingFlag&&<span style={{fontSize:10,color:T.cyan}}>Will appear in Client section</span>}
        </div>
      </div>}
      <button onClick={()=>{if(isMeeting){addMeeting(nN)}else{addTask()}}} style={{padding:"9px 20px",background:isMeeting?`linear-gradient(135deg,${T.magenta},#C084FC)`:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>{isMeeting?"Schedule Meeting":"Add Task"}</button>
    </Card>}

    {/* ══ LAYER 3 — Content ══ */}
    {(()=>{
      const calendarBlock=showCalOrGantt&&<div style={{marginBottom:16}}>
        {viewMode==="calendar"?<CalendarView tasks={[...tasks,...gcalEvents]} onAddTask={addTask} onAddMeeting={(title,date,time,dur,att,agenda)=>{setMeetingTime(time);setMeetingDuration(dur);setMeetingAttendees(att);setMeetingAgenda(agenda);setMeetingDate(date);addMeeting(title)}} onEditTask={editTask} onDeleteTask={deleteTask} canEdit={canEdit}/>
        :<GanttChart tasks={tasks}/>}
      </div>;

      const taskListBlock=tasks.length===0&&!showAdd?
        <div style={{textAlign:"center",padding:"48px 20px",color:T.dim}}>
          <div style={{fontSize:14,marginBottom:12}}>No tasks yet</div>
          {canEdit&&<button onClick={()=>{setViewMode("list");setShowAdd(true)}} style={{padding:"10px 20px",background:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",border:"none",borderRadius:T.rS,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>+ Add Task</button>}
        </div>
      :<div>
        {isListView&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          {canEdit&&<button onClick={()=>setShowAdd(!showAdd)} style={{width:28,height:28,borderRadius:14,border:`1px solid ${showAdd?T.gold+"55":T.border}`,background:showAdd?T.goldSoft:"transparent",color:showAdd?T.gold:T.dim,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,lineHeight:1}}>{showAdd?"\u00d7":"+"}</button>}
        </div>}
        {taskView==="table"?renderTaskTable():
        <div style={taskView==="card"?{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}:{display:"flex",flexDirection:"column",gap:4}}>
          {taskView==="block"?
            getMergedBlockItems().map(item=>item.type==="task"?renderTaskBlock(item.data,tasks.indexOf(item.data)):renderMeetingBlock(item.data))
          :filtered.map(t=>{const ri=tasks.indexOf(t);return taskView==="card"?renderTaskCard(t,ri):renderTaskBlock(t,ri)})}
          {filtered.length===0&&tasks.length>0&&<div style={{textAlign:"center",padding:40,color:T.dim,fontSize:13,gridColumn:"1/-1"}}>No tasks with this status.</div>}
        </div>}
      </div>;

      return calBelow?<>{taskListBlock}{calendarBlock}</>:<>{calendarBlock}{taskListBlock}</>;
    })()}

    {/* ══ Meeting Detail Modal Overlay ══ */}
    {viewMeeting&&(()=>{const m=meetings.find(mt=>mt.id===viewMeeting);if(!m)return null;return<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}}>
      <div style={{width:"100%",maxWidth:720,maxHeight:"85vh",overflow:"auto",borderRadius:T.r,background:T.bg,border:`1px solid rgba(232,121,249,.15)`,boxShadow:"0 16px 48px rgba(0,0,0,.5)",padding:24}}>
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
        <div className="metric-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
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
      </div>
    </div>})()}

    {editingTaskId&&(()=>{const t=tasks.find(t=>t.id===editingTaskId);if(!t)return null;return<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}} onClick={()=>setEditingTaskId(null)}>
      <div onClick={e=>e.stopPropagation()} style={{width:500,maxWidth:"90vw",background:T.surface,borderRadius:T.r,border:`1px solid ${T.borderGlow}`,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
        <div style={{padding:"20px 24px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:15,fontWeight:700,color:T.cream,fontFamily:T.sans}}>Edit Task</span>
          <button onClick={()=>setEditingTaskId(null)} style={{background:"none",border:"none",color:T.dim,fontSize:18,cursor:"pointer",padding:4,lineHeight:1}}>&times;</button>
        </div>
        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,display:"block",fontFamily:T.sans}}>Name</label>
            <input value={etName} onChange={e=>setEtName(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=T.borderGlow} onBlur={e=>e.target.style.borderColor=T.border}/>
          </div>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}>
              <label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,display:"block",fontFamily:T.sans}}>Category</label>
              <input value={etCat} onChange={e=>setEtCat(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=T.borderGlow} onBlur={e=>e.target.style.borderColor=T.border}/>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,display:"block",fontFamily:T.sans}}>Assignee</label>
              <input value={etAssignee} onChange={e=>setEtAssignee(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=T.borderGlow} onBlur={e=>e.target.style.borderColor=T.border}/>
            </div>
          </div>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}>
              <label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,display:"block",fontFamily:T.sans}}>Start Date</label>
              <DatePick value={etStart} onChange={setEtStart} label="" compact/>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,display:"block",fontFamily:T.sans}}>End Date</label>
              <DatePick value={etEnd} onChange={setEtEnd} label="" compact/>
            </div>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,display:"block",fontFamily:T.sans}}>Status</label>
            <div style={{display:"flex",gap:6}}>
              {[["todo","To Do"],["progress","In Progress"],["roadblocked","Roadblocked"],["done","Done"]].map(([key,label])=><button key={key} onClick={()=>{updateProject({timeline:tasks.map(tk=>tk.id===editingTaskId?{...tk,status:key}:tk)})}} style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${STATUS_COLORS[key]}33`,background:t.status===key?`${STATUS_COLORS[key]}33`:"transparent",color:STATUS_COLORS[key],fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans,textTransform:"uppercase",letterSpacing:".04em"}}>{label}</button>)}
            </div>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,display:"block",fontFamily:T.sans}}>Notes</label>
            <textarea value={etNotes} onChange={e=>setEtNotes(e.target.value)} rows={4} style={{width:"100%",padding:"10px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none",resize:"vertical",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=T.borderGlow} onBlur={e=>e.target.style.borderColor=T.border}/>
          </div>
        </div>
        <div style={{padding:"16px 24px 20px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <button onClick={()=>{const idx=tasks.findIndex(tk=>tk.id===editingTaskId);if(idx>=0){removeTask(idx);setEditingTaskId(null)}}} style={{padding:"8px 18px",borderRadius:T.rS,border:`1px solid ${T.neg}33`,background:"transparent",color:T.neg,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Delete</button>
          <button onClick={saveEditTask} style={{padding:"8px 24px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},${T.cyan})`,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Save</button>
        </div>
      </div>
    </div>})()}

  </div>;
}

export default TimelineV;
