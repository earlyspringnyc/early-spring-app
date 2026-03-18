import { useState, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganWordmark, MorganIsotype } from '../components/brand/MorganLogo.jsx';

/* ── Shared styles ── */
const section = {
  maxWidth:1100,margin:'0 auto',padding:'100px 24px',position:'relative',zIndex:1,
};
const primaryBtn = {
  padding:'14px 32px',borderRadius:T.rS,
  border:`1px solid ${T.borderGlow}`,
  background:T.goldSoft,color:T.gold,
  fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:T.sans,
  transition:'all .25s',
};
const outlineBtn = {
  padding:'14px 32px',borderRadius:T.rS,background:'transparent',
  border:`1px solid ${T.border}`,color:T.cream,fontSize:15,fontWeight:500,
  cursor:'pointer',fontFamily:T.sans,transition:'all .25s',
};

/* ── Feature card colors ── */
const CARD_COLORS = {
  indigo: '#818CF8',
  teal:   '#2DD4BF',
  coral:  '#FB7185',
  amber:  '#FBBF24',
  emerald:'#34D399',
  purple: '#A78BFA',
};

/* ── Feature Mockups ── */
function BudgetMockup(){
  const categories = [
    { label: 40, color: CARD_COLORS.indigo, amount: 45 },
    { label: 30, color: CARD_COLORS.teal,   amount: 38 },
    { label: 50, color: CARD_COLORS.coral,  amount: 52 },
    { label: 25, color: CARD_COLORS.amber,  amount: 30 },
  ];
  return <div style={{background:'rgba(255,255,255,.03)',borderRadius:10,padding:16,border:`1px solid rgba(255,255,255,.06)`}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
      <div style={{width:'30%',height:7,background:'rgba(148,163,184,.12)',borderRadius:4}}/>
      <div style={{width:'15%',height:7,background:'rgba(255,255,255,.06)',borderRadius:4}}/>
    </div>
    {categories.map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
      <div style={{width:3,height:18,borderRadius:2,background:c.color,flexShrink:0}}/>
      <div style={{width:`${c.label}%`,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,flex:1}}/>
      <div style={{width:`${c.amount}px`,height:5,background:`${c.color}30`,borderRadius:3}}/>
    </div>)}
    <div style={{marginTop:12,background:'#1E293B',borderRadius:6,padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{width:'25%',height:6,background:'rgba(255,255,255,.25)',borderRadius:3}}/>
      <div style={{width:'18%',height:8,background:'rgba(148,163,184,.4)',borderRadius:4}}/>
    </div>
  </div>;
}

function CalendarMockup(){
  const days = Array.from({length:35},(_,i)=>i);
  const events = [3,7,8,15,16,22,28];
  const colors = [CARD_COLORS.teal,CARD_COLORS.purple,CARD_COLORS.coral,CARD_COLORS.indigo];
  return <div style={{background:'rgba(255,255,255,.03)',borderRadius:10,padding:16,border:`1px solid rgba(255,255,255,.06)`}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:12,alignItems:'center'}}>
      <div style={{width:'22%',height:7,background:'rgba(255,255,255,.1)',borderRadius:4}}/>
      <div style={{display:'flex',gap:4}}>
        <div style={{width:16,height:5,background:'rgba(255,255,255,.06)',borderRadius:3}}/>
        <div style={{width:16,height:5,background:'rgba(255,255,255,.06)',borderRadius:3}}/>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
      {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} style={{textAlign:'center',fontSize:7,color:'rgba(255,255,255,.2)',padding:'2px 0'}}>{d}</div>)}
      {days.map(i=><div key={i} style={{
        aspectRatio:'1',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',
        background: events.includes(i) ? `${colors[i%colors.length]}18` : 'rgba(255,255,255,.02)',
      }}>
        {events.includes(i)&&<div style={{width:'65%',height:3,borderRadius:2,background:colors[i%colors.length],opacity:.6}}/>}
      </div>)}
    </div>
  </div>;
}

function VendorMockup(){
  const vendors = [
    {name:35,type:'Floral',color:CARD_COLORS.emerald},
    {name:28,type:'Lighting',color:CARD_COLORS.amber},
    {name:40,type:'AV',color:CARD_COLORS.indigo},
  ];
  return <div style={{background:'rgba(255,255,255,.03)',borderRadius:10,padding:16,border:`1px solid rgba(255,255,255,.06)`,display:'flex',flexDirection:'column',gap:8}}>
    {vendors.map((v,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:6,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.04)'}}>
      <div style={{width:28,height:28,borderRadius:6,background:`${v.color}15`,border:`1px solid ${v.color}30`,flexShrink:0}}/>
      <div style={{flex:1}}>
        <div style={{width:`${v.name}%`,height:5,background:'rgba(255,255,255,.08)',borderRadius:3,marginBottom:5}}/>
        <div style={{padding:'1px 6px',borderRadius:3,background:`${v.color}15`,height:4,width:32}}/>
      </div>
    </div>)}
  </div>;
}

