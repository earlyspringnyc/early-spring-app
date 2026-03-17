import { useState, useMemo } from 'react';
import T from '../theme/tokens.js';
import { parseD } from '../utils/date.js';
import { Card, DatePick } from '../components/primitives/index.js';

function CalendarView({tasks,onAddTask,canEdit}){
  const[month,setMonth]=useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()}});
  const[addDate,setAddDate]=useState(null);
  const[qN,setQN]=useState("");const[qE,setQE]=useState("");
  const mNames=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const firstDay=new Date(month.y,month.m,1).getDay();
  const daysInMonth=new Date(month.y,month.m+1,0).getDate();
  const prev=()=>setMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});
  const next=()=>setMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});
  const today=new Date();const isToday=(d)=>d===today.getDate()&&month.m===today.getMonth()&&month.y===today.getFullYear();

  const tasksByDay=useMemo(()=>{
    const map={};
    tasks.forEach(t=>{
      const s=parseD(t.startDate);const e=parseD(t.endDate)||s;
      if(!s)return;
      let cur=new Date(s);const end=new Date(e);
      while(cur<=end){
        if(cur.getMonth()===month.m&&cur.getFullYear()===month.y){
          const d=cur.getDate();if(!map[d])map[d]=[];map[d].push(t);
        }
        cur.setDate(cur.getDate()+1);
      }
    });
    return map;
  },[tasks,month]);

  const quickAdd=()=>{
    if(!qN.trim()||!addDate)return;
    const sd=`${String(month.m+1).padStart(2,"0")}/${String(addDate).padStart(2,"0")}/${month.y}`;
    const ed=qE||sd;
    onAddTask(qN.trim(),"General","",sd,ed);
    setQN("");setQE("");setAddDate(null);
  };

  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(<div key={`e${i}`} style={{background:"transparent",minHeight:100}}/>);
  for(let d=1;d<=daysInMonth;d++){
    const dayTasks=tasksByDay[d]||[];
    const tdy=isToday(d);
    cells.push(<div key={d} className="cal-cell" onClick={()=>canEdit&&setAddDate(addDate===d?null:d)} style={{minHeight:100,maxHeight:120,overflow:"auto",padding:6,background:addDate===d?"rgba(255,234,151,.06)":"transparent",borderRadius:T.rS,cursor:canEdit?"pointer":"default",transition:"all .15s",border:tdy?`1px solid rgba(255,234,151,.25)`:"1px solid transparent"}} onMouseEnter={e=>{if(addDate!==d)e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{if(addDate!==d)e.currentTarget.style.background="transparent"}}>
      <div style={{fontSize:11,fontWeight:tdy?700:400,color:tdy?T.gold:T.dim,marginBottom:4,fontFamily:T.mono}}>{d}</div>
      {dayTasks.slice(0,3).map(t=><div key={t.id+d} style={{fontSize:9,padding:"2px 5px",marginBottom:2,borderRadius:3,background:t.status==="done"?"rgba(52,211,153,.12)":t.status==="progress"?"rgba(34,211,238,.12)":"rgba(255,234,151,.1)",color:t.status==="done"?T.pos:t.status==="progress"?T.cyan:T.gold,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div>)}
      {dayTasks.length>3&&<div style={{fontSize:8,color:T.dim,paddingLeft:5}}>+{dayTasks.length-3} more</div>}
    </div>);
  }

  return<Card style={{padding:0,marginBottom:20,overflow:"visible"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}>
      <button onClick={prev} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:16,padding:"4px 8px"}}>&larr;</button>
      <span style={{fontSize:14,fontWeight:600,color:T.cream}}>{mNames[month.m]} {month.y}</span>
      <button onClick={next} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:16,padding:"4px 8px"}}>&rarr;</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:`1px solid ${T.border}`}}>
      {dNames.map(d=><div key={d} style={{textAlign:"center",padding:"8px 0",fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em"}}>{d}</div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,padding:6}}>
      {cells}
    </div>
    {addDate&&canEdit&&<div style={{padding:"12px 18px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center",position:"relative",zIndex:10}}>
      <span style={{fontSize:10,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{mNames[month.m]} {addDate}</span>
      <input autoFocus value={qN} onChange={e=>setQN(e.target.value)} placeholder="Task" onKeyDown={e=>e.key==="Enter"&&quickAdd()} style={{flex:1,padding:"7px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
      <div style={{width:200}}><DatePick value={qE} onChange={setQE} label="End Date" compact/></div>
      <button onClick={quickAdd} style={{padding:"7px 14px",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,border:"none",borderRadius:T.rS,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:T.sans,flexShrink:0}}>Add</button>
    </div>}
  </Card>;
}

export default CalendarView;
