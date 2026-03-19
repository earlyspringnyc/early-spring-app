import { useState, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganIsotype } from '../components/brand/MorganLogo.jsx';

/* ── Scroll-triggered fade ── */
function useFadeIn(threshold=.1){
  const ref=useRef(null);const[vis,setVis]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting)setVis(true)},{threshold});obs.observe(el);return()=>obs.disconnect()},[]);
  return{ref,style:{opacity:vis?1:0,transform:vis?'none':'translateY(20px)',transition:'opacity .8s cubic-bezier(.4,0,.2,1), transform .8s cubic-bezier(.4,0,.2,1)'}};
}
function Fade({children,style:sx={},delay=0,...p}){const{ref,style}=useFadeIn();return<div ref={ref} style={{...style,transitionDelay:`${delay}s`,...sx}} {...p}>{children}</div>}

/* ── Accent colors ── */
const C={amber:'#F59E0B',teal:'#14B8A6',purple:'#8B5CF6',coral:'#F47264',cyan:'#06B6D4',emerald:'#10B981'};

/* ════════════════════════════════════════════════════════════════════
   PRODUCT UI MOCKUPS — realistic Neon Drift data
   ════════════════════════════════════════════════════════════════════ */

/* ── Animated Dashboard — cards shuffle and appear ── */
function DashboardHero(){
  const[step,setStep]=useState(0);
  const totalSteps=4;
  useEffect(()=>{
    const t=setInterval(()=>setStep(s=>(s+1)%totalSteps),2800);
    return()=>clearInterval(t);
  },[]);

  const fmt=n=>'$'+n.toLocaleString();

  // Card definitions — position changes per step
  const allCards=[
    {id:'budget',label:'Client Budget',value:fmt(481000),color:C.amber,size:1},
    {id:'total',label:'Project Total',value:fmt(387450),color:C.teal,size:1},
    {id:'tasks',label:'Tasks',value:'12 / 34',sub:'35% complete',color:C.cyan,size:1},
    {id:'vendors',label:'Owed to Vendors',value:fmt(142800),color:C.coral,size:1},
    {id:'profit',label:'Net Profit',value:fmt(68200),color:C.emerald,size:1},
    {id:'margin',label:'Blended Margin',value:'17.6%',color:C.purple,size:1},
    {id:'countdown',label:'Event Countdown',value:'87 days',sub:'Jun 14, 2026',color:C.amber,size:1},
    {id:'meetings',label:'Upcoming Meetings',value:'3 this week',color:C.cyan,size:1},
  ];

  // Which cards are visible at each step (progressively adds cards)
  const visibleIds=[
    ['budget','total','tasks','vendors'],
    ['budget','total','tasks','vendors','profit','margin'],
    ['budget','total','vendors','profit','margin','countdown','tasks','meetings'],
    ['total','budget','profit','margin','vendors','tasks','countdown','meetings'],
  ];

  const visible=visibleIds[step];
  const cards=visible.map(id=>allCards.find(c=>c.id===id)).filter(Boolean);

  return<div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden',fontFamily:T.sans,width:'100%',maxWidth:900}}>
    {/* Dashboard header */}
    <div style={{padding:'14px 20px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div style={{fontSize:15,fontWeight:600,color:T.cream}}>Neon Drift Summer Activation</div>
        <div style={{fontSize:11,color:T.dim,marginTop:2}}>NeonDrift Gaming · Jun 14, 2026</div>
      </div>
      <div style={{display:'flex',gap:6}}>
        {['Dashboard','Budget','Production'].map((t,i)=><span key={t} style={{fontSize:9,padding:'4px 10px',borderRadius:10,background:i===0?T.surfEl:'transparent',color:i===0?T.cream:T.dim,fontWeight:i===0?600:400}}>{t}</span>)}
      </div>
    </div>
    {/* Animated card grid */}
    <div style={{padding:16,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,minHeight:220}}>
      {cards.map((c,i)=><div key={c.id} style={{
        padding:'18px 16px',borderRadius:10,
        background:`${c.color}06`,border:`1px solid ${c.color}18`,borderLeft:`3px solid ${c.color}`,
        animation:'cardIn .5s ease-out forwards',
        animationDelay:`${i*0.08}s`,
        opacity:0,
      }}>
        <div style={{fontSize:8,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>{c.label}</div>
        <div style={{fontSize:22,fontWeight:700,color:c.color,fontFamily:T.mono,lineHeight:1}}>{c.value}</div>
        {c.sub&&<div style={{fontSize:9,color:T.dim,marginTop:4}}>{c.sub}</div>}
      </div>)}
    </div>
    <style>{`@keyframes cardIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}`}</style>
  </div>;
}

function BudgetUI(){
  const cats=[
    {name:'Venue',accent:C.amber,items:[
      {name:'Venue Buyout',vendor:'Terminal 5',actual:45000,margin:.18},
      {name:'Security',vendor:'Terminal 5',actual:8200,margin:.10},
    ]},
    {name:'Staging & AV',accent:C.purple,items:[
      {name:'LED Wall 16×9',vendor:'Prism AV',actual:12500,margin:.15},
      {name:'Sound System + DJ',vendor:'Prism AV',actual:8400,margin:.15},
      {name:'Lighting Design',vendor:'Prism AV',actual:9800,margin:.18},
      {name:'Gaming Stations',vendor:'Neon Rentals',detail:'8 × $2,400',actual:19200,margin:.15},
    ]},
    {name:'Fabrication & Scenic',accent:C.teal,items:[
      {name:'Custom Entry Arch',vendor:'Atlas Staging',actual:14500,margin:.20},
      {name:'Branded Bar Wrap',vendor:'Atlas Staging',actual:6800,margin:.15},
      {name:'Neon Signage',vendor:'Glow Works',actual:8200,margin:.18},
    ]},
    {name:'Content & Capture',accent:C.coral,items:[
      {name:'Photography',vendor:'Lens & Light',actual:4500,margin:.15},
      {name:'Videography',vendor:'Lens & Light',actual:6500,margin:.15},
    ]},
  ];
  const fmt=n=>'$'+n.toLocaleString();
  let totalActual=0,totalClient=0;
  cats.forEach(c=>c.items.forEach(it=>{totalActual+=it.actual;totalClient+=it.actual*(1+it.margin)}));

  return<div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden',fontFamily:T.sans,maxWidth:680}}>
    <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div style={{fontSize:14,fontWeight:600,color:T.cream}}>Neon Drift Summer Activation</div>
        <div style={{fontSize:11,color:T.dim,marginTop:2}}>NeonDrift Gaming · Jun 14, 2026</div>
      </div>
      <div style={{textAlign:'right'}}>
        <div style={{fontSize:9,color:T.dim,textTransform:'uppercase',letterSpacing:'.06em'}}>Grand Total</div>
        <div style={{fontSize:20,fontWeight:700,color:C.amber,fontFamily:T.mono}}>{fmt(Math.round(totalClient*1.20))}</div>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'2fr 1.2fr .8fr .8fr',padding:'8px 20px',borderBottom:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
      {['Item','Vendor','Actual','Client'].map((h,i)=><span key={i} style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.08em',textAlign:i>1?'right':'left'}}>{h}</span>)}
    </div>
    {cats.map(c=><div key={c.name}>
      <div style={{padding:'10px 20px',borderBottom:`1px solid ${T.border}`,background:`${c.accent}06`,borderLeft:`3px solid ${c.accent}`}}>
        <span style={{fontSize:11,fontWeight:600,color:T.cream,textTransform:'uppercase',letterSpacing:'.06em'}}>{c.name}</span>
      </div>
      {c.items.map(it=>{const client=it.actual*(1+it.margin);return<div key={it.name} style={{display:'grid',gridTemplateColumns:'2fr 1.2fr .8fr .8fr',padding:'8px 20px',borderBottom:`1px solid ${T.border}`}}>
        <div>
          <span style={{fontSize:12,color:T.cream}}>{it.name}</span>
          {it.detail&&<span style={{fontSize:10,color:T.dim,marginLeft:6,fontFamily:T.mono}}>{it.detail}</span>}
        </div>
        <span style={{fontSize:11,color:T.dim}}>{it.vendor}</span>
        <span style={{fontSize:11,fontFamily:T.mono,color:T.dim,textAlign:'right'}}>{fmt(it.actual)}</span>
        <span style={{fontSize:11,fontFamily:T.mono,color:C.amber,textAlign:'right'}}>{fmt(Math.round(client))}</span>
      </div>})}
    </div>)}
  </div>;
}

function TimelineUI(){
  const tasks=[
    {name:'Confirm Terminal 5 contract',date:'Apr 28',status:'done',cat:'Venue'},
    {name:'Submit noise & street permits',date:'May 1',status:'done',cat:'Permits'},
    {name:'Finalize floor plan + gaming layout',date:'May 5',status:'progress',cat:'Design'},
    {name:'AV walkthrough @ Terminal 5',date:'May 12',status:'upcoming',cat:'Production'},
    {name:'Gaming station specs to Neon Rentals',date:'May 14',status:'upcoming',cat:'Production'},
    {name:'Client kickoff deck due',date:'May 16',status:'upcoming',cat:'Client'},
    {name:'Neon signage proof from Glow Works',date:'May 20',status:'upcoming',cat:'Fabrication'},
    {name:'Final vendor payments',date:'Jun 7',status:'upcoming',cat:'Finance'},
  ];
  const sc={done:C.emerald,progress:C.cyan,upcoming:T.dim};
  const sl={done:'Done',progress:'In Progress',upcoming:'To Do'};
  return<div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden',fontFamily:T.sans,maxWidth:560}}>
    <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{fontSize:14,fontWeight:600,color:T.cream}}>Production Timeline</div>
      <div style={{fontSize:11,color:T.dim}}>{tasks.filter(t=>t.status==='done').length}/{tasks.length} complete</div>
    </div>
    {tasks.map(t=><div key={t.name} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',borderBottom:`1px solid ${T.border}`}}>
      <div style={{width:7,height:7,borderRadius:'50%',background:sc[t.status],flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:t.status==='done'?T.dim:T.cream,textDecoration:t.status==='done'?'line-through':'none'}}>{t.name}</div>
      </div>
      <span style={{fontSize:10,color:T.dim,fontFamily:T.mono,flexShrink:0}}>{t.date}</span>
      <span style={{fontSize:8,fontWeight:700,padding:'2px 8px',borderRadius:10,background:`${sc[t.status]}15`,color:sc[t.status],textTransform:'uppercase',letterSpacing:'.04em',flexShrink:0}}>{sl[t.status]}</span>
    </div>)}
  </div>;
}

function AIchatUI(){
  return<div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden',fontFamily:T.sans,maxWidth:560}}>
    <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.border}`}}>
      <div style={{fontSize:14,fontWeight:600,color:T.cream}}>Morgan AI</div>
    </div>
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
      {/* User message */}
      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <div style={{maxWidth:'75%',padding:'10px 14px',borderRadius:'12px 12px 4px 12px',background:'rgba(148,163,184,.08)',border:`1px solid rgba(148,163,184,.1)`,fontSize:12,lineHeight:1.6,color:T.cream}}>
          Staff the agency team for the Neon Drift 3-day activation
        </div>
      </div>
      {/* AI response */}
      <div style={{display:'flex',justifyContent:'flex-start'}}>
        <div style={{maxWidth:'85%',padding:'10px 14px',borderRadius:'12px 12px 12px 4px',background:'rgba(255,255,255,.03)',border:`1px solid ${T.border}`,fontSize:12,lineHeight:1.7,color:T.dimH}}>
          <div style={{fontSize:9,fontWeight:600,color:C.cyan,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Morgan</div>
          For a 3-day activation at this budget level, here's what I'd staff:<br/><br/>
          <strong style={{color:T.cream}}>Account Lead</strong> — 8 days @ $950/day<br/>
          <strong style={{color:T.cream}}>Creative Director</strong> — 5 days @ $1,200/day<br/>
          <strong style={{color:T.cream}}>Production Manager</strong> — 12 days @ $800/day<br/>
          <strong style={{color:T.cream}}>Designer</strong> — 6 days @ $750/day<br/><br/>
          Agency cost: <span style={{color:C.amber,fontFamily:T.mono}}>$24,950</span> · With 20% fee: <span style={{color:C.amber,fontFamily:T.mono}}>$29,940</span>
        </div>
      </div>
      {/* Action cards */}
      <div style={{padding:'10px 12px',borderRadius:8,background:'rgba(255,255,255,.02)',border:`1px solid ${T.border}`}}>
        <div style={{fontSize:9,fontWeight:600,color:C.amber,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Suggested Actions (4)</div>
        {['Account Lead — 8d @ $950','Creative Director — 5d @ $1,200','Production Manager — 12d @ $800','Designer — 6d @ $750'].map((a,i)=>
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:i<3?`1px solid ${T.border}`:'none'}}>
            <div style={{width:5,height:5,borderRadius:'50%',background:C.teal}}/>
            <span style={{flex:1,fontSize:11,color:T.cream}}>Add role: {a}</span>
            <span style={{fontSize:9,padding:'3px 10px',borderRadius:12,background:`${C.teal}12`,color:C.teal,fontWeight:600,border:`1px solid ${C.teal}30`}}>Apply</span>
          </div>)}
      </div>
    </div>
  </div>;
}

/* ════════════════════════════════════════════════════════════════════
   LANDING PAGE
   ════════════════════════════════════════════════════════════════════ */

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

    {/* ── Nav ── */}
    <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,padding:'0 clamp(20px,4vw,48px)',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',background:scrolled?'rgba(8,8,12,.92)':'transparent',backdropFilter:scrolled?'blur(24px)':'none',borderBottom:scrolled?`1px solid ${T.border}`:'none',transition:'all .3s'}}>
      <ESWordmark height={16} color={T.cream}/>
      <button onClick={onGetStarted} style={{padding:'8px 22px',borderRadius:T.rS,border:`1px solid ${T.borderGlow}`,background:'transparent',color:T.cream,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}>Sign In</button>
    </nav>

    {/* ═══════════════════════════════════════════════════════════════
        HERO — headline + product UI
        ═══════════════════════════════════════════════════════════════ */}
    <header style={{maxWidth:1200,margin:'0 auto',padding:'160px clamp(20px,5vw,48px) 120px'}}>
      <Fade>
        <div style={{textAlign:'center',maxWidth:700,margin:'0 auto 80px'}}>
          <h1 style={{fontSize:'clamp(40px,6vw,72px)',fontWeight:400,lineHeight:1.05,letterSpacing:'-0.04em',fontFamily:T.serif,marginBottom:24}}>
            Brief to build.<br/>One tool.
          </h1>
          <p style={{fontSize:'clamp(15px,1.3vw,18px)',color:T.dim,lineHeight:1.7,maxWidth:520,margin:'0 auto 40px'}}>
            Budgets, production, creative, and finance — from the pitch deck to the run of show. Built by producers who got tired of stitching it together in spreadsheets.
          </p>
          <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
            <button onClick={onGetStarted} style={{padding:'14px 40px',borderRadius:T.rS,border:'none',background:T.cream,color:T.bg,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 30px rgba(255,255,255,.08)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>Start Free</button>
          </div>
        </div>
      </Fade>
      <Fade delay={.15}>
        <div style={{display:'flex',justifyContent:'center'}}>
          <DashboardHero/>
        </div>
      </Fade>
    </header>

    {/* ═══════════════════════════════════════════════════════════════
        STATEMENT
        ═══════════════════════════════════════════════════════════════ */}
    <section style={{borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`}}>
      <Fade>
        <div style={{maxWidth:900,margin:'0 auto',padding:'80px clamp(20px,5vw,48px)',textAlign:'center'}}>
          <p style={{fontSize:'clamp(20px,2.5vw,32px)',fontWeight:400,lineHeight:1.5,fontFamily:T.serif,color:T.dimH}}>
            Spreadsheets don't know what a load-in is.<br/>
            <span style={{color:T.cream}}>Morgan does.</span>
          </p>
        </div>
      </Fade>
    </section>

    {/* ═══════════════════════════════════════════════════════════════
        FEATURES — alternating text + product UI
        ═══════════════════════════════════════════════════════════════ */}

    {/* ── Budget ── */}
    <section style={{maxWidth:1200,margin:'0 auto',padding:'120px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(40px,6vw,100px)',alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.amber,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:16}}>Budgets & Margins</div>
            <h2 style={{fontSize:'clamp(26px,3.5vw,44px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.03em',fontFamily:T.serif,marginBottom:20}}>
              Every line item.<br/>Every margin.<br/>In real time.
            </h2>
            <p style={{fontSize:15,color:T.dim,lineHeight:1.7}}>
              Client price and actual cost on every item. Enter one — the other calculates. Toggle items on and off to model scenarios without losing data. Multiple budget versions in tabs. Auto-syncs to Google Sheets.
            </p>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <BudgetUI/>
          </div>
        </div>
      </Fade>
    </section>

    <div style={{maxWidth:1200,margin:'0 auto',padding:'0 clamp(20px,5vw,48px)'}}><div style={{height:1,background:T.border}}/></div>

    {/* ── Timeline ── */}
    <section style={{maxWidth:1200,margin:'0 auto',padding:'120px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(40px,6vw,100px)',alignItems:'center'}}>
          <div style={{order:1}}>
            <TimelineUI/>
          </div>
          <div style={{order:0}}>
            <div style={{fontSize:11,fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:16}}>Production</div>
            <h2 style={{fontSize:'clamp(26px,3.5vw,44px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.03em',fontFamily:T.serif,marginBottom:20}}>
              Calendar. Tasks.<br/>Gantt. All linked.
            </h2>
            <p style={{fontSize:15,color:T.dim,lineHeight:1.7}}>
              Click a date to add a task. Drag across days for multi-day events. Toggle between calendar, Gantt, and list. Google Calendar events sync in automatically. Milestones flow directly to the client timeline.
            </p>
          </div>
        </div>
      </Fade>
    </section>

    <div style={{maxWidth:1200,margin:'0 auto',padding:'0 clamp(20px,5vw,48px)'}}><div style={{height:1,background:T.border}}/></div>

    {/* ── AI ── */}
    <section style={{maxWidth:1200,margin:'0 auto',padding:'120px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(40px,6vw,100px)',alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.cyan,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:16}}>Morgan AI</div>
            <h2 style={{fontSize:'clamp(26px,3.5vw,44px)',fontWeight:400,lineHeight:1.15,letterSpacing:'-0.03em',fontFamily:T.serif,marginBottom:20}}>
              An AI that doesn't<br/>just talk.
            </h2>
            <p style={{fontSize:15,color:T.dim,lineHeight:1.7}}>
              Morgan reads your entire project — budget, timeline, vendors, files. Ask it to add line items, staff the agency team, flag risks, or review creative assets. It suggests actions. You apply them with one click.
            </p>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <AIchatUI/>
          </div>
        </div>
      </Fade>
    </section>

    <div style={{maxWidth:1200,margin:'0 auto',padding:'0 clamp(20px,5vw,48px)'}}><div style={{height:1,background:T.border}}/></div>

    {/* ── Client + Vendors + Creative — compact grid ── */}
    <section style={{maxWidth:1200,margin:'0 auto',padding:'120px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:20}}>
          <div style={{padding:'32px 28px',borderRadius:12,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.coral,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:14}}>Client Portal</div>
            <h3 style={{fontSize:20,fontWeight:400,fontFamily:T.serif,lineHeight:1.3,marginBottom:12}}>Estimates, decks, files. One link.</h3>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Send polished production estimates, timelines, and creative decks. Track client contacts and meeting notes. Share via email with a personal message or a single link.</p>
          </div>
          <div style={{padding:'32px 28px',borderRadius:12,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.purple,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:14}}>Vendors</div>
            <h3 style={{fontSize:20,fontWeight:400,fontFamily:T.serif,lineHeight:1.3,marginBottom:12}}>Your vendor rolodex, leveled up.</h3>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Full profiles with contacts, addresses, and financials. Upload invoices — AI reads the amount and due date. W-9 tracking, payment status, and budget line item linking built in.</p>
          </div>
          <div style={{padding:'32px 28px',borderRadius:12,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.emerald,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:14}}>Creative</div>
            <h3 style={{fontSize:20,fontWeight:400,fontFamily:T.serif,lineHeight:1.3,marginBottom:12}}>Review, comment, approve.</h3>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Upload renders, decks, and design files. Page-by-page PDF viewer with commenting. Figma and Canva embeds. Track approval status across rounds and versions.</p>
          </div>
        </div>
      </Fade>
    </section>

    {/* ═══════════════════════════════════════════════════════════════
        QUOTE
        ═══════════════════════════════════════════════════════════════ */}
    <section style={{borderTop:`1px solid ${T.border}`}}>
      <Fade>
        <div style={{maxWidth:700,margin:'0 auto',padding:'100px clamp(20px,5vw,48px)',textAlign:'center'}}>
          <p style={{fontSize:'clamp(18px,2vw,24px)',fontWeight:400,fontFamily:T.serif,color:T.dimH,lineHeight:1.7,marginBottom:28}}>
            "We built Morgan because every production tool we tried was either built for software teams or built for weddings. Neither works when you're producing a brand activation with a $300K budget and 15 vendors."
          </p>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
            <MorganIsotype size={18} color={T.dim}/>
            <span style={{fontSize:12,color:T.dim}}>Early Spring · Brooklyn, NY</span>
          </div>
        </div>
      </Fade>
    </section>

    {/* ═══════════════════════════════════════════════════════════════
        CTA
        ═══════════════════════════════════════════════════════════════ */}
    <section style={{borderTop:`1px solid ${T.border}`}}>
      <Fade>
        <div style={{maxWidth:600,margin:'0 auto',padding:'120px clamp(20px,5vw,48px)',textAlign:'center'}}>
          <h2 style={{fontSize:'clamp(28px,4vw,48px)',fontWeight:400,fontFamily:T.serif,letterSpacing:'-0.03em',marginBottom:20}}>Your next show starts here.</h2>
          <p style={{fontSize:15,color:T.dim,marginBottom:36}}>Free to start. No credit card.</p>
          <button onClick={onGetStarted} style={{padding:'14px 48px',borderRadius:T.rS,border:'none',background:T.cream,color:T.bg,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 30px rgba(255,255,255,.08)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>Start Free</button>
        </div>
      </Fade>
    </section>

    {/* ═══════════════════════════════════════════════════════════════
        FOOTER
        ═══════════════════════════════════════════════════════════════ */}
    <footer style={{borderTop:`1px solid ${T.border}`,padding:'32px clamp(20px,5vw,48px)',display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:1200,margin:'0 auto',flexWrap:'wrap',gap:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <MorganIsotype size={16} color={T.dim}/>
        <span style={{fontSize:11,color:'rgba(255,255,255,.2)'}}>© 2026 Early Spring LLC</span>
      </div>
      <div style={{display:'flex',gap:20}}>
        <a href="/privacy" style={{fontSize:11,color:'rgba(255,255,255,.2)',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.2)'}>Privacy</a>
        <a href="/terms" style={{fontSize:11,color:'rgba(255,255,255,.2)',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.2)'}>Terms</a>
      </div>
    </footer>

    {/* ── Mobile responsive ── */}
    <style>{`
      @media(max-width:768px){
        .grid-responsive{grid-template-columns:1fr!important}
        .grid-responsive>*{order:0!important}
      }
    `}</style>
  </div>;
}

export default LandingPage;
