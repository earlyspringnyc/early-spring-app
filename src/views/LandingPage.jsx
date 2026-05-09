import { useEffect, useRef, useState } from 'react';
import T from '../theme/tokens.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganIsotype, MorganWordmark } from '../components/brand/MorganLogo.jsx';

const PAPER = T.paper;
const INK = T.ink;
const RULE = T.faintRule;
const FADED = T.fadedInk;

/* ── Scroll-triggered fade. Cubic, never bouncy. ── */
function useFadeIn(threshold=.08){
  const ref=useRef(null);const[vis,setVis]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting)setVis(true)},{threshold});obs.observe(el);return()=>obs.disconnect()},[]);
  return{ref,style:{opacity:vis?1:0,transform:vis?'none':'translateY(8px)',transition:'opacity .6s cubic-bezier(.2,.8,.2,1), transform .6s cubic-bezier(.2,.8,.2,1)'}};
}
function Fade({children,style:sx={},delay=0,...p}){
  const{ref,style}=useFadeIn();
  return<div ref={ref} style={{...style,transitionDelay:`${delay}s`,...sx}} {...p}>{children}</div>;
}

const Kicker = ({children}) => <div style={{
  fontSize:11,fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:INK,
}}>{children}</div>;

const Section = ({id,children,style:sx={}}) => <section id={id} style={{
  maxWidth:1640,margin:'0 auto',padding:'clamp(56px,8vw,96px) clamp(20px,3vw,56px)',
  ...sx,
}}>{children}</section>;

