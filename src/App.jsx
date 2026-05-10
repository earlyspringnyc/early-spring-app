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
import EPDashboard from './views/EPDashboard.jsx';
import ProjectView from './views/ProjectView.jsx';
import ContactsView from './views/ContactsView.jsx';
import NewProjectModal from './components/modals/NewProjectModal.jsx';
import SharedClientView from './views/SharedClientView.jsx';



/* ── Legal Pages ── */
function LegalPage({title,children}){
  return<div style={{minHeight:"100vh",background:T.bg,color:T.cream,fontFamily:T.sans}}>
    <div style={{maxWidth:700,margin:"0 auto",padding:"60px 24px 80px"}}>
      <a href="/" style={{fontSize:10,color:T.dim,textDecoration:"none",display:"block",marginBottom:24}}>&larr; Back to Morgan</a>
      <h1 style={{fontSize:28,fontWeight:700,letterSpacing:"-0.02em",marginBottom:8}}>{title}</h1>
      <p style={{fontSize:12,color:T.dim,marginBottom:40}}>Last updated: March 19, 2026</p>
      <div style={{fontSize:14,color:T.dimH,lineHeight:1.8}}>{children}</div>
    </div>
  </div>;
}
const H2=({children})=><h2 style={{fontSize:18,fontWeight:600,color:T.cream,marginTop:36,marginBottom:12}}>{children}</h2>;
const P=({children})=><p style={{marginBottom:16}}>{children}</p>;
const UL=({children})=><ul style={{paddingLeft:24,marginBottom:16}}>{children}</ul>;
const LI=({children})=><li style={{marginBottom:6}}>{children}</li>;

function PrivacyPage(){
  return<LegalPage title="Privacy Policy">
    <P>Morgan ("we", "us", "the app") is a production management tool built by Early Spring LLC. This policy explains what data we collect, how we use it, and your rights.</P>

    <H2>What We Collect</H2>
    <UL>
      <LI><strong style={{color:T.cream}}>Account information:</strong> Your Google account name, email address, and profile photo — used to sign you in and identify you within your team.</LI>
      <LI><strong style={{color:T.cream}}>Project data:</strong> Budgets, timelines, vendor information, client contacts, files, and other content you create in the app.</LI>
    </UL>

    <H2>How We Use Your Google Access</H2>
    <P>Morgan requests access to specific Google services. Here is exactly what we do with each:</P>
    <UL>
      <LI><strong style={{color:T.cream}}>Gmail:</strong> Only sends emails you explicitly compose and click "Send" on. We never read your inbox or send anything without your action.</LI>
      <LI><strong style={{color:T.cream}}>Google Drive:</strong> Creates and organizes project folders and files you upload. Only touches folders Morgan created (the "Morgan" folder). Never reads or modifies your other Drive files.</LI>
      <LI><strong style={{color:T.cream}}>Google Calendar:</strong> Creates calendar events you add from the app. Reads your upcoming events to display them in the timeline. Never modifies or deletes events it didn't create.</LI>
      <LI><strong style={{color:T.cream}}>Google Contacts:</strong> Searches your contacts to autocomplete email addresses when you're composing. Read-only — never adds, edits, or deletes contacts.</LI>
    </UL>

    <H2>Where Your Data Is Stored</H2>
    <UL>
      <LI>Project data is stored in a secure Supabase database and your browser's local storage.</LI>
      <LI>Files you upload are stored in your own Google Drive (in the Morgan folder you set up).</LI>
      <LI>No data is sold, shared with third parties, or used for advertising.</LI>
    </UL>

    <H2>What We Don't Do</H2>
    <UL>
      <LI>We don't track you across other websites.</LI>
      <LI>We don't use cookies for advertising or analytics.</LI>
      <LI>We don't share your data with anyone outside your team.</LI>
      <LI>We don't train AI models on your project data — the AI assistant processes your data in real-time and does not retain it after the conversation.</LI>
    </UL>

    <H2>Data Deletion</H2>
    <UL>
      <LI>Delete a project in the app and it is removed from the database.</LI>
      <LI>Delete your account and all associated data is removed.</LI>
      <LI>Your Google Drive files remain yours — Morgan does not delete them when you leave.</LI>
    </UL>

    <H2>Contact</H2>
    <P>Questions about privacy? Contact us at <a href="mailto:hello@earlyspring.nyc" style={{color:T.cyan}}>hello@earlyspring.nyc</a></P>
  </LegalPage>;
}