function DeliverableMockup(){
  return <div style={{background:'rgba(255,255,255,.03)',borderRadius:10,padding:16,border:`1px solid rgba(255,255,255,.06)`}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{width:'28%',height:7,background:'rgba(255,255,255,.08)',borderRadius:4}}/>
      <div style={{width:'18%',height:6,background:'rgba(255,255,255,.05)',borderRadius:4}}/>
    </div>
    <div style={{borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:10}}>
      {[1,2,3].map(i=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
        <div style={{width:`${20+i*10}%`,height:4,background:'rgba(255,255,255,.06)',borderRadius:3}}/>
        <div style={{width:'14%',height:4,background:'rgba(255,255,255,.08)',borderRadius:3}}/>
      </div>)}
    </div>
    <div style={{marginTop:10,background:'#1E293B',borderRadius:6,padding:'7px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{width:'22%',height:5,background:'rgba(255,255,255,.25)',borderRadius:3}}/>
      <div style={{width:'16%',height:7,background:'rgba(148,163,184,.4)',borderRadius:4}}/>
    </div>
  </div>;
}

function AIMockup(){
  return <div style={{background:'rgba(255,255,255,.03)',borderRadius:10,padding:16,border:`1px solid rgba(255,255,255,.06)`}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
      <div style={{width:20,height:20,borderRadius:6,background:`${CARD_COLORS.purple}20`,border:`1px solid ${CARD_COLORS.purple}30`,flexShrink:0}}/>
      <div style={{width:'40%',height:5,background:'rgba(255,255,255,.08)',borderRadius:3}}/>
    </div>
    {[1,2].map(i=><div key={i} style={{marginBottom:8,padding:'8px 10px',borderRadius:6,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.03)'}}>
      <div style={{width:`${50+i*15}%`,height:4,background:'rgba(255,255,255,.06)',borderRadius:3,marginBottom:5}}/>
      <div style={{width:`${30+i*10}%`,height:4,background:'rgba(255,255,255,.04)',borderRadius:3}}/>
    </div>)}
  </div>;
}

function FinanceMockup(){
  return <div style={{background:'rgba(255,255,255,.03)',borderRadius:10,padding:16,border:`1px solid rgba(255,255,255,.06)`}}>
    <div style={{display:'flex',gap:8,marginBottom:12}}>
      {[CARD_COLORS.emerald,CARD_COLORS.coral,CARD_COLORS.amber].map((c,i)=><div key={i} style={{flex:1,padding:'8px 6px',borderRadius:6,background:`${c}08`,borderLeft:`2px solid ${c}`,textAlign:'center'}}>
        <div style={{width:'60%',height:4,background:`${c}30`,borderRadius:2,margin:'0 auto 4px'}}/>
        <div style={{width:'80%',height:6,background:`${c}20`,borderRadius:3,margin:'0 auto'}}/>
      </div>)}
    </div>
    <div style={{display:'flex',gap:4}}>
      {[1,2,3,4,5,6].map(i=><div key={i} style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'flex-end',height:32}}>
        <div style={{background:'rgba(148,163,184,.15)',borderRadius:2,height:`${20+Math.random()*80}%`}}/>
      </div>)}
    </div>
  </div>;
}

/* ── Scroll fade-in hook ── */
function useFadeIn(){
  const ref = useRef(null);
  const[vis,setVis]=useState(false);
  useEffect(()=>{
    const el=ref.current;if(!el)return;
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting)setVis(true)},{threshold:.15});
    obs.observe(el);
    return()=>obs.disconnect();
  },[]);
  return {ref, style:{opacity:vis?1:0,transform:vis?'translateY(0)':'translateY(30px)',transition:'opacity .7s ease, transform .7s ease'}};
}

function FadeSection({children,style:sx,...props}){
  const {ref,style}=useFadeIn();
  return <div ref={ref} style={{...style,...sx}} {...props}>{children}</div>;
}

