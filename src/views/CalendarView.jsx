import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import T from '../theme/tokens.js';
import { parseD } from '../utils/date.js';
import { Card, DatePick } from '../components/primitives/index.js';
import { searchTaskHistory } from '../utils/taskHistory.js';

// Sapphire-only event chips. Per Lab guidelines: two colors, opacity for separation.
// Production = sapphire 100, Creative = sapphire 70, Meetings = sapphire 42 (italic),
// Logistics/admin = sapphire 60, Done = sapphire 20 muted.
export function taskColor(t){
  if(t._gcal)return{bg:"rgba(15,82,186,.06)",fg:T.fadedInk};
  if(t.status==="done")return{bg:"rgba(15,82,186,.05)",fg:T.fadedInk};
  if(t.status==="progress")return{bg:"rgba(15,82,186,.10)",fg:T.ink};
  const cat=((t.category||"General")+" "+(t.name||"")).toLowerCase();
  if(cat.includes("meeting")||cat.includes("call")||cat.includes("sync"))return{bg:"rgba(15,82,186,.06)",fg:T.fadedInk};
  if(cat.includes("design")||cat.includes("creative")||cat.includes("brand")||cat.includes("art")||cat.includes("concept")||cat.includes("strategy")||cat.includes("ideation")||cat.includes("content")||cat.includes("photo")||cat.includes("video")||cat.includes("capture")||cat.includes("edit")||cat.includes("marketing"))return{bg:"rgba(15,82,186,.08)",fg:T.ink70};
  if(cat.includes("production")||cat.includes("build")||cat.includes("fabrication")||cat.includes("install")||cat.includes("av")||cat.includes("staging")||cat.includes("venue")||cat.includes("location")||cat.includes("site")||cat.includes("catering")||cat.includes("food")||cat.includes("bev")||cat.includes("print")||cat.includes("collateral")||cat.includes("signage")||cat.includes("staff")||cat.includes("team")||cat.includes("crew")||cat.includes("talent")||cat.includes("travel")||cat.includes("logistics")||cat.includes("shipping")||cat.includes("freight")||cat.includes("rental"))return{bg:"rgba(15,82,186,.10)",fg:T.ink};
  return{bg:"rgba(15,82,186,.06)",fg:T.fadedInk};
}

