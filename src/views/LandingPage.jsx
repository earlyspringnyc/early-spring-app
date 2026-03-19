import { useState, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganIsotype } from '../components/brand/MorganLogo.jsx';

/* ── Accent palette ── */
const C={steel:'#94A3B8',teal:'#14B8A6',coral:'#F47264',amber:'#F59E0B',emerald:'#10B981',cyan:'#06B6D4',indigo:'#6366F1',purple:'#8B5CF6'};

/* ── Scroll-triggered fade ── */
function useFadeIn(threshold=.12){
  const ref=useRef(null);const[vis,setVis]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting)setVis(true)},{threshold});obs.observe(el);return()=>obs.disconnect()},[]);
  return{ref,style:{opacity:vis?1:0,transform:vis?'none':'translateY(28px)',transition:'opacity .7s cubic-bezier(.4,0,.2,1), transform .7s cubic-bezier(.4,0,.2,1)'}};
}
function Fade({children,style:sx={},delay=0,...p}){const{ref,style}=useFadeIn();return<div ref={ref} style={{...style,transitionDelay:`${delay}s`,...sx}} {...p}>{children}</div>}

/* ── Divider line ── */
function Rule({maxWidth=1200}){return<div style={{maxWidth,margin:'0 auto',height:1,background:T.border}}/>}