function TermsPage(){
  return<LegalPage title="Terms of Service">
    <P>By using Morgan ("the app"), you agree to these terms. Morgan is provided by Early Spring LLC.</P>

    <H2>What Morgan Is</H2>
    <P>Morgan is a production management tool for event and experiential producers. It helps manage budgets, timelines, vendors, client deliverables, and creative assets.</P>

    <H2>Your Account</H2>
    <UL>
      <LI>You sign in with your Google account. You are responsible for maintaining the security of your account.</LI>
      <LI>You must provide accurate information when creating projects and sharing with clients.</LI>
    </UL>

    <H2>Your Data</H2>
    <UL>
      <LI>You own all content you create in Morgan — budgets, documents, files, and project data.</LI>
      <LI>We do not claim any ownership or license over your content beyond what's needed to operate the service.</LI>
      <LI>You can export or delete your data at any time.</LI>
    </UL>

    <H2>Acceptable Use</H2>
    <P>Don't use Morgan to store or transmit illegal content, malware, or content that infringes on others' rights.</P>

    <H2>Service Availability</H2>
    <P>We aim to keep Morgan available at all times but cannot guarantee 100% uptime. We may perform maintenance that temporarily affects availability.</P>

    <H2>Limitation of Liability</H2>
    <P>Morgan is provided "as is." Early Spring LLC is not liable for any indirect, incidental, or consequential damages arising from your use of the app. Our total liability is limited to the amount you paid for the service in the 12 months preceding the claim.</P>

    <H2>Changes</H2>
    <P>We may update these terms. Continued use of Morgan after changes constitutes acceptance.</P>

    <H2>Contact</H2>
    <P>Questions? Reach us at <a href="mailto:hello@earlyspring.nyc" style={{color:T.cyan}}>hello@earlyspring.nyc</a></P>
  </LegalPage>;
}

