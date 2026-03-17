import { useState } from 'react';
import T from '../theme/tokens.js';
import { ROLE_COLORS, ROLE_LABELS, GOOGLE_CLIENT_ID } from '../constants/index.js';
import { getStoredUsers } from '../utils/storage.js';
import { ESWordmark } from '../components/brand/index.js';
import { GoogleIcon } from '../components/icons/index.js';

function Login({onLogin}){
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);const[showDemo,setShowDemo]=useState(false);
  const[dots]=useState(()=>{const d=[];for(let i=0;i<35;i++)d.push({x:Math.random()*100,y:Math.random()*100,s:Math.random()*2+1,o:Math.random()*.25+.05,c:i%3});return d});
  const users=getStoredUsers();
  const googleSignIn=()=>{
    if(GOOGLE_CLIENT_ID){
      window.location.href=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin+"/auth/callback")}&response_type=token&scope=email+profile+https://www.googleapis.com/auth/calendar+https://www.googleapis.com/auth/gmail.send`;
    }else{
      setShowDemo(true);
    }
  };
  const demoLogin=(u)=>{setErr("");onLogin(u)};
  return<div className="scanlines retro-grid" style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bgGrad,fontFamily:T.sans,position:"relative",overflow:"hidden"}}>
    {dots.map((d,i)=><div key={i} style={{position:"absolute",left:`${d.x}%`,top:`${d.y}%`,width:d.s,height:d.s,borderRadius:"50%",background:d.c===0?T.gold:d.c===1?T.cyan:T.magenta,opacity:d.o,animation:`glow ${3+Math.random()*4}s ease-in-out infinite`}}/>)}
    <div className="fade-up modal-inner" style={{width:400,padding:44,borderRadius:T.r,background:"rgba(12,10,20,.85)",backdropFilter:"blur(40px)",border:`1px solid ${T.border}`,boxShadow:T.shadow,position:"relative",zIndex:1}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{marginBottom:14}}><ESWordmark height={18} color={T.gold}/></div>
        <h1 style={{fontSize:26,fontWeight:600,color:T.cream,fontFamily:T.serif,letterSpacing:"-0.01em"}}>Production Tool</h1>
        <p style={{fontSize:12,color:T.dim,marginTop:8,fontFamily:T.serif,fontStyle:"italic"}}>Sign in with your Google account</p>
      </div>
      {err&&<p style={{fontSize:12,color:T.neg,marginBottom:14,textAlign:"center"}}>{err}</p>}
      <button onClick={googleSignIn} style={{width:"100%",padding:"13px 20px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"rgba(255,255,255,.04)",color:T.cream,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:T.sans,display:"flex",alignItems:"center",justifyContent:"center",gap:12,transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.08)";e.currentTarget.style.borderColor=T.borderGlow}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.04)";e.currentTarget.style.borderColor=T.border}}>
        <GoogleIcon size={20}/> Continue with Google
      </button>
      <div style={{textAlign:"center",marginTop:20}}><p style={{fontSize:10,color:T.dim,fontFamily:T.serif,fontStyle:"italic"}}>Only authorized team members can access projects</p></div>
      {!showDemo&&<div style={{textAlign:"center",marginTop:16}}><button onClick={()=>setShowDemo(true)} style={{background:"none",border:"none",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans,textDecoration:"underline",opacity:.5}}>Dev mode: select account</button></div>}
      {showDemo&&<div style={{marginTop:20,borderTop:`1px solid ${T.border}`,paddingTop:16}}>
        <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Select Account (Dev Mode)</div>
        {users.map(u=><button key={u.id} onClick={()=>demoLogin(u)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:T.rS,cursor:"pointer",marginBottom:6,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.surfHov;e.currentTarget.style.borderColor=T.borderGlow}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=T.border}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${ROLE_COLORS[u.role]}22,${ROLE_COLORS[u.role]}08)`,border:`1.5px solid ${ROLE_COLORS[u.role]}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:ROLE_COLORS[u.role]}}>{u.name[0]}</div>
          <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:13,fontWeight:500,color:T.cream}}>{u.name}</div><div style={{fontSize:10,color:T.dim}}>{u.email}</div></div>
          <span style={{fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:8,background:`${ROLE_COLORS[u.role]}18`,color:ROLE_COLORS[u.role],textTransform:"uppercase"}}>{ROLE_LABELS[u.role]}</span>
        </button>)}
      </div>}
    </div>
  </div>;
}

export default Login;
