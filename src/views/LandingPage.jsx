import { useState, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganWordmark, MorganIsotype } from '../components/brand/MorganLogo.jsx';

/* ── Animated dots background (reused from Login) ── */
const DOTS = Array.from({length:40},(_,i)=>({
  x:Math.random()*100, y:Math.random()*100,
  s:Math.random()*2+1, o:Math.random()*.25+.05,
  c:i%3, d:3+Math.random()*4
}));

function FloatingDots(){
  return DOTS.map((d,i)=><div key={i} style={{
    position:'absolute',left:`${d.x}%`,top:`${d.y}%`,width:d.s,height:d.s,
    borderRadius:'50%',background:d.c===0?T.gold:d.c===1?T.cyan:T.magenta,
    opacity:d.o,animation:`glow ${d.d}s ease-in-out infinite`,pointerEvents:'none'
  }}/>);
}

/* ── Shared styles ── */
const section = {
  maxWidth:1100,margin:'0 auto',padding:'100px 24px',position:'relative',zIndex:1,
};
const goldBtn = {
  padding:'14px 32px',borderRadius:T.rS,border:'none',
  background:`linear-gradient(135deg,${T.gold},#FFD96A)`,color:'#1A1200',
  fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:T.sans,
  transition:'all .25s',boxShadow:'0 2px 16px rgba(255,234,151,.18)',
};
const outlineBtn = {
  padding:'14px 32px',borderRadius:T.rS,background:'transparent',
  border:`1px solid ${T.border}`,color:T.cream,fontSize:15,fontWeight:500,
  cursor:'pointer',fontFamily:T.sans,transition:'all .25s',
};

/* ── Feature Mockups ── */
function BudgetMockup(){
  return <div style={{background:'rgba(255,255,255,.04)',borderRadius:12,padding:20,border:`1px solid rgba(255,255,255,.06)`}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
      <div style={{width:'30%',height:8,background:'rgba(255,234,151,.15)',borderRadius:4}}/>
      <div style={{width:'15%',height:8,background:'rgba(255,255,255,.08)',borderRadius:4}}/>
    </div>
    {[1,2,3,4,5].map(i=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
      <div style={{width:`${18+i*8}%`,height:6,background:'rgba(255,255,255,.06)',borderRadius:3}}/>
      <div style={{width:'12%',height:6,background:'rgba(255,234,151,.1)',borderRadius:3}}/>
    </div>)}
    <div style={{marginTop:14,background:'#432D1C',borderRadius:8,padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{width:'25%',height:8,background:'rgba(255,255,255,.3)',borderRadius:4}}/>
      <div style={{width:'18%',height:10,background:'rgba(255,255,255,.5)',borderRadius:4}}/>
    </div>
  </div>;
}

function CalendarMockup(){
  const days = Array.from({length:35},(_,i)=>i);
  const events = [3,7,8,15,16,22,28];
  const colors = [T.gold,T.cyan,T.magenta,T.pos];
  return <div style={{background:'rgba(255,255,255,.04)',borderRadius:12,padding:20,border:`1px solid rgba(255,255,255,.06)`}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:14,alignItems:'center'}}>
      <div style={{width:'22%',height:8,background:'rgba(255,255,255,.12)',borderRadius:4}}/>
      <div style={{display:'flex',gap:6}}>
        <div style={{width:20,height:6,background:'rgba(255,255,255,.06)',borderRadius:3}}/>
        <div style={{width:20,height:6,background:'rgba(255,255,255,.06)',borderRadius:3}}/>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
      {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} style={{textAlign:'center',fontSize:8,color:'rgba(255,255,255,.2)',padding:'2px 0'}}>{d}</div>)}
      {days.map(i=><div key={i} style={{
        aspectRatio:'1',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',
        background: events.includes(i) ? `${colors[i%colors.length]}18` : 'rgba(255,255,255,.02)',
        position:'relative',
      }}>
        {events.includes(i)&&<div style={{width:'70%',height:4,borderRadius:2,background:colors[i%colors.length],opacity:.6}}/>}
      </div>)}
    </div>
  </div>;
}