function App(){
  // Check for legal pages and migration
  const path=window.location.pathname;
  if(path==="/privacy")return<PrivacyPage/>;
  if(path==="/terms")return<TermsPage/>;

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

  // Theme — light (paper canvas) or dark (sapphire canvas).
  // We persist the choice and reload so all useMemo'd palettes pick up
  // the new tokens cleanly.
  const themeMode = T.mode || 'light';
  const toggleTheme = useCallback(() => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    if (typeof window !== 'undefined') window.location.reload();
  }, [themeMode]);

  // Projects & Shared Vendors
  // For Supabase-authenticated users, only set orgId once profiles have
  // actually loaded. Falling back to 'local' would cause silent data loss
  // (writes go to localStorage instead of Supabase).
  const orgId = usesSupa
    ? (sbAuth.currentOrgId || sbAuth.profile?.org_id || (user ? null : 'local'))
    : 'local';
  const profilePending = usesSupa && !!user && !orgId;
  console.log('[app] Auth state:', { usesSupa, user: !!user, profile: sbAuth.profile?.id, orgId, orgCount: sbAuth.profiles?.length, profilePending });
  const { projects, loaded, createProject: createProj, updateProject: updateProj, deleteProject: deleteProj, flushPending, conflicts, dismissConflict } = useProjects(orgId);

  // Wrap switchOrg so we flush in-flight saves before changing orgId,
  // otherwise pending updates fire against the new org's RLS context.
  const switchOrgSafe = useCallback(async (nextOrgId) => {
    try { await flushPending?.(); } catch (e) { console.warn('[app] flushPending before org switch failed:', e); }
    setActiveIdRaw(null);
    try { sessionStorage.removeItem('es_activeProject'); } catch (e) {}
    return sbAuth.switchOrg?.(nextOrgId);
  }, [flushPending, sbAuth]);
  const { vendors: sharedVendors, addVendor: addSharedVendor, updateVendor: updateSharedVendor, removeVendor: removeSharedVendor } = useVendors(orgId);
  const[saving,setSaving]=useState(false);
  const[lastSaved,setLastSaved]=useState(null);

  const[showLogin,setShowLogin]=useState(false);
  const[activeId,setActiveIdRaw]=useState(()=>{try{return sessionStorage.getItem("es_activeProject")||null}catch(e){return null}});
  const setActiveId=useCallback(id=>{setActiveIdRaw(id);try{if(id)sessionStorage.setItem("es_activeProject",id);else sessionStorage.removeItem("es_activeProject")}catch(e){}},[]);
  const[showNew,setShowNew]=useState(false);
  // Top-level view: 'dashboard' (home) or 'contacts' (CRM). Project view
  // is owned by activeId; setting it to a non-null value supersedes both.
  const[topView,setTopView]=useState("dashboard");
  const[toasts,setToasts]=useState([]);
  const toast=useCallback((msg,type="success")=>{const id=uid();setToasts(p=>[...p,{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000)},[]);
  // Subscribe to the global toast bus so any module can surface errors.
  useEffect(()=>{
    let unsubscribe=null;
    let mounted=true;
    import('./lib/toast.js').then(({subscribe})=>{
      if(!mounted)return;
      unsubscribe=subscribe(t=>{
        setToasts(p=>[...p,t]);
        if(t.ttl>0)setTimeout(()=>setToasts(p=>p.filter(x=>x.id!==t.id)),t.ttl);
      });
    });
    return()=>{mounted=false;if(unsubscribe)unsubscribe()};
  },[]);
  const activeProject=activeId?projects.find(p=>p.id===activeId):null;
  // After projects load: if activeId references a project that's not in
  // the current org's list (org switch, deleted by teammate, stale
  // sessionStorage), clear it instead of silently dropping to dashboard
  // with no feedback.
  useEffect(()=>{
    if(!loaded||!activeId)return;
    if(!projects.find(p=>p.id===activeId)){
      console.warn('[app] active project not found in current list — clearing');
      setActiveIdRaw(null);
      try{sessionStorage.removeItem('es_activeProject')}catch(e){}
    }
  },[loaded,activeId,projects]);

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

  useEffect(()=>{const handler=e=>{
    if(e.key==="Escape"){setShowNew(false)}
  };window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[]);

  // Watchdog: if profile loading is stuck for >30s, the session token is
  // almost certainly stale. Auto-clear auth state and bounce to login
  // instead of leaving the user trapped on the loading screen.
  useEffect(()=>{
    if(!profilePending)return;
    const t=setTimeout(()=>{
      if(sbAuth.forceSignOutAndReload){
        sbAuth.forceSignOutAndReload('profile load stuck >30s');
      }
    },30000);
    return()=>clearTimeout(t);
  },[profilePending,sbAuth]);

  // Loading state — also catches "signed in but profile still loading" so
  // we never let the user write data while orgId is unresolved.
  if(sbAuth.loading || !loaded || profilePending)return<div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:T.sans}}>
    <div style={{textAlign:"center",color:T.fadedInk,maxWidth:360,padding:"0 24px"}}>
      <div style={{fontSize:24,marginBottom:14,animation:"pulse 1.5s ease-in-out infinite",color:T.ink}}>◐</div>
      <div style={{fontSize:13,color:T.ink,fontWeight:600,marginBottom:6}}>{profilePending?"Loading your workspace…":"Loading…"}</div>
      {profilePending&&<div style={{fontSize:11,color:T.fadedInk,lineHeight:1.6,marginBottom:14}}>Reconnecting to the server. This usually takes a few seconds — if it doesn't clear within 30 seconds we'll auto-recover.</div>}
      {profilePending&&<button onClick={()=>sbAuth.forceSignOutAndReload?.('user clicked sign out from loading screen')} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}>Sign out</button>}
    </div>
  </div>;

  if(!user){
    if(showLogin)return<Login onLogin={setUser} googleClientId={GOOGLE_CLIENT_ID} onGoogleLogin={loginWithGoogle} onEmailLogin={usesSupa?sbAuth.loginWithEmail:null} onEmailSignUp={usesSupa?sbAuth.signUp:null} isSupabase={usesSupa}/>;
    return<LandingPage onGetStarted={()=>setShowLogin(true)}/>;
  }

  if(topView==="contacts"&&!activeProject)return<><ContactsView user={user} onBack={()=>setTopView("dashboard")} onLogout={doLogout} accessToken={accessToken}/>
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=>{const isErr=t.type==='error';const isSucc=t.type==='success';return<div key={t.id} className="slide-in" style={{padding:"10px 16px",borderRadius:T.rS,background:isErr?T.alertSoft:isSucc?T.inkSoft:T.paper,border:`1px solid ${isErr?T.alert:T.ink}`,color:isErr?T.alert:T.ink,fontSize:12,fontWeight:500,fontFamily:T.sans,boxShadow:T.shadow,maxWidth:340}}>{t.msg}</div>;})}
    </div>
  </>;

  if(activeProject)return<><ProjectView project={activeProject} updateProject={updateProject} deleteProject={deleteProject} user={user} onBack={()=>setActiveId(null)} accessToken={accessToken} requestCalendarAccess={requestCalendarAccess} toggleTheme={toggleTheme} themeMode={themeMode} onLogout={doLogout} sharedVendors={sharedVendors} addSharedVendor={addSharedVendor} saving={saving} lastSaved={lastSaved} onUpdateUser={setUser} profiles={sbAuth.profiles} organizations={sbAuth.organizations} currentOrgId={orgId} switchOrg={switchOrgSafe}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=>{
        const isErr=t.type==='error';
        const isSucc=t.type==='success';
        return<div key={t.id} className="slide-in" style={{padding:"10px 16px",borderRadius:T.rS,background:isErr?T.alertSoft:isSucc?T.inkSoft:T.paper,border:`1px solid ${isErr?T.alert:T.ink}`,color:isErr?T.alert:T.ink,fontSize:12,fontWeight:500,fontFamily:T.sans,boxShadow:T.shadow,maxWidth:340}}>{t.msg}{t.action&&<button onClick={t.action.onClick} style={{marginLeft:10,background:'none',border:'none',color:'inherit',fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer',fontFamily:T.sans,textDecoration:'underline'}}>{t.action.label}</button>}</div>;
      })}
    </div>
  </>;
  const DashComp=user.role==="ep"?EPDashboard:PortfolioDash;
  return<><DashComp projects={projects} onOpen={setActiveId} onNew={()=>setShowNew(true)} onOpenContacts={()=>setTopView("contacts")} user={user} onLogout={doLogout} accessToken={accessToken} profiles={sbAuth.profiles} organizations={sbAuth.organizations} currentOrgId={orgId} switchOrg={switchOrgSafe} orgId={orgId} toggleTheme={toggleTheme} themeMode={themeMode}/>{showNew&&<NewProjectModal onClose={()=>setShowNew(false)} onCreate={createProject}/>}
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
      {(conflicts||[]).map(c=><div key={c.projectId} className="slide-in" style={{padding:"12px 18px",borderRadius:T.rS,background:T.alertSoft,border:`1px solid ${T.alert}`,color:T.alert,fontSize:12,fontFamily:T.sans,boxShadow:T.shadow,maxWidth:340}}>
        <div style={{fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",marginBottom:4}}>Refreshed from server</div>
        <div style={{fontWeight:400,lineHeight:1.5}}>“{c.name}” was edited by another team member while you were working. We've loaded the latest version — review and re-apply your changes.</div>
        <button onClick={()=>dismissConflict?.(c.projectId)} style={{marginTop:8,padding:"4px 12px",borderRadius:999,border:`1px solid ${T.alert}`,background:"transparent",color:T.alert,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans}}>Dismiss</button>
      </div>)}
      {toasts.map(t=>{
        const isErr=t.type==='error';
        const isSucc=t.type==='success';
        return<div key={t.id} className="slide-in" style={{padding:"10px 16px",borderRadius:T.rS,background:isErr?T.alertSoft:isSucc?T.inkSoft:T.paper,border:`1px solid ${isErr?T.alert:T.ink}`,color:isErr?T.alert:T.ink,fontSize:12,fontWeight:500,fontFamily:T.sans,boxShadow:T.shadow,maxWidth:340}}>{t.msg}{t.action&&<button onClick={t.action.onClick} style={{marginLeft:10,background:'none',border:'none',color:'inherit',fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer',fontFamily:T.sans,textDecoration:'underline'}}>{t.action.label}</button>}</div>;
      })}
    </div>
  </>;
}

export default App;
