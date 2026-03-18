import { useState, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { ROLE_COLORS, ROLE_LABELS } from '../constants/index.js';
import { getStoredUsers } from '../utils/storage.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganWordmark, MorganIsotype } from '../components/brand/MorganLogo.jsx';

/* ── Animated grid background ── */
function GridBackground(){
  return<div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}>
    {/* Slow-moving gradient orbs */}
    <div style={{position:'absolute',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,.06),transparent 70%)',top:'-10%',left:'-10%',animation:'orbFloat 20s ease-in-out infinite'}}/>
    <div style={{position:'absolute',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(20,184,166,.05),transparent 70%)',bottom:'-5%',right:'-5%',animation:'orbFloat 25s ease-in-out infinite reverse'}}/>
    <div style={{position:'absolute',width:300,height:300,borderRadius:'50%',background:'radial-gradient(circle,rgba(196,181,253,.04),transparent 70%)',top:'40%',left:'30%',animation:'orbFloat 18s ease-in-out infinite 5s'}}/>
    {/* Subtle grid lines */}
    <div style={{position:'absolute',inset:0,backgroundImage:`linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)`,backgroundSize:'60px 60px',opacity:.5}}/>
    <style>{`@keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}25%{transform:translate(30px,-20px) scale(1.05)}50%{transform:translate(-10px,30px) scale(.95)}75%{transform:translate(20px,10px) scale(1.02)}}`}</style>
  </div>;
}

/* ── Mini dashboard mockup ── */
function MiniDashboard(){
  const C={indigo:'#6366F1',teal:'#14B8A6',amber:'#F59E0B',coral:'#F47264',emerald:'#10B981',cyan:'#06B6D4'};
  return<div style={{padding:14,height:'100%',display:'flex',flexDirection:'column',gap:6,fontFamily:T.sans}}>
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <span style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,.6)'}}>Dashboard</span>
      <span style={{flex:1}}/>
      <span style={{fontSize:5,color:'rgba(255,255,255,.12)'}}>Montauk Capital Launch</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4}}>
      {[{l:'Client Budget',v:'$340K',c:C.amber},{l:'Project Total',v:'$287K',c:C.teal},{l:'Net Profit',v:'$59K',c:C.emerald}].map((m,i)=>
        <div key={i} style={{padding:'6px',borderRadius:4,background:`${m.c}06`,borderLeft:`2px solid ${m.c}`}}>
          <div style={{fontSize:4,color:'rgba(255,255,255,.2)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:2}}>{m.l}</div>
          <div style={{fontSize:9,fontWeight:700,fontFamily:T.mono,color:m.c}}>{m.v}</div>
        </div>)}
    </div>
    <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
      <div style={{borderRadius:4,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.03)',padding:8}}>
        <div style={{fontSize:4,color:'rgba(255,255,255,.15)',textTransform:'uppercase',marginBottom:5}}>Tasks</div>
        {['Venue Walkthrough','Design Review','AV Spec','Load In'].map((t,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:3,padding:'2px 0'}}>
          <div style={{width:4,height:4,borderRadius:1,background:[C.teal,C.coral,C.teal,C.amber][i],opacity:.5}}/>
          <span style={{fontSize:4,color:'rgba(255,255,255,.25)'}}>{t}</span>
        </div>)}
      </div>
      <div style={{borderRadius:4,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.03)',padding:8}}>
        <div style={{fontSize:4,color:'rgba(255,255,255,.15)',textTransform:'uppercase',marginBottom:5}}>Vendors</div>
        {['Prism AV','Bloom & Stem','Atlas Staging'].map((v,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:3,padding:'2px 0'}}>
          <div style={{width:8,height:8,borderRadius:2,background:`${[C.teal,C.amber,C.coral][i]}10`,border:`1px solid ${[C.teal,C.amber,C.coral][i]}20`,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:3,fontWeight:700,color:[C.teal,C.amber,C.coral][i]}}>{v[0]}</span>
          </div>
          <span style={{fontSize:4,color:'rgba(255,255,255,.25)'}}>{v}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

/* ── MacBook frame (compact) ── */
function MacBookCompact({children}){
  return<div>
    <div style={{background:'linear-gradient(180deg,#2A2A2E,#1C1C1F)',borderRadius:'10px 10px 0 0',padding:'6px 10px 5px',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}>
      <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:60,height:10,background:'#1C1C1F',borderRadius:'0 0 6px 6px',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{width:3,height:3,borderRadius:'50%',background:'rgba(255,255,255,.04)'}}/>
      </div>
      <div style={{background:'#0A0A0C',borderRadius:4,overflow:'hidden',width:420,height:260,border:'1px solid rgba(255,255,255,.04)'}}>
        {children}
      </div>
    </div>
    <div style={{height:2,background:'linear-gradient(90deg,transparent 10%,rgba(255,255,255,.08) 30%,rgba(255,255,255,.1) 50%,rgba(255,255,255,.08) 70%,transparent 90%)'}}/>
    <div style={{background:'linear-gradient(180deg,#2A2A2E,#222225)',borderRadius:'0 0 8px 8px',height:10,position:'relative'}}>
      <div style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:'28%',height:2,borderRadius:1,background:'rgba(255,255,255,.03)'}}/>
    </div>
  </div>;
}

function Login({onLogin, googleClientId, onGoogleLogin, isSupabase}){
  const[err,setErr]=useState("");
  const[showDemo,setShowDemo]=useState(false);
  const users=getStoredUsers();
  const hasClientId=!!googleClientId;

  useEffect(()=>{
    if(!hasClientId)return;
    const tryRender=()=>{
      if(!window.google?.accounts?.id)return false;
      window.google.accounts.id.initialize({
        client_id:googleClientId,
        callback:(response)=>{
          try{
            const payload=JSON.parse(atob(response.credential.split('.')[1]));
            const email=payload.email;
            const name=payload.name||payload.given_name||email.split('@')[0];
            const avatar=payload.picture||'';
            const team=getStoredUsers();
            const teamMember=team.find(u=>u.email.toLowerCase()===email.toLowerCase());
            if(teamMember){onLogin({...teamMember,name,avatar,googleId:payload.sub})}
            else{setErr('Not authorized. Ask an admin to add '+email+' to the team.')}
          }catch(e){setErr('Sign-in failed. Please try again.')}
        },
      });
      const el=document.getElementById("google-signin-btn");
      if(el){window.google.accounts.id.renderButton(el,{theme:'filled_black',size:'large',width:'320',text:'continue_with'});return true}
      return false;
    };
    if(!tryRender()){const interval=setInterval(()=>{if(tryRender())clearInterval(interval)},200);return()=>clearInterval(interval)}
  },[hasClientId,googleClientId,onLogin]);

  const demoLogin=(u)=>{setErr("");onLogin(u)};

  return<div style={{height:'100vh',display:'flex',background:T.bg,fontFamily:T.sans,position:'relative',overflow:'hidden'}}>
    <GridBackground/>
    {/* Accent line */}
    <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${T.gold},${T.cyan},${T.magenta},${T.pos})`,opacity:.4,zIndex:10}}/>

    {/* ── Left: Mockup showcase ── */}
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',zIndex:1}}>
      <div className="fade-up" style={{textAlign:'center'}}>
        <MacBookCompact>
          <MiniDashboard/>
        </MacBookCompact>
        <div style={{marginTop:28,fontSize:13,color:T.dim,lineHeight:1.6,maxWidth:340,margin:'28px auto 0'}}>
          Budgets, timelines, vendors, and client deliverables — all in one place.
        </div>
      </div>
    </div>

    {/* ── Right: Sign in form ── */}
    <div style={{width:460,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',zIndex:1}}>
      <div className="fade-up" style={{width:360,padding:'48px 40px',borderRadius:T.r,background:'rgba(12,10,20,.7)',backdropFilter:'blur(40px)',border:`1px solid ${T.border}`,boxShadow:'0 24px 80px rgba(0,0,0,.4)'}}>
        {/* Branding */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <MorganIsotype size={28} color={T.gold}/>
          <MorganWordmark height={20} color={T.cream}/>
        </div>
        <h1 style={{fontSize:24,fontWeight:700,color:T.cream,letterSpacing:'-0.03em',marginBottom:6}}>Welcome back.</h1>
        <p style={{fontSize:13,color:T.dim,marginBottom:32}}>Sign in to access your projects.</p>

        {err&&<p style={{fontSize:12,color:T.neg,marginBottom:14,padding:'8px 12px',borderRadius:T.rS,background:'rgba(248,113,113,.08)',border:'1px solid rgba(248,113,113,.15)'}}>{err}</p>}

        {isSupabase?<button onClick={onGoogleLogin} style={{width:'100%',padding:'14px 20px',borderRadius:T.rS,border:`1px solid ${T.border}`,background:'rgba(255,255,255,.04)',color:T.cream,fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:T.sans,display:'flex',alignItems:'center',justifyContent:'center',gap:12,transition:'all .2s',marginBottom:12}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.08)';e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.transform='translateY(-1px)'}} onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform='none'}}>
          <svg width={20} height={20} viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        :hasClientId?<div id="google-signin-btn" style={{display:'flex',justifyContent:'center',marginBottom:12}}/>
        :<div style={{textAlign:'center',marginBottom:12}}>
          <p style={{fontSize:11,color:T.dim,marginBottom:10}}>Google sign-in not configured.</p>
        </div>}

        <div style={{textAlign:'center',marginTop:8}}>
          <p style={{fontSize:10,color:T.dim}}>{isSupabase?'Sign in to create or join a team':'Only authorized team members can access projects'}</p>
        </div>

        {/* Dev mode toggle */}
        {!showDemo&&<div style={{textAlign:'center',marginTop:20}}><button onClick={()=>setShowDemo(true)} style={{background:'none',border:'none',color:T.dim,fontSize:10,cursor:'pointer',fontFamily:T.sans,opacity:.4,transition:'opacity .2s'}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.4}>Dev mode</button></div>}
        {showDemo&&<div style={{marginTop:20,borderTop:`1px solid ${T.border}`,paddingTop:16}}>
          <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Select Account</div>
          {users.map(u=><button key={u.id} onClick={()=>demoLogin(u)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'transparent',border:`1px solid ${T.border}`,borderRadius:T.rS,cursor:'pointer',marginBottom:4,transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.borderColor=T.borderGlow}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor=T.border}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:`${ROLE_COLORS[u.role]}12`,border:`1.5px solid ${ROLE_COLORS[u.role]}33`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:ROLE_COLORS[u.role]}}>{u.name[0]}</div>
            <div style={{flex:1,textAlign:'left'}}><div style={{fontSize:12,fontWeight:500,color:T.cream}}>{u.name}</div><div style={{fontSize:9,color:T.dim}}>{u.email}</div></div>
            <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:20,background:`${ROLE_COLORS[u.role]}15`,color:ROLE_COLORS[u.role],textTransform:'uppercase'}}>{ROLE_LABELS[u.role]}</span>
          </button>)}
        </div>}
      </div>
    </div>
  </div>;
}

export default Login;