/* ───────────────────────── HERO BUDGET MOCKUP ───────────────────────── */
function HeroBudgetUI(){
  const cats=[
    {category:'Venue',items:[
      {name:'The Williamsburg Hotel',desc:'Rooftop buyout',cost:28000},
    ]},
    {category:'Catering & Beverage',items:[
      {name:'LIC Catering Co',desc:'150 guests x $125/ea',cost:18750},
      {name:'Open Bar',desc:'150 x $75/ea',cost:11250},
    ]},
    {category:'AV & Production',items:[
      {name:'LED Wall 12x8 2.6mm',desc:'Prism AV',cost:8500},
      {name:'Sound + DJ',desc:'Prism AV',cost:4200},
      {name:'Lighting Design',desc:'Prism AV',cost:6800},
    ]},
    {category:'Decor & Fabrication',items:[
      {name:'Custom Entry Arch',desc:'Fabrication + install',cost:7500},
    ]},
    {category:'Staffing & Talent',items:[
      {name:'Photography',desc:'Lens & Light',cost:4500},
      {name:'Brand Ambassadors',desc:'6 x $800/ea',cost:4800},
    ]},
  ];
  const subtotal=cats.reduce((s,c)=>s+c.items.reduce((a,i)=>a+i.cost,0),0);
  const fee=Math.round(subtotal*.2);
  const total=subtotal+fee;
  const fmt=n=>'$'+n.toLocaleString();

  return<div style={{background:'rgba(0,0,0,.4)',border:`1px solid ${T.border}`,borderRadius:T.r,overflow:'hidden',fontFamily:T.sans,maxWidth:520}}>
    {/* Title bar */}
    <div style={{padding:'14px 18px 12px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:T.cream,letterSpacing:'-0.02em'}}>Montauk Capital Summer Party</div>
        <div style={{fontSize:10,color:T.dim,marginTop:2}}>Montauk Capital Partners &middot; June 14, 2026</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>Client budget</span>
        <span style={{fontSize:13,fontWeight:700,fontFamily:T.mono,color:C.amber}}>{fmt(340000)}</span>
      </div>
    </div>

    {/* Column headers */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 80px 80px',padding:'8px 18px 6px',borderBottom:`1px solid rgba(255,255,255,.03)`}}>
      <span style={{fontSize:9,fontWeight:600,color:'rgba(255,255,255,.2)',textTransform:'uppercase',letterSpacing:'.08em'}}>Line Item</span>
      <span style={{fontSize:9,fontWeight:600,color:'rgba(255,255,255,.2)',textTransform:'uppercase',letterSpacing:'.08em',textAlign:'right'}}>Cost</span>
      <span style={{fontSize:9,fontWeight:600,color:'rgba(255,255,255,.2)',textTransform:'uppercase',letterSpacing:'.08em',textAlign:'right'}}>Margin</span>
    </div>

    {/* Categories + items */}
    <div style={{maxHeight:320,overflow:'hidden'}}>
      {cats.map((cat,ci)=><div key={ci}>
        <div style={{padding:'8px 18px 4px',fontSize:9,fontWeight:700,color:T.gold,textTransform:'uppercase',letterSpacing:'.1em',background:'rgba(255,255,255,.015)'}}>{cat.category}</div>
        {cat.items.map((it,ii)=>{
          const margin=Math.round(it.cost*.15);
          return<div key={ii} style={{display:'grid',gridTemplateColumns:'1fr 80px 80px',padding:'7px 18px',borderBottom:'1px solid rgba(255,255,255,.025)',alignItems:'center'}}>
            <div>
              <span style={{fontSize:12,color:'rgba(255,255,255,.7)'}}>{it.name}</span>
              <span style={{fontSize:10,color:'rgba(255,255,255,.2)',marginLeft:8}}>{it.desc}</span>
            </div>
            <span style={{fontSize:11,fontFamily:T.mono,color:'rgba(255,255,255,.5)',textAlign:'right'}}>{fmt(it.cost)}</span>
            <span style={{fontSize:11,fontFamily:T.mono,color:T.pos,textAlign:'right',opacity:.7}}>+{fmt(margin)}</span>
          </div>
        })}
      </div>)}
    </div>

    {/* Totals */}
    <div style={{borderTop:`1px solid ${T.border}`,padding:'10px 18px',background:'rgba(255,255,255,.02)'}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 80px 80px',marginBottom:6}}>
        <span style={{fontSize:11,color:T.dim}}>Agency Fee (20%)</span>
        <span style={{fontSize:11,fontFamily:T.mono,color:'rgba(255,255,255,.4)',textAlign:'right'}}>{fmt(fee)}</span>
        <span/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 80px 80px'}}>
        <span style={{fontSize:13,fontWeight:700,color:T.cream}}>Grand Total</span>
        <span style={{fontSize:14,fontWeight:700,fontFamily:T.mono,color:C.amber,textAlign:'right'}}>{fmt(total)}</span>
        <span style={{fontSize:11,fontFamily:T.mono,color:T.pos,textAlign:'right'}}>+{fmt(Math.round(subtotal*.15))}</span>
      </div>
    </div>
  </div>;
}

/* ───────────────────────── TIMELINE MOCKUP ───────────────────────── */
function TimelineMockup(){
  const tasks=[
    {name:'Confirm venue contract',date:'Apr 28',status:'done',owner:'KT'},
    {name:'Catering tasting — LIC Catering Co',date:'May 2',status:'done',owner:'AM'},
    {name:'Client kickoff deck due',date:'May 5',status:'in-progress',owner:'JR'},
    {name:'AV walkthrough @ Williamsburg Hotel',date:'May 12',status:'upcoming',owner:'KT'},
    {name:'LED wall content specs to Prism AV',date:'May 14',status:'upcoming',owner:'JR'},
    {name:'Final headcount lock',date:'May 30',status:'upcoming',owner:'AM'},
    {name:'Load-in & rehearsal',date:'Jun 13',status:'upcoming',owner:'KT'},
    {name:'Show day',date:'Jun 14',status:'upcoming',owner:'ALL'},
  ];
  const statusColor={done:T.pos,'in-progress':C.amber,upcoming:'rgba(255,255,255,.15)'};
  const statusLabel={done:'Done','in-progress':'In Progress',upcoming:'Upcoming'};

  return<div style={{background:'rgba(0,0,0,.4)',border:`1px solid ${T.border}`,borderRadius:T.r,overflow:'hidden',fontFamily:T.sans}}>
    <div style={{padding:'14px 18px 12px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontSize:13,fontWeight:700,color:T.cream}}>Production Timeline</span>
      <span style={{fontSize:10,color:T.dim}}>8 tasks &middot; 2 complete</span>
    </div>
    <div style={{padding:'4px 0'}}>
      {tasks.map((t,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'10px 1fr 70px 60px 32px',gap:10,padding:'9px 18px',borderBottom:'1px solid rgba(255,255,255,.025)',alignItems:'center'}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:statusColor[t.status],border:t.status==='upcoming'?'1.5px solid rgba(255,255,255,.12)':'none'}}/>
        <span style={{fontSize:12,color:t.status==='done'?'rgba(255,255,255,.3)':'rgba(255,255,255,.7)',textDecoration:t.status==='done'?'line-through':'none'}}>{t.name}</span>
        <span style={{fontSize:10,fontFamily:T.mono,color:'rgba(255,255,255,.25)',textAlign:'right'}}>{t.date}</span>
        <span style={{fontSize:8,fontWeight:600,color:statusColor[t.status],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'right'}}>{statusLabel[t.status]}</span>
        <span style={{fontSize:9,fontWeight:600,color:'rgba(255,255,255,.2)',textAlign:'center',background:'rgba(255,255,255,.03)',borderRadius:4,padding:'2px 0'}}>{t.owner}</span>
      </div>)}
    </div>
  </div>;
}

/* ───────────────────────── CLIENT SHARE MOCKUP ───────────────────────── */
function ClientShareMockup(){
  return<div style={{background:'rgba(0,0,0,.4)',border:`1px solid ${T.border}`,borderRadius:T.r,overflow:'hidden',fontFamily:T.sans,maxWidth:440}}>
    <div style={{padding:'14px 18px 12px',borderBottom:`1px solid ${T.border}`}}>
      <span style={{fontSize:13,fontWeight:700,color:T.cream}}>Share Estimate</span>
    </div>
    <div style={{padding:18}}>
      {/* Email preview */}
      <div style={{borderRadius:8,border:`1px solid ${T.border}`,overflow:'hidden',background:'rgba(255,255,255,.015)'}}>
        <div style={{padding:'12px 14px',borderBottom:`1px solid ${T.border}`,display:'flex',flexDirection:'column',gap:4}}>
          <div style={{display:'flex',gap:8,fontSize:10}}>
            <span style={{color:'rgba(255,255,255,.2)'}}>To:</span>
            <span style={{color:'rgba(255,255,255,.5)'}}>david.chen@montaukcap.com</span>
          </div>
          <div style={{display:'flex',gap:8,fontSize:10}}>
            <span style={{color:'rgba(255,255,255,.2)'}}>Subject:</span>
            <span style={{color:'rgba(255,255,255,.5)'}}>Production Estimate — Summer Party 2026</span>
          </div>
        </div>
        <div style={{padding:'14px 14px 16px'}}>
          <p style={{fontSize:11,color:'rgba(255,255,255,.4)',lineHeight:1.6,margin:'0 0 12px'}}>
            Hi David, please find the attached production estimate for the Montauk Capital Summer Party. The total comes to <span style={{color:T.cream,fontFamily:T.mono,fontWeight:600}}>$287,450</span> against your <span style={{color:T.cream,fontFamily:T.mono,fontWeight:600}}>$340,000</span> budget.
          </p>
          <div style={{display:'flex',gap:8}}>
            <div style={{padding:'6px 12px',borderRadius:6,background:'rgba(148,163,184,.08)',border:`1px solid ${T.border}`,fontSize:9,color:T.gold,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontSize:11}}>&#128196;</span> Estimate_MontaukCapital_2026.pdf
            </div>
          </div>
        </div>
      </div>
      <div style={{marginTop:14,display:'flex',gap:10}}>
        <div style={{flex:1,padding:'8px 0',borderRadius:6,background:T.goldSoft,border:`1px solid ${T.borderGlow}`,textAlign:'center',fontSize:11,fontWeight:600,color:T.gold}}>Send Email</div>
        <div style={{flex:1,padding:'8px 0',borderRadius:6,background:'transparent',border:`1px solid ${T.border}`,textAlign:'center',fontSize:11,fontWeight:500,color:T.dim}}>Copy Link</div>
      </div>
    </div>
  </div>;
}

/* ───────────────────────── AI CHAT MOCKUP ───────────────────────── */
function AIChatMockup(){
  return<div style={{background:'rgba(0,0,0,.4)',border:`1px solid ${T.border}`,borderRadius:T.r,overflow:'hidden',fontFamily:T.sans,maxWidth:480}}>
    <div style={{padding:'14px 18px 12px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:8}}>
      <MorganIsotype size={16} color={T.gold}/>
      <span style={{fontSize:13,fontWeight:700,color:T.cream}}>Morgan AI</span>
      <span style={{fontSize:9,padding:'2px 8px',borderRadius:10,background:'rgba(77,222,128,.08)',color:T.pos,fontWeight:600}}>Online</span>
    </div>
    <div style={{padding:18,display:'flex',flexDirection:'column',gap:14}}>
      {/* User message */}
      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <div style={{background:'rgba(148,163,184,.08)',border:`1px solid ${T.border}`,borderRadius:'12px 12px 4px 12px',padding:'10px 14px',maxWidth:'85%'}}>
          <p style={{fontSize:12,color:'rgba(255,255,255,.7)',lineHeight:1.5,margin:0}}>Staff the agency team for the Montauk Capital 3-day activation. Need a PM, creative lead, and on-site crew.</p>
        </div>
      </div>
      {/* AI response */}
      <div style={{display:'flex',justifyContent:'flex-start'}}>
        <div style={{background:'rgba(255,255,255,.02)',border:`1px solid rgba(255,255,255,.04)`,borderRadius:'12px 12px 12px 4px',padding:'12px 14px',maxWidth:'90%'}}>
          <p style={{fontSize:12,color:'rgba(255,255,255,.6)',lineHeight:1.6,margin:'0 0 10px'}}>Here is a staffing plan for the 3-day activation:</p>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[
              {role:'Project Manager',name:'You (KT)',days:'3 days',rate:'--'},
              {role:'Creative Director',name:'Jordan R.',days:'3 days',rate:'$2,400/day'},
              {role:'Production Coordinator',name:'Ava M.',days:'3 days',rate:'$900/day'},
              {role:'AV Tech Lead',name:'From Prism AV',days:'2 days',rate:'Included in AV bid'},
              {role:'Brand Ambassadors',name:'6 staff',days:'1 day (show day)',rate:'$800/ea'},
            ].map((s,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'130px 100px 80px 1fr',gap:6,fontSize:10,padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
              <span style={{color:T.gold,fontWeight:600}}>{s.role}</span>
              <span style={{color:'rgba(255,255,255,.5)'}}>{s.name}</span>
              <span style={{color:'rgba(255,255,255,.25)',fontFamily:T.mono}}>{s.days}</span>
              <span style={{color:'rgba(255,255,255,.3)',fontFamily:T.mono}}>{s.rate}</span>
            </div>)}
          </div>
          <div style={{marginTop:10,padding:'8px 10px',borderRadius:6,background:'rgba(148,163,184,.05)',border:`1px solid ${T.border}`,fontSize:10,color:T.dim,lineHeight:1.5}}>
            Estimated staffing cost: <span style={{color:T.cream,fontFamily:T.mono,fontWeight:600}}>$18,600</span>. Want me to add these as line items in the budget?
          </div>
        </div>
      </div>
      {/* Input */}
      <div style={{display:'flex',gap:8,alignItems:'center',padding:'10px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
        <span style={{fontSize:11,color:'rgba(255,255,255,.15)',flex:1}}>Ask Morgan anything about this project...</span>
        <div style={{width:24,height:24,borderRadius:6,background:T.goldSoft,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:12,color:T.gold}}>&#8593;</span>
        </div>
      </div>
    </div>
  </div>;
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ══ MAIN LANDING PAGE ═══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════ */
function LandingPage({onGetStarted}){
  const[scrolled,setScrolled]=useState(false);
  useEffect(()=>{
    document.documentElement.style.overflow='auto';
    document.body.style.overflow='auto';
    document.getElementById('root').style.overflow='auto';
    const h=()=>setScrolled(window.scrollY>40);
    window.addEventListener('scroll',h,{passive:true});
    return()=>{
      document.documentElement.style.overflow='';
      document.body.style.overflow='';
      document.getElementById('root').style.overflow='';
      window.removeEventListener('scroll',h);
    };
  },[]);

  return<div style={{minHeight:'100vh',background:T.bg,fontFamily:T.sans,color:T.cream,overflowX:'hidden'}}>
    {/* ── Accent gradient line ── */}
    <div style={{position:'fixed',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${T.gold},${T.cyan},${T.magenta},${T.pos})`,opacity:.4,zIndex:200}}/>

    {/* ── Nav ── */}
    <nav style={{position:'fixed',top:2,left:0,right:0,zIndex:100,padding:'0 clamp(16px,4vw,32px)',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',background:scrolled?'rgba(8,8,12,.92)':'transparent',backdropFilter:scrolled?'blur(24px)':'none',borderBottom:scrolled?`1px solid ${T.border}`:'none',transition:'all .3s'}}>
      <ESWordmark height={16} color={T.cream}/>
      <button onClick={onGetStarted} style={{padding:'8px 20px',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:T.goldSoft,color:T.gold,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none'}}>Sign In</button>
    </nav>

    {/* ══════════════════════════════════════════════════════════════ */}
    {/* ── SECTION 1: HERO ─────────────────────────────────────────── */}
    {/* ══════════════════════════════════════════════════════════════ */}
    <header style={{maxWidth:1200,margin:'0 auto',padding:'140px clamp(20px,5vw,40px) 80px'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(40px,5vw,80px)',alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.gold,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:24,fontFamily:T.sans}}>Production Management</div>
            <h1 style={{fontSize:'clamp(36px,5.5vw,64px)',fontWeight:400,lineHeight:1.05,letterSpacing:'-0.035em',marginBottom:28,color:T.cream,fontFamily:T.serif}}>
              The production tool<br/>you wish you had<br/>on your last show.
            </h1>
            <p style={{fontSize:'clamp(14px,1.2vw,17px)',color:T.dim,lineHeight:1.75,marginBottom:40,maxWidth:460}}>
              Budgets, timelines, vendors, client deliverables, and an AI that actually understands production. Morgan handles the ops so you can focus on the experience.
            </p>
            <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
              <button onClick={onGetStarted} style={{padding:'14px 36px',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:T.goldSoft,color:T.gold,fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:T.sans,transition:'all .25s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 24px rgba(148,163,184,.15)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>Start Free</button>
            </div>
          </div>
          {/* Hero product UI */}
          <div style={{display:'flex',justifyContent:'center'}}>
            <HeroBudgetUI/>
          </div>
        </div>
      </Fade>
    </header>

    {/* ══════════════════════════════════════════════════════════════ */}
    {/* ── SECTION 2: STATEMENT ─────────────────────────────────────── */}
    {/* ══════════════════════════════════════════════════════════════ */}
    <section style={{padding:'100px clamp(20px,5vw,40px)'}}>
      <Fade>
        <div style={{maxWidth:1000,margin:'0 auto',textAlign:'center'}}>
          <h2 style={{fontSize:'clamp(28px,4.5vw,56px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.03em',fontFamily:T.serif,color:T.cream}}>
            Spreadsheets don&rsquo;t know what a load-in is.<br/>
            <span style={{color:T.dim}}>Morgan does.</span>
          </h2>
        </div>
      </Fade>
    </section>

    <Rule/>

    {/* ══════════════════════════════════════════════════════════════ */}
    {/* ── SECTION 3: FEATURES ─────────────────────────────────────── */}
    {/* ══════════════════════════════════════════════════════════════ */}
    <section id="features" style={{maxWidth:1200,margin:'0 auto',padding:'100px clamp(20px,5vw,40px)'}}>

      {/* ── Feature 1: Budget ── */}
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center',marginBottom:140}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.amber,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:16}}>Budgets & Margins</div>
            <h3 style={{fontSize:'clamp(24px,3vw,40px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.025em',fontFamily:T.serif,marginBottom:16}}>
              Every dollar.<br/>Every margin.<br/>In real time.
            </h3>
            <p style={{fontSize:14,color:T.dim,lineHeight:1.75,maxWidth:400}}>
              Client price, actual cost, and your margin on every single line item. Enter one side and the other auto-calculates. Category subtotals, agency fees, and a grand total that updates as you build. Export to PDF, XLSX, or share directly.
            </p>
          </div>
          <div style={{display:'flex',justifyContent:'center'}}>
            <HeroBudgetUI/>
          </div>
        </div>
      </Fade>

      {/* ── Feature 2: Timeline ── */}
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center',marginBottom:140}}>
          <div style={{order:1}}>
            <TimelineMockup/>
          </div>
          <div style={{order:0}}>
            <div style={{fontSize:11,fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:16}}>Timeline & Tasks</div>
            <h3 style={{fontSize:'clamp(24px,3vw,40px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.025em',fontFamily:T.serif,marginBottom:16}}>
              From contract<br/>to load-in.<br/>Nothing falls through.
            </h3>
            <p style={{fontSize:14,color:T.dim,lineHeight:1.75,maxWidth:400}}>
              Every task, every deadline, every owner. Track status from kickoff to wrap. Drag to reschedule, assign team members, and see the whole production at a glance. Syncs with Google Calendar.
            </p>
          </div>
        </div>
      </Fade>

      {/* ── Feature 3: Client Sharing ── */}
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center',marginBottom:140}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.coral,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:16}}>Client Sharing</div>
            <h3 style={{fontSize:'clamp(24px,3vw,40px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.025em',fontFamily:T.serif,marginBottom:16}}>
              Polished estimates.<br/>One click.
            </h3>
            <p style={{fontSize:14,color:T.dim,lineHeight:1.75,maxWidth:400}}>
              Generate a clean, client-facing estimate that hides your margins and shows only what they need to see. Send via email or shareable link. Track when they open it.
            </p>
          </div>
          <div style={{display:'flex',justifyContent:'center'}}>
            <ClientShareMockup/>
          </div>
        </div>
      </Fade>

      {/* ── Feature 4: AI ── */}
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center'}}>
          <div style={{order:1}}>
            <AIChatMockup/>
          </div>
          <div style={{order:0}}>
            <div style={{fontSize:11,fontWeight:700,color:C.cyan,textTransform:'uppercase',letterSpacing:'.15em',marginBottom:16}}>Morgan AI</div>
            <h3 style={{fontSize:'clamp(24px,3vw,40px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.025em',fontFamily:T.serif,marginBottom:16}}>
              An AI that doesn&rsquo;t<br/>just talk.
            </h3>
            <p style={{fontSize:14,color:T.dim,lineHeight:1.75,maxWidth:400}}>
              Morgan reads your entire project — budget, timeline, vendors, everything. Ask it to staff a team, flag overspend, add line items, or draft a run-of-show. It suggests actions. You approve them.
            </p>
          </div>
        </div>
      </Fade>
    </section>

    <Rule/>

    {/* ══════════════════════════════════════════════════════════════ */}
    {/* ── SECTION 4: SOCIAL PROOF / QUOTE ─────────────────────────── */}
    {/* ══════════════════════════════════════════════════════════════ */}
    <section style={{padding:'120px clamp(20px,5vw,40px)'}}>
      <Fade>
        <div style={{maxWidth:720,margin:'0 auto',textAlign:'center'}}>
          <div style={{fontSize:72,color:'rgba(255,255,255,.06)',fontFamily:T.serif,lineHeight:1,marginBottom:-20,userSelect:'none'}}>&ldquo;</div>
          <p style={{fontSize:'clamp(18px,2.2vw,26px)',fontWeight:400,color:T.dimH,lineHeight:1.7,fontFamily:T.serif,marginBottom:32}}>
            We built Morgan because every production tool we tried was either built for software teams or glorified spreadsheets. We needed something that thinks the way producers think.
          </p>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
            <MorganIsotype size={20} color={T.dim}/>
            <span style={{fontSize:13,color:T.dim,letterSpacing:'.02em'}}>The team at Early Spring &mdash; Brooklyn, NY</span>
          </div>
        </div>
      </Fade>
    </section>

    <Rule/>

    {/* ══════════════════════════════════════════════════════════════ */}
    {/* ── SECTION 5: FINAL CTA ────────────────────────────────────── */}
    {/* ══════════════════════════════════════════════════════════════ */}
    <section style={{padding:'120px clamp(20px,5vw,40px) 140px'}}>
      <Fade>
        <div style={{maxWidth:700,margin:'0 auto',textAlign:'center'}}>
          <h2 style={{fontSize:'clamp(32px,5vw,56px)',fontWeight:400,lineHeight:1.1,letterSpacing:'-0.035em',fontFamily:T.serif,marginBottom:20}}>
            Your next show<br/>starts here.
          </h2>
          <p style={{fontSize:16,color:T.dim,marginBottom:40,lineHeight:1.7}}>
            Stop producing out of spreadsheets. Start producing out of Morgan.
          </p>
          <button onClick={onGetStarted} style={{padding:'16px 48px',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:T.goldSoft,color:T.gold,fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:T.sans,transition:'all .25s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 12px 32px rgba(148,163,184,.15)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>Start Free</button>
        </div>
      </Fade>
    </section>

    {/* ══════════════════════════════════════════════════════════════ */}
    {/* ── FOOTER ──────────────────────────────────────────────────── */}
    {/* ══════════════════════════════════════════════════════════════ */}
    <footer style={{borderTop:`1px solid ${T.border}`,padding:'32px clamp(20px,5vw,40px)'}}>
      <div style={{maxWidth:1200,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <MorganIsotype size={18} color={T.dim}/>
          <span style={{fontSize:11,color:'rgba(255,255,255,.2)'}}>Early Spring LLC</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <a href="/privacy" style={{fontSize:11,color:'rgba(255,255,255,.2)',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.2)'}>Privacy Policy</a>
          <a href="/terms" style={{fontSize:11,color:'rgba(255,255,255,.2)',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.2)'}>Terms of Service</a>
        </div>
        <span style={{fontSize:10,color:'rgba(255,255,255,.15)'}}>© 2026 Early Spring LLC</span>
      </div>
    </footer>

    {/* ── Responsive overrides ── */}
    <style>{`
      @media(max-width:768px){
        .grid-responsive{grid-template-columns:1fr !important;}
        .grid-responsive>*{order:0 !important;}
      }
    `}</style>
  </div>;
}

export default LandingPage;
