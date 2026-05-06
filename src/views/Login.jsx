import { useState, useEffect, useRef, useCallback } from 'react';
import { getTheme } from '../theme/tokens.js';
const T = getTheme('dark');
import { ROLE_COLORS, ROLE_LABELS } from '../constants/index.js';
import { getStoredUsers } from '../utils/storage.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganWordmark, MorganIsotype } from '../components/brand/MorganLogo.jsx';

/* ── Interactive Constellation Canvas ── */
function ConstellationCanvas(){
  const canvasRef=useRef(null);
  const mouse=useRef({x:-1000,y:-1000});
  const particles=useRef([]);
  const raf=useRef(null);

  const COLORS=['#94A3B8','#7DD3FC','#C4B5FD','#4ADE80','#F59E0B','#EC4899'];
  const COUNT=80;
  const CONNECT_DIST=120;
  const MOUSE_RADIUS=180;

  const init=useCallback((w,h)=>{
    particles.current=[];
    for(let i=0;i<COUNT;i++){
      particles.current.push({
        x:Math.random()*w,y:Math.random()*h,
        vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,
        r:Math.random()*2+1,
        color:COLORS[Math.floor(Math.random()*COLORS.length)],
        baseAlpha:Math.random()*.3+.1,
        alpha:0,phase:Math.random()*Math.PI*2,
      });
    }
  },[]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');
    let w=canvas.width=window.innerWidth;
    let h=canvas.height=window.innerHeight;
    init(w,h);

    const onResize=()=>{w=canvas.width=window.innerWidth;h=canvas.height=window.innerHeight;init(w,h)};
    const onMove=(e)=>{mouse.current={x:e.clientX,y:e.clientY}};
    const onLeave=()=>{mouse.current={x:-1000,y:-1000}};
    window.addEventListener('resize',onResize);
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseleave',onLeave);

    let time=0;
    const draw=()=>{
      time+=.01;
      ctx.clearRect(0,0,w,h);
      const mx=mouse.current.x,my=mouse.current.y;
      const pts=particles.current;

      // Update & draw particles
      for(let i=0;i<pts.length;i++){
        const p=pts[i];
        // Base movement
        p.x+=p.vx;p.y+=p.vy;
        // Wrap edges
        if(p.x<-10)p.x=w+10;if(p.x>w+10)p.x=-10;
        if(p.y<-10)p.y=h+10;if(p.y>h+10)p.y=-10;

        // Mouse attraction
        const dx=mx-p.x,dy=my-p.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<MOUSE_RADIUS){
          const force=(1-dist/MOUSE_RADIUS)*.015;
          p.vx+=dx*force;p.vy+=dy*force;
          p.alpha=p.baseAlpha+(1-dist/MOUSE_RADIUS)*.6;
        }else{
          p.alpha+=(p.baseAlpha-p.alpha)*.02;
        }

        // Damping
        p.vx*=.99;p.vy*=.99;

        // Pulse
        const pulse=Math.sin(time*2+p.phase)*.15+1;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r*pulse,0,Math.PI*2);
        ctx.fillStyle=p.color;
        ctx.globalAlpha=p.alpha;
        ctx.fill();

        // Glow for nearby particles
        if(dist<MOUSE_RADIUS){
          ctx.beginPath();
          ctx.arc(p.x,p.y,p.r*3,0,Math.PI*2);
          const grd=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3);
          grd.addColorStop(0,p.color);
          grd.addColorStop(1,'transparent');
          ctx.fillStyle=grd;
          ctx.globalAlpha=(1-dist/MOUSE_RADIUS)*.15;
          ctx.fill();
        }
      }

      // Draw connections
      ctx.lineWidth=.5;
      for(let i=0;i<pts.length;i++){
        for(let j=i+1;j<pts.length;j++){
          const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y;
          const dist=Math.sqrt(dx*dx+dy*dy);
          if(dist<CONNECT_DIST){
            const alpha=(1-dist/CONNECT_DIST)*.12;
            // Brighter when near mouse
            const midX=(pts[i].x+pts[j].x)/2,midY=(pts[i].y+pts[j].y)/2;
            const mDist=Math.sqrt((mx-midX)**2+(my-midY)**2);
            const boost=mDist<MOUSE_RADIUS?(1-mDist/MOUSE_RADIUS)*.2:0;
            ctx.beginPath();
            ctx.moveTo(pts[i].x,pts[i].y);
            ctx.lineTo(pts[j].x,pts[j].y);
            ctx.strokeStyle=pts[i].color;
            ctx.globalAlpha=alpha+boost;
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha=1;
      raf.current=requestAnimationFrame(draw);
    };
    raf.current=requestAnimationFrame(draw);

    return()=>{
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize',onResize);
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseleave',onLeave);
    };
  },[init]);

  return<canvas ref={canvasRef} style={{position:'fixed',inset:0,zIndex:0}}/>;
}

