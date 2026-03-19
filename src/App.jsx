import { useState, useEffect, useCallback } from 'react';
import T, { setThemeMode } from './theme/tokens.js';
import { uid } from './utils/uid.js';
import { GOOGLE_CLIENT_ID } from './constants/index.js';
import { useSupabaseAuth } from './hooks/useSupabaseAuth.js';
import { useGoogleAuth } from './hooks/useGoogleAuth.js';
import { useProjects } from './hooks/useProjects.js';
import { useVendors } from './hooks/useVendors.js';
import { isSupabaseConfigured } from './lib/supabase.js';
import Login from './views/Login.jsx';
import LandingPage from './views/LandingPage.jsx';
import PortfolioDash from './views/PortfolioDash.jsx';
import ProjectView from './views/ProjectView.jsx';
import NewProjectModal from './components/modals/NewProjectModal.jsx';
import SharedClientView from './views/SharedClientView.jsx';

const MAX_UNDO=15;

/* ── Drive Onboarding Modal — shown once for new users ── */
function DriveOnboarding({accessToken,onComplete,onSkip}){
  const[drives,setDrives]=useState([]);
  const[loading,setLoading]=useState(false);
  const[setting,setSetting]=useState(false);

  useEffect(()=>{
    if(!accessToken)return;
    setLoading(true);
    fetch("https://www.googleapis.com/drive/v3/drives?pageSize=50",{headers:{Authorization:`Bearer ${accessToken}`}})
      .then(r=>r.ok?r.json():{drives:[]}).then(d=>setDrives(d.drives||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[accessToken]);

  const selectDrive=async(driveId,driveName)=>{
    setSetting(true);
    try{localStorage.setItem("es_drive_location",JSON.stringify({driveId,driveName:driveName||"My Drive"}))}catch(e){}
    onComplete(driveId,driveName);
  };

  return<div style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.sans}}>
    <div style={{width:"100%",maxWidth:480,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r,boxShadow:"0 24px 80px rgba(0,0,0,.5)",padding:32}}>
      <div style={{fontSize:20,fontWeight:700,color:T.cream,marginBottom:8}}>Connect Google Drive</div>
      <p style={{fontSize:13,color:T.dim,lineHeight:1.6,marginBottom:6}}>Morgan stores all your project files — budgets, creative assets, client documents — in Google Drive so nothing is lost when you switch devices or clear your browser.</p>
      <p style={{fontSize:12,color:T.gold,lineHeight:1.6,marginBottom:24}}>We recommend setting this up now to keep your files safe.</p>

      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
        <button onClick={()=>selectDrive(null,"My Drive")} disabled={setting} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontWeight:500,cursor:setting?"wait":"pointer",fontFamily:T.sans,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderGlow} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
          <span style={{fontSize:18}}>&#128193;</span>
          <div><div>My Drive</div><div style={{fontSize:10,color:T.dim,marginTop:2}}>Personal Google Drive</div></div>
        </button>
        {loading&&<div style={{textAlign:"center",padding:12,color:T.dim,fontSize:12}}>Loading shared drives...</div>}
        {drives.map(d=><button key={d.id} onClick={()=>selectDrive(d.id,d.name)} disabled={setting} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:T.surfEl,color:T.cream,fontSize:13,fontWeight:500,cursor:setting?"wait":"pointer",fontFamily:T.sans,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderGlow} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
          <span style={{fontSize:18}}>&#128101;</span>
          <div><div>{d.name}</div><div style={{fontSize:10,color:T.dim,marginTop:2}}>Shared Drive</div></div>
        </button>)}
      </div>

      {setting&&<div style={{textAlign:"center",padding:12,color:T.gold,fontSize:12}}>Setting up Drive...</div>}

      <button onClick={onSkip} style={{width:"100%",padding:"10px 0",background:"none",border:"none",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>Skip for now (files will only be saved locally)</button>
    </div>
  </div>;
}

function App(){
  // Check for share link
  const shareToken=new URLSearchParams(window.location.search).get("share");
  if(shareToken)return<SharedClientView token={shareToken}/>;

  // Auth: use Supabase when configured, otherwise fall back to old auth
  const sbAuth = useSupabaseAuth();
  const gAuth = useGoogleAuth();
  const usesSupa = isSupabaseConfigured();

  const user = usesSupa ? sbAuth.user : gAuth.user;
  const accessToken = usesSupa ? sbAuth.accessToken : gAuth.accessToken;
  const rawLogout = usesSupa ? sbAuth.logout : gAuth.logout;
  const setUser = usesSupa ? sbAuth.setDevUser : gAuth.setUser;
  const loginWithGoogle = usesSupa ? sbAuth.login : null;
  const doLogout = useCallback(()=>{
    // Data is already saved to localStorage on every change (write-through cache)
    // Only clear auth tokens, NOT project data
    localStorage.removeItem("es_user");
    localStorage.removeItem("es_google_token");
    const keys=Object.keys(localStorage).filter(k=>k.startsWith("sb-"));
    keys.forEach(k=>localStorage.removeItem(k));
    try{ rawLogout(); }catch(e){}
    // Small delay to let any pending Supabase saves flush
    setTimeout(()=>{window.location.href=window.location.origin},300);
  },[rawLogout]);

  // Initialize Google token client for non-Supabase mode
  useEffect(()=>{if(!usesSupa && GOOGLE_CLIENT_ID)gAuth.initTokenClient(GOOGLE_CLIENT_ID)},[usesSupa,GOOGLE_CLIENT_ID]);
  const requestCalendarAccess = usesSupa ? sbAuth.refreshToken : gAuth.requestCalendarAccess;

  // Theme
  const[themeMode,setThemeModeSt]=useState(()=>{
    try{return localStorage.getItem('es_theme')||'dark'}catch(e){return'dark'}
  });
  const toggleTheme=useCallback(()=>{
    setThemeModeSt(prev=>{
      const next=prev==='dark'?'light':'dark';
      setThemeMode(next);
      try{localStorage.setItem('es_theme',next)}catch(e){}
      return next;
    });
  },[]);
  useEffect(()=>{setThemeMode(themeMode)},[]);
  useEffect(()=>{document.documentElement.className=themeMode==='light'?'theme-light':''},[themeMode]);

  // Projects & Shared Vendors
  const orgId = usesSupa ? (sbAuth.profile?.org_id || 'local') : 'local';
  console.log('[app] Auth state:', { usesSupa, user: !!user, profile: sbAuth.profile?.id, orgId });
  const { projects, loaded, createProject: createProj, updateProject: updateProj, deleteProject: deleteProj } = useProjects(orgId);
  const { vendors: sharedVendors, addVendor: addSharedVendor, updateVendor: updateSharedVendor, removeVendor: removeSharedVendor } = useVendors(orgId);
  const[saving,setSaving]=useState(false);
  const[lastSaved,setLastSaved]=useState(null);

  const[showLogin,setShowLogin]=useState(false);
  const[activeId,setActiveIdRaw]=useState(()=>{try{return sessionStorage.getItem("es_activeProject")||null}catch(e){return null}});
  const setActiveId=useCallback(id=>{setActiveIdRaw(id);try{if(id)sessionStorage.setItem("es_activeProject",id);else sessionStorage.removeItem("es_activeProject")}catch(e){}},[]);
  const[showNew,setShowNew]=useState(false);
  const[undoStack,setUndoStack]=useState([]);
  const[toasts,setToasts]=useState([]);
  const[showDriveOnboarding,setShowDriveOnboarding]=useState(false);
  // Show Drive onboarding for first-time users who haven't set up Drive
  useEffect(()=>{
    if(!user||!accessToken||!loaded)return;
    const hasDriveLoc=(()=>{try{return!!localStorage.getItem("es_drive_location")}catch(e){return false}})();
    const dismissed=(()=>{try{return!!localStorage.getItem("es_drive_onboarding_dismissed")}catch(e){return false}})();
    if(!hasDriveLoc&&!dismissed)setShowDriveOnboarding(true);
  },[user,accessToken,loaded]);
  const toast=useCallback((msg,type="success")=>{const id=uid();setToasts(p=>[...p,{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000)},[]);
  const activeProject=activeId?projects.find(p=>p.id===activeId):null;

  // Org-level Drive location setting
  const getDriveLocation=()=>{try{const s=localStorage.getItem("es_drive_location");return s?JSON.parse(s):null}catch(e){return null}};

  const createProject=useCallback(async(name,client,date,eventDate,logo,clientBudget,stage)=>{
    const id=await createProj(name,client,date,eventDate,logo,clientBudget,stage);
    if(id){
      setActiveId(id);
      // Create Google Drive folder structure in background
      if(accessToken){
        const driveLoc=getDriveLocation();
        const sharedDriveId=driveLoc?.driveId||null;
        import('./utils/drive.js').then(async({createProjectFoldersInDrive,shareWithTeam})=>{
          const folderIds=await createProjectFoldersInDrive(accessToken,name||"Untitled Project",sharedDriveId,stage||"pitching",client||"General");
          if(folderIds){
            updateProj(id,{driveFolders:folderIds,driveLocation:driveLoc});
            // Auto-share folders with team members based on roles
            if(!sharedDriveId){
              try{const team=JSON.parse(localStorage.getItem("es_users")||"[]");if(team.length)shareWithTeam(accessToken,folderIds,team)}catch(e){}
            }
          }
        }).catch(e=>console.error('[drive] Folder creation failed:',e));
      }
    }
  },[createProj,accessToken,updateProj]);

  const updateProject=useCallback(updates=>{
    if(!activeId)return;
    setUndoStack(s=>[...s.slice(-MAX_UNDO),projects]);
    setSaving(true);
    updateProj(activeId,updates);
    setTimeout(()=>{setSaving(false);setLastSaved(new Date())},1200);
  },[activeId,updateProj,projects]);

  const deleteProject=useCallback(async(id)=>{
    await deleteProj(id);
    setActiveId(null);
  },[deleteProj]);

  const updateStage=useCallback((projectId,newStage)=>{
    const proj=projects.find(p=>p.id===projectId);
    updateProj(projectId,{stage:newStage});
    // Move Drive folder if set up
    if(accessToken&&proj?.driveFolders){
      import('./utils/drive.js').then(async({moveProjectToStage})=>{
        const updatedFolders=await moveProjectToStage(accessToken,proj.driveFolders,newStage);
        if(updatedFolders)updateProj(projectId,{driveFolders:updatedFolders});
      }).catch(e=>console.error('[drive] Move failed:',e));
    }
  },[updateProj,projects,accessToken]);

  const duplicateProject=useCallback(async(projectId)=>{
    const source=projects.find(p=>p.id===projectId);
    if(!source)return;
    const{id,_dbId,createdAt,...data}=JSON.parse(JSON.stringify(source));
    const newId=await createProj(data.name+" (Copy)",data.client,data.date,data.eventDate,data.logo,data.clientBudget,"pitching");
    if(newId){
      const{name,client,date,eventDate,logo,clientBudget,stage,...rest}=data;
      updateProj(newId,rest);
    }
  },[projects,createProj,updateProj]);

  const undo=useCallback(()=>{setUndoStack(s=>{if(!s.length)return s;/* undo not fully supported with Supabase yet */return s.slice(0,-1)})},[]);

  useEffect(()=>{const handler=e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==="z"&&!e.shiftKey){e.preventDefault();undo()}
    if(e.key==="Escape"){setShowNew(false)}
  };window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[undo]);

  // Loading state
  if(sbAuth.loading || !loaded)return<div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bgGrad,fontFamily:T.sans}}>
    <div style={{textAlign:"center",color:T.dim}}>
      <div style={{fontSize:24,marginBottom:8,animation:"pulse 1.5s ease-in-out infinite"}}>◐</div>
      <div style={{fontSize:12}}>Loading...</div>
    </div>
  </div>;

  if(!user){
    if(showLogin)return<Login onLogin={setUser} googleClientId={GOOGLE_CLIENT_ID} onGoogleLogin={loginWithGoogle} isSupabase={usesSupa}/>;
    return<LandingPage onGetStarted={()=>setShowLogin(true)}/>;
  }

  if(activeProject)return<><ProjectView project={activeProject} updateProject={updateProject} deleteProject={deleteProject} user={user} onBack={()=>setActiveId(null)} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={doLogout} sharedVendors={sharedVendors} addSharedVendor={addSharedVendor} saving={saving} lastSaved={lastSaved} onUpdateUser={setUser}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=><div key={t.id} className="slide-in" style={{padding:"10px 18px",borderRadius:T.rS,background:t.type==="success"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",border:`1px solid ${t.type==="success"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,color:t.type==="success"?T.pos:T.neg,fontSize:12,fontFamily:T.sans,backdropFilter:"blur(12px)",boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}>{t.msg}</div>)}
    </div>
  </>;
  return<>{showDriveOnboarding&&<DriveOnboarding accessToken={accessToken} onComplete={(driveId,driveName)=>{setShowDriveOnboarding(false)}} onSkip={()=>{setShowDriveOnboarding(false);try{localStorage.setItem("es_drive_onboarding_dismissed","1")}catch(e){}}}/>}<PortfolioDash projects={projects} onOpen={setActiveId} onNew={()=>setShowNew(true)} user={user} onLogout={doLogout} onDuplicate={duplicateProject} onDelete={deleteProject} onUpdateStage={updateStage} accessToken={accessToken}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=><div key={t.id} className="slide-in" style={{padding:"10px 18px",borderRadius:T.rS,background:t.type==="success"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",border:`1px solid ${t.type==="success"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,color:t.type==="success"?T.pos:T.neg,fontSize:12,fontFamily:T.sans,backdropFilter:"blur(12px)",boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}>{t.msg}</div>)}
    </div>
  </>;
}

export default App;