function VendorMockup(){
  const vendors = [
    {name:35,type:'Floral',color:T.gold,amount:42},
    {name:28,type:'Lighting',color:T.cyan,amount:35},
    {name:40,type:'Catering',color:T.magenta,amount:50},
  ];
  return <div style={{background:'rgba(255,255,255,.04)',borderRadius:12,padding:20,border:`1px solid rgba(255,255,255,.06)`,display:'flex',flexDirection:'column',gap:10}}>
    {vendors.map((v,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:8,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.04)'}}>
      <div style={{width:32,height:32,borderRadius:8,background:`${v.color}15`,border:`1px solid ${v.color}30`,flexShrink:0}}/>
      <div style={{flex:1}}>
        <div style={{width:`${v.name}%`,height:6,background:'rgba(255,255,255,.1)',borderRadius:3,marginBottom:6}}/>
        <div style={{display:'flex',gap:6}}>
          <div style={{padding:'2px 8px',borderRadius:4,background:`${v.color}15`,height:5,width:40}}/>
        </div>
      </div>
      <div style={{width:`${v.amount}px`,height:8,background:'rgba(255,234,151,.12)',borderRadius:4}}/>
    </div>)}
  </div>;
}

function DeliverableMockup(){
  return <div style={{background:'#FAFAF9',borderRadius:12,padding:20,border:'1px solid rgba(0,0,0,.08)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <div style={{width:'28%',height:10,background:'rgba(0,0,0,.08)',borderRadius:4}}/>
      <div style={{width:'18%',height:8,background:'rgba(0,0,0,.05)',borderRadius:4}}/>
    </div>
    <div style={{borderTop:'2px solid rgba(0,0,0,.08)',paddingTop:12}}>
      {[1,2,3].map(i=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(0,0,0,.04)'}}>
        <div style={{width:`${20+i*10}%`,height:5,background:'rgba(0,0,0,.06)',borderRadius:3}}/>
        <div style={{width:'14%',height:5,background:'rgba(0,0,0,.08)',borderRadius:3}}/>
      </div>)}
    </div>
    <div style={{marginTop:12,background:'#1A1200',borderRadius:6,padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{width:'22%',height:6,background:'rgba(255,255,255,.3)',borderRadius:3}}/>
      <div style={{width:'16%',height:8,background:'rgba(255,234,151,.6)',borderRadius:4}}/>
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

    {/* ── NAV ── */}
    <nav style={{
      position:'fixed',top:0,left:0,right:0,zIndex:100,
      padding:'0 32px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',
      background: scrolled ? 'rgba(8,8,12,.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? `1px solid ${T.border}` : '1px solid transparent',
      transition:'all .35s ease',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <ESWordmark height={14} color={T.gold}/>
        <MorganIsotype size={28} color={T.gold}/>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:24}}>
        <button onClick={()=>scrollTo('features')} style={{background:'none',border:'none',color:T.dim,fontSize:13,cursor:'pointer',fontFamily:T.sans,transition:'color .2s'}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Features</button>
        <button onClick={()=>scrollTo('pricing')} style={{background:'none',border:'none',color:T.dim,fontSize:13,cursor:'pointer',fontFamily:T.sans,transition:'color .2s'}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Pricing</button>
        <button onClick={onGetStarted} style={{padding:'8px 20px',borderRadius:T.rS,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.04)',color:T.cream,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:T.sans,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.08)';e.currentTarget.style.borderColor=T.borderGlow}} onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.borderColor=T.border}}>Sign In</button>
      </div>
    </nav>

    {/* ── HERO ── */}
    <header style={{...section,paddingTop:160,paddingBottom:120,textAlign:'center',position:'relative',minHeight:'90vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}><FloatingDots/></div>
      <div style={{position:'relative',zIndex:2}}>
        <div style={{marginBottom:24}}><MorganWordmark height={32} color={T.gold}/></div>
        <p style={{fontSize:'clamp(20px,3vw,28px)',fontFamily:T.serif,fontStyle:'italic',color:T.dim,marginBottom:20,letterSpacing:'-0.01em'}}>Production management, reimagined.</p>
        <p style={{fontSize:16,color:T.dim,maxWidth:560,margin:'0 auto 20px',lineHeight:1.8}}>Morgan is the all-in-one platform for event production companies. Build budgets with real-time margin tracking, manage vendors and invoices, schedule timelines with calendar integration, and deliver polished client-facing proposals — all in one place.</p>
        <div style={{display:'flex',gap:20,justifyContent:'center',flexWrap:'wrap',marginBottom:44}}>
          {["Budget & Margins","Vendor Management","Timeline & Calendar","Client Deliverables","AI Assistant","Google Calendar"].map(f=><span key={f} style={{fontSize:11,color:T.gold,padding:'4px 12px',borderRadius:20,border:`1px solid rgba(255,234,151,.15)`,background:'rgba(255,234,151,.04)',fontFamily:T.sans}}>{f}</span>)}
        </div>
        <div style={{display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap'}}>
          <button onClick={onGetStarted} style={goldBtn} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 6px 24px rgba(255,234,151,.25)'}} onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 2px 16px rgba(255,234,151,.18)'}}>Get Started</button>
          <button onClick={()=>scrollTo('how-it-works')} style={outlineBtn} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background='rgba(255,255,255,.03)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background='transparent'}}>See How It Works</button>
        </div>
      </div>
      {/* Scroll indicator */}
      <div style={{position:'absolute',bottom:40,left:'50%',transform:'translateX(-50%)',animation:'glow 2s ease-in-out infinite'}}>
        <div style={{width:1,height:40,background:`linear-gradient(to bottom,transparent,${T.gold}40)`,margin:'0 auto'}}/>
      </div>
    </header>

    {/* ── FEATURES ── */}
    <section id="features" style={section}>
      <FadeSection style={{textAlign:'center',marginBottom:80}}>
        <p style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.15em',color:T.gold,marginBottom:12}}>Features</p>
        <h2 style={{fontSize:'clamp(28px,4vw,40px)',fontWeight:600,fontFamily:T.serif,letterSpacing:'-0.02em',marginBottom:14}}>Everything you need to produce</h2>
        <p style={{fontSize:14,color:T.dim,maxWidth:480,margin:'0 auto',lineHeight:1.7}}>From initial pitch to final invoice, Morgan handles every detail of your production workflow.</p>
      </FadeSection>

      {/* Feature 1 – Budget */}
      <FadeSection style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center',marginBottom:100}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:T.gold,marginBottom:12}}>Budget Management</div>
          <h3 style={{fontSize:24,fontWeight:600,fontFamily:T.serif,marginBottom:14,letterSpacing:'-0.01em'}}>Margins at a glance</h3>
          <p style={{fontSize:14,color:T.dim,lineHeight:1.8}}>Track every dollar from client budget to vendor cost. Categories, line items, margins, and a grand total — all updating in real time.</p>
        </div>
        <BudgetMockup/>
      </FadeSection>

      {/* Feature 2 – Calendar */}
      <FadeSection style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center',marginBottom:100}}>
        <CalendarMockup/>
        <div>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:T.cyan,marginBottom:12}}>Timeline & Calendar</div>
          <h3 style={{fontSize:24,fontWeight:600,fontFamily:T.serif,marginBottom:14,letterSpacing:'-0.01em'}}>Never miss a deadline</h3>
          <p style={{fontSize:14,color:T.dim,lineHeight:1.8}}>Color-coded task pills, milestone tracking, and Google Calendar sync. See your entire production timeline at a glance.</p>
        </div>
      </FadeSection>

      {/* Feature 3 – Vendors */}
      <FadeSection style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center',marginBottom:100}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:T.magenta,marginBottom:12}}>Vendor Management</div>
          <h3 style={{fontSize:24,fontWeight:600,fontFamily:T.serif,marginBottom:14,letterSpacing:'-0.01em'}}>Your vendor rolodex</h3>
          <p style={{fontSize:14,color:T.dim,lineHeight:1.8}}>Categorize vendors by type, track bids and contracts, and see financial summaries across all your projects.</p>
        </div>
        <VendorMockup/>
      </FadeSection>

      {/* Feature 4 – Deliverables */}
      <FadeSection style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'center',marginBottom:40}}>
        <DeliverableMockup/>
        <div>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:T.pos,marginBottom:12}}>Client Deliverables</div>
          <h3 style={{fontSize:24,fontWeight:600,fontFamily:T.serif,marginBottom:14,letterSpacing:'-0.01em'}}>Polished, client-ready</h3>
          <p style={{fontSize:14,color:T.dim,lineHeight:1.8}}>Export clean, white-background budget views that look great in any client presentation. Professional without the effort.</p>
        </div>
      </FadeSection>
    </section>

    {/* ── HOW IT WORKS ── */}
    <section id="how-it-works" style={{...section,paddingTop:80,paddingBottom:80}}>
      <FadeSection style={{textAlign:'center',marginBottom:64}}>
        <p style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.15em',color:T.gold,marginBottom:12}}>How It Works</p>
        <h2 style={{fontSize:'clamp(28px,4vw,40px)',fontWeight:600,fontFamily:T.serif,letterSpacing:'-0.02em'}}>Three steps. Zero friction.</h2>
      </FadeSection>
      <FadeSection style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:32}}>
        {[
          {num:'01',title:'Create a project',desc:'Set your client budget, add categories, and define the scope of your production.'},
          {num:'02',title:'Build your budget',desc:'Add line items, assign vendors, and track margins. Everything updates in real time.'},
          {num:'03',title:'Share with clients',desc:'Export polished budgets, timelines, and proposals. Impress clients effortlessly.'},
        ].map(s=><div key={s.num} style={{padding:32,borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`,transition:'border-color .3s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderGlow} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
          <div style={{fontSize:32,fontWeight:700,fontFamily:T.serif,color:T.gold,opacity:.4,marginBottom:16}}>{s.num}</div>
          <h3 style={{fontSize:18,fontWeight:600,marginBottom:10,fontFamily:T.serif}}>{s.title}</h3>
          <p style={{fontSize:13,color:T.dim,lineHeight:1.7}}>{s.desc}</p>
        </div>)}
      </FadeSection>
    </section>

    {/* ── PRICING ── */}
    <section id="pricing" style={{...section,paddingTop:80,paddingBottom:80}}>
      <FadeSection style={{textAlign:'center',marginBottom:56}}>
        <p style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.15em',color:T.gold,marginBottom:12}}>Pricing</p>
        <h2 style={{fontSize:'clamp(28px,4vw,40px)',fontWeight:600,fontFamily:T.serif,letterSpacing:'-0.02em',marginBottom:14}}>Simple, transparent pricing</h2>
        <p style={{fontSize:14,color:T.dim,maxWidth:420,margin:'0 auto'}}>Start free. Upgrade when you're ready.</p>
      </FadeSection>
      <FadeSection style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:24,maxWidth:720,margin:'0 auto'}}>
        {/* Free */}
        <div style={{padding:36,borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`,display:'flex',flexDirection:'column'}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:T.dim,marginBottom:8}}>Free</div>
          <div style={{fontSize:36,fontWeight:700,fontFamily:T.serif,marginBottom:6}}>$0<span style={{fontSize:14,fontWeight:400,color:T.dim}}>/mo</span></div>
          <p style={{fontSize:13,color:T.dim,marginBottom:24,lineHeight:1.6}}>Perfect for trying Morgan on a single project.</p>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
            {['1 active project','Budget management','Timeline view','Basic exports'].map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:T.dimH}}>
              <span style={{color:T.pos,fontSize:14}}>&#10003;</span>{f}
            </div>)}
          </div>
          <button onClick={onGetStarted} style={{...outlineBtn,width:'100%',padding:'12px 0'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background='rgba(255,255,255,.03)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background='transparent'}}>Get Started</button>
        </div>
        {/* Pro */}
        <div style={{padding:36,borderRadius:T.r,background:'rgba(255,234,151,.03)',border:`1px solid ${T.borderGlow}`,display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:16,right:16,padding:'4px 10px',borderRadius:20,background:`${T.gold}18`,fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:T.gold}}>Popular</div>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:T.gold,marginBottom:8}}>Pro</div>
          <div style={{fontSize:36,fontWeight:700,fontFamily:T.serif,marginBottom:6}}>$29<span style={{fontSize:14,fontWeight:400,color:T.dim}}>/mo</span></div>
          <p style={{fontSize:13,color:T.dim,marginBottom:24,lineHeight:1.6}}>For production teams who need the full toolkit.</p>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
            {['Unlimited projects','Team management','Vendor database','Client portal & exports','Google Calendar sync','Priority support'].map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:T.dimH}}>
              <span style={{color:T.gold,fontSize:14}}>&#10003;</span>{f}
            </div>)}
          </div>
          <button onClick={onGetStarted} style={{...goldBtn,width:'100%',padding:'12px 0'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 6px 24px rgba(255,234,151,.25)'}} onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 2px 16px rgba(255,234,151,.18)'}}>Get Started</button>
        </div>
      </FadeSection>
    </section>

    {/* ── TRUST ── */}
    <section style={{...section,paddingTop:60,paddingBottom:60}}>
      <FadeSection style={{textAlign:'center',padding:'48px 32px',borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`}}>
        <p style={{fontSize:16,fontFamily:T.serif,fontStyle:'italic',color:T.dimH,lineHeight:1.7,maxWidth:500,margin:'0 auto 20px'}}>"Built by a production team, for production teams."</p>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
          <ESWordmark height={12} color={T.dim}/>
          <span style={{fontSize:12,color:T.dim}}>Early Spring — Brooklyn, NY</span>
        </div>
      </FadeSection>
    </section>

    {/* ── CTA BANNER ── */}
    <section style={{...section,paddingTop:40,paddingBottom:100}}>
      <FadeSection style={{textAlign:'center'}}>
        <h2 style={{fontSize:'clamp(24px,4vw,36px)',fontWeight:600,fontFamily:T.serif,letterSpacing:'-0.02em',marginBottom:16}}>Ready to streamline your productions?</h2>
        <p style={{fontSize:14,color:T.dim,marginBottom:32}}>Join production companies already using Morgan.</p>
        <button onClick={onGetStarted} style={goldBtn} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 6px 24px rgba(255,234,151,.25)'}} onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 2px 16px rgba(255,234,151,.18)'}}>Get Started Free</button>
      </FadeSection>
    </section>

    {/* ── FOOTER ── */}
    <footer style={{borderTop:`1px solid ${T.border}`,padding:'32px 32px',textAlign:'center'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12}}>
        <ESWordmark height={10} color={T.dim}/>
        <span style={{fontSize:11,color:T.dim,fontFamily:T.serif,fontStyle:'italic'}}>Sent from Morgan @ Early Spring</span>
      </div>
      <p style={{fontSize:10,color:'rgba(255,255,255,.2)'}}>© 2026 Early Spring LLC. All rights reserved.</p>
    </footer>

    {/* ── Responsive overrides ── */}
    <style>{`
      @media(max-width:768px){
        #features > div > div[style*="grid-template-columns: 1fr 1fr"],
        #features > div > div {
          grid-template-columns: 1fr !important;
          gap: 32px !important;
        }
      }
    `}</style>
  </div>;
}

export default LandingPage;
