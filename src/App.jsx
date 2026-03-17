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
import PortfolioDash from './views/PortfolioDash.jsx';
import ProjectView from './views/ProjectView.jsx';
import NewProjectModal from './components/modals/NewProjectModal.jsx';

const MAX_UNDO=15;

function App(){
  // Auth: use Supabase when configured, otherwise fall back to old auth
  const sbAuth = useSupabaseAuth();
  const gAuth = useGoogleAuth();
  const usesSupa = isSupabaseConfigured();

  const user = usesSupa ? sbAuth.user : gAuth.user;
  const accessToken = usesSupa ? sbAuth.accessToken : gAuth.accessToken;
  const rawLogout = usesSupa ? sbAuth.logout : gAuth.logout;
  const setUser = usesSupa ? sbAuth.setDevUser : gAuth.setUser;
  const loginWithGoogle = usesSupa ? sbAuth.login : null;
  const doLogout = useCallback(async()=>{
    if(!confirm("Are you sure you want to sign out?"))return;
    localStorage.removeItem("es_user");
    localStorage.removeItem("es_google_token");
    await rawLogout();
    window.location.reload();
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
  const { projects, loaded, createProject: createProj, updateProject: updateProj, deleteProject: deleteProj } = useProjects(orgId);
  const { vendors: sharedVendors, addVendor: addSharedVendor, updateVendor: updateSharedVendor, removeVendor: removeSharedVendor } = useVendors(orgId);
  const[saving,setSaving]=useState(false);
  const[lastSaved,setLastSaved]=useState(null);

  const[activeId,setActiveId]=useState(null);
  const[showNew,setShowNew]=useState(false);
  const[undoStack,setUndoStack]=useState([]);
  const[toasts,setToasts]=useState([]);
  const toast=useCallback((msg,type="success")=>{const id=uid();setToasts(p=>[...p,{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000)},[]);
  const activeProject=activeId?projects.find(p=>p.id===activeId):null;

  const createProject=useCallback(async(name,client,date,eventDate,logo,clientBudget,stage)=>{
    const id=await createProj(name,client,date,eventDate,logo,clientBudget,stage);
    if(id)setActiveId(id);
  },[createProj]);

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

  if(!user)return<Login
    onLogin={setUser}
    googleClientId={GOOGLE_CLIENT_ID}
    onGoogleLogin={loginWithGoogle}
    isSupabase={usesSupa}
  />;

  if(activeProject)return<><ProjectView project={activeProject} updateProject={updateProject} deleteProject={deleteProject} user={user} onBack={()=>setActiveId(null)} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={doLogout} sharedVendors={sharedVendors} addSharedVendor={addSharedVendor} saving={saving} lastSaved={lastSaved}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=><div key={t.id} className="slide-in" style={{padding:"10px 18px",borderRadius:T.rS,background:t.type==="success"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",border:`1px solid ${t.type==="success"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,color:t.type==="success"?T.pos:T.neg,fontSize:12,fontFamily:T.sans,backdropFilter:"blur(12px)",boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}>{t.msg}</div>)}
    </div>
  </>;
  return<><PortfolioDash projects={projects} onOpen={setActiveId} onNew={()=>setShowNew(true)} user={user} onLogout={doLogout} onDuplicate={duplicateProject} onDelete={deleteProject}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=><div key={t.id} className="slide-in" style={{padding:"10px 18px",borderRadius:T.rS,background:t.type==="success"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",border:`1px solid ${t.type==="success"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,color:t.type==="success"?T.pos:T.neg,fontSize:12,fontFamily:T.sans,backdropFilter:"blur(12px)",boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}>{t.msg}</div>)}
    </div>
  </>;
}

export default App;
