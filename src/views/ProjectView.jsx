import { useState, useMemo, useCallback } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { calcProject } from '../utils/calc.js';
import { mkI, mkA } from '../data/factories.js';
import ProfileV from './ProfileV.jsx';
import { Side, MobileNav } from '../components/layout/index.js';
import VendorDetailModal from '../components/modals/VendorDetailModal.jsx';
import BudgetV from './BudgetV.jsx';
import DashV from './DashV.jsx';
import TimelineV from './TimelineV.jsx';
import ROSV from './ROSV.jsx';
import CreativeV from './CreativeV.jsx';
import PnLV from './PnLV.jsx';
import DocsV from './DocsV.jsx';
import VendorsV from './VendorsV.jsx';
import ExpV from './ExpV.jsx';
import AIV from './AIV.jsx';
import SetV from './SetV.jsx';

function ProjectView({project,updateProject,deleteProject,user,onBack,accessToken,requestCalendarAccess,toggleTheme,themeMode,onLogout,sharedVendors,addSharedVendor,saving,lastSaved,onUpdateUser}){
  const[view,setView]=useState("dashboard");
  const[exp,setExp]=useState(new Set());
  const canEdit=user.role!=="viewer";
  const tog=useCallback(id=>setExp(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n}),[]);
  const uCat=useCallback((ci2,ii,u)=>updateProject({cats:project.cats.map((c,i)=>i===ci2?{...c,items:c.items.map((it,j)=>j===ii?{...it,...u}:it)}:c)}),[project.cats,updateProject]);
  const aCat=useCallback(ci2=>updateProject({cats:project.cats.map((c,i)=>i===ci2?{...c,items:[...c.items,mkI("New Item")]}:c)}),[project.cats,updateProject]);
  const rCat=useCallback((ci2,ii)=>updateProject({cats:project.cats.map((c,i)=>i===ci2?{...c,items:c.items.filter((_,j)=>j!==ii)}:c)}),[project.cats,updateProject]);
  const rmCat=useCallback(ci2=>updateProject({cats:project.cats.filter((_,i)=>i!==ci2)}),[project.cats,updateProject]);
  const addSection=useCallback(name=>{const newCat={id:uid(),name,items:[mkI("New Item")]};updateProject({cats:[...project.cats,newCat]});},[project.cats,updateProject]);
  const uAg=useCallback((ii,u)=>updateProject({ag:project.ag.map((it,i)=>i===ii?{...it,...u}:it)}),[project.ag,updateProject]);
  const aAg=useCallback(()=>updateProject({ag:[...project.ag,mkA("New Role")]}),[project.ag,updateProject]);
  const rAg=useCallback(ii=>updateProject({ag:project.ag.filter((_,i)=>i!==ii)}),[project.ag,updateProject]);
  const setFeeP=useCallback(v=>updateProject({feeP:v}),[updateProject]);
  const setAllMargins=useCallback(margin=>{updateProject({cats:project.cats.map(c=>({...c,items:c.items.map(it=>({...it,margin}))}))});},[project.cats,updateProject]);
  const saveHistory=useCallback(history=>updateProject({budgetHistory:history}),[updateProject]);
  const restoreHistory=useCallback(snapshot=>{updateProject({cats:snapshot.cats,ag:snapshot.ag,feeP:snapshot.feeP});},[updateProject]);
  const comp=useMemo(()=>calcProject(project),[project]);
  const[vendorDetailId,setVendorDetailId]=useState(null);
  const reorderCat=useCallback((ci2,from,to)=>{const cats=[...project.cats];const items=[...cats[ci2].items];const[moved]=items.splice(from,1);items.splice(to,0,moved);cats[ci2]={...cats[ci2],items};updateProject({cats})},[project.cats,updateProject]);
  const reorderSection=useCallback((from,to)=>{const cats=[...project.cats];const[moved]=cats.splice(from,1);cats.splice(to,0,moved);updateProject({cats})},[project.cats,updateProject]);
  const addVendor=useCallback(v=>updateProject({vendors:[...(project.vendors||[]),v]}),[project.vendors,updateProject]);
  const handleDelete=()=>{if(confirm(`Delete "${project.name}"? This cannot be undone.`))deleteProject(project.id)};
  return<div style={{display:"flex",height:"100vh",background:T.bg,color:T.cream,fontFamily:T.sans}}>
    <Side view={view} setView={setView} comp={comp} user={user} project={project} onBack={onBack} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={onLogout} saving={saving} lastSaved={lastSaved}/>
    <MobileNav view={view} setView={setView} project={project}/>
    <main className="main-content" style={{flex:1,overflow:"auto",padding:32}}><div key={view} className="view-enter">
      {view==="budget"&&<BudgetV cats={project.cats} ag={project.ag} feeP={project.feeP} setFeeP={setFeeP} comp={comp} exp={exp} tog={tog} uCat={uCat} aCat={aCat} rCat={rCat} rmCat={rmCat} addSection={addSection} uAg={uAg} aAg={aAg} rAg={rAg} user={user} docs={project.docs||[]} vendors={project.vendors||[]} onAddVendor={addVendor} onVendorClick={setVendorDetailId} clientBudget={project.clientBudget||0} onUpdateBudget={v=>updateProject({clientBudget:v})} reorderCat={reorderCat} reorderSection={reorderSection} saving={saving} lastSaved={lastSaved} setAllMargins={setAllMargins} project={project} onSaveHistory={saveHistory} onRestoreHistory={restoreHistory} updateProject={updateProject}/>}
      {view==="dashboard"&&<DashV cats={project.cats} comp={comp} feeP={project.feeP} project={project} onNavigate={setView}/>}
      {view==="timeline"&&<TimelineV project={project} updateProject={updateProject} canEdit={canEdit} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess}/>}
      {view==="ros"&&<ROSV project={project} updateProject={updateProject} canEdit={canEdit}/>}
      {(view==="pnl"||view==="docs")&&<PnLV project={project} updateProject={updateProject} comp={comp} canEdit={canEdit} vendors={project.vendors||[]} onAddVendor={addVendor} onVendorClick={setVendorDetailId}/>}
      {view==="vendors"&&<VendorsV project={project} updateProject={updateProject} canEdit={canEdit} onVendorClick={setVendorDetailId}/>}
      {view==="creative"&&<CreativeV project={project} updateProject={updateProject} canEdit={canEdit}/>}
      {view==="export"&&<ExpV cats={project.cats} ag={project.ag} comp={comp} feeP={project.feeP} project={project} updateProject={updateProject} accessToken={accessToken}/>}
      {view==="ai"&&<AIV project={project} updateProject={updateProject} comp={comp}/>}
      {view==="profile"&&<ProfileV user={user} updateProject={updateProject} project={project} onUpdateUser={onUpdateUser}/>}
      {view==="settings"&&<SetV project={project} updateProject={updateProject} onDelete={handleDelete} user={user}/>}
    </div></main>
    {vendorDetailId&&<VendorDetailModal vendorId={vendorDetailId} project={project} onClose={()=>setVendorDetailId(null)} canEdit={canEdit} updateProject={updateProject}/>}
  </div>;
}

export default ProjectView;
