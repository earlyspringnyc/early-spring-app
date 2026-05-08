import { useState, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f0 } from '../utils/format.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganIsotype } from '../components/brand/MorganLogo.jsx';

const PAPER = T.paper;
const INK = T.ink;
const RULE = T.faintRule;
const FADED = T.fadedInk;

const Kicker = ({children}) => <div style={{
  fontSize:11,fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:INK,
}}>{children}</div>;

const STATUS_LABELS = {done:"Done","in-progress":"In progress",todo:"To do",roadblocked:"Blocked"};

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

  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:PAPER,color:FADED,fontFamily:T.sans}}>
    <div style={{textAlign:"center"}}>
      <div style={{display:"inline-flex",justifyContent:"center"}}><ESWordmark height={14} color={INK}/></div>
      <div style={{marginTop:18,fontSize:12,letterSpacing:".06em",textTransform:"uppercase",fontWeight:700,color:FADED}}>Loading</div>
    </div>
  </div>;

  if(error)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:PAPER,color:INK,fontFamily:T.sans}}>
    <div style={{textAlign:"center",maxWidth:480,padding:"40px 24px"}}>
      <div style={{display:"inline-flex",justifyContent:"center",marginBottom:24}}><ESWordmark height={14} color={INK}/></div>
      <div style={{fontSize:24,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1.05,color:INK}}>{error}</div>
      <div style={{marginTop:12,fontSize:13,color:FADED,lineHeight:1.6}}>Please contact the project team for a new link.</div>
    </div>
  </div>;

  const cats=data.cats||[];
  const timeline=data.timeline||[];
  const meetings=data.meetings||[];
  const grandTotal=cats.reduce((a,c)=>a+c.items.reduce((b,it)=>b+(it.clientPrice||0),0),0);
  const tasksDone=timeline.filter(t=>t.status==="done").length;

  return<div style={{minHeight:"100vh",background:PAPER,color:INK,fontFamily:T.sans}}>

    {/* Top rule */}
    <div style={{height:1,background:RULE}}/>

    {/* Sticky lockup nav */}
    <nav style={{
      position:"sticky",top:0,zIndex:50,
      background:"rgba(255,255,255,.86)",backdropFilter:"blur(24px) saturate(140%)",WebkitBackdropFilter:"blur(24px) saturate(140%)",
      borderBottom:`1px solid ${RULE}`,
      display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:24,
      padding:"14px clamp(20px,3vw,56px)",
    }}>
      <a href="https://earlyspring.nyc" style={{textDecoration:"none",display:"inline-flex",alignItems:"center",justifySelf:"start"}}>
        <ESWordmark height={14} color={INK}/>
      </a>
      <div style={{justifySelf:"center",fontSize:11,fontWeight:700,letterSpacing:".10em",textTransform:"uppercase",color:FADED}}>
        Lab · {data.client||"Client"}
      </div>
      <div style={{justifySelf:"end",fontSize:11,color:FADED,letterSpacing:".04em"}}>{data.eventDate?`Event · ${data.eventDate}`:""}</div>
    </nav>

    {/* Hero */}
    <header style={{maxWidth:1640,margin:"0 auto",padding:"clamp(56px,8vw,128px) clamp(20px,3vw,56px) clamp(40px,6vw,80px)"}}>
      <div style={{display:"grid",gap:"clamp(20px,3vw,32px)"}}>
        <Kicker>Production Estimate</Kicker>
        <h1 style={{
          fontSize:"clamp(40px,6vw,96px)",
          fontWeight:800,letterSpacing:"-0.028em",lineHeight:0.96,
          margin:0,color:INK,
        }}>{data.name}</h1>
        <div style={{fontSize:14,color:FADED,letterSpacing:".04em",display:"flex",gap:18,flexWrap:"wrap"}}>
          <span>{data.client}</span>
          {data.eventDate&&<span>Event · {data.eventDate}</span>}
          <span>Prepared by Early Spring</span>
        </div>
      </div>
    </header>

    {/* ── Quick stats ── */}
    <div style={{borderTop:`1px solid ${RULE}`}}>
      <section style={{maxWidth:1640,margin:"0 auto",padding:"clamp(40px,6vw,80px) clamp(20px,3vw,56px)"}}>
        <div className="budget-metrics" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"clamp(20px,3vw,40px)"}}>
          <Stat label="Estimate Total" value={f0(grandTotal)}/>
          <Stat label="Tasks Progress" value={`${tasksDone} / ${timeline.length}`}/>
          <Stat label="Event Date" value={data.eventDate||"TBD"}/>
        </div>
      </section>
    </div>

    {/* ── Estimate ── */}
    <div style={{borderTop:`1px solid ${RULE}`}}>
      <section style={{maxWidth:1640,margin:"0 auto",padding:"clamp(40px,6vw,80px) clamp(20px,3vw,56px)"}}>
        <div style={{display:"grid",gap:"clamp(20px,3vw,32px)"}}>
          <Kicker>Estimate</Kicker>
          <div style={{display:"grid",gap:0,maxWidth:920}}>
            {cats.map((c,ci)=>{
              const catTotal=c.items.reduce((a,it)=>a+(it.clientPrice||0),0);
              return<div key={ci} style={{borderTop:`1px solid ${INK}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"18px 0 10px"}}>
                  <span style={{fontSize:18,fontWeight:800,letterSpacing:"-0.01em",color:INK}}>{c.name}</span>
                  <span className="num" style={{fontSize:16,fontFamily:T.mono,color:INK,fontWeight:600}}>{f0(catTotal)}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column"}}>
                  {c.items.map((it,ii)=><div key={ii} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",fontSize:14,color:FADED,lineHeight:1.55,borderBottom:ii===c.items.length-1?"none":`1px solid ${RULE}`}}>
                    <span>{it.name}</span>
                    <span className="num" style={{fontFamily:T.mono}}>{f0(it.clientPrice)}</span>
                  </div>)}
                </div>
              </div>;
            })}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"22px 0 0",borderTop:`2px solid ${INK}`,marginTop:8}}>
              <span style={{fontSize:14,fontWeight:700,letterSpacing:".10em",textTransform:"uppercase",color:INK}}>Grand Total</span>
              <span className="num" style={{fontSize:24,fontFamily:T.mono,fontWeight:800,color:INK}}>{f0(grandTotal)}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    {/* ── Timeline ── */}
    {timeline.length>0&&<div style={{borderTop:`1px solid ${RULE}`,background:T.inkSoft3}}>
      <section style={{maxWidth:1640,margin:"0 auto",padding:"clamp(40px,6vw,80px) clamp(20px,3vw,56px)"}}>
        <div style={{display:"grid",gap:"clamp(20px,3vw,32px)"}}>
          <Kicker>Production Timeline</Kicker>
          <div style={{display:"grid",gap:0,maxWidth:920}}>
            {timeline.map((t,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",alignItems:"center",gap:16,padding:"14px 0",borderBottom:`1px solid ${RULE}`,fontSize:14}}>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:t.status==="done"?INK:t.status==="roadblocked"?T.alert:FADED,minWidth:96}}>{STATUS_LABELS[t.status]||t.status}</span>
              <span style={{color:INK,fontWeight:500}}>{t.name} <em style={{marginLeft:8}}>{t.category}</em></span>
              <span className="num" style={{fontSize:12,color:FADED,fontFamily:T.mono,whiteSpace:"nowrap"}}>{t.startDate&&t.endDate?`${t.startDate} — ${t.endDate}`:t.endDate||""}</span>
            </div>)}
          </div>
        </div>
      </section>
    </div>}

    {/* ── Meetings ── */}
    {meetings.length>0&&<div style={{borderTop:`1px solid ${RULE}`}}>
      <section style={{maxWidth:1640,margin:"0 auto",padding:"clamp(40px,6vw,80px) clamp(20px,3vw,56px)"}}>
        <div style={{display:"grid",gap:"clamp(20px,3vw,32px)"}}>
          <Kicker>Meetings</Kicker>
          <div style={{display:"grid",gap:0,maxWidth:920}}>
            {meetings.map((m,i)=><div key={i} style={{padding:"18px 0",borderTop:i===0?`1px solid ${INK}`:`1px solid ${RULE}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:18,flexWrap:"wrap"}}>
                <span style={{fontSize:16,fontWeight:700,letterSpacing:"-0.01em",color:INK}}>{m.title}</span>
                <span style={{fontSize:12,color:FADED,fontFamily:T.mono,whiteSpace:"nowrap"}}>{m.date} {m.time}</span>
              </div>
              {m.location&&<div style={{fontSize:12,color:FADED,marginTop:4}}>{m.location}</div>}
              {m.summary&&<div style={{fontSize:14,color:INK,marginTop:8,lineHeight:1.6,maxWidth:"62ch"}}>{m.summary}</div>}
            </div>)}
          </div>
        </div>
      </section>
    </div>}

    {/* Footer */}
    <footer style={{borderTop:`1px solid ${RULE}`,padding:"clamp(28px,4vw,48px) clamp(20px,3vw,56px)"}}>
      <div style={{maxWidth:1640,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:24,alignItems:"end"}}>
        <div>
          <ESWordmark height={14} color={INK}/>
          <div style={{fontSize:12,color:FADED,marginTop:14,maxWidth:"40ch",lineHeight:1.6}}>Engineering Serendipity · 385 Van Brunt St, Floor 2, Brooklyn NY 11231</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:FADED,justifySelf:"end"}}>
          <MorganIsotype size={16} color={FADED} strokeWidth={1.2}/>
          <span style={{letterSpacing:".06em",textTransform:"uppercase",fontWeight:700}}>Prepared in Morgan</span>
        </div>
      </div>
    </footer>
  </div>;
}

function Stat({label,value}){
  return<div>
    <div style={{fontSize:11,fontWeight:700,letterSpacing:".10em",textTransform:"uppercase",color:FADED,marginBottom:10}}>{label}</div>
    <div className="num" style={{fontSize:"clamp(28px,3.4vw,48px)",fontWeight:800,letterSpacing:"-0.022em",lineHeight:1.04,color:INK,fontFamily:T.mono}}>{value}</div>
  </div>;
}

export default SharedClientView;