function Login({onLogin, googleClientId, onGoogleLogin, onEmailLogin, onEmailSignUp, isSupabase}){
  const[err,setErr]=useState("");
  const[showDemo,setShowDemo]=useState(false);
  const[cardHov,setCardHov]=useState(false);
  const[showEmail,setShowEmail]=useState(false);
  const[isSignUp,setIsSignUp]=useState(false);
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[fullName,setFullName]=useState("");
  const[orgName,setOrgName]=useState("");
  const[emailLoading,setEmailLoading]=useState(false);
  const[successMsg,setSuccessMsg]=useState("");
  const users=getStoredUsers();
  const hasClientId=!!googleClientId;

  const handleEmailSubmit=async(e)=>{
    e.preventDefault();
    setErr("");setSuccessMsg("");setEmailLoading(true);
    try{
      if(isSignUp){
        const{error}=await onEmailSignUp(email,password,fullName,orgName);
        if(error){setErr(error)}
        else{setSuccessMsg("Check your email to confirm your account.")}
      }else{
        const{error}=await onEmailLogin(email,password);
        if(error){setErr(error)}
      }
    }catch(e){setErr("Something went wrong. Try again.")}
    setEmailLoading(false);
  };

  // Google sign-in initialization — preserved exactly
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

  return<div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0A0A0D',fontFamily:T.sans,position:'relative',overflow:'hidden'}}>
    <ConstellationCanvas/>

    {/* Accent line */}
    <div style={{position:'fixed',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${T.gold},${T.cyan},${T.magenta},${T.pos})`,opacity:.5,zIndex:10}}/>

    {/* ── Card ── */}
    <div
      className="fade-up"
      onMouseEnter={()=>setCardHov(true)}
      onMouseLeave={()=>setCardHov(false)}
      style={{
        width:380,padding:'52px 44px',borderRadius:16,
        background:'rgba(10,10,14,.75)',
        backdropFilter:'blur(60px) saturate(1.2)',
        WebkitBackdropFilter:'blur(60px) saturate(1.2)',
        border:`1px solid ${cardHov?'rgba(148,163,184,.15)':'rgba(255,255,255,.06)'}`,
        boxShadow:cardHov
          ?'0 0 60px rgba(148,163,184,.08), 0 24px 80px rgba(0,0,0,.5), 0 0 120px rgba(125,211,252,.03)'
          :'0 24px 80px rgba(0,0,0,.5)',
        position:'relative',zIndex:2,
        transition:'border-color .4s, box-shadow .4s',
        textAlign:'center',
      }}
    >
      {/* Isotype + Wordmark */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
          <MorganIsotype size={48} color={T.gold}/>
        </div>
        <MorganWordmark height={24} color={T.cream}/>
        <div style={{fontSize:11,color:T.dim,marginTop:8,letterSpacing:'.06em'}}>by Early Spring</div>
      </div>

      {/* Tagline */}
      <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:'-0.03em',marginBottom:8,lineHeight:1.3}}>
        Brief to build. One tool.
      </h1>
      <p style={{fontSize:13,color:T.dimH,marginBottom:36,lineHeight:1.6}}>
        Total project management for<br/>people who build experiences.
      </p>

      {/* Auth */}
      {err&&<p style={{fontSize:11,color:T.neg,marginBottom:14,padding:'8px 12px',borderRadius:T.rS,background:'rgba(248,113,113,.08)',border:'1px solid rgba(248,113,113,.15)',textAlign:'left'}}>{err}</p>}

      {isSupabase?<button onClick={onGoogleLogin} style={{
        width:'100%',padding:'14px 20px',borderRadius:10,
        border:'1px solid rgba(255,255,255,.08)',
        background:'rgba(255,255,255,.04)',
        color:T.cream,fontSize:14,fontWeight:500,
        cursor:'pointer',fontFamily:T.sans,
        display:'flex',alignItems:'center',justifyContent:'center',gap:12,
        transition:'all .25s',
      }} onMouseEnter={e=>{
        e.currentTarget.style.background='rgba(255,255,255,.1)';
        e.currentTarget.style.borderColor='rgba(148,163,184,.25)';
        e.currentTarget.style.transform='translateY(-2px)';
        e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,.3)';
      }} onMouseLeave={e=>{
        e.currentTarget.style.background='rgba(255,255,255,.04)';
        e.currentTarget.style.borderColor='rgba(255,255,255,.08)';
        e.currentTarget.style.transform='none';
        e.currentTarget.style.boxShadow='none';
      }}>
        <svg width={20} height={20} viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>
      :hasClientId?<div id="google-signin-btn" style={{display:'flex',justifyContent:'center',marginBottom:12}}/>
      :<div style={{textAlign:'center',marginBottom:12}}>
        <p style={{fontSize:11,color:T.dim}}>Google sign-in not configured.</p>
      </div>}

      {/* Divider */}
      {isSupabase&&onEmailLogin&&<div style={{display:'flex',alignItems:'center',gap:12,margin:'20px 0'}}>
        <div style={{flex:1,height:1,background:'rgba(255,255,255,.08)'}}/>
        <span style={{fontSize:10,color:'rgba(255,255,255,.2)',textTransform:'uppercase',letterSpacing:'.08em'}}>or</span>
        <div style={{flex:1,height:1,background:'rgba(255,255,255,.08)'}}/>
      </div>}

      {/* Email auth */}
      {isSupabase&&onEmailLogin&&!showEmail&&<button onClick={()=>setShowEmail(true)} style={{
        width:'100%',padding:'14px 20px',borderRadius:10,
        border:'1px solid rgba(255,255,255,.08)',
        background:'transparent',
        color:T.dimH,fontSize:14,fontWeight:500,
        cursor:'pointer',fontFamily:T.sans,
        transition:'all .25s',
      }} onMouseEnter={e=>{
        e.currentTarget.style.background='rgba(255,255,255,.04)';
        e.currentTarget.style.borderColor='rgba(148,163,184,.15)';
        e.currentTarget.style.color=T.cream;
      }} onMouseLeave={e=>{
        e.currentTarget.style.background='transparent';
        e.currentTarget.style.borderColor='rgba(255,255,255,.08)';
        e.currentTarget.style.color=T.dimH;
      }}>
        Continue with email
      </button>}

      {isSupabase&&showEmail&&<form onSubmit={handleEmailSubmit} style={{display:'flex',flexDirection:'column',gap:10}}>
        {isSignUp&&<input type="text" placeholder="Organization name" value={orgName} onChange={e=>setOrgName(e.target.value)} style={{
          width:'100%',padding:'12px 14px',borderRadius:8,
          border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.04)',
          color:T.cream,fontSize:13,fontFamily:T.sans,outline:'none',
          transition:'border-color .2s',boxSizing:'border-box',
        }} onFocus={e=>e.currentTarget.style.borderColor='rgba(148,163,184,.25)'} onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.08)'}/>}
        {isSignUp&&<input type="text" placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} style={{
          width:'100%',padding:'12px 14px',borderRadius:8,
          border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.04)',
          color:T.cream,fontSize:13,fontFamily:T.sans,outline:'none',
          transition:'border-color .2s',boxSizing:'border-box',
        }} onFocus={e=>e.currentTarget.style.borderColor='rgba(148,163,184,.25)'} onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.08)'}/>}
        <input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} required style={{
          width:'100%',padding:'12px 14px',borderRadius:8,
          border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.04)',
          color:T.cream,fontSize:13,fontFamily:T.sans,outline:'none',
          transition:'border-color .2s',boxSizing:'border-box',
        }} onFocus={e=>e.currentTarget.style.borderColor='rgba(148,163,184,.25)'} onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.08)'}/>
        <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} style={{
          width:'100%',padding:'12px 14px',borderRadius:8,
          border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.04)',
          color:T.cream,fontSize:13,fontFamily:T.sans,outline:'none',
          transition:'border-color .2s',boxSizing:'border-box',
        }} onFocus={e=>e.currentTarget.style.borderColor='rgba(148,163,184,.25)'} onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.08)'}/>
        {successMsg&&<p style={{fontSize:11,color:T.pos,padding:'8px 12px',borderRadius:T.rS,background:'rgba(52,211,153,.08)',border:'1px solid rgba(52,211,153,.15)',textAlign:'left',margin:0}}>{successMsg}</p>}
        <button type="submit" disabled={emailLoading} style={{
          width:'100%',padding:'14px 20px',borderRadius:10,
          border:'none',background:T.cream,color:'#0A0A0D',
          fontSize:14,fontWeight:600,cursor:emailLoading?'wait':'pointer',
          fontFamily:T.sans,transition:'all .25s',
          opacity:emailLoading?.6:1,
        }} onMouseEnter={e=>{if(!emailLoading){e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,.3)'}}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>
          {emailLoading?'...':(isSignUp?'Create account':'Sign in')}
        </button>
        <button type="button" onClick={()=>{setIsSignUp(!isSignUp);setErr("");setSuccessMsg("")}} style={{
          background:'none',border:'none',color:T.dim,fontSize:11,
          cursor:'pointer',fontFamily:T.sans,padding:'4px 0',
          transition:'color .2s',
        }} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>
          {isSignUp?'Already have an account? Sign in':'Don\u2019t have an account? Sign up'}
        </button>
      </form>}

      <div style={{marginTop:16}}>
        <p style={{fontSize:10,color:'rgba(255,255,255,.2)'}}>{isSupabase?'Sign in to create or join a team':'Only authorized team members can access'}</p>
      </div>

      {/* Dev mode */}
      {!showDemo&&<div style={{marginTop:24}}><button onClick={()=>setShowDemo(true)} style={{background:'none',border:'none',color:T.dim,fontSize:9,cursor:'pointer',fontFamily:T.sans,opacity:.3,transition:'opacity .2s',letterSpacing:'.04em'}} onMouseEnter={e=>e.currentTarget.style.opacity=.8} onMouseLeave={e=>e.currentTarget.style.opacity=.3}>dev mode</button></div>}
      {showDemo&&<div style={{marginTop:24,borderTop:`1px solid ${T.border}`,paddingTop:16,textAlign:'left'}}>
        <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Select Account</div>
        {users.map(u=><button key={u.id} onClick={()=>demoLogin(u)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'transparent',border:`1px solid rgba(255,255,255,.04)`,borderRadius:8,cursor:'pointer',marginBottom:4,transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.borderColor='rgba(255,255,255,.1)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='rgba(255,255,255,.04)'}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:`${ROLE_COLORS[u.role]}10`,border:`1.5px solid ${ROLE_COLORS[u.role]}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:ROLE_COLORS[u.role]}}>{u.name[0]}</div>
          <div style={{flex:1,textAlign:'left'}}><div style={{fontSize:12,fontWeight:500,color:T.cream}}>{u.name}</div><div style={{fontSize:9,color:T.dim}}>{u.email}</div></div>
          <span style={{fontSize:8,fontWeight:700,padding:'2px 7px',borderRadius:20,background:`${ROLE_COLORS[u.role]}12`,color:ROLE_COLORS[u.role],textTransform:'uppercase',letterSpacing:'.04em'}}>{ROLE_LABELS[u.role]}</span>
        </button>)}
      </div>}
    </div>
  </div>;
}

export default Login;
