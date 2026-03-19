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
   INTERACTIVE PRODUCT MOCKUPS — hover to see them come alive
   ════════════════════════════════════════════════════════════════════ */

/* ── Dashboard Hero — full app layout with sidebar + animated cards ── */
function DashboardHero(){
  const[step,setStep]=useState(0);
  const[activeNav,setActiveNav]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setStep(s=>s+1),3000);return()=>clearInterval(t)},[]);
  const fmt=n=>'$'+n.toLocaleString();
  const navItems=[
    {icon:'◐',label:'Dashboard',active:true},
    {icon:'◈',label:'Budget'},
    {icon:'▤',label:'Production'},
    {icon:'◆',label:'Vendors'},
    {icon:'▨',label:'Creative'},
    {icon:'◉',label:'ES AI'},
  ];
  const toolItems=[
    {icon:'◎',label:'Client: NeonDrift'},
    {icon:'◇',label:'Finance'},
    {icon:'▶',label:'Run of Show'},
  ];

  return<div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,overflow:'hidden',fontFamily:T.sans,width:'100%',maxWidth:1060,display:'flex',height:520}}>
    {/* ── Sidebar ── */}
    <div style={{width:180,borderRight:`1px solid ${T.border}`,display:'flex',flexDirection:'column',flexShrink:0,background:T.bg}}>
      {/* Logo */}
      <div style={{padding:'16px 14px',display:'flex',alignItems:'center',gap:8}}>
        <MorganIsotype size={20} color={T.gold}/>
        <ESWordmark height={11} color={T.cream}/>
      </div>
      {/* Project name */}
      <div style={{padding:'0 14px 12px'}}>
        <div style={{fontSize:10,fontWeight:600,color:T.cream,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Neon Drift Summer</div>
        <div style={{fontSize:9,color:T.dim,marginTop:1}}>NeonDrift Gaming</div>
      </div>
      {/* Main nav */}
      <nav style={{flex:1,padding:'0 6px',display:'flex',flexDirection:'column',gap:1}}>
        {navItems.map((n,i)=><div key={n.label} onMouseEnter={()=>setActiveNav(i)} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',borderRadius:6,background:activeNav===i?T.surfEl:'transparent',color:activeNav===i?T.cream:T.dim,fontSize:11,cursor:'pointer',transition:'all .15s'}}>
          <span style={{fontSize:13,width:16,textAlign:'center',opacity:activeNav===i?1:.4}}>{n.icon}</span>
          <span style={{fontWeight:activeNav===i?500:400}}>{n.label}</span>
        </div>)}
        {/* Divider */}
        <div style={{height:1,background:T.border,margin:'6px 8px'}}/>
        {toolItems.map((n,i)=><div key={n.label} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',borderRadius:6,color:T.dim,fontSize:11}}>
          <span style={{fontSize:13,width:16,textAlign:'center',opacity:.4}}>{n.icon}</span>
          <span>{n.label}</span>
        </div>)}
      </nav>
      {/* Bottom */}
      <div style={{padding:'8px 6px 12px',borderTop:`1px solid ${T.border}`}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',borderRadius:6,color:T.dim,fontSize:11}}>
          <span style={{fontSize:13,width:16,textAlign:'center',opacity:.4}}>◎</span>
          <span>Settings</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',borderRadius:6,color:T.dim,fontSize:11}}>
          <span style={{fontSize:13,width:16,textAlign:'center',opacity:.4}}>☀</span>
          <span>Light</span>
        </div>
      </div>
    </div>
    {/* ── Main content — bento dashboard ── */}
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'auto'}}>
      <div style={{padding:'14px 18px 8px'}}>
        <div style={{fontSize:15,fontWeight:600,color:T.cream}}>Dashboard</div>
        <div style={{fontSize:10,color:T.dim,marginTop:2}}>Neon Drift Summer Activation · Jun 14, 2026</div>
      </div>
      {/* Bento grid — 4 columns, cards span 1 or 2 */}
      <div style={{flex:1,padding:'4px 14px 14px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7,alignContent:'start',gridAutoRows:'min-content'}}>
        {/* Row 1: Budget (2) + Spend (2) */}
        <div key={'budget'+step} style={{gridColumn:'1/3',padding:'12px',borderRadius:7,background:`${C.amber}06`,border:`1px solid ${C.amber}12`,borderLeft:`3px solid ${C.amber}`,animation:'cardPop .4s ease-out forwards',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Client Budget</div>
          <div style={{fontSize:22,fontWeight:700,color:C.amber,fontFamily:T.mono,lineHeight:1}}>{fmt(481000)}</div>
          <div style={{height:3,background:T.surface,borderRadius:2,marginTop:8,overflow:'hidden'}}><div style={{width:'81%',height:'100%',background:`linear-gradient(90deg,${C.amber},${C.teal})`,borderRadius:2}}/></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}><span style={{fontSize:7,color:T.dim}}>81% allocated</span><span style={{fontSize:7,color:T.dim,fontFamily:T.mono}}>{fmt(93550)} remaining</span></div>
        </div>
        <div key={'spend'+step} style={{gridColumn:'3/5',padding:'12px',borderRadius:7,background:`${C.teal}06`,border:`1px solid ${C.teal}12`,borderLeft:`3px solid ${C.teal}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.06s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Project Total</div>
          <div style={{fontSize:22,fontWeight:700,color:C.teal,fontFamily:T.mono,lineHeight:1}}>{fmt(387450)}</div>
          <div style={{fontSize:8,color:T.dim,marginTop:6}}>Production: {fmt(298200)} · Agency: {fmt(89250)}</div>
        </div>

        {/* Row 2: Owed (1) + Due (1) + Tasks (2) */}
        <div key={'owed'+step} style={{padding:'12px',borderRadius:7,background:`${C.coral}06`,border:`1px solid ${C.coral}12`,borderLeft:`3px solid ${C.coral}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.12s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Owed to Vendors</div>
          <div style={{fontSize:16,fontWeight:700,color:C.coral,fontFamily:T.mono,lineHeight:1}}>{fmt(142800)}</div>
        </div>
        <div key={'due'+step} style={{padding:'12px',borderRadius:7,background:`${C.cyan}06`,border:`1px solid ${C.cyan}12`,borderLeft:`3px solid ${C.cyan}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.18s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Due from Client</div>
          <div style={{fontSize:16,fontWeight:700,color:C.cyan,fontFamily:T.mono,lineHeight:1}}>{fmt(195000)}</div>
        </div>
        <div key={'tasks'+step} style={{gridColumn:'3/5',padding:'12px',borderRadius:7,background:`${C.teal}06`,border:`1px solid ${C.teal}12`,borderLeft:`3px solid ${C.teal}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.24s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Tasks</div>
          <div style={{display:'flex',alignItems:'baseline',gap:4}}>
            <span style={{fontSize:16,fontWeight:700,color:C.teal,fontFamily:T.mono}}>16</span>
            <span style={{fontSize:10,color:T.dim,fontFamily:T.mono}}>/ 34</span>
          </div>
          <div style={{height:3,background:T.surface,borderRadius:2,marginTop:6,overflow:'hidden'}}><div style={{width:'47%',height:'100%',background:C.teal,borderRadius:2}}/></div>
        </div>

        {/* Row 3: Prod (1) + Margin (1) + Profit (1) + Countdown (1) */}
        <div key={'prod'+step} style={{padding:'12px',borderRadius:7,background:`rgba(255,255,255,.02)`,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.dim}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.3s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Production Cost</div>
          <div style={{fontSize:14,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{fmt(298200)}</div>
        </div>
        <div key={'margin'+step} style={{padding:'12px',borderRadius:7,background:`${C.purple}06`,border:`1px solid ${C.purple}12`,borderLeft:`3px solid ${C.purple}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.36s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Blended Margin</div>
          <div style={{fontSize:14,fontWeight:700,color:C.purple,fontFamily:T.mono}}>17.6%</div>
        </div>
        <div key={'profit'+step} style={{padding:'12px',borderRadius:7,background:`${C.emerald}06`,border:`1px solid ${C.emerald}12`,borderLeft:`3px solid ${C.emerald}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.42s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Net Profit</div>
          <div style={{fontSize:14,fontWeight:700,color:C.emerald,fontFamily:T.mono}}>{fmt(68200)}</div>
        </div>
        <div key={'countdown'+step} style={{padding:'12px',borderRadius:7,background:`${C.amber}06`,border:`1px solid ${C.amber}12`,borderLeft:`3px solid ${C.amber}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.48s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Event Countdown</div>
          <div style={{fontSize:14,fontWeight:700,color:C.amber,fontFamily:T.mono}}>87 days</div>
          <div style={{fontSize:7,color:T.dim,marginTop:2}}>Jun 14, 2026</div>
        </div>

        {/* Row 4: Donut (2) + Comp (2) */}
        <div key={'donut'+step} style={{gridColumn:'1/3',padding:'12px',borderRadius:7,background:'rgba(255,255,255,.02)',border:`1px solid ${T.border}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.54s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Spend Distribution</div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:48,height:48,borderRadius:'50%',border:`3px solid ${C.purple}50`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{width:34,height:34,borderRadius:'50%',border:`3px solid ${C.teal}40`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{width:20,height:20,borderRadius:'50%',border:`3px solid ${C.amber}35`}}/>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {[{n:'Staging & AV',c:C.purple,v:'34%'},{n:'Venue',c:C.teal,v:'28%'},{n:'Fabrication',c:C.amber,v:'18%'},{n:'Content',c:C.coral,v:'12%'}].map(d=>
                <div key={d.n} style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:4,height:4,borderRadius:1,background:d.c}}/><span style={{fontSize:7,color:T.dim}}>{d.n}</span><span style={{fontSize:7,color:T.dim,fontFamily:T.mono,marginLeft:'auto'}}>{d.v}</span></div>
              )}
            </div>
          </div>
        </div>
        <div key={'weather'+step} style={{padding:'12px',borderRadius:7,background:`${C.cyan}06`,border:`1px solid ${C.cyan}12`,borderLeft:`3px solid ${C.cyan}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.6s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Event Weather</div>
          <div style={{fontSize:18,fontWeight:700,color:C.cyan,fontFamily:T.mono}}>82°F</div>
          <div style={{fontSize:7,color:T.dim,marginTop:2}}>☀ Mostly sunny · Brooklyn, NY</div>
        </div>
        <div key={'timezone'+step} style={{padding:'12px',borderRadius:7,background:'rgba(255,255,255,.02)',border:`1px solid ${T.border}`,animation:'cardPop .4s ease-out forwards',animationDelay:'.66s',opacity:0}}>
          <div style={{fontSize:7,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Time & Timezone</div>
          <div style={{fontSize:14,fontWeight:700,color:T.cream,fontFamily:T.mono}}>2:45 PM</div>
          <div style={{fontSize:7,color:T.dim,marginTop:2}}>America/New_York (EDT)</div>
        </div>
      </div>
    </div>
    <style>{`@keyframes cardPop{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:none}}`}</style>
  </div>;
}

/* ── Budget — numbers type in on hover ── */
function BudgetUI(){
  const[hovered,setHovered]=useState(false);
  const[typingRow,setTypingRow]=useState(-1);
  const[typedVal,setTypedVal]=useState('');
  const items=[
    {name:'Venue Buyout',vendor:'Terminal 5',actual:45000,margin:.18,accent:C.amber},
    {name:'LED Wall 16×9',vendor:'Prism AV',actual:12500,margin:.15,accent:C.purple},
    {name:'Sound System + DJ',vendor:'Prism AV',actual:8400,margin:.15,accent:C.purple},
    {name:'Gaming Stations',vendor:'Neon Rentals',detail:'8 × $2,400',actual:19200,margin:.15,accent:C.purple},
    {name:'Custom Entry Arch',vendor:'Atlas Staging',actual:14500,margin:.20,accent:C.teal},
    {name:'Neon Signage',vendor:'Glow Works',actual:8200,margin:.18,accent:C.teal},
    {name:'Photography',vendor:'Lens & Light',actual:4500,margin:.15,accent:C.coral},
    {name:'Brand Ambassadors',vendor:'Staff Co',detail:'6 × $800',actual:4800,margin:.10,accent:C.coral},
  ];
  useEffect(()=>{
    if(!hovered)return;
    const target='$14,500';let i=0;setTypingRow(4);setTypedVal('');
    const t=setInterval(()=>{if(i<target.length){setTypedVal(target.slice(0,i+1));i++}else{clearInterval(t);setTimeout(()=>{setTypingRow(-1);setTypedVal('')},1200)}},80);
    return()=>clearInterval(t);
  },[hovered]);
  const fmt=n=>'$'+n.toLocaleString();
  const total=items.reduce((a,it)=>a+it.actual*(1+it.margin),0);
  return<div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>{setHovered(false);setTypingRow(-1)}} style={{background:T.bg,border:`1px solid ${hovered?T.borderGlow:T.border}`,borderRadius:12,overflow:'hidden',fontFamily:T.sans,maxWidth:600,transition:'border-color .3s',boxShadow:hovered?'0 8px 40px rgba(0,0,0,.3)':'none'}}>
    <div style={{padding:'12px 16px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontSize:12,fontWeight:600,color:T.cream}}>Production Budget</span>
      <span style={{fontSize:16,fontWeight:700,color:C.amber,fontFamily:T.mono}}>{fmt(Math.round(total*1.2))}</span>
    </div>
    {items.map((it,idx)=>{const client=it.actual*(1+it.margin);const isTyping=typingRow===idx;
      return<div key={it.name} style={{display:'grid',gridTemplateColumns:'1.8fr 1fr .7fr .7fr',padding:'7px 16px',borderBottom:`1px solid ${T.border}`,borderLeft:`3px solid ${isTyping?C.cyan:it.accent}`,background:isTyping?'rgba(125,211,252,.04)':'transparent',transition:'all .2s'}}>
        <div><span style={{fontSize:11,color:T.cream}}>{it.name}</span>{it.detail&&<span style={{fontSize:9,color:T.dim,marginLeft:4,fontFamily:T.mono}}>{it.detail}</span>}</div>
        <span style={{fontSize:10,color:T.dim}}>{it.vendor}</span>
        <span style={{fontSize:10,fontFamily:T.mono,color:T.dim,textAlign:'right'}}>{isTyping?<span style={{color:C.cyan,borderBottom:'1.5px solid '+C.cyan}}>{typedVal}<span style={{animation:'blink 1s infinite'}}>|</span></span>:fmt(it.actual)}</span>
        <span style={{fontSize:10,fontFamily:T.mono,color:C.amber,textAlign:'right'}}>{isTyping?'—':fmt(Math.round(client))}</span>
      </div>})}
    <style>{`@keyframes blink{0%,50%{opacity:1}51%,100%{opacity:0}}`}</style>
  </div>;
}

/* ── Timeline — tasks check off on hover ── */
function TimelineUI(){
  const[hovered,setHovered]=useState(false);
  const[checked,setChecked]=useState(new Set());
  const tasks=[
    {name:'Confirm Terminal 5 contract',date:'Apr 28',done:true},
    {name:'Submit noise & street permits',date:'May 1',done:true},
    {name:'Finalize floor plan + gaming layout',date:'May 5',done:false},
    {name:'AV walkthrough @ Terminal 5',date:'May 12',done:false},
    {name:'Gaming station specs to Neon Rentals',date:'May 14',done:false},
    {name:'Client kickoff deck due',date:'May 16',done:false},
    {name:'Neon signage proof from Glow Works',date:'May 20',done:false},
  ];
  useEffect(()=>{
    if(!hovered){setChecked(new Set());return}
    const timers=[2,3,4].map((idx,i)=>setTimeout(()=>setChecked(s=>{const n=new Set(s);n.add(idx);return n}),(i+1)*600));
    return()=>timers.forEach(clearTimeout);
  },[hovered]);
  return<div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} style={{background:T.bg,border:`1px solid ${hovered?T.borderGlow:T.border}`,borderRadius:12,overflow:'hidden',fontFamily:T.sans,maxWidth:520,transition:'border-color .3s',boxShadow:hovered?'0 8px 40px rgba(0,0,0,.3)':'none'}}>
    <div style={{padding:'12px 16px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontSize:12,fontWeight:600,color:T.cream}}>Production Timeline</span>
      <span style={{fontSize:10,color:T.dim}}>{tasks.filter((t,i)=>t.done||checked.has(i)).length}/{tasks.length}</span>
    </div>
    {tasks.map((t,i)=>{const isDone=t.done||checked.has(i);const justChecked=checked.has(i)&&!t.done;
      return<div key={t.name} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 16px',borderBottom:`1px solid ${T.border}`,transition:'all .3s',background:justChecked?'rgba(74,222,128,.04)':'transparent'}}>
        <div style={{width:14,height:14,borderRadius:4,border:`1.5px solid ${isDone?C.emerald:T.dim}`,background:isDone?C.emerald:'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .3s',flexShrink:0}}>
          {isDone&&<span style={{color:'#fff',fontSize:9,fontWeight:700}}>✓</span>}
        </div>
        <span style={{flex:1,fontSize:11,color:isDone?T.dim:T.cream,textDecoration:isDone?'line-through':'none',transition:'all .3s'}}>{t.name}</span>
        <span style={{fontSize:9,fontFamily:T.mono,color:T.dim,flexShrink:0}}>{t.date}</span>
      </div>})}
  </div>;
}

/* ── AI Chat — messages appear on hover ── */
function AIchatUI(){
  const[hovered,setHovered]=useState(false);
  const[msgStep,setMsgStep]=useState(0);
  useEffect(()=>{
    if(!hovered){setMsgStep(0);return}
    const t1=setTimeout(()=>setMsgStep(1),400);
    const t2=setTimeout(()=>setMsgStep(2),1200);
    const t3=setTimeout(()=>setMsgStep(3),2200);
    return()=>{clearTimeout(t1);clearTimeout(t2);clearTimeout(t3)};
  },[hovered]);
  const roles=['Account Lead — 8d @ $950','Creative Director — 5d @ $1,200','Production Manager — 12d @ $800','Designer — 6d @ $750'];
  return<div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} style={{background:T.bg,border:`1px solid ${hovered?T.borderGlow:T.border}`,borderRadius:12,overflow:'hidden',fontFamily:T.sans,maxWidth:520,transition:'border-color .3s',boxShadow:hovered?'0 8px 40px rgba(0,0,0,.3)':'none'}}>
    <div style={{padding:'12px 16px',borderBottom:`1px solid ${T.border}`}}>
      <span style={{fontSize:12,fontWeight:600,color:T.cream}}>Morgan AI</span>
    </div>
    <div style={{padding:16,display:'flex',flexDirection:'column',gap:10,minHeight:220}}>
      {/* User message — always visible */}
      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <div style={{maxWidth:'80%',padding:'8px 12px',borderRadius:'10px 10px 3px 10px',background:'rgba(148,163,184,.08)',border:'1px solid rgba(148,163,184,.1)',fontSize:11,color:T.cream}}>Staff the agency team for the Neon Drift 3-day activation</div>
      </div>
      {/* Typing indicator */}
      {msgStep===1&&<div style={{display:'flex',gap:3,padding:'8px 12px',animation:'fadeUp .3s ease-out'}}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:'50%',background:T.dim,animation:`pulse 1s ease-in-out ${i*.15}s infinite`}}/>)}</div>}
      {/* AI response */}
      {msgStep>=2&&<div style={{display:'flex',justifyContent:'flex-start',animation:'fadeUp .4s ease-out'}}>
        <div style={{maxWidth:'90%',padding:'8px 12px',borderRadius:'10px 10px 10px 3px',background:'rgba(255,255,255,.02)',border:`1px solid ${T.border}`,fontSize:11,lineHeight:1.6,color:T.dimH}}>
          <span style={{fontSize:8,fontWeight:600,color:C.cyan,textTransform:'uppercase',letterSpacing:'.08em'}}>Morgan</span><br/>
          Here's the recommended staffing:<br/>
          {roles.map(r=><span key={r}><strong style={{color:T.cream}}>{r.split('—')[0]}</strong>—{r.split('—')[1]}<br/></span>)}
          Total: <span style={{color:C.amber,fontFamily:T.mono,fontWeight:600}}>$24,950</span>
        </div>
      </div>}
      {/* Action buttons */}
      {msgStep>=3&&<div style={{display:'flex',gap:6,flexWrap:'wrap',animation:'fadeUp .3s ease-out'}}>
        {roles.map(r=><span key={r} style={{fontSize:8,padding:'4px 10px',borderRadius:10,background:`${C.teal}10`,border:`1px solid ${C.teal}25`,color:C.teal,fontWeight:600,cursor:'default'}}>+ {r.split('—')[0].trim()}</span>)}
      </div>}
    </div>
    <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
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
    <header style={{maxWidth:1200,margin:'0 auto',padding:'130px clamp(20px,5vw,48px) 80px'}}>
      <Fade>
        <div style={{textAlign:'center',maxWidth:700,margin:'0 auto 60px'}}>
          <h1 style={{fontSize:'clamp(40px,6vw,72px)',fontWeight:700,lineHeight:1.05,letterSpacing:'-0.04em',fontFamily:T.sans,marginBottom:24}}>
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
          <p style={{fontSize:'clamp(20px,2.5vw,32px)',fontWeight:500,lineHeight:1.5,fontFamily:T.sans,color:T.dimH}}>
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
    <section style={{maxWidth:1200,margin:'0 auto',padding:'80px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(40px,6vw,100px)',alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.amber,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:16}}>Budgets & Margins</div>
            <h2 style={{fontSize:'clamp(26px,3.5vw,44px)',fontWeight:700,lineHeight:1.15,letterSpacing:'-0.03em',fontFamily:T.sans,marginBottom:20}}>
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
    <section style={{maxWidth:1200,margin:'0 auto',padding:'80px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(40px,6vw,100px)',alignItems:'center'}}>
          <div style={{order:1}}>
            <TimelineUI/>
          </div>
          <div style={{order:0}}>
            <div style={{fontSize:11,fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:16}}>Production</div>
            <h2 style={{fontSize:'clamp(26px,3.5vw,44px)',fontWeight:700,lineHeight:1.15,letterSpacing:'-0.03em',fontFamily:T.sans,marginBottom:20}}>
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
    <section style={{maxWidth:1200,margin:'0 auto',padding:'80px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(40px,6vw,100px)',alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.cyan,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:16}}>Morgan AI</div>
            <h2 style={{fontSize:'clamp(26px,3.5vw,44px)',fontWeight:700,lineHeight:1.15,letterSpacing:'-0.03em',fontFamily:T.sans,marginBottom:20}}>
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
    <section style={{maxWidth:1200,margin:'0 auto',padding:'80px clamp(20px,5vw,48px)'}}>
      <Fade>
        <div className="grid-responsive" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:20}}>
          <div style={{padding:'32px 28px',borderRadius:12,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.coral,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:14}}>Client Portal</div>
            <h3 style={{fontSize:20,fontWeight:600,fontFamily:T.sans,lineHeight:1.3,marginBottom:12}}>Estimates, decks, files. One link.</h3>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Send polished production estimates, timelines, and creative decks. Track client contacts and meeting notes. Share via email with a personal message or a single link.</p>
          </div>
          <div style={{padding:'32px 28px',borderRadius:12,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.purple,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:14}}>Vendors</div>
            <h3 style={{fontSize:20,fontWeight:600,fontFamily:T.sans,lineHeight:1.3,marginBottom:12}}>Your vendor rolodex, leveled up.</h3>
            <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>Full profiles with contacts, addresses, and financials. Upload invoices — AI reads the amount and due date. W-9 tracking, payment status, and budget line item linking built in.</p>
          </div>
          <div style={{padding:'32px 28px',borderRadius:12,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.015)'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.emerald,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:14}}>Creative</div>
            <h3 style={{fontSize:20,fontWeight:600,fontFamily:T.sans,lineHeight:1.3,marginBottom:12}}>Review, comment, approve.</h3>
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
          <p style={{fontSize:'clamp(18px,2vw,24px)',fontWeight:400,fontFamily:T.sans,color:T.dimH,lineHeight:1.7,marginBottom:28}}>
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
        <div style={{maxWidth:600,margin:'0 auto',padding:'80px clamp(20px,5vw,48px)',textAlign:'center'}}>
          <h2 style={{fontSize:'clamp(28px,4vw,48px)',fontWeight:700,fontFamily:T.sans,letterSpacing:'-0.03em',marginBottom:20}}>Your next show starts here.</h2>
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
