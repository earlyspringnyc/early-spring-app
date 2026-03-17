import T from '../theme/tokens.js';
import { parseD, fmtShort, daysBetween } from '../utils/date.js';
import { Card } from '../components/primitives/index.js';
import { taskColor } from './CalendarView.jsx';

function GanttChart({tasks}){
  const dated=tasks.filter(t=>parseD(t.startDate));
  if(dated.length===0)return<Card style={{padding:24,marginBottom:20}}><div style={{textAlign:"center",color:T.dim,fontSize:13}}>Add start dates to tasks to see the Gantt chart.</div></Card>;
  const allDates=[];
  dated.forEach(t=>{allDates.push(parseD(t.startDate));if(parseD(t.endDate))allDates.push(parseD(t.endDate));else allDates.push(parseD(t.startDate))});
  const minD=new Date(Math.min(...allDates));const maxD=new Date(Math.max(...allDates));
  const pad=3;minD.setDate(minD.getDate()-pad);maxD.setDate(maxD.getDate()+pad);
  const totalDays=Math.max(daysBetween(minD,maxD),7);
  const weeks=[];let cur=new Date(minD);while(cur<=maxD){weeks.push(new Date(cur));cur.setDate(cur.getDate()+7)}

  return<Card style={{padding:0,marginBottom:20,overflow:"hidden"}}>
    <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:12,fontWeight:600,color:T.cream}}>Project Gantt</span><span style={{fontSize:11,color:T.dim,marginLeft:10}}>{fmtShort(minD)} — {fmtShort(maxD)}</span></div>
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth:Math.max(totalDays*14,500),position:"relative"}}>
        {/* Week headers */}
        <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"6px 0"}}>
          <div style={{width:160,flexShrink:0,padding:"0 14px"}}/>
          <div style={{flex:1,position:"relative",height:20}}>
            {weeks.map((w,i)=>{const left=(daysBetween(minD,w)/totalDays)*100;return<span key={i} style={{position:"absolute",left:`${left}%`,fontSize:10,color:T.dim,fontFamily:T.mono,whiteSpace:"nowrap"}}>{fmtShort(w)}</span>})}
          </div>
        </div>
        {/* Task rows */}
        {dated.map(t=>{
          const start=parseD(t.startDate);const end=parseD(t.endDate)||start;
          const left=(daysBetween(minD,start)/totalDays)*100;
          const width=Math.max((daysBetween(start,end)+1)/totalDays*100,1);
          const tc=taskColor(t);
          return<div key={t.id} style={{display:"flex",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:160,flexShrink:0,padding:"0 14px",overflow:"hidden",display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:tc.fg,flexShrink:0}}/>
              <span style={{fontSize:11,color:t.status==="done"?T.dim:T.cream,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{t.name}</span>
            </div>
            <div style={{flex:1,position:"relative",height:22}}>
              <div style={{position:"absolute",left:`${left}%`,width:`${width}%`,top:4,height:14,borderRadius:3,background:tc.fg,opacity:t.status==="done"?.3:.8,transition:"all .3s",boxShadow:`0 0 8px ${tc.fg}33`}}>
                <span style={{position:"absolute",left:6,top:1,fontSize:10,color:"#000",fontWeight:600,whiteSpace:"nowrap",mixBlendMode:"luminosity"}}>{fmtShort(start)}{end>start?` — ${fmtShort(end)}`:""}</span>
              </div>
            </div>
          </div>})}
      </div>
    </div>
  </Card>;
}

export default GanttChart;