/* ── Bento feature cards data ── */
const FEATURES = [
  { key:'budget', label:'Budget', title:'Budget & Margins', desc:'Track every dollar with real-time margin calculations across categories and line items.', color:CARD_COLORS.indigo, Mockup:BudgetMockup, span:2 },
  { key:'production', label:'Production', title:'Production & Calendar', desc:'Color-coded timelines, task cards, and Google Calendar sync for your entire team.', color:CARD_COLORS.teal, Mockup:CalendarMockup, span:1 },
  { key:'vendors', label:'Vendors', title:'Vendor Database', desc:'Profiles, bids, contracts, and maps for every vendor across all projects.', color:CARD_COLORS.coral, Mockup:VendorMockup, span:1 },
  { key:'client', label:'Client', title:'Client Portal', desc:'Estimates, production decks, files, contacts, and meetings in one shareable space.', color:CARD_COLORS.amber, Mockup:DeliverableMockup, span:1 },
  { key:'ai', label:'ES AI', title:'ES AI by Morgan', desc:'Intelligent assistant that understands your production data and helps you move faster.', color:CARD_COLORS.purple, Mockup:AIMockup, span:1 },
  { key:'tools', label:'Tools', title:'Finance & Documents', desc:'Invoices, run of show, and document generation — all connected to your projects.', color:CARD_COLORS.emerald, Mockup:FinanceMockup, span:2 },
];

