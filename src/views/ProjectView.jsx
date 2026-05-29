import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { setCurrency } from '../utils/format.js';
import { calcProject } from '../utils/calc.js';
import { mkI, mkA } from '../data/factories.js';
import { defaultCats, defaultAg } from '../data/defaults.js';
import ProfileV from './ProfileV.jsx';
import { Side, MobileNav } from '../components/layout/index.js';
import VendorDetailModal from '../components/modals/VendorDetailModal.jsx';
import BudgetV from './BudgetV.jsx';
import DashV from './DashV.jsx';
import TimelineV from './TimelineV.jsx';
import ROSV from './ROSV.jsx';
import CreativeV from './CreativeV.jsx';
import ProjectMeetingsV from './ProjectMeetingsV.jsx';
import ContractEditor from '../components/ContractEditor.jsx';
import ReportingV from './ReportingV.jsx';
import PnLV from './PnLV.jsx';
import DocsV from './DocsV.jsx';
import VendorsV from './VendorsV.jsx';
import ExpV from './ExpV.jsx';
import AIV from './AIV.jsx';
import SetV from './SetV.jsx';
import TimeV from './TimeV.jsx';
import { createContact } from '../lib/contacts.js';
import { upsertCompany } from '../lib/companies.js';

function ProjectView({project,updateProject,deleteProject,user,onBack,accessToken,requestCalendarAccess,toggleTheme,themeMode,onLogout,saving,lastSaved,onUpdateUser,profiles,organizations,currentOrgId,switchOrg}){
  // View state is persisted per-project (es_view_<id>). When App.jsx
  // sets activeId via a click on the dashboard, it CLEARS this key
  // first, so a click always lands on the project dashboard. A
  // refresh while inside a project re-reads this and stays put.
  const[view,setViewRaw]=useState(()=>{try{return localStorage.getItem(`es_view_${project.id}`)||"dashboard"}catch(e){return"dashboard"}});
  const setView=useCallback(v=>{setViewRaw(v);try{localStorage.setItem(`es_view_${project.id}`,v)}catch(e){};window.history.pushState({view:v},"","")},[project.id]);
  // Restore (or reset) per-project view when switching between
  // projects in the same session — ProjectView is reused across
  // project changes, so useState alone doesn't re-init.
  useEffect(()=>{
    try{
      const stored = localStorage.getItem(`es_view_${project.id}`);
      setViewRaw(stored || "dashboard");
    }catch(e){setViewRaw("dashboard")}
  },[project.id]);
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
  // Move a section out of the currently-viewed budget (primary or
  // alt) into another budget. The single updateProject call writes
  // both source and target in one atomic state update so there's
  // no flicker / race. The section keeps its id + items.
  const moveSection=useCallback((sectionIdx,targetBudgetId)=>{
    if(sectionIdx<0||sectionIdx>=activeCats.length) return;
    const moving=activeCats[sectionIdx];
    if(!moving) return;
    // Source is the active budget. Target is one of: null=primary,
    // or an alt budget id. Bail if target equals source.
    const sourceId=activeBudgetId||null;
    if(sourceId===targetBudgetId) return;
    // Build updates for the project: rewrite cats (if primary
    // touched as src or target) AND budgets (if any alt touched).
    const updates={};
    let newCats=project.cats;
    let newBudgets=altBudgets.slice();
    if(!sourceId){
      // Primary → alt: drop from primary cats
      newCats=newCats.filter((_,i)=>i!==sectionIdx);
    }else{
      // Alt → ?: drop from that alt's cats
      const sIdx=newBudgets.findIndex(b=>b.id===sourceId);
      if(sIdx<0) return;
      newBudgets=newBudgets.map((b,i)=>i===sIdx?{...b,cats:b.cats.filter((_,j)=>j!==sectionIdx)}:b);
    }
    if(!targetBudgetId){
      // → Primary: append to primary cats
      newCats=[...newCats,moving];
    }else{
      // → Alt: append to that alt's cats
      const tIdx=newBudgets.findIndex(b=>b.id===targetBudgetId);
      if(tIdx<0) return;
      newBudgets=newBudgets.map((b,i)=>i===tIdx?{...b,cats:[...b.cats,moving]}:b);
    }
    updates.cats=newCats;
    updates.budgets=newBudgets;
    updateProject(updates);
  },[activeCats,activeBudgetId,project.cats,altBudgets,updateProject]);
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
  // Restore the full project budget state from a snapshot. New
  // auto-snapshots include the alt-budgets array too, so a restore
  // is a complete rollback (primary + all alts + fee% + clientBudget).
  // Older manual snapshots only have {cats,ag,feeP} — those still
  // restore but only touch the currently-viewed budget.
  const restoreHistory=useCallback(snapshot=>{
    if (!snapshot) return;
    if ('budgets' in snapshot && Array.isArray(snapshot.budgets)) {
      // Full snapshot — replace primary cats/ag/feeP/clientBudget + budgets.
      const data = {
        cats: snapshot.cats,
        ag: snapshot.ag,
        feeP: snapshot.feeP,
        budgets: snapshot.budgets,
      };
      if ('clientBudget' in snapshot) data.clientBudget = snapshot.clientBudget;
      updateProject(data);
    } else {
      // Legacy snapshot — only the active budget gets restored.
      const data = { cats: snapshot.cats, ag: snapshot.ag, feeP: snapshot.feeP };
      isAlt ? updateAltBudget(data) : updateProject(data);
    }
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
  const addVendor=useCallback((v)=>{
    // 1) Per-project working copy — budget line items reference
    //    these by ID; P&L matches expenses to them.
    updateProject({vendors:[...(project.vendors||[]),v]});
    // 2) Best-effort sync to the CRM as a contact with type='vendor'.
    //    This is the org-wide source of truth — the legacy standalone
    //    `vendors` table isn't read by any UI today, so we don't dupe
    //    data into it. The contacts dedup logic (unique email index)
    //    quietly absorbs repeat adds.
    (async () => {
      try {
        const authUserId = user?.user_id || user?.id;
        if (authUserId && v?.name) {
          const [fn, ...rest] = String(v.contactName || '').trim().split(/\s+/);
          const ln = rest.join(' ');
          const email = String(v.email || '').toLowerCase().trim() || null;
          const fields = {
            first_name: fn || null,
            last_name: ln || null,
            email,
            phone: v.phone || null,
            company: v.name,
            contact_type: 'vendor',
            status: 'vendor',
            sources: ['project_vendor'],
          };
          await createContact(authUserId, fields).catch(() => {});
          await upsertCompany(authUserId, v.name, {}).catch(() => {});
        }
      } catch (e) { console.warn('[project-vendor] CRM sync:', e.message); }
    })();
  },[project.vendors,updateProject,user]);
  const handleDelete=()=>{if(confirm(`Delete "${project.name}"? This cannot be undone.`))deleteProject(project.id)};
  return<div style={{display:"flex",height:"100vh",background:T.bg,color:T.cream,fontFamily:T.sans}}>
    <Side view={view} setView={setView} comp={primaryComp} user={user} project={project} onBack={onBack} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={onLogout} saving={saving} lastSaved={lastSaved} profiles={profiles} organizations={organizations} currentOrgId={currentOrgId} switchOrg={switchOrg}/>
    <MobileNav view={view} setView={setView} project={project} onBack={onBack} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={onLogout}/>
    <main className="main-content" style={{flex:1,overflow:"auto",padding:32}}><div key={view} className="view-enter">
      {view==="budget"&&<BudgetV cats={activeCats} ag={activeAg} feeP={activeFeeP} setFeeP={setFeeP} comp={comp} exp={exp} tog={tog} uCat={uCat} aCat={aCat} rCat={rCat} rmCat={rmCat} addSection={addSection} moveSection={moveSection} uAg={uAg} aAg={aAg} rAg={rAg} user={user} docs={project.docs||[]} vendors={project.vendors||[]} onAddVendor={addVendor} onVendorClick={setVendorDetailId} clientBudget={activeClientBudget} onUpdateBudget={v=>{isAlt?updateAltBudget({clientBudget:v}):updateProject({clientBudget:v})}} reorderCat={reorderCat} reorderSection={reorderSection} saving={saving} lastSaved={lastSaved} setAllMargins={setAllMargins} project={activeProjectForCalc} onSaveHistory={saveHistory} onRestoreHistory={restoreHistory} updateProject={isAlt?(fields)=>updateAltBudget(fields):updateProject} accessToken={accessToken} budgets={altBudgets} activeBudgetId={activeBudgetId} onSwitchBudget={setActiveBudgetId} onAddBudget={(name)=>{const b={id:uid(),name,cats:defaultCats(),ag:defaultAg(),feeP:0.10,clientBudget:0,repFeeEnabled:false,repFeeP:0.10,createdAt:new Date().toISOString()};updateProject({budgets:[...altBudgets,b]});setActiveBudgetId(b.id)}} onDeleteBudget={(id)=>{if(!confirm("Delete this budget? This cannot be undone."))return;updateProject({budgets:altBudgets.filter(b=>b.id!==id)});if(activeBudgetId===id)setActiveBudgetId(null)}} onRenameBudget={(id,name)=>{updateProject({budgets:altBudgets.map(b=>b.id===id?{...b,name}:b)})}} onMakePrimary={(id)=>{
          const alt=altBudgets.find(b=>b.id===id);if(!alt)return;
          // Current primary becomes an alternate
          const oldPrimary={id:uid(),name:"Previous Primary",cats:JSON.parse(JSON.stringify(project.cats)),ag:JSON.parse(JSON.stringify(project.ag)),feeP:project.feeP,clientBudget:project.clientBudget||0,repFeeEnabled:project.repFeeEnabled||false,repFeeP:project.repFeeP||0.10,createdAt:new Date().toISOString()};
          // Promoted alt becomes the new primary
          updateProject({cats:alt.cats,ag:alt.ag,feeP:alt.feeP,clientBudget:alt.clientBudget||0,budgets:[oldPrimary,...altBudgets.filter(b=>b.id!==id)]});
          setActiveBudgetId(null);
        }}/>}
      {view==="dashboard"&&<DashV cats={project.cats} comp={primaryComp} feeP={project.feeP} project={project} onNavigate={setView} updateProject={updateProject} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess} user={user}/>}
      {view==="timeline"&&<TimelineV project={project} updateProject={updateProject} canEdit={canEdit} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess} user={user}/>}
      {view==="ros"&&<ROSV project={project} updateProject={updateProject} canEdit={canEdit} accessToken={accessToken}/>}
      {(view==="pnl"||view==="docs")&&<PnLV project={project} updateProject={updateProject} comp={primaryComp} canEdit={canEdit} vendors={project.vendors||[]} onAddVendor={addVendor} onVendorClick={setVendorDetailId} accessToken={accessToken}/>}
      {view==="vendors"&&<VendorsV project={project} updateProject={updateProject} canEdit={canEdit} onVendorClick={setVendorDetailId} onAddVendor={addVendor}/>}
      {view==="creative"&&<CreativeV project={project} updateProject={updateProject} canEdit={canEdit} accessToken={accessToken} user={user} orgId={currentOrgId}/>}
      {view==="meetings"&&<ProjectMeetingsV project={project} user={user} accessToken={accessToken}/>}
      {view==="contract"&&<ContractEditor project={project} user={user}/>}
      {view==="reporting"&&<ReportingV project={project} updateProject={updateProject} canEdit={canEdit} comp={primaryComp}/>}
      {view==="time"&&<TimeV project={project} user={user} canEdit={canEdit}/>}
      {view==="export"&&<ExpV cats={project.cats} ag={project.ag} comp={primaryComp} feeP={project.feeP} project={project} updateProject={updateProject} accessToken={accessToken} budgets={project.budgets||[]} requestCalendarAccess={requestCalendarAccess} user={user}/>}
      {view==="ai"&&<AIV project={project} updateProject={updateProject} comp={primaryComp} accessToken={accessToken}/>}
      {view==="profile"&&<ProfileV user={user} updateProject={updateProject} project={project} onUpdateUser={onUpdateUser} orgId={currentOrgId}/>}
      {view==="settings"&&<SetV project={project} updateProject={updateProject} onDelete={handleDelete} user={user} accessToken={accessToken} orgId={currentOrgId}/>}
    </div></main>
    {vendorDetailId&&<VendorDetailModal vendorId={vendorDetailId} project={project} onClose={()=>setVendorDetailId(null)} canEdit={canEdit} updateProject={updateProject}/>}
  </div>;
}

export default ProjectView;