function CalendarView({tasks,onAddTask,onAddMeeting,onEditTask,onDeleteTask,canEdit}){
  const[month,setMonth]=useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()}});
  const[addDate,setAddDate]=useState(null);
  const[popoverPos,setPopoverPos]=useState(null);
  const[qN,setQN]=useState("");const[qE,setQE]=useState("");const[qCat,setQCat]=useState("General");const[qAssignee,setQAssignee]=useState("");
  const[taskSugs,setTaskSugs]=useState([]);
  const[editingTask,setEditingTask]=useState(null);
  const[editName,setEditName]=useState("");
  const[sugIdx,setSugIdx]=useState(-1);
  const[calMode,setCalMode]=useState("month");
  const[selectedDay,setSelectedDay]=useState(()=>new Date().getDate());
  const[dragStart,setDragStart]=useState(null);
  const[dragEnd,setDragEnd]=useState(null);
  const[isDragging,setIsDragging]=useState(false);
  const[isMeeting,setIsMeeting]=useState(false);
  const[meetTime,setMeetTime]=useState("");
  const[meetAttendees,setMeetAttendees]=useState("");
  const[meetAgenda,setMeetAgenda]=useState("");
  const[meetDuration,setMeetDuration]=useState("30m");
  const[showMore,setShowMore]=useState(false);
  const[showMonthPicker,setShowMonthPicker]=useState(false);
  const[gcalDetail,setGcalDetail]=useState(null);
  const[gcalPos,setGcalPos]=useState(null);
  const popRef=useRef(null);
  const gcalRef=useRef(null);
  const calRef=useRef(null);
  const monthPickerRef=useRef(null);

  // Close popover on click outside
  useEffect(()=>{
    if(!addDate)return;
    const handler=(e)=>{if(popRef.current&&!popRef.current.contains(e.target))closePopover()};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[addDate]);
  // Close month picker on click outside
  useEffect(()=>{
    if(!showMonthPicker)return;
    const handler=(e)=>{if(monthPickerRef.current&&!monthPickerRef.current.contains(e.target))setShowMonthPicker(false)};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[showMonthPicker]);
  // Close gcal detail on click outside
  useEffect(()=>{
    if(!gcalDetail)return;
    const handler=(e)=>{if(gcalRef.current&&!gcalRef.current.contains(e.target)){setGcalDetail(null);setGcalPos(null)}};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[gcalDetail]);

  const mNames=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const firstDay=new Date(month.y,month.m,1).getDay();
  const daysInMonth=new Date(month.y,month.m+1,0).getDate();
  const prev=()=>setMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});
  const next=()=>setMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});
  const today=new Date();const isToday=(d)=>d===today.getDate()&&month.m===today.getMonth()&&month.y===today.getFullYear();
  const fmtDate=(d)=>`${String(month.m+1).padStart(2,"0")}/${String(d).padStart(2,"0")}/${month.y}`;

  const isInDragRange=(d)=>{
    if(!dragStart||!dragEnd)return false;
    return d>=Math.min(dragStart,dragEnd)&&d<=Math.max(dragStart,dragEnd);
  };

  const tasksByDay=useMemo(()=>{
    const map={};
    tasks.forEach(t=>{
      const s=parseD(t.startDate);const e=parseD(t.endDate)||s;
      if(!s)return;
      let cur=new Date(s);const end=new Date(e);
      while(cur<=end){
        if(cur.getMonth()===month.m&&cur.getFullYear()===month.y){
          const d=cur.getDate();if(!map[d])map[d]=[];
          const startDay=s.getMonth()===month.m&&s.getFullYear()===month.y?s.getDate():1;
          const endDay=end.getMonth()===month.m&&end.getFullYear()===month.y?end.getDate():daysInMonth;
          const isStart=d===startDay;
          const isEnd=d===endDay;
          const isMultiDay=startDay!==endDay;
          map[d].push({...t,_isStart:isStart,_isEnd:isEnd,_isMultiDay:isMultiDay,_startDay:startDay,_endDay:endDay});
        }
        cur.setDate(cur.getDate()+1);
      }
    });
    return map;
  },[tasks,month,daysInMonth]);

  const closePopover=()=>{setAddDate(null);setPopoverPos(null);setQN("");setQE("");setQCat("General");setQAssignee("");setShowMore(false);setIsMeeting(false);setMeetTime("");setMeetAttendees("");setMeetAgenda("");setMeetDuration("30m");setTaskSugs([]);setSugIdx(-1);setDragStart(null);setDragEnd(null)};

  const openGcalDetail=(t,e)=>{
    e.stopPropagation();e.preventDefault();
    const rect=e.currentTarget.getBoundingClientRect();
    const calRect=calRef.current?.getBoundingClientRect()||{left:0,top:0,width:600};
    let left=rect.left-calRect.left;
    let top=rect.bottom-calRect.top+4;
    if(left+260>calRect.width)left=calRect.width-270;
    if(left<0)left=0;
    setGcalDetail(t);setGcalPos({left,top});
  };

  const quickAdd=()=>{
    if(!qN.trim()||!addDate)return;
    const sd=fmtDate(addDate);
    const ed=qE||sd;
    if(isMeeting&&onAddMeeting){
      onAddMeeting(qN.trim(),sd,meetTime,meetDuration,meetAttendees,meetAgenda);
    }else{
      onAddTask(qN.trim(),qCat||"General",qAssignee||"",sd,ed);
    }
    closePopover();
  };

  const positionPopover=(cell)=>{
    const calRect=calRef.current?.getBoundingClientRect()||{left:0,top:0,width:600};
    const cellRect=cell.getBoundingClientRect();
    let left=cellRect.left-calRect.left;
    let top=cellRect.bottom-calRect.top+4;
    if(left+300>calRect.width)left=calRect.width-310;
    if(left<0)left=0;
    return{left,top};
  };
  const openPopover=(d,e,endDate)=>{
    if(!canEdit)return;
    if(addDate===d&&!endDate){closePopover();return}
    setPopoverPos(positionPopover(e.currentTarget));
    setAddDate(d);setQN("");setShowMore(false);setIsMeeting(false);
    if(endDate)setQE(endDate);else setQE("");
  };

  const onCellMouseDown=(d)=>{if(!canEdit)return;setDragStart(d);setDragEnd(d);setIsDragging(true)};
  const onCellMouseEnter=(d)=>{
    if(!isDragging)return;
    setDragEnd(d);
    const min=Math.min(dragStart,d);const max=Math.max(dragStart,d);
    setAddDate(min);if(max>min)setQE(fmtDate(max));
  };
  const onCellMouseUp=(d,e)=>{
    if(!isDragging)return;
    setIsDragging(false);
    const min=Math.min(dragStart||d,d);
    const max=Math.max(dragStart||d,d);
    const endDate=max>min?fmtDate(max):"";
    openPopover(min,e,endDate);
    setDragStart(null);setDragEnd(null);
  };

  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(<div key={`e${i}`} style={{background:"transparent",minHeight:100}}/>);
  for(let d=1;d<=daysInMonth;d++){
    const dayTasks=tasksByDay[d]||[];
    const tdy=isToday(d);
    const inRange=isInDragRange(d);
    const isSelected=d===addDate;
    cells.push(<div key={d} className="cal-cell"
      onMouseDown={()=>onCellMouseDown(d)}
      onMouseEnter={()=>onCellMouseEnter(d)}
      onMouseUp={(e)=>onCellMouseUp(d,e)}
      style={{minHeight:100,maxHeight:120,overflow:"auto",padding:6,
        background:inRange?"rgba(148,163,184,.08)":isSelected?`${T.gold}0A`:"transparent",
        borderRadius:T.rS,cursor:canEdit?"pointer":"default",transition:"background .1s",userSelect:"none",
        border:tdy?`1px solid ${T.gold}40`:isSelected?`1px solid ${T.gold}30`:inRange?`1px solid rgba(148,163,184,.15)`:"1px solid transparent"}}
      onMouseOver={e=>{if(!isDragging&&!inRange&&!isSelected)e.currentTarget.style.background=T.surfHov}}
      onMouseOut={e=>{if(!isDragging&&!inRange&&!isSelected)e.currentTarget.style.background="transparent"}}>
      <div style={{fontSize:11,fontWeight:tdy?700:400,color:tdy?T.gold:T.dim,marginBottom:4,fontFamily:T.mono}}>{d}</div>
      {dayTasks.slice(0,3).map(t=>{const tc=taskColor(t);const isEditing=editingTask===t.id;
        if(isEditing)return<div key={t.id+d} style={{display:"flex",gap:2,marginBottom:2}} onClick={e=>e.stopPropagation()}>
          <input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){onEditTask&&onEditTask(t.id,{name:editName});setEditingTask(null)}if(e.key==="Escape")setEditingTask(null)}} onBlur={()=>{if(editName.trim()&&editName!==t.name)onEditTask&&onEditTask(t.id,{name:editName});setEditingTask(null)}} style={{flex:1,padding:"1px 4px",fontSize:10,borderRadius:2,border:`1px solid ${tc.fg}`,background:"transparent",color:T.cream,outline:"none",fontFamily:T.sans,minWidth:0}}/>
          <button onClick={e=>{e.stopPropagation();onDeleteTask&&onDeleteTask(t.id);setEditingTask(null)}} style={{background:"none",border:"none",color:T.neg,fontSize:10,cursor:"pointer",padding:"0 2px",lineHeight:1}} title="Delete task">×</button>
        </div>;
        /* Multi-day: show name on start, continuation bar on middle/end */
        const taskTitle=`${t.name}${t.category?" · "+t.category:""}${t.startDate?" · "+t.startDate:""}${t.endDate&&t.endDate!==t.startDate?" — "+t.endDate:""}`;
        if(t._isMultiDay&&!t._isStart)return<div key={t.id+d} title={taskTitle} style={{marginBottom:2}} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(t._gcal){openGcalDetail(t,e)}else if(canEdit){setEditingTask(t.id);setEditName(t.name)}}}>
          <div style={{fontSize:10,padding:"2px 5px",background:tc.bg,color:tc.fg,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:t._gcal?"pointer":canEdit?"pointer":"default",borderRadius:t._isEnd?"0 3px 3px 0":"0",marginLeft:-6,paddingLeft:8,opacity:.7}}>{t._isEnd?`— ${t.name}`:""}</div>
        </div>;
        return<div key={t.id+d} title={taskTitle} style={{display:"flex",alignItems:"center",gap:2,marginBottom:2}}>
          <div onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(t._gcal){openGcalDetail(t,e)}else if(canEdit){setEditingTask(t.id);setEditName(t.name)}}} style={{flex:1,fontSize:10,padding:"2px 5px",background:tc.bg,color:tc.fg,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid ${tc.fg}`,borderRadius:t._isMultiDay?"3px 0 0 3px":"3px",marginRight:t._isMultiDay?-6:0,cursor:t._gcal?"pointer":canEdit?"pointer":"default"}}>{t.category==="Meeting"?"● ":""}{t.name}{t._isMultiDay?" →":""}</div>
          {canEdit&&!t._isMultiDay&&!t._gcal&&<button onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(confirm("Delete '"+t.name+"'?"))onDeleteTask&&onDeleteTask(t.id)}} style={{background:"none",border:"none",color:T.dim,fontSize:10,cursor:"pointer",padding:0,lineHeight:1,flexShrink:0,opacity:.3,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.3} title="Delete">×</button>}
        </div>})}
      {dayTasks.length>3&&<div style={{fontSize:10,color:T.dim,paddingLeft:5}}>+{dayTasks.length-3} more</div>}
    </div>);
  }

  const DayView=()=>{
    const hours=[];for(let h=7;h<=22;h++)hours.push(h);
    const dayTasks=(tasksByDay[selectedDay]||[]);
    return<div style={{padding:6}}>
      {hours.map(h=>(
        <div key={h} style={{display:"flex",borderBottom:`1px solid ${T.border}`,minHeight:48}}>
          <div style={{width:50,padding:"8px 8px 8px 0",textAlign:"right",fontSize:10,color:T.dim,fontFamily:T.mono,flexShrink:0}}>
            {h>12?h-12:h}{h>=12?"pm":"am"}
          </div>
          <div style={{flex:1,padding:"4px 8px",borderLeft:`1px solid ${T.border}`}} onClick={(e)=>canEdit&&openPopover(selectedDay,e)}>
            {dayTasks.map(t=>{const tc=taskColor(t);return<div key={t.id} style={{fontSize:10,padding:"2px 6px",marginBottom:2,borderRadius:3,background:tc.bg,color:tc.fg,borderLeft:`2px solid ${tc.fg}`}}>{t.name}</div>})}
          </div>
        </div>
      ))}
    </div>;
  };

  const WeekView=()=>{
    const dayOfWeek=new Date(month.y,month.m,selectedDay||1).getDay();
    const weekStart=(selectedDay||1)-dayOfWeek;
    const days=[];for(let i=0;i<7;i++){const d=weekStart+i;if(d>=1&&d<=daysInMonth)days.push(d)}
    return<div style={{display:"grid",gridTemplateColumns:`repeat(${days.length},1fr)`,gap:1,padding:6}}>
      {days.map(d=>{
        const dayTasks=tasksByDay[d]||[];
        const tdy=isToday(d);
        return<div key={d} onClick={(e)=>{setSelectedDay(d);canEdit&&openPopover(d,e)}} style={{minHeight:200,padding:8,background:addDate===d?`${T.gold}0A`:"transparent",borderRadius:T.rS,cursor:canEdit?"pointer":"default",border:tdy?`1px solid ${T.gold}40`:"1px solid transparent"}} onMouseEnter={e=>{if(addDate!==d)e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{if(addDate!==d)e.currentTarget.style.background="transparent"}}>
          <div style={{fontSize:10,fontWeight:tdy?700:400,color:tdy?T.gold:T.dim,marginBottom:6,fontFamily:T.mono,textAlign:"center"}}>{dNames[new Date(month.y,month.m,d).getDay()]} {d}</div>
          {dayTasks.map(t=>{const tc=taskColor(t);return<div key={t.id+d} style={{fontSize:10,padding:"3px 6px",marginBottom:3,borderRadius:3,background:tc.bg,color:tc.fg,borderLeft:`2px solid ${tc.fg}`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div>})}
        </div>;
      })}
    </div>;
  };

  return<Card style={{padding:0,marginBottom:20,overflow:"visible",position:"relative"}} onMouseUp={()=>setIsDragging(false)}>
    <div ref={calRef} style={{position:"relative"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}>
        <button onClick={prev} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:T.rS,cursor:"pointer",color:T.dim,fontSize:16,padding:"4px 10px",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=T.dim}} title="Previous month">{"\u2190"}</button>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{display:"flex",gap:2,background:T.surface,borderRadius:T.rS,padding:1}}>
            {[["day","Day"],["week","Week"],["month","Month"]].map(([k,l])=>
              <button key={k} onClick={()=>setCalMode(k)} style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:10,fontWeight:calMode===k?600:400,fontFamily:T.sans,background:calMode===k?T.goldSoft:"transparent",color:calMode===k?T.gold:T.dim}}>{l}</button>
            )}
          </div>
          <div style={{position:"relative"}} ref={monthPickerRef}>
            <button onClick={()=>setShowMonthPicker(!showMonthPicker)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,fontWeight:600,color:T.cream,fontFamily:T.sans,padding:"2px 6px",borderRadius:T.rS,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{mNames[month.m]} {month.y} <span style={{fontSize:10,color:T.dim,marginLeft:2}}>&#9662;</span></button>
            {showMonthPicker&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:"50%",transform:"translateX(-50%)",zIndex:70,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r,boxShadow:T.shadow,padding:16,width:240}}>
              {/* Year nav */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <button onClick={()=>setMonth(p=>({y:p.y-1,m:p.m}))} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:14,padding:"2px 8px"}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>&larr;</button>
                <span style={{fontSize:14,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{month.y}</span>
                <button onClick={()=>setMonth(p=>({y:p.y+1,m:p.m}))} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:14,padding:"2px 8px"}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>&rarr;</button>
              </div>
              {/* Month grid */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
                {mNames.map((m,i)=>{const isActive=i===month.m;const isCurrent=i===today.getMonth()&&month.y===today.getFullYear();return<button key={i} onClick={()=>{setMonth({y:month.y,m:i});setShowMonthPicker(false)}} style={{padding:"8px 4px",borderRadius:T.rS,border:isCurrent?`1px solid ${T.gold}40`:"1px solid transparent",background:isActive?T.goldSoft:"transparent",color:isActive?T.gold:T.cream,fontSize:11,fontWeight:isActive?600:400,cursor:"pointer",fontFamily:T.sans,transition:"all .1s"}} onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background=isActive?T.goldSoft:"transparent"}}>{m.slice(0,3)}</button>})}
              </div>
              {/* Today shortcut */}
              <button onClick={()=>{setMonth({y:today.getFullYear(),m:today.getMonth()});setShowMonthPicker(false)}} style={{width:"100%",marginTop:10,padding:"7px 0",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,textAlign:"center"}} onMouseEnter={e=>{e.currentTarget.style.color=T.cream;e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{e.currentTarget.style.color=T.dim;e.currentTarget.style.background="transparent"}}>Today</button>
            </div>}
          </div>
        </div>
        <button onClick={next} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:T.rS,cursor:"pointer",color:T.dim,fontSize:16,padding:"4px 10px",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=T.dim}} title="Next month">{"\u2192"}</button>
      </div>
      {calMode==="month"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:`1px solid ${T.border}`}}>
          {dNames.map(d=><div key={d} style={{textAlign:"center",padding:"8px 0",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,padding:6}} onMouseLeave={()=>setIsDragging(false)}>
          {cells}
        </div>
      </>}
      {calMode==="week"&&<WeekView/>}
      {calMode==="day"&&<DayView/>}
      {tasks.length===0&&!addDate&&<div style={{padding:"16px 18px",textAlign:"center",color:T.dim,fontSize:11}}>Click a date to add your first task</div>}

      {/* ── Floating popover ── */}
      {addDate&&canEdit&&popoverPos&&<div ref={popRef} className="pop-in" style={{position:"absolute",left:popoverPos.left,top:popoverPos.top,width:300,zIndex:60,background:T.bg,border:`1px solid ${T.borderGlow}`,borderRadius:T.r,boxShadow:T.shadow,backdropFilter:"blur(12px)",overflow:"hidden"}} onMouseDown={e=>e.stopPropagation()}>
        {/* Popover header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
          <span style={{fontSize:11,fontWeight:600,color:T.cream,fontFamily:T.mono}}>{mNames[month.m]} {addDate}{qE?` — ${qE}`:""}</span>
          <div style={{display:"flex",gap:2,background:T.surface,borderRadius:20,padding:2}}>
            <button onClick={()=>setIsMeeting(false)} style={{padding:"3px 10px",borderRadius:18,border:"none",cursor:"pointer",fontSize:9,fontWeight:!isMeeting?600:400,background:!isMeeting?T.goldSoft:"transparent",color:!isMeeting?T.gold:T.dim}}>Task</button>
            <button onClick={()=>setIsMeeting(true)} style={{padding:"3px 10px",borderRadius:18,border:"none",cursor:"pointer",fontSize:9,fontWeight:isMeeting?600:400,background:isMeeting?"rgba(196,181,253,.15)":"transparent",color:isMeeting?T.magenta:T.dim}}>Meeting</button>
          </div>
        </div>

        {/* Quick input */}
        <div style={{padding:"12px 14px"}}>
          <div style={{position:"relative",marginBottom:showMore?10:0}}>
            <input autoFocus value={qN} onChange={e=>{setQN(e.target.value);setTaskSugs(searchTaskHistory(e.target.value));setSugIdx(-1)}} placeholder={isMeeting?"Meeting name...":"Task name..."} onKeyDown={e=>{if(e.key==="Enter"){if(sugIdx>=0&&taskSugs[sugIdx]){setQN(taskSugs[sugIdx]);setTaskSugs([]);setSugIdx(-1)}else quickAdd()}else if(e.key==="ArrowDown"){e.preventDefault();setSugIdx(i=>Math.min(i+1,taskSugs.length-1))}else if(e.key==="ArrowUp"){e.preventDefault();setSugIdx(i=>Math.max(i-1,-1))}else if(e.key==="Escape")closePopover()}} onBlur={()=>setTimeout(()=>{setTaskSugs([]);setSugIdx(-1)},200)} style={{width:"100%",padding:"9px 12px",borderRadius:T.rS,background:T.surface,border:`1px solid ${isMeeting?"rgba(196,181,253,.3)":T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
            {taskSugs.length>0&&<div style={{position:"absolute",left:0,right:0,top:"100%",zIndex:50,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:T.shadow,maxHeight:120,overflow:"auto"}}>
              {taskSugs.map((s,i)=><button key={i} onMouseDown={e=>{e.preventDefault();setQN(s);setTaskSugs([]);setSugIdx(-1)}} style={{width:"100%",display:"block",padding:"7px 12px",background:sugIdx===i?T.surfHov:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontSize:11,color:sugIdx===i?T.cream:T.dim,fontFamily:T.sans}} onMouseEnter={()=>setSugIdx(i)}>{s}</button>)}
            </div>}
          </div>

          {/* More options (expandable) */}
          {showMore&&!isMeeting&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Category</div><input value={qCat} onChange={e=>setQCat(e.target.value)} placeholder="General" style={{width:"100%",padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none"}}/></div>
            <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Assignee</div><input value={qAssignee} onChange={e=>setQAssignee(e.target.value)} placeholder="Name" onKeyDown={e=>e.key==="Enter"&&quickAdd()} style={{width:"100%",padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none"}}/></div>
            <div style={{gridColumn:"1/-1"}}><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>End Date</div><DatePick value={qE} onChange={setQE} compact/></div>
          </div>}

          {showMore&&isMeeting&&<div style={{display:"grid",gap:8,marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Time</div>
                <select value={meetTime||""} onChange={e=>setMeetTime(e.target.value)} style={{width:"100%",padding:"7px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:meetTime?T.cream:T.dim,fontSize:11,fontFamily:T.mono,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
                  <option value="">Select</option>
                  {[...Array(30)].map((_,i)=>{const h=7+Math.floor(i/2);const m=i%2===0?"00":"30";const t=`${String(h).padStart(2,"0")}:${m}`;return<option key={t} value={t}>{h>12?h-12:h}:{m}{h>=12?"p":"a"}</option>})}
                </select></div>
              <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Duration</div>
                <select value={meetDuration} onChange={e=>setMeetDuration(e.target.value)} style={{width:"100%",padding:"7px 8px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none",appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>
                  {["15m","30m","45m","1h","1.5h","2h","3h"].map(d=><option key={d} value={d}>{d}</option>)}
                </select></div>
            </div>
            <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Attendees</div>
              <input value={meetAttendees} onChange={e=>setMeetAttendees(e.target.value)} placeholder="email@example.com" style={{width:"100%",padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none"}}/></div>
            <div><div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Agenda</div>
              <input value={meetAgenda} onChange={e=>setMeetAgenda(e.target.value)} placeholder="Topics..." onKeyDown={e=>e.key==="Enter"&&quickAdd()} style={{width:"100%",padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:11,fontFamily:T.sans,outline:"none"}}/></div>
          </div>}

          {/* Actions */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>setShowMore(!showMore)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:T.dim,fontFamily:T.sans,padding:0}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>{showMore?"Less options":"More options"}</button>
            <div style={{display:"flex",gap:6}}>
              <button onClick={closePopover} style={{padding:"6px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
              <button onClick={quickAdd} disabled={!qN.trim()} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",background:qN.trim()?(isMeeting?`linear-gradient(135deg,${T.magenta},#C084FC)`:T.goldSoft):"rgba(15,82,186,.05)",color:qN.trim()?(isMeeting?"#fff":T.gold):"rgba(255,255,255,.2)",fontSize:10,fontWeight:700,cursor:qN.trim()?"pointer":"default",fontFamily:T.sans}}>{isMeeting?"Schedule":"Add"}</button>
            </div>
          </div>
        </div>
      </div>}

      {/* ── Google Calendar detail popover ── */}
      {gcalDetail&&gcalPos&&<div ref={gcalRef} className="pop-in" style={{position:"absolute",left:gcalPos.left,top:gcalPos.top,width:260,zIndex:65,background:T.bg,border:"1px solid rgba(66,133,244,.3)",borderRadius:T.r,boxShadow:T.shadow,backdropFilter:"blur(12px)",overflow:"hidden"}} onMouseDown={e=>e.stopPropagation()}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#4285F4",flexShrink:0}}/>
            <span style={{fontSize:12,fontWeight:600,color:T.cream,fontFamily:T.sans}}>{gcalDetail.name}</span>
          </div>
          <div style={{fontSize:9,color:"#4285F4",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Google Calendar</div>
        </div>
        <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
          {gcalDetail._gcalTime&&<div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:T.dim,width:50,flexShrink:0}}>Time</span>
            <span style={{fontSize:11,color:T.cream,fontFamily:T.mono}}>{gcalDetail._gcalTime}</span>
          </div>}
          {gcalDetail.startDate&&<div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:T.dim,width:50,flexShrink:0}}>Date</span>
            <span style={{fontSize:11,color:T.cream,fontFamily:T.mono}}>{gcalDetail.startDate}{gcalDetail.endDate&&gcalDetail.endDate!==gcalDetail.startDate?` — ${gcalDetail.endDate}`:""}</span>
          </div>}
          {gcalDetail._gcalLocation&&<div style={{display:"flex",alignItems:"flex-start",gap:8}}>
            <span style={{fontSize:10,color:T.dim,width:50,flexShrink:0}}>Location</span>
            <span style={{fontSize:11,color:T.cream}}>{gcalDetail._gcalLocation}</span>
          </div>}
        </div>
        <div style={{padding:"8px 14px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${T.border}`}}>
          <a href={`https://calendar.google.com/calendar/r/search?q=${encodeURIComponent(gcalDetail.name)}`} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#4285F4",textDecoration:"none",fontWeight:600,fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>Open in Google Calendar</a>
          <button onClick={()=>{setGcalDetail(null);setGcalPos(null)}} style={{padding:"5px 10px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Close</button>
        </div>
      </div>}
    </div>
  </Card>;
}

export default CalendarView;
