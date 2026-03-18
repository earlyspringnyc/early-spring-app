import { useState, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganIsotype } from '../components/brand/MorganLogo.jsx';

/* ── Card accent palette ── */
const C={indigo:'#6366F1',teal:'#14B8A6',coral:'#F47264',amber:'#F59E0B',purple:'#8B5CF6',emerald:'#10B981',cyan:'#06B6D4',pink:'#EC4899'};

/* ── Scroll-triggered fade ── */
function useFadeIn(threshold=.12){
  const ref=useRef(null);const[vis,setVis]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting)setVis(true)},{threshold});obs.observe(el);return()=>obs.disconnect()},[]);
  return{ref,style:{opacity:vis?1:0,transform:vis?'none':'translateY(28px)',transition:'opacity .7s cubic-bezier(.4,0,.2,1), transform .7s cubic-bezier(.4,0,.2,1)'}};
}
function Fade({children,style:sx={},delay=0,...p}){const{ref,style}=useFadeIn();return<div ref={ref} style={{...style,transitionDelay:`${delay}s`,...sx}} {...p}>{children}</div>}

/* ── CSS Laptop Frame ── */
function Laptop({children,scale=1}){
  return<div style={{perspective:1200,display:'flex',justifyContent:'center'}}>
    <div style={{transform:`scale(${scale})`,transformOrigin:'top center'}}>
      {/* Screen */}
      <div style={{background:'#0C0C10',borderRadius:10,border:'2px solid rgba(255,255,255,.1)',padding:6,boxShadow:'0 20px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.03)',position:'relative'}}>
        {/* Camera dot */}
        <div style={{position:'absolute',top:3,left:'50%',transform:'translateX(-50)',width:4,height:4,borderRadius:'50%',background:'rgba(255,255,255,.08)'}}/>
        <div style={{background:'#141417',borderRadius:6,overflow:'hidden',width:560,height:350}}>
          {children}
        </div>
      </div>
      {/* Base */}
      <div style={{margin:'0 auto',width:'65%',height:8,background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02))',borderRadius:'0 0 8px 8px'}}/>
      <div style={{margin:'0 auto',width:'35%',height:3,background:'rgba(255,255,255,.04)',borderRadius:'0 0 4px 4px'}}/>
    </div>
  </div>;
}

