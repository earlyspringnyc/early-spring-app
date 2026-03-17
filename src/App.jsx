import { useState, useEffect, useCallback } from 'react';
import T from './theme/tokens.js';
import { uid } from './utils/uid.js';
import { mkProject } from './data/defaults.js';
import Login from './views/Login.jsx';
import PortfolioDash from './views/PortfolioDash.jsx';
import ProjectView from './views/ProjectView.jsx';
import NewProjectModal from './components/modals/NewProjectModal.jsx';

const MAX_UNDO=15;

function App(){
  const[user,setUser]=useState(()=>{try{const s=localStorage.getItem("es_user");if(s){const u=JSON.parse(s);if(u&&u.role&&u.email)return u;localStorage.removeItem("es_user")}}catch(e){localStorage.removeItem("es_user")}return null});
  useEffect(()=>{try{if(user)localStorage.setItem("es_user",JSON.stringify(user));else localStorage.removeItem("es_user")}catch(e){}},[user]);
  const[projects,setProjects]=useState(()=>{
    try{const saved=localStorage.getItem("es_projects");if(saved)return JSON.parse(saved)}catch(e){}
    return[mkProject("SeedAI House SXSW 2026","SeedAI","3/16/2026","3/9/2026")];
  });
  useEffect(()=>{try{localStorage.setItem("es_projects",JSON.stringify(projects))}catch(e){}},[projects]);
  const[activeId,setActiveId]=useState(null);
  const[showNew,setShowNew]=useState(false);
  const[undoStack,setUndoStack]=useState([]);
  const[toasts,setToasts]=useState([]);
  const toast=useCallback((msg,type="success")=>{const id=uid();setToasts(p=>[...p,{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000)},[]);
  const activeProject=activeId?projects.find(p=>p.id===activeId):null;
  const createProject=useCallback((name,client,date,eventDate,logo,clientBudget)=>{const p=mkProject(name,client,date,eventDate,logo,clientBudget);setProjects(prev=>[...prev,p]);setActiveId(p.id)},[]);
  const updateProject=useCallback(updates=>{setProjects(prev=>{const next=prev.map(p=>p.id===activeId?{...p,...updates}:p);setUndoStack(s=>[...s.slice(-MAX_UNDO),prev]);return next})},[activeId]);
  const deleteProject=useCallback(id=>{setProjects(prev=>prev.filter(p=>p.id!==id));setActiveId(null)},[]);
  const undo=useCallback(()=>{setUndoStack(s=>{if(!s.length)return s;const prev=s[s.length-1];setProjects(prev);return s.slice(0,-1)})},[]);
  useEffect(()=>{const handler=e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==="z"&&!e.shiftKey){e.preventDefault();undo()}
    if(e.key==="Escape"){setShowNew(false)}
  };window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[undo]);

  if(!user)return<Login onLogin={setUser}/>;
  if(activeProject)return<><ProjectView project={activeProject} updateProject={updateProject} deleteProject={deleteProject} user={user} onBack={()=>setActiveId(null)}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=><div key={t.id} className="slide-in" style={{padding:"10px 18px",borderRadius:T.rS,background:t.type==="success"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",border:`1px solid ${t.type==="success"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,color:t.type==="success"?T.pos:T.neg,fontSize:12,fontFamily:T.sans,backdropFilter:"blur(12px)",boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}>{t.msg}</div>)}
    </div>
  </>;
  return<><PortfolioDash projects={projects} onOpen={setActiveId} onNew={()=>setShowNew(true)} user={user} onLogout={()=>setUser(null)}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=><div key={t.id} className="slide-in" style={{padding:"10px 18px",borderRadius:T.rS,background:t.type==="success"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",border:`1px solid ${t.type==="success"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,color:t.type==="success"?T.pos:T.neg,fontSize:12,fontFamily:T.sans,backdropFilter:"blur(12px)",boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}>{t.msg}</div>)}
    </div>
  </>;
}

export default App;