function LandingPage({onGetStarted}){
  // The landing page scrolls — restore overflow on mount
  useEffect(()=>{
    document.documentElement.style.overflow='auto';
    document.body.style.overflow='auto';
    const root=document.getElementById('root');
    if(root)root.style.overflow='auto';
    return()=>{
      document.documentElement.style.overflow='';
      document.body.style.overflow='';
      if(root)root.style.overflow='';
    };
  },[]);

  return<div style={{minHeight:'100vh',background:PAPER,color:INK,fontFamily:T.sans,overflowX:'hidden'}}>

    {/* Top rule */}
    <div style={{height:1,background:RULE,position:'sticky',top:0,zIndex:99}}/>

    {/* ── Sticky nav: paper bg + faint rule below, three-column grid ── */}
    <nav style={{
      position:'sticky',top:1,zIndex:100,
      background:T.mode==='dark'?'rgba(15,82,186,.86)':'rgba(255,255,255,.86)',backdropFilter:'blur(24px) saturate(140%)',WebkitBackdropFilter:'blur(24px) saturate(140%)',
      borderBottom:`1px solid ${RULE}`,
      display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',gap:24,
      padding:'14px clamp(20px,3vw,56px)',
    }}>
      <a href="#top" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:14,justifySelf:'start'}}>
        <ESWordmark height={14} color={INK}/>
      </a>
      <div style={{display:'inline-flex',alignItems:'center',gap:10,justifySelf:'center'}}>
        <MorganIsotype size={20} color={INK} strokeWidth={1.4}/>
        <MorganWordmark height={12} color={INK} tracking=".34em"/>
      </div>
      <div style={{justifySelf:'end',display:'inline-flex',gap:8}}>
        <a href="#about" className="btn-pill" style={{textDecoration:'none'}}>What is Morgan</a>
        <button onClick={onGetStarted} className="btn-pill">Sign in</button>
      </div>
    </nav>

    {/* ═══ Hero ═══ */}
    <Section id="top" style={{paddingTop:'clamp(64px,9vw,128px)',paddingBottom:'clamp(48px,7vw,96px)'}}>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:'clamp(24px,4vw,48px)'}}>
        <Fade>
          <Kicker>Lab · Internal Tool</Kicker>
        </Fade>
        <Fade delay={.05}>
          <h1 style={{
            fontSize:'clamp(48px,7vw,144px)',
            fontWeight:800,
            letterSpacing:'-0.028em',
            lineHeight:0.94,
            margin:0,
            color:INK,
          }}>
            Brief to build.<br/>One tool.
          </h1>
        </Fade>
        <Fade delay={.1}>
          <p style={{
            fontSize:'clamp(15px,1.4vw,18px)',
            lineHeight:1.6,fontWeight:400,
            color:INK,
            maxWidth:'62ch',margin:0,
          }}>
            Morgan is the production tool we use at Early Spring — budgets, timelines, vendors, creative, and client deliverables in one well-set page. <em>It is built for our team.</em> If you find it and want to use it, you’re welcome to.
          </p>
        </Fade>
        <Fade delay={.15}>
          <div style={{display:'inline-flex',gap:10,marginTop:8}}>
            <button onClick={onGetStarted} className="btn-pill" style={{padding:'10px 22px',fontSize:14}}>Sign in to Morgan</button>
            <a href="#about" className="btn-pill" style={{padding:'10px 22px',fontSize:14,textDecoration:'none'}}>Read more</a>
          </div>
        </Fade>
      </div>
    </Section>

    {/* ═══ What it is ═══ */}
    <div style={{borderTop:`1px solid ${RULE}`}}>
      <Section id="about">
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:'clamp(28px,4vw,56px)'}}>
          <Fade>
            <Kicker>About</Kicker>
          </Fade>
          <Fade delay={.05}>
            <h2 style={{
              fontSize:'clamp(28px,3.4vw,48px)',
              fontWeight:800,
              letterSpacing:'-0.022em',
              lineHeight:1.04,
              margin:0,
              maxWidth:'24ch',
              color:INK,
            }}>
              Production management for people who build experiences.
            </h2>
          </Fade>
          <Fade delay={.1}>
            <div style={{
              display:'grid',gap:'clamp(28px,4vw,48px)',
              gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',
              maxWidth:1100,
            }}>
              {[
                ['Budgets','Build estimates with vendors and margins. Share a clean PDF with the client. Track actuals against the original budget without rebuilding it.'],
                ['Timeline','Production timeline, run of show, and crew schedule on one canvas. The same dates feed the Google Calendar of whoever needs them.'],
                ['Deliverables','Files, briefs, decks, and approvals. Anything sent to a client carries the Early Spring lockup, never an app chrome.'],
                ['Reporting','Project P&L the day after wrap. Portfolio view across pitching, awarded, wrapped — without spreadsheets.'],
              ].map(([title,body],i)=><Fade key={title} delay={.1+i*.05}>
                <div style={{borderTop:`1px solid ${INK}`,paddingTop:18}}>
                  <div style={{fontSize:18,fontWeight:800,letterSpacing:'-0.01em',marginBottom:10}}>{title}</div>
                  <p style={{fontSize:14,lineHeight:1.6,color:INK,margin:0,maxWidth:'42ch'}}>{body}</p>
                </div>
              </Fade>)}
            </div>
          </Fade>
        </div>
      </Section>
    </div>

    {/* ═══ Principles ═══ */}
    <div style={{borderTop:`1px solid ${RULE}`,background:T.inkSoft3}}>
      <Section>
        <div style={{display:'grid',gap:'clamp(28px,4vw,48px)'}}>
          <Fade>
            <Kicker>Principles</Kicker>
          </Fade>
          <Fade delay={.05}>
            <div style={{display:'grid',gap:'clamp(20px,3vw,32px)',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',maxWidth:1100}}>
              {[
                ['Paper before texture.','We render on white. Information is the texture.'],
                ['Ink before color.','One blue, used precisely. Everything else is an opacity.'],
                ['Stillness before motion.','Quiet, cubic transitions. Motion confirms; it doesn’t entertain.'],
                ['Type before image.','Lausanne, set carefully. Images live inside the writing, not the other way around.'],
              ].map(([t,b])=><div key={t}>
                <div style={{fontSize:'clamp(20px,2.2vw,28px)',fontWeight:800,letterSpacing:'-0.018em',marginBottom:8,color:INK}}>{t}</div>
                <p style={{fontSize:14,lineHeight:1.6,color:FADED,margin:0,maxWidth:'40ch'}}>{b}</p>
              </div>)}
            </div>
          </Fade>
        </div>
      </Section>
    </div>

    {/* ═══ Final CTA ═══ */}
    <div style={{borderTop:`1px solid ${RULE}`}}>
      <Section style={{paddingTop:'clamp(56px,7vw,96px)',paddingBottom:'clamp(56px,7vw,96px)'}}>
        <div style={{display:'grid',gap:24,maxWidth:760}}>
          <Fade>
            <Kicker>Sign in</Kicker>
          </Fade>
          <Fade delay={.05}>
            <h2 style={{
              fontSize:'clamp(28px,3.4vw,48px)',
              fontWeight:800,
              letterSpacing:'-0.022em',
              lineHeight:1.04,
              margin:0,color:INK,
            }}>
              The team uses it daily. <em>Borrow it if it’s useful.</em>
            </h2>
          </Fade>
          <Fade delay={.1}>
            <div style={{display:'inline-flex',gap:10}}>
              <button onClick={onGetStarted} className="btn-pill" style={{padding:'10px 22px',fontSize:14}}>Continue</button>
            </div>
          </Fade>
        </div>
      </Section>
    </div>

    {/* ═══ Footer ═══ */}
    <footer style={{borderTop:`1px solid ${RULE}`,padding:'clamp(28px,4vw,48px) clamp(20px,3vw,56px)'}}>
      <div style={{maxWidth:1640,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:24,alignItems:'end'}}>
        <div>
          <ESWordmark height={14} color={INK}/>
          <div style={{fontSize:12,color:FADED,marginTop:14,maxWidth:'40ch',lineHeight:1.6}}>Engineering Serendipity · 385 Van Brunt St, Floor 2, Brooklyn NY 11231</div>
        </div>
        <div style={{display:'flex',gap:18,fontSize:12,color:FADED,flexWrap:'wrap'}}>
          <a href="https://earlyspring.nyc" style={{color:'inherit',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=INK} onMouseLeave={e=>e.currentTarget.style.color=FADED}>earlyspring.nyc</a>
          <a href="https://earlyspring.nyc/lab/guidelines" style={{color:'inherit',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=INK} onMouseLeave={e=>e.currentTarget.style.color=FADED}>Lab</a>
          <a href="/privacy" style={{color:'inherit',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=INK} onMouseLeave={e=>e.currentTarget.style.color=FADED}>Privacy</a>
          <a href="/terms" style={{color:'inherit',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color=INK} onMouseLeave={e=>e.currentTarget.style.color=FADED}>Terms</a>
        </div>
        <div style={{fontSize:12,color:FADED,justifySelf:'end'}}>{new Date().getFullYear()}</div>
      </div>
    </footer>
  </div>;
}

export default LandingPage;
