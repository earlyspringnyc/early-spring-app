import { useState, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f0 } from '../utils/format.js';
import { MorganIsotype } from '../components/brand/MorganLogo.jsx';

const Pill=({children,color=T.gold})=><span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em"}}>{children}</span>;
const STATUS_COLORS={done:T.pos,"in-progress":T.cyan,todo:T.dim,roadblocked:T.neg};

function SharedClientView({token}){
  const[data,setData]=useState(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState(null);

  useEffect(()=>{
    fetch(`/api/share?token=${encodeURIComponent(token)}`)
      .then(r=>{if(!r.ok)throw new Error(r.status===404?"This link has expired or is invalid":"Something went wrong");return r.json()})
      .then(d=>{setData(d);setLoading(false)})
      .catch(e=>{setError(e.message);setLoading(false)});
  },[token]);

  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.dim,fontFamily:T.sans}}>
    <div style={{textAlign:"center"}}><MorganIsotype size={40}/><div style={{marginTop:16,fontSize:13}}>Loading...</div></div>
  </div>;

  if(error)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.cream,fontFamily:T.sans}}>
    <div style={{textAlign:"center",maxWidth:400}}><MorganIsotype size={40}/><div style={{marginTop:20,fontSize:16,fontWeight:600}}>{error}</div><div style={{marginTop:8,fontSize:12,color:T.dim}}>Please contact the project team for a new link.</div></div>
  </div>;

  const cats=data.cats||[];
  const timeline=data.timeline||[];
  const meetings=data.meetings||[];
  const grandTotal=cats.reduce((a,c)=>a+c.items.reduce((b,it)=>b+(it.clientPrice||0),0),0);
  const tasksDone=timeline.filter(t=>t.status==="done").length;

  return<div style={{minHeight:"100vh",background:T.bg,color:T.cream,fontFamily:T.sans}}>
    {/* Header */}
    <div style={{padding:"32px 40px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:16}}>
        {data.logo&&<img src={data.logo} style={{height:36,objectFit:"contain"}}/>}
        <div>
          <h1 style={{fontSize:20,fontWeight:700,letterSpacing:"-0.02em"}}>{data.name}</h1>
          <div style={{fontSize:12,color:T.dim,marginTop:2}}>{data.client}{data.eventDate&&<span style={{marginLeft:8}}>Event: {data.eventDate}</span>}</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <MorganIsotype size={20}/>
        <span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>Powered by Morgan</span>
      </div>
    </div>

    <div style={{padding:"32px clamp(16px,4vw,40px)",maxWidth:1000,margin:"0 auto"}}>
      {/* Quick stats */}
      <div className="budget-metrics" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:32}}>
        <div style={{padding:"20px 24px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Estimate Total</div>
          <div className="num" style={{fontSize:28,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{f0(grandTotal)}</div>
        </div>
        <div style={{padding:"20px 24px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Tasks Progress</div>
          <div className="num" style={{fontSize:28,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{tasksDone}<span style={{fontSize:14,color:T.dim,fontWeight:400}}>/ {timeline.length}</span></div>
        </div>
        <div style={{padding:"20px 24px",borderRadius:T.r,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Event Date</div>
          <div style={{fontSize:20,fontWeight:600,color:T.cyan}}>{data.eventDate||"TBD"}</div>
        </div>
      </div>

      {/* Budget Estimate */}
      <div style={{marginBottom:32}}>
        <h2 style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:T.cream,marginBottom:16}}>Estimate</h2>
        {cats.map((c,ci)=><div key={ci} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
            <span style={{fontSize:12,fontWeight:600,color:T.cream}}>{c.name}</span>
            <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{f0(c.items.reduce((a,it)=>a+(it.clientPrice||0),0))}</span>
          </div>
          {c.items.map((it,ii)=><div key={ii} style={{display:"flex",justifyContent:"space-between",padding:"7px 16px 7px 32px",fontSize:12,color:T.dim}}>
            <span>{it.name}</span>
            <span className="num" style={{fontFamily:T.mono}}>{f0(it.clientPrice)}</span>
          </div>)}
        </div>)}
        <div style={{display:"flex",justifyContent:"space-between",padding:"14px 16px",borderRadius:T.rS,background:T.goldSoft,border:`1px solid ${T.borderGlow}`,marginTop:8}}>
          <span style={{fontSize:13,fontWeight:700,color:T.gold}}>Total</span>
          <span className="num" style={{fontSize:16,fontFamily:T.mono,fontWeight:700,color:T.gold}}>{f0(grandTotal)}</span>
        </div>
      </div>

      {/* Timeline */}
      {timeline.length>0&&<div style={{marginBottom:32}}>
        <h2 style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:T.cream,marginBottom:16}}>Production Timeline</h2>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {timeline.map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:STATUS_COLORS[t.status]||T.dim}}/>
              <span style={{fontSize:12,color:T.cream,fontWeight:500}}>{t.name}</span>
              <Pill color={T.dim}>{t.category}</Pill>
            </div>
            <div style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>{t.startDate&&t.endDate?`${t.startDate} — ${t.endDate}`:t.endDate||""}</div>
          </div>)}
        </div>
      </div>}

      {/* Meetings */}
      {meetings.length>0&&<div style={{marginBottom:32}}>
        <h2 style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:T.cream,marginBottom:16}}>Meetings</h2>
        {meetings.map((m,i)=><div key={i} style={{padding:"14px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:600,color:T.cream}}>{m.title}</span>
            <span style={{fontSize:11,color:T.cyan,fontFamily:T.mono}}>{m.date} {m.time}</span>
          </div>
          {m.location&&<div style={{fontSize:11,color:T.dim,marginTop:4}}>{m.location}</div>}
          {m.summary&&<div style={{fontSize:12,color:T.dim,marginTop:6,lineHeight:1.5}}>{m.summary}</div>}
        </div>)}
      </div>}

      {/* Footer */}
      <div style={{textAlign:"center",padding:"32px 0",borderTop:`1px solid ${T.border}`,marginTop:32}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <MorganIsotype size={16}/>
          <span style={{fontSize:11,color:T.dim}}>Powered by Morgan</span>
        </div>
      </div>
    </div>
  </div>;
}

export default SharedClientView;
