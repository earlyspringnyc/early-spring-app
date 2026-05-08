import { useState, useEffect } from 'react';
import T from '../theme/tokens.js';
import { ROLE_COLORS, ROLE_LABELS } from '../constants/index.js';
import { getStoredUsers } from '../utils/storage.js';
import { ESWordmark } from '../components/brand/index.js';
import { MorganWordmark, MorganIsotype } from '../components/brand/MorganLogo.jsx';

const PAPER = T.paper;
const INK = T.ink;
const RULE = T.faintRule;
const FADED = T.fadedInk;

function Login({onLogin, googleClientId, onGoogleLogin, onEmailLogin, onEmailSignUp, isSupabase}){
  const[err,setErr]=useState("");
  const[showDemo,setShowDemo]=useState(false);
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

  // Google sign-in (legacy non-Supabase path)
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
      if(el){window.google.accounts.id.renderButton(el,{theme:'outline',size:'large',width:'320',text:'continue_with'});return true}
      return false;
    };
    if(!tryRender()){const interval=setInterval(()=>{if(tryRender())clearInterval(interval)},200);return()=>clearInterval(interval)}
  },[hasClientId,googleClientId,onLogin]);

  const demoLogin=(u)=>{setErr("");onLogin(u)};

  const inputStyle={
    width:'100%',padding:'14px 0 12px',
    border:'none',borderBottom:`1px solid ${RULE}`,
    background:'transparent',
    color:INK,fontSize:15,fontFamily:T.sans,fontWeight:400,
    outline:'none',boxSizing:'border-box',
    transition:'border-color .18s ease',
  };
  const onFocus=e=>e.currentTarget.style.borderBottomColor=INK;
  const onBlur=e=>e.currentTarget.style.borderBottomColor=RULE;

  return<div style={{minHeight:'100vh',background:PAPER,color:INK,fontFamily:T.sans,display:'flex',flexDirection:'column'}}>

    {/* Top rule */}
    <div style={{height:1,background:RULE}}/>

    {/* Lockup nav */}
    <div style={{padding:'clamp(20px,3vw,40px) clamp(20px,3vw,56px)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <a href="https://earlyspring.nyc" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:14}}>
        <ESWordmark height={14} color={INK}/>
      </a>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:FADED}}>Lab · Morgan</div>
    </div>

    {/* Body */}
    <div className="fade-up" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'clamp(40px,8vw,96px) clamp(20px,3vw,56px)'}}>
      <div style={{width:'100%',maxWidth:520,display:'grid',gap:'clamp(28px,4vw,40px)'}}>

        {/* Kicker + headline */}
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
            <MorganIsotype size={28} color={INK}/>
            <MorganWordmark height={14} color={INK} tracking=".34em"/>
          </div>
          <h1 style={{
            fontSize:'clamp(34px,5.4vw,64px)',
            fontWeight:800,
            letterSpacing:'-0.028em',
            lineHeight:0.98,
            margin:0,
            color:INK,
          }}>
            Brief to build.<br/>One tool.
          </h1>
          <p style={{
            marginTop:18,fontSize:15,lineHeight:1.6,color:FADED,
            maxWidth:'40ch',
          }}>
            An internal production tool for the Early Spring team — budgets, timelines, vendors, and client deliverables in one place.
          </p>
        </div>

        {/* Auth */}
        <div style={{display:'grid',gap:14}}>
          {err&&<p style={{
            fontSize:12,color:T.alert,
            padding:'10px 14px',borderLeft:`2px solid ${T.alert}`,
            background:T.alertSoft,
          }}>{err}</p>}

          {isSupabase
            ?<button onClick={onGoogleLogin} className="btn-rect" style={{width:'100%'}}>
              <svg width={18} height={18} viewBox="0 0 24 24" style={{flexShrink:0}}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>
            :hasClientId
              ?<div id="google-signin-btn"/>
              :<p style={{fontSize:12,color:FADED}}>Google sign-in not configured.</p>}

          {isSupabase&&onEmailLogin&&!showEmail&&<>
            <div style={{display:'flex',alignItems:'center',gap:14,fontSize:11,fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:FADED}}>
              <span style={{flex:1,height:1,background:RULE}}/>or<span style={{flex:1,height:1,background:RULE}}/>
            </div>
            <button onClick={()=>setShowEmail(true)} className="btn-rect" style={{width:'100%',background:'transparent'}}>
              Continue with email
            </button>
          </>}

          {isSupabase&&showEmail&&<form onSubmit={handleEmailSubmit} style={{display:'grid',gap:8}}>
            {isSignUp&&<input type="text" placeholder="Organization" value={orgName} onChange={e=>setOrgName(e.target.value)} style={inputStyle} onFocus={onFocus} onBlur={onBlur}/>}
            {isSignUp&&<input type="text" placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} style={inputStyle} onFocus={onFocus} onBlur={onBlur}/>}
            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required style={inputStyle} onFocus={onFocus} onBlur={onBlur}/>
            <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} style={inputStyle} onFocus={onFocus} onBlur={onBlur}/>
            {successMsg&&<p style={{fontSize:12,color:INK,padding:'10px 14px',borderLeft:`2px solid ${INK}`,background:T.inkSoft}}>{successMsg}</p>}
            <button type="submit" disabled={emailLoading} className="btn-rect btn-rect-solid" style={{width:'100%',marginTop:14,opacity:emailLoading?.6:1,cursor:emailLoading?'wait':'pointer'}}>
              {emailLoading?'…':(isSignUp?'Create account':'Sign in')}
            </button>
            <button type="button" onClick={()=>{setIsSignUp(!isSignUp);setErr("");setSuccessMsg("")}} style={{
              background:'none',border:'none',color:FADED,fontSize:12,
              cursor:'pointer',fontFamily:T.sans,padding:'10px 0 0 0',textAlign:'left',
            }} onMouseEnter={e=>e.currentTarget.style.color=INK} onMouseLeave={e=>e.currentTarget.style.color=FADED}>
              {isSignUp?'Already have an account? Sign in':'Don’t have an account? Sign up'}
            </button>
          </form>}

          <p style={{fontSize:11,color:FADED,letterSpacing:'.04em',marginTop:6}}>
            {isSupabase?'Sign in to create or join a team.':'Only authorized team members can access.'}
          </p>
        </div>

        {/* Dev mode */}
        {!showDemo&&<button onClick={()=>setShowDemo(true)} style={{background:'none',border:'none',color:FADED,fontSize:10,cursor:'pointer',fontFamily:T.sans,letterSpacing:'.10em',textTransform:'uppercase',fontWeight:700,padding:0,textAlign:'left',justifySelf:'start'}} onMouseEnter={e=>e.currentTarget.style.color=INK} onMouseLeave={e=>e.currentTarget.style.color=FADED}>dev mode</button>}
        {showDemo&&<div style={{borderTop:`1px solid ${RULE}`,paddingTop:20}}>
          <div style={{fontSize:11,fontWeight:700,color:FADED,textTransform:'uppercase',letterSpacing:'.10em',marginBottom:14}}>Select Account</div>
          <div style={{display:'grid',gap:6}}>
            {users.map(u=><button key={u.id} onClick={()=>demoLogin(u)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:'transparent',border:`1px solid ${RULE}`,borderRadius:8,cursor:'pointer',fontFamily:T.sans,textAlign:'left'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=INK}} onMouseLeave={e=>{e.currentTarget.style.borderColor=RULE}}>
              <div style={{width:30,height:30,borderRadius:'50%',background:T.inkSoft,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:INK}}>{u.name[0]}</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:INK}}>{u.name}</div><div style={{fontSize:11,color:FADED}}>{u.email}</div></div>
              <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:999,border:`1px solid ${ROLE_COLORS[u.role]||INK}`,color:ROLE_COLORS[u.role]||INK,textTransform:'uppercase',letterSpacing:'.06em'}}>{ROLE_LABELS[u.role]}</span>
            </button>)}
          </div>
        </div>}
      </div>
    </div>

    {/* Footer */}
    <div style={{padding:'24px clamp(20px,3vw,56px)',borderTop:`1px solid ${RULE}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
      <div style={{fontSize:11,color:FADED,letterSpacing:'.04em'}}>Engineering Serendipity · Early Spring</div>
      <div style={{fontSize:11,color:FADED,letterSpacing:'.04em'}}>{new Date().getFullYear()}</div>
    </div>
  </div>;
}

export default Login;