/* ── Main Landing Page ── */
function LandingPage({onGetStarted}){
  const[scrolled,setScrolled]=useState(false);
  useEffect(()=>{
    const h=()=>setScrolled(window.scrollY>40);
    window.addEventListener('scroll',h,{passive:true});
    return()=>window.removeEventListener('scroll',h);
  },[]);

  const scrollTo = (id)=>{
    document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
  };

  return <div style={{minHeight:'100vh',background:T.bgGrad,fontFamily:T.sans,color:T.cream,overflowX:'hidden'}}>

    {/* ── GRADIENT ACCENT LINE ── */}
    <div style={{position:'fixed',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg, ${T.gold}, ${T.cyan}, ${T.magenta}, ${T.pos})`,opacity:.4,zIndex:200}}/>

    {/* ── NAV ── */}
    <nav style={{
      position:'fixed',top:2,left:0,right:0,zIndex:100,
      padding:'0 32px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',
      background: scrolled ? 'rgba(20,20,23,.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? `1px solid ${T.border}` : '1px solid transparent',
      transition:'all .35s ease',
    }}>
      <MorganWordmark height={16} color={T.cream}/>
      <div style={{display:'flex',alignItems:'center',gap:28}}>
        <button onClick={()=>scrollTo('features')} style={{background:'none',border:'none',color:T.dim,fontSize:13,cursor:'pointer',fontFamily:T.sans,transition:'color .2s',fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Features</button>
        <button onClick={()=>scrollTo('pricing')} style={{background:'none',border:'none',color:T.dim,fontSize:13,cursor:'pointer',fontFamily:T.sans,transition:'color .2s',fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Pricing</button>
        <button onClick={onGetStarted} style={{padding:'8px 20px',borderRadius:T.rS,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.04)',color:T.cream,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.08)';e.currentTarget.style.borderColor=T.borderGlow}} onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.borderColor=T.border}}>Sign In</button>
      </div>
    </nav>

    {/* ── HERO ── */}
    <header style={{...section,paddingTop:160,paddingBottom:120,textAlign:'center',minHeight:'90vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'relative',zIndex:2,maxWidth:720,margin:'0 auto'}}>
        <h1 style={{fontSize:'clamp(36px,5.5vw,60px)',fontWeight:700,fontFamily:T.sans,letterSpacing:'-0.03em',lineHeight:1.1,marginBottom:24}}>
          Production management for teams that create experiences.
        </h1>
        <p style={{fontSize:'clamp(16px,2vw,18px)',color:T.dimH,maxWidth:520,margin:'0 auto 40px',lineHeight:1.7,fontFamily:T.sans}}>
          Morgan is the all-in-one platform for event and experiential production companies — budgets, vendors, timelines, and client deliverables in one place.
        </p>
        <div style={{display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap'}}>
          <button onClick={onGetStarted} style={primaryBtn} onMouseEnter={e=>{e.currentTarget.style.background='rgba(148,163,184,.15)';e.currentTarget.style.borderColor=T.gold}} onMouseLeave={e=>{e.currentTarget.style.background=T.goldSoft;e.currentTarget.style.borderColor=T.borderGlow}}>Get Started</button>
          <button onClick={()=>scrollTo('features')} style={outlineBtn} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background='rgba(255,255,255,.03)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background='transparent'}}>See Features</button>
        </div>
      </div>
      {/* Scroll indicator */}
      <div style={{position:'absolute',bottom:40,left:'50%',transform:'translateX(-50%)',animation:'glow 2s ease-in-out infinite'}}>
        <div style={{width:1,height:40,background:`linear-gradient(to bottom,transparent,${T.gold}40)`,margin:'0 auto'}}/>
      </div>
    </header>

    {/* ── FEATURES — BENTO GRID ── */}
    <section id="features" style={section}>
      <FadeSection style={{textAlign:'center',marginBottom:60}}>
        <p style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.15em',color:T.gold,marginBottom:12}}>Features</p>
        <h2 style={{fontSize:'clamp(28px,4vw,40px)',fontWeight:600,fontFamily:T.sans,letterSpacing:'-0.02em',marginBottom:14}}>Everything you need to produce</h2>
        <p style={{fontSize:14,color:T.dim,maxWidth:480,margin:'0 auto',lineHeight:1.7}}>From initial pitch to final invoice, Morgan handles every detail of your production workflow.</p>
      </FadeSection>

      <FadeSection style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20}}>
        {FEATURES.map(f=><div key={f.key} style={{
          gridColumn:`span ${f.span}`,
          padding:24,borderRadius:T.r,
          background:T.surface,border:`1px solid ${T.border}`,
          borderLeft:`3px solid ${f.color}`,
          transition:'border-color .3s, transform .2s',
          cursor:'default',
        }} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.borderLeftColor=f.color;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.borderLeftColor=f.color;e.currentTarget.style.transform='translateY(0)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:f.color,fontFamily:T.sans}}>{f.label}</span>
          </div>
          <h3 style={{fontSize:17,fontWeight:600,fontFamily:T.sans,marginBottom:8}}>{f.title}</h3>
          <p style={{fontSize:13,color:T.dim,lineHeight:1.6,marginBottom:16}}>{f.desc}</p>
          <f.Mockup/>
        </div>)}
      </FadeSection>
    </section>

    {/* ── HOW IT WORKS ── */}
    <section id="how-it-works" style={{...section,paddingTop:80,paddingBottom:80}}>
      <FadeSection style={{textAlign:'center',marginBottom:56}}>
        <p style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.15em',color:T.gold,marginBottom:12}}>How It Works</p>
        <h2 style={{fontSize:'clamp(28px,4vw,40px)',fontWeight:600,fontFamily:T.sans,letterSpacing:'-0.02em'}}>Three steps. Zero friction.</h2>
      </FadeSection>
      <FadeSection style={{display:'flex',justifyContent:'center',gap:64,flexWrap:'wrap',maxWidth:800,margin:'0 auto'}}>
        {[
          {num:'01',title:'Create a project',desc:'Define scope, set your client budget, and add production categories.'},
          {num:'02',title:'Build & manage',desc:'Add line items, assign vendors, and track margins in real time.'},
          {num:'03',title:'Share & deliver',desc:'Export polished budgets, timelines, and proposals to clients.'},
        ].map(s=><div key={s.num} style={{textAlign:'center',flex:'1 1 200px',maxWidth:240}}>
          <div style={{fontSize:28,fontWeight:700,fontFamily:T.sans,color:T.gold,opacity:.3,marginBottom:12}}>{s.num}</div>
          <h3 style={{fontSize:16,fontWeight:600,marginBottom:8,fontFamily:T.sans}}>{s.title}</h3>
          <p style={{fontSize:13,color:T.dim,lineHeight:1.6}}>{s.desc}</p>
        </div>)}
      </FadeSection>
    </section>

    {/* ── SOCIAL PROOF ── */}
    <section style={{...section,paddingTop:40,paddingBottom:40}}>
      <FadeSection style={{textAlign:'center',padding:'48px 32px',borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`}}>
        <p style={{fontSize:18,fontFamily:T.sans,fontWeight:500,color:T.dimH,lineHeight:1.7,maxWidth:440,margin:'0 auto 20px'}}>"Built by producers, for producers."</p>
        <MorganIsotype size={24} color={T.dim}/>
      </FadeSection>
    </section>

    {/* ── CTA BANNER ── */}
    <section style={{...section,paddingTop:40,paddingBottom:60}}>
      <FadeSection style={{textAlign:'center'}}>
        <h2 style={{fontSize:'clamp(24px,4vw,36px)',fontWeight:600,fontFamily:T.sans,letterSpacing:'-0.02em',marginBottom:16}}>Ready to produce?</h2>
        <p style={{fontSize:14,color:T.dim,marginBottom:32}}>Join production companies already using Morgan.</p>
        <button onClick={onGetStarted} style={primaryBtn} onMouseEnter={e=>{e.currentTarget.style.background='rgba(148,163,184,.15)';e.currentTarget.style.borderColor=T.gold}} onMouseLeave={e=>{e.currentTarget.style.background=T.goldSoft;e.currentTarget.style.borderColor=T.borderGlow}}>Get Started</button>
      </FadeSection>
    </section>

    {/* ── PRICING ── */}
    <section id="pricing" style={{...section,paddingTop:80,paddingBottom:80}}>
      <FadeSection style={{textAlign:'center',marginBottom:56}}>
        <p style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.15em',color:T.gold,marginBottom:12}}>Pricing</p>
        <h2 style={{fontSize:'clamp(28px,4vw,40px)',fontWeight:600,fontFamily:T.sans,letterSpacing:'-0.02em',marginBottom:14}}>Simple, transparent pricing</h2>
        <p style={{fontSize:14,color:T.dim,maxWidth:420,margin:'0 auto'}}>Start free. Upgrade when you're ready.</p>
      </FadeSection>
      <FadeSection style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:24,maxWidth:720,margin:'0 auto'}}>
        {/* Free */}
        <div style={{padding:36,borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`,display:'flex',flexDirection:'column'}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:T.dim,marginBottom:8,fontFamily:T.sans}}>Free</div>
          <div style={{fontSize:36,fontWeight:700,fontFamily:T.sans,marginBottom:6}}>$0<span style={{fontSize:14,fontWeight:400,color:T.dim}}>/mo</span></div>
          <p style={{fontSize:13,color:T.dim,marginBottom:24,lineHeight:1.6}}>Perfect for trying Morgan on a single project.</p>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
            {['1 active project','Budget management','Timeline view','Basic exports'].map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:T.dimH}}>
              <span style={{color:T.pos,fontSize:14}}>&#10003;</span>{f}
            </div>)}
          </div>
          <button onClick={onGetStarted} style={{...outlineBtn,width:'100%',padding:'12px 0'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background='rgba(255,255,255,.03)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background='transparent'}}>Get Started</button>
        </div>
        {/* Pro */}
        <div style={{padding:36,borderRadius:T.r,background:'rgba(148,163,184,.03)',border:`1px solid ${T.borderGlow}`,display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:16,right:16,padding:'4px 10px',borderRadius:20,background:T.goldSoft,fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:T.gold,fontFamily:T.sans}}>Popular</div>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:T.gold,marginBottom:8,fontFamily:T.sans}}>Pro</div>
          <div style={{fontSize:36,fontWeight:700,fontFamily:T.sans,marginBottom:6}}>$29<span style={{fontSize:14,fontWeight:400,color:T.dim}}>/mo</span></div>
          <p style={{fontSize:13,color:T.dim,marginBottom:24,lineHeight:1.6}}>For production teams who need the full toolkit.</p>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
            {['Unlimited projects','Team management','Vendor database','Client portal & exports','Google Calendar sync','Priority support'].map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:T.dimH}}>
              <span style={{color:T.gold,fontSize:14}}>&#10003;</span>{f}
            </div>)}
          </div>
          <button onClick={onGetStarted} style={{...primaryBtn,width:'100%',padding:'12px 0'}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(148,163,184,.15)';e.currentTarget.style.borderColor=T.gold}} onMouseLeave={e=>{e.currentTarget.style.background=T.goldSoft;e.currentTarget.style.borderColor=T.borderGlow}}>Get Started</button>
        </div>
      </FadeSection>
    </section>

    {/* ── FOOTER ── */}
    <footer style={{borderTop:`1px solid ${T.border}`,padding:'32px 32px',textAlign:'center'}}>
      <div style={{marginBottom:10}}>
        <MorganWordmark height={12} color={T.dim}/>
      </div>
      <p style={{fontSize:10,color:'rgba(255,255,255,.2)',fontFamily:T.sans}}>© 2026 Early Spring LLC</p>
    </footer>

    {/* ── Responsive overrides ── */}
    <style>{`
      @media(max-width:900px){
        #features > div > div[style*="grid-template-columns"] {
          grid-template-columns: repeat(2, 1fr) !important;
        }
        #features > div > div[style*="grid-template-columns"] > div[style*="span 2"] {
          grid-column: span 2 !important;
        }
      }
      @media(max-width:640px){
        #features > div > div[style*="grid-template-columns"] {
          grid-template-columns: 1fr !important;
        }
        #features > div > div[style*="grid-template-columns"] > div[style*="span 2"] {
          grid-column: span 1 !important;
        }
      }
    `}</style>
  </div>;
}

export default LandingPage;
