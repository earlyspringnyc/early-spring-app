import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { setCurrency } from '../utils/format.js';
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
import ProjectMeetingsV from './ProjectMeetingsV.jsx';
import ReportingV from './ReportingV.jsx';
import PnLV from './PnLV.jsx';
import DocsV from './DocsV.jsx';
import VendorsV from './VendorsV.jsx';
import ExpV from './ExpV.jsx';
import AIV from './AIV.jsx';
import SetV from './SetV.jsx';

function ProjectView({project,updateProject,deleteProject,user,onBack,accessToken,requestCalendarAccess,toggleTheme,themeMode,onLogout,sharedVendors,addSharedVendor,saving,lastSaved,onUpdateUser,profiles,organizations,currentOrgId,switchOrg}){
  const[view,setViewRaw]=useState(()=>{try{return sessionStorage.getItem("es_view")||"dashboard"}catch(e){return"dashboard"}});
  const setView=useCallback(v=>{setViewRaw(v);try{sessionStorage.setItem("es_view",v)}catch(e){};window.history.pushState({view:v},"","")},[]);
  // Handle browser back/forward
  useEffect(()=>{
    const onPop=(e)=>{const v=e.state?.view;if(v)setViewRaw(v)};
    window.addEventListener("popstate",onPop);
    // Push initial state
    window.history.replaceState({view},"","");
    return()=>window.removeEventListener("popstate",onPop);
  },[]);
  const[exp,setExp]=useState(new Set());
  const canEdit=user.role!=="client";
  const tog=useCallback(id=>setExp(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n}),[]);

  // ── Multi-budget support ──
  const[activeBudgetId,setActiveBudgetId]=useState(null); // null = primary budget
  const altBudgets=project.budgets||[];
  const altIdx=activeBudgetId?altBudgets.findIndex(b=>b.id===activeBudgetId):-1;
  const isAlt=altIdx>=0;
  const activeCats=isAlt?altBudgets[altIdx].cats:project.cats;
  const activeAg=isAlt?altBudgets[altIdx].ag:project.ag;
  const activeFeeP=isAlt?altBudgets[altIdx].feeP:project.feeP;
  const activeClientBudget=isAlt?(altBudgets[altIdx].clientBudget||0):(project.clientBudget||0);
  // Helper to update a field inside the active alt budget
  const updateAltBudget=useCallback((fields)=>{
    const budgets=[...altBudgets];budgets[altIdx]={...budgets[altIdx],...fields};
    updateProject({budgets});
  },[altBudgets,altIdx,updateProject]);

  const uCat=useCallback((ci2,ii,u)=>{
    const cats=activeCats.map((c,i)=>i===ci2?{...c,items:c.items.map((it,j)=>j===ii?{...it,...u}:it)}:c);
    isAlt?updateAltBudget({cats}):updateProject({cats});
  },[activeCats,isAlt,updateProject,updateAltBudget]);
  const aCat=useCallback(ci2=>{
    const cats=activeCats.map((c,i)=>i===ci2?{...c,items:[...c.items,mkI("New Item")]}:c);
    isAlt?updateAltBudget({cats}):updateProject({cats});
  },[activeCats,isAlt,updateProject,updateAltBudget]);
  const rCat=useCallback((ci2,ii)=>{
    const cats=activeCats.map((c,i)=>i===ci2?{...c,items:c.items.filter((_,j)=>j!==ii)}:c);
    isAlt?updateAltBudget({cats}):updateProject({cats});
  },[activeCats,isAlt,updateProject,updateAltBudget]);
  const rmCat=useCallback(ci2=>{
    const cats=activeCats.filter((_,i)=>i!==ci2);
    isAlt?updateAltBudget({cats}):updateProject({cats});
  },[activeCats,isAlt,updateProject,updateAltBudget]);
  const addSection=useCallback(name=>{
    const newCat={id:uid(),name,items:[mkI("New Item")]};
    const cats=[...activeCats,newCat];
    isAlt?updateAltBudget({cats}):updateProject({cats});
  },[activeCats,isAlt,updateProject,updateAltBudget]);
  const uAg=useCallback((ii,u)=>{
    const ag=activeAg.map((it,i)=>i===ii?{...it,...u}:it);
    isAlt?updateAltBudget({ag}):updateProject({ag});
  },[activeAg,isAlt,updateProject,updateAltBudget]);
  const aAg=useCallback(()=>{
    const ag=[...activeAg,mkA("New Role")];
    isAlt?updateAltBudget({ag}):updateProject({ag});
  },[activeAg,isAlt,updateProject,updateAltBudget]);
  const rAg=useCallback(ii=>{
    const ag=activeAg.filter((_,i)=>i!==ii);
    isAlt?updateAltBudget({ag}):updateProject({ag});
  },[activeAg,isAlt,updateProject,updateAltBudget]);
  const setFeeP=useCallback(v=>{isAlt?updateAltBudget({feeP:v}):updateProject({feeP:v})},[isAlt,updateProject,updateAltBudget]);
  const setAllMargins=useCallback(margin=>{
    const cats=activeCats.map(c=>({...c,items:c.items.map(it=>({...it,margin}))}));
    isAlt?updateAltBudget({cats}):updateProject({cats});
  },[activeCats,isAlt,updateProject,updateAltBudget]);
  const saveHistory=useCallback(history=>updateProject({budgetHistory:history}),[updateProject]);
  const restoreHistory=useCallback(snapshot=>{
    const data={cats:snapshot.cats,ag:snapshot.ag,feeP:snapshot.feeP};
    isAlt?updateAltBudget(data):updateProject(data);
  },[isAlt,updateProject,updateAltBudget]);
  const primaryComp=useMemo(()=>calcProject(project),[project]);
  const activeProjectForCalc=isAlt?{...project,cats:activeCats,ag:activeAg,feeP:activeFeeP}:project;
  const comp=useMemo(()=>isAlt?calcProject(activeProjectForCalc):primaryComp,[activeProjectForCalc,primaryComp,isAlt]);
  useEffect(()=>{setCurrency(project.currency)},[project.currency]);

  // Auto-sync budgets to Google Sheets (debounced)
  const sheetSyncTimer=useRef(null);
  useEffect(()=>{
    if(!accessToken||!project.driveFolders)return;
    if(sheetSyncTimer.current)clearTimeout(sheetSyncTimer.current);
    sheetSyncTimer.current=setTimeout(async()=>{
      try{
        const{syncBudgetToSheets}=await import('../utils/drive.js');
        const result=await syncBudgetToSheets(accessToken,project,primaryComp,calcProject);
        if(result&&!project.budgetSheetId){
          updateProject({budgetSheetId:result.spreadsheetId});
        }
      }catch(e){console.error('[sheets] Auto-sync failed:',e)}
    },5000); // 5s debounce
    return()=>{if(sheetSyncTimer.current)clearTimeout(sheetSyncTimer.current)};
  },[project.cats,project.ag,project.feeP,project.budgets,accessToken,project.driveFolders]);

  const[vendorDetailId,setVendorDetailId]=useState(null);
  const reorderCat=useCallback((ci2,from,to)=>{const cats=[...activeCats];const items=[...cats[ci2].items];const[moved]=items.splice(from,1);items.splice(to,0,moved);cats[ci2]={...cats[ci2],items};isAlt?updateAltBudget({cats}):updateProject({cats})},[activeCats,isAlt,updateProject,updateAltBudget]);
  const reorderSection=useCallback((from,to)=>{const cats=[...activeCats];const[moved]=cats.splice(from,1);cats.splice(to,0,moved);isAlt?updateAltBudget({cats}):updateProject({cats})},[activeCats,isAlt,updateProject,updateAltBudget]);
  const addVendor=useCallback(v=>updateProject({vendors:[...(project.vendors||[]),v]}),[project.vendors,updateProject]);
  const handleDelete=()=>{if(confirm(`Delete "${project.name}"? This cannot be undone.`))deleteProject(project.id)};
  return<div style={{display:"flex",height:"100vh",background:T.bg,color:T.cream,fontFamily:T.sans}}>
    <Side view={view} setView={setView} comp={primaryComp} user={user} project={project} onBack={onBack} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={onLogout} saving={saving} lastSaved={lastSaved} profiles={profiles} organizations={organizations} currentOrgId={currentOrgId} switchOrg={switchOrg}/>
    <MobileNav view={view} setView={setView} project={project} onBack={onBack} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={onLogout}/>
    <main className="main-content" style={{flex:1,overflow:"auto",padding:32}}><div key={view} className="view-enter">
      {view==="budget"&&<BudgetV cats={activeCats} ag={activeAg} feeP={activeFeeP} setFeeP={setFeeP} comp={comp} exp={exp} tog={tog} uCat={uCat} aCat={aCat} rCat={rCat} rmCat={rmCat} addSection={addSection} uAg={uAg} aAg={aAg} rAg={rAg} user={user} docs={project.docs||[]} vendors={project.vendors||[]} onAddVendor={addVendor} onVendorClick={setVendorDetailId} clientBudget={activeClientBudget} onUpdateBudget={v=>{isAlt?updateAltBudget({clientBudget:v}):updateProject({clientBudget:v})}} reorderCat={reorderCat} reorderSection={reorderSection} saving={saving} lastSaved={lastSaved} setAllMargins={setAllMargins} project={activeProjectForCalc} onSaveHistory={saveHistory} onRestoreHistory={restoreHistory} updateProject={isAlt?(fields)=>updateAltBudget(fields):updateProject} accessToken={accessToken} budgets={altBudgets} activeBudgetId={activeBudgetId} onSwitchBudget={setActiveBudgetId} onAddBudget={(name)=>{const cloneCats=JSON.parse(JSON.stringify(project.cats)).map(c=>({...c,id:uid(),items:c.items.map(it=>({...it,id:uid()}))}));const cloneAg=JSON.parse(JSON.stringify(project.ag)).map(a=>({...a,id:uid()}));const b={id:uid(),name,cats:cloneCats,ag:cloneAg,feeP:project.feeP||0.10,clientBudget:project.clientBudget||0,repFeeEnabled:project.repFeeEnabled||false,repFeeP:project.repFeeP||0.10,createdAt:new Date().toISOString()};updateProject({budgets:[...altBudgets,b]});setActiveBudgetId(b.id)}} onDeleteBudget={(id)=>{if(!confirm("Delete this budget? This cannot be undone."))return;updateProject({budgets:altBudgets.filter(b=>b.id!==id)});if(activeBudgetId===id)setActiveBudgetId(null)}} onRenameBudget={(id,name)=>{updateProject({budgets:altBudgets.map(b=>b.id===id?{...b,name}:b)})}} onMakePrimary={(id)=>{
          const alt=altBudgets.find(b=>b.id===id);if(!alt)return;
          // Current primary becomes an alternate
          const oldPrimary={id:uid(),name:"Previous Primary",cats:JSON.parse(JSON.stringify(project.cats)),ag:JSON.parse(JSON.stringify(project.ag)),feeP:project.feeP,clientBudget:project.clientBudget||0,repFeeEnabled:project.repFeeEnabled||false,repFeeP:project.repFeeP||0.10,createdAt:new Date().toISOString()};
          // Promoted alt becomes the new primary
          updateProject({cats:alt.cats,ag:alt.ag,feeP:alt.feeP,clientBudget:alt.clientBudget||0,budgets:[oldPrimary,...altBudgets.filter(b=>b.id!==id)]});
          setActiveBudgetId(null);
        }}/>}
      {view==="dashboard"&&<DashV cats={project.cats} comp={primaryComp} feeP={project.feeP} project={project} onNavigate={setView} updateProject={updateProject} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess}/>}
      {view==="timeline"&&<TimelineV project={project} updateProject={updateProject} canEdit={canEdit} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess}/>}
      {view==="ros"&&<ROSV project={project} updateProject={updateProject} canEdit={canEdit} accessToken={accessToken}/>}
      {(view==="pnl"||view==="docs")&&<PnLV project={project} updateProject={updateProject} comp={primaryComp} canEdit={canEdit} vendors={project.vendors||[]} onAddVendor={addVendor} onVendorClick={setVendorDetailId} accessToken={accessToken}/>}
      {view==="vendors"&&<VendorsV project={project} updateProject={updateProject} canEdit={canEdit} onVendorClick={setVendorDetailId}/>}
      {view==="creative"&&<CreativeV project={project} updateProject={updateProject} canEdit={canEdit} accessToken={accessToken}/>}
      {view==="meetings"&&<ProjectMeetingsV project={project} user={user} accessToken={accessToken}/>}
      {view==="reporting"&&<ReportingV project={project} updateProject={updateProject} canEdit={canEdit} comp={primaryComp}/>}
      {view==="export"&&<ExpV cats={project.cats} ag={project.ag} comp={primaryComp} feeP={project.feeP} project={project} updateProject={updateProject} accessToken={accessToken} budgets={project.budgets||[]} requestCalendarAccess={requestCalendarAccess}/>}
      {view==="ai"&&<AIV project={project} updateProject={updateProject} comp={primaryComp} accessToken={accessToken}/>}
      {view==="profile"&&<ProfileV user={user} updateProject={updateProject} project={project} onUpdateUser={onUpdateUser} orgId={currentOrgId}/>}
      {view==="settings"&&<SetV project={project} updateProject={updateProject} onDelete={handleDelete} user={user} accessToken={accessToken} orgId={currentOrgId}/>}
    </div></main>
    {vendorDetailId&&<VendorDetailModal vendorId={vendorDetailId} project={project} onClose={()=>setVendorDetailId(null)} canEdit={canEdit} updateProject={updateProject}/>}
  </div>;
}

export default ProjectView;