/* ── Abstract App Mockups ── */
function DashboardMockup(){
  return<div style={{padding:16,height:'100%',display:'flex',flexDirection:'column',gap:8}}>
    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}>
      <div style={{width:50,height:6,background:'rgba(148,163,184,.15)',borderRadius:3}}/>
      <div style={{flex:1}}/>
      <div style={{width:24,height:6,background:'rgba(255,255,255,.04)',borderRadius:3}}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6}}>
      {[C.amber,C.teal,C.cyan,C.coral].map((c,i)=><div key={i} style={{padding:'10px 8px',borderRadius:6,background:`${c}08`,borderLeft:`2px solid ${c}`,border:`1px solid ${c}15`}}>
        <div style={{width:'60%',height:4,background:'rgba(255,255,255,.06)',borderRadius:2,marginBottom:6}}/>
        <div style={{width:'40%',height:10,background:`${c}30`,borderRadius:3}}/>
      </div>)}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,flex:1}}>
      <div style={{borderRadius:6,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.04)',padding:10}}>
        <div style={{width:'40%',height:4,background:'rgba(255,255,255,.06)',borderRadius:2,marginBottom:10}}/>
        <div style={{width:60,height:60,borderRadius:'50%',border:'4px solid rgba(99,102,241,.3)',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{width:40,height:40,borderRadius:'50%',border:`4px solid ${C.teal}40`}}/>
        </div>
      </div>
      <div style={{borderRadius:6,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.04)',padding:10}}>
        <div style={{width:'45%',height:4,background:'rgba(255,255,255,.06)',borderRadius:2,marginBottom:8}}/>
        {[C.amber,C.teal,C.emerald].map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
          <div style={{width:6,height:6,borderRadius:2,background:c}}/>
          <div style={{width:`${30+i*10}%`,height:4,background:'rgba(255,255,255,.05)',borderRadius:2,flex:1}}/>
          <div style={{width:20,height:4,background:`${c}25`,borderRadius:2}}/>
        </div>)}
      </div>
    </div>
  </div>;
}

function CalendarMockup(){
  const events=[3,7,8,14,15,16,22,28,29];
  const colors=[C.teal,C.purple,C.teal,C.coral,C.teal,C.teal,C.purple,C.teal,C.coral];
  return<div style={{padding:16,height:'100%'}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
      <div style={{width:'25%',height:6,background:'rgba(255,255,255,.08)',borderRadius:3}}/>
      <div style={{display:'flex',gap:3}}>{['D','W','M'].map((d,i)=><div key={i} style={{padding:'2px 6px',borderRadius:4,background:i===2?'rgba(148,163,184,.08)':'transparent',fontSize:7,color:i===2?'rgba(148,163,184,.6)':'rgba(255,255,255,.15)'}}>{d}</div>)}</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
      {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} style={{textAlign:'center',fontSize:6,color:'rgba(255,255,255,.15)',padding:2}}>{d}</div>)}
      {Array.from({length:35}).map((_,i)=>{const hasEvent=events.includes(i);const c=colors[events.indexOf(i)]||C.teal;
        return<div key={i} style={{aspectRatio:'1',borderRadius:3,background:hasEvent?`${c}12`:'rgba(255,255,255,.015)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:1}}>
          {hasEvent&&<div style={{width:'80%',height:3,borderRadius:1,background:c,opacity:.5}}/>}
        </div>})}
    </div>
  </div>;
}

function VendorMockup(){
  const vendors=[{w:35,c:C.teal},{w:42,c:C.amber},{w:28,c:C.purple}];
  return<div style={{padding:16,height:'100%'}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
      <div style={{width:'20%',height:6,background:'rgba(255,255,255,.08)',borderRadius:3}}/>
      <div style={{width:40,height:5,background:'rgba(148,163,184,.06)',borderRadius:3}}/>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {vendors.map((v,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:6,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.04)'}}>
        <div style={{width:24,height:24,borderRadius:6,background:`${v.c}10`,border:`1px solid ${v.c}25`,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{width:`${v.w}%`,height:4,background:'rgba(255,255,255,.08)',borderRadius:2,marginBottom:4}}/>
          <div style={{width:`${v.w-10}%`,height:3,background:'rgba(255,255,255,.04)',borderRadius:2}}/>
        </div>
        <div style={{width:30,height:5,background:`${v.c}15`,borderRadius:3}}/>
      </div>)}
    </div>
  </div>;
}

/* ── Main Landing Page ── */
function LandingPage({onGetStarted}){
  const[scrolled,setScrolled]=useState(false);
  useEffect(()=>{const h=()=>setScrolled(window.scrollY>40);window.addEventListener('scroll',h,{passive:true});return()=>window.removeEventListener('scroll',h)},[]);
  const scrollTo=(id)=>document.getElementById(id)?.scrollIntoView({behavior:'smooth'});

  return<div style={{minHeight:'100vh',background:T.bg,fontFamily:T.sans,color:T.cream,overflowX:'hidden'}}>
    {/* ── Accent line ── */}
    <div style={{position:'fixed',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${T.gold},${T.cyan},${T.magenta},${T.pos})`,opacity:.4,zIndex:200}}/>

    {/* ── Nav ── */}
    <nav style={{position:'fixed',top:2,left:0,right:0,zIndex:100,padding:'0 32px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',background:scrolled?'rgba(8,8,12,.88)':'transparent',backdropFilter:scrolled?'blur(20px)':'none',borderBottom:scrolled?`1px solid ${T.border}`:'none',transition:'all .3s'}}>
      <ESWordmark height={16} color={T.cream}/>
      <div style={{display:'flex',alignItems:'center',gap:24}}>
        <button onClick={()=>scrollTo('features')} style={{background:'none',border:'none',color:T.dim,fontSize:13,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Features</button>
        <button onClick={()=>scrollTo('pricing')} style={{background:'none',border:'none',color:T.dim,fontSize:13,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Pricing</button>
        <button onClick={onGetStarted} style={{padding:'8px 20px',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:T.goldSoft,color:T.gold,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none'}}>Sign In</button>
      </div>
    </nav>

    {/* ── Hero ── */}
    <header style={{maxWidth:1200,margin:'0 auto',padding:'140px 32px 80px',position:'relative'}}>
      <Fade>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center'}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:T.gold,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:20}}>By Producers, For Producers</div>
            <h1 style={{fontSize:'clamp(32px,5vw,52px)',fontWeight:800,lineHeight:1.08,letterSpacing:'-0.04em',marginBottom:24,color:T.cream}}>
              The production tool you wish you had on your last show.
            </h1>
            <p style={{fontSize:16,color:T.dim,lineHeight:1.7,marginBottom:36,maxWidth:440}}>
              Budgets, timelines, vendors, client deliverables, and an AI that actually does things. Morgan handles the ops so you can focus on the experience.
            </p>
            <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
              <button onClick={onGetStarted} style={{padding:'14px 36px',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:T.goldSoft,color:T.gold,fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:T.sans,transition:'all .25s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 24px rgba(148,163,184,.15)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>Start Free</button>
              <button onClick={()=>scrollTo('features')} style={{padding:'14px 36px',borderRadius:T.rS,border:`1px solid ${T.border}`,background:'transparent',color:T.cream,fontSize:15,fontWeight:500,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background='rgba(255,255,255,.02)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background='transparent'}}>See Features</button>
            </div>
          </div>
          {/* Laptop mockup */}
          <Laptop scale={.95}>
            <DashboardMockup/>
          </Laptop>
        </div>
      </Fade>
    </header>

    {/* ── Marquee stats ── */}
    <Fade delay={.2}>
      <div style={{borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,padding:'32px 0'}}>
        <div style={{maxWidth:1200,margin:'0 auto',padding:'0 32px',display:'flex',justifyContent:'space-around',flexWrap:'wrap',gap:32}}>
          {[['Budgets','Real-time margins on every line item'],['Calendar','Drag, schedule, sync with Google'],['Vendors','Profiles, contracts, invoices in one place'],['AI','Asks questions. Executes changes.']].map(([t,s],i)=>
            <div key={i} style={{textAlign:'center',minWidth:140}}>
              <div style={{fontSize:16,fontWeight:700,color:T.cream,marginBottom:4}}>{t}</div>
              <div style={{fontSize:11,color:T.dim,lineHeight:1.5}}>{s}</div>
            </div>
          )}
        </div>
      </div>
    </Fade>

    {/* ── Features bento grid ── */}
    <section id="features" style={{maxWidth:1200,margin:'0 auto',padding:'100px 32px'}}>
      <Fade>
        <div style={{textAlign:'center',marginBottom:64}}>
          <div style={{fontSize:11,fontWeight:700,color:T.gold,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:12}}>Features</div>
          <h2 style={{fontSize:'clamp(28px,4vw,42px)',fontWeight:800,letterSpacing:'-0.03em',marginBottom:14}}>Everything from pitch to wrap.</h2>
          <p style={{fontSize:15,color:T.dim,maxWidth:480,margin:'0 auto',lineHeight:1.7}}>Six tools that cover the entire production lifecycle. No switching between apps.</p>
        </div>
      </Fade>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gridTemplateRows:'auto auto',gap:14}}>
        {/* Budget — large */}
        <Fade delay={.1} style={{gridColumn:'1/3'}}>
          <div style={{borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${C.amber}`,background:`${C.amber}05`,padding:0,overflow:'hidden',display:'grid',gridTemplateColumns:'1fr 1fr',height:'100%',transition:'border-color .3s,transform .3s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.amber}40`;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform='none'}}>
            <div style={{padding:'32px 28px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
              <div style={{fontSize:10,fontWeight:700,color:C.amber,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:10}}>Budget & Margins</div>
              <div style={{fontSize:22,fontWeight:700,letterSpacing:'-0.02em',marginBottom:10}}>Know your numbers in real time.</div>
              <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Client price, actual cost, and margin on every line item. Enter either side — the other auto-calculates. Category-level controls. Export to XLSX, CSV, or PDF.</p>
            </div>
            <div style={{padding:16,background:'rgba(0,0,0,.15)',borderLeft:`1px solid ${T.border}`}}>
              <BudgetMockup/>
            </div>
          </div>
        </Fade>

        {/* Production — tall */}
        <Fade delay={.2} style={{gridRow:'1/3'}}>
          <div style={{borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${C.teal}`,background:`${C.teal}05`,padding:'28px 24px',height:'100%',transition:'border-color .3s,transform .3s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.teal}40`;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform='none'}}>
            <div style={{fontSize:10,fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:10}}>Production</div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:'-0.02em',marginBottom:10}}>Calendar. Tasks. Gantt. All linked.</div>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7,marginBottom:20}}>Click a date to add a task. Drag across days for multi-day events. Toggle between calendar, Gantt, and list views. Meetings flow inline with tasks.</p>
            <CalendarMockup/>
          </div>
        </Fade>

        {/* Vendors */}
        <Fade delay={.3}>
          <div style={{borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${C.purple}`,background:`${C.purple}05`,padding:'28px 24px',transition:'border-color .3s,transform .3s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.purple}40`;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform='none'}}>
            <div style={{fontSize:10,fontWeight:700,color:C.purple,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:10}}>Vendor Database</div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:'-0.02em',marginBottom:10}}>Your vendor rolodex, leveled up.</div>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7,marginBottom:16}}>Profiles with contacts, address, financials. Upload invoices — AI reads the amount and due date. Budget discrepancy flagging built in.</p>
            <VendorMockup/>
          </div>
        </Fade>

        {/* Client Portal */}
        <Fade delay={.4}>
          <div style={{borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${C.coral}`,background:`${C.coral}05`,padding:'28px 24px',transition:'border-color .3s,transform .3s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.coral}40`;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform='none'}}>
            <div style={{fontSize:10,fontWeight:700,color:C.coral,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:10}}>Client Portal</div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:'-0.02em',marginBottom:10}}>Estimates, decks, files. One link.</div>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Send production estimates, timelines, pitch decks (PDF or Figma), and files. Track client contacts and meeting notes. Share via email or link.</p>
          </div>
        </Fade>

        {/* ES AI */}
        <Fade delay={.5}>
          <div style={{borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${C.cyan}`,background:`${C.cyan}05`,padding:'28px 24px',transition:'border-color .3s,transform .3s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.cyan}40`;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform='none'}}>
            <div style={{fontSize:10,fontWeight:700,color:C.cyan,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:10}}>ES AI</div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:'-0.02em',marginBottom:10}}>An AI that doesn't just talk.</div>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Morgan reads your entire project. Ask it to add line items, staff the agency team, flag risks, or optimize margins. Review suggested actions, then apply with one click.</p>
          </div>
        </Fade>
      </div>
    </section>

    {/* ── How it works ── */}
    <section style={{maxWidth:1200,margin:'0 auto',padding:'60px 32px 100px'}}>
      <Fade>
        <div style={{textAlign:'center',marginBottom:56}}>
          <div style={{fontSize:11,fontWeight:700,color:T.gold,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:12}}>How It Works</div>
          <h2 style={{fontSize:'clamp(28px,4vw,42px)',fontWeight:800,letterSpacing:'-0.03em'}}>Three steps. Zero learning curve.</h2>
        </div>
      </Fade>
      <Fade delay={.1}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:40,maxWidth:900,margin:'0 auto'}}>
          {[
            {n:'01',t:'Create a project',d:'Set the client budget, name, and event date. That\'s it.'},
            {n:'02',t:'Build your budget',d:'Add categories, line items, vendors. Margins calculate live.'},
            {n:'03',t:'Share with clients',d:'Send polished estimates, timelines, and decks. One click.'},
          ].map(s=><div key={s.n}>
            <div style={{fontSize:36,fontWeight:800,color:T.gold,opacity:.25,marginBottom:12,fontFamily:T.mono}}>{s.n}</div>
            <div style={{fontSize:17,fontWeight:700,marginBottom:8}}>{s.t}</div>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>{s.d}</p>
          </div>)}
        </div>
      </Fade>
    </section>

    {/* ── Full-width laptop showcase ── */}
    <section style={{padding:'0 32px 100px'}}>
      <Fade>
        <div style={{maxWidth:700,margin:'0 auto'}}>
          <Laptop scale={1.1}>
            <div style={{display:'grid',gridTemplateColumns:'.35fr 1fr',height:'100%'}}>
              {/* Sidebar mock */}
              <div style={{borderRight:'1px solid rgba(255,255,255,.04)',padding:'12px 8px',display:'flex',flexDirection:'column',gap:3}}>
                <div style={{width:16,height:16,borderRadius:6,border:'1px solid rgba(148,163,184,.2)',margin:'0 auto 8px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <div style={{width:8,height:8,borderRadius:2,background:'rgba(148,163,184,.15)'}}/>
                </div>
                {[C.amber,C.teal,C.purple,C.cyan,C.coral].map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 6px',borderRadius:4,background:i===0?'rgba(255,255,255,.04)':'transparent'}}>
                  <div style={{width:4,height:4,borderRadius:1,background:i===0?c:'rgba(255,255,255,.08)'}}/>
                  <div style={{width:`${20+i*5}px`,height:3,background:i===0?'rgba(255,255,255,.12)':'rgba(255,255,255,.05)',borderRadius:2}}/>
                </div>)}
              </div>
              {/* Content */}
              <CalendarMockup/>
            </div>
          </Laptop>
        </div>
      </Fade>
    </section>

    {/* ── Social proof ── */}
    <Fade>
      <div style={{maxWidth:1200,margin:'0 auto',padding:'0 32px 100px'}}>
        <div style={{textAlign:'center',padding:'48px 32px',borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`}}>
          <p style={{fontSize:18,fontWeight:500,color:T.dimH,lineHeight:1.7,maxWidth:500,margin:'0 auto 20px'}}>"We built Morgan because every production tool we tried was either too complex or too simple. This is the one we actually want to use."</p>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
            <MorganIsotype size={20} color={T.dim}/>
            <span style={{fontSize:12,color:T.dim}}>Early Spring — Brooklyn, NY</span>
          </div>
        </div>
      </div>
    </Fade>

    {/* ── Pricing ── */}
    <section id="pricing" style={{maxWidth:1200,margin:'0 auto',padding:'0 32px 100px'}}>
      <Fade>
        <div style={{textAlign:'center',marginBottom:56}}>
          <div style={{fontSize:11,fontWeight:700,color:T.gold,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:12}}>Pricing</div>
          <h2 style={{fontSize:'clamp(28px,4vw,42px)',fontWeight:800,letterSpacing:'-0.03em',marginBottom:14}}>Start free. Upgrade when you're ready.</h2>
        </div>
      </Fade>
      <Fade delay={.1}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,maxWidth:700,margin:'0 auto'}}>
          {/* Free */}
          <div style={{padding:36,borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`,display:'flex',flexDirection:'column'}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:T.dim,marginBottom:8}}>Free</div>
            <div style={{fontSize:40,fontWeight:800,marginBottom:4}}>$0<span style={{fontSize:14,fontWeight:400,color:T.dim}}>/mo</span></div>
            <p style={{fontSize:13,color:T.dim,marginBottom:28,lineHeight:1.6}}>One project. Full toolkit.</p>
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
              {['1 active project','Budget & margins','Calendar & tasks','Basic exports'].map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:T.dimH}}>
                <span style={{color:T.pos,fontSize:13}}>&#10003;</span>{f}
              </div>)}
            </div>
            <button onClick={onGetStarted} style={{width:'100%',padding:'12px 0',borderRadius:T.rS,border:`1px solid ${T.border}`,background:'transparent',color:T.cream,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background='rgba(255,255,255,.02)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background='transparent'}}>Get Started</button>
          </div>
          {/* Pro */}
          <div style={{padding:36,borderRadius:T.r,background:`rgba(148,163,184,.03)`,border:`1px solid ${T.borderGlow}`,display:'flex',flexDirection:'column',position:'relative'}}>
            <div style={{position:'absolute',top:16,right:16,padding:'4px 10px',borderRadius:20,background:T.goldSoft,fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:T.gold}}>Popular</div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:T.gold,marginBottom:8}}>Pro</div>
            <div style={{fontSize:40,fontWeight:800,marginBottom:4}}>$29<span style={{fontSize:14,fontWeight:400,color:T.dim}}>/mo</span></div>
            <p style={{fontSize:13,color:T.dim,marginBottom:28,lineHeight:1.6}}>Unlimited projects. Full team.</p>
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
              {['Unlimited projects','Team management','Vendor database','Client portal','Google Calendar sync','ES AI assistant','Priority support'].map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:T.dimH}}>
                <span style={{color:T.gold,fontSize:13}}>&#10003;</span>{f}
              </div>)}
            </div>
            <button onClick={onGetStarted} style={{width:'100%',padding:'12px 0',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:T.goldSoft,color:T.gold,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:T.sans,transition:'all .25s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none'}}>Get Started</button>
          </div>
        </div>
      </Fade>
    </section>

    {/* ── CTA ── */}
    <section style={{maxWidth:1200,margin:'0 auto',padding:'0 32px 100px'}}>
      <Fade>
        <div style={{textAlign:'center'}}>
          <h2 style={{fontSize:'clamp(24px,4vw,38px)',fontWeight:800,letterSpacing:'-0.03em',marginBottom:16}}>Ready to produce?</h2>
          <p style={{fontSize:15,color:T.dim,marginBottom:32}}>Join production teams already using Morgan.</p>
          <button onClick={onGetStarted} style={{padding:'14px 40px',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:T.goldSoft,color:T.gold,fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:T.sans,transition:'all .25s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 24px rgba(148,163,184,.15)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>Start Free</button>
        </div>
      </Fade>
    </section>

    {/* ── Footer ── */}
    <footer style={{borderTop:`1px solid ${T.border}`,padding:'28px 32px',textAlign:'center'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:8}}>
        <MorganIsotype size={16} color={T.dim}/>
        <ESWordmark height={10} color={T.dim}/>
      </div>
      <p style={{fontSize:10,color:'rgba(255,255,255,.2)'}}>© 2026 Early Spring LLC. All rights reserved.</p>
    </footer>

    {/* ── Responsive ── */}
    <style>{`
      @media(max-width:768px){
        header > div > div[style*="grid-template-columns: 1fr 1fr"],
        header > div > div { grid-template-columns: 1fr !important; }
        #features > div:last-child { grid-template-columns: 1fr !important; }
        #features > div:last-child > div { grid-column: auto !important; grid-row: auto !important; }
        #pricing > div:last-child > div { grid-template-columns: 1fr !important; }
      }
    `}</style>
  </div>;
}

/* ── Budget mockup for feature card ── */
function BudgetMockup(){
  const cats=[{c:C.indigo,w:40},{c:C.teal,w:55},{c:C.coral,w:30},{c:C.amber,w:45}];
  return<div style={{height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',padding:8}}>
    {cats.map((r,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
      <div style={{width:2,height:14,borderRadius:1,background:r.c}}/>
      <div style={{width:`${r.w}%`,height:4,background:'rgba(255,255,255,.06)',borderRadius:2,flex:1}}/>
      <div style={{width:28,height:4,background:`${r.c}20`,borderRadius:2}}/>
      <div style={{width:22,height:4,background:'rgba(148,163,184,.1)',borderRadius:2}}/>
    </div>)}
    <div style={{marginTop:8,background:'#1E293B',borderRadius:5,padding:'6px 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{width:'30%',height:5,background:'rgba(255,255,255,.2)',borderRadius:2}}/>
      <div style={{width:'20%',height:6,background:'rgba(148,163,184,.35)',borderRadius:3}}/>
    </div>
  </div>;
}

export default LandingPage;
