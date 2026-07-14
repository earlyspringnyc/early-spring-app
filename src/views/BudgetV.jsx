import { useState, useEffect, useCallback, useRef } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { ct, fmtRange, projectSupportsRanges } from '../utils/calc.js';
import { uid } from '../utils/uid.js';
import { PlusI } from '../components/icons/index.js';
import { Card, NI, Metric, SB } from '../components/primitives/index.js';
import { exportBudgetToSheets } from '../utils/drive.js';
import SheetImportModal from '../components/modals/SheetImportModal.jsx';
import SheetSyncModal from '../components/modals/SheetSyncModal.jsx';
import XlsxImportModal from '../components/modals/XlsxImportModal.jsx';
import AddSectionModal from '../components/modals/AddSectionModal.jsx';
import Cat from './Cat.jsx';

const Pill=({children,color=T.ink,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 8px":"3px 10px",borderRadius:999,background:"transparent",color,border:`1px solid ${color}`,textTransform:"uppercase",letterSpacing:".06em",whiteSpace:"nowrap"}}>{children}</span>;

/* Category accents — sapphire opacity variants only (per Lab guidelines) */
const CAT_ACCENTS=[T.ink,T.ink70,T.ink60,T.fadedInk];

function BudgetV(p){
  const canEdit=p.user.role!=="client";
  const proj=p.project||{};
  const[globalMargin,setGlobalMargin]=useState(15);
  const[showHistory,setShowHistory]=useState(false);
  // Range mode: opt-in per project. Auto-suggested for pitching
  // projects (the toggle defaults visible-on) but always under the
  // user's control. When off, the budget displays as single numbers
  // even if individual items still have isRange data set.
  const rangesAllowed=projectSupportsRanges(proj);
  const toggleRanges=()=>{
    if(!p.updateProject)return;
    p.updateProject({ budgetSupportsRanges: !rangesAllowed });
  };

  // ── Version history from the budget_snapshots table ──
  // Snapshots are stored in their own table (paginated to avoid
  // pulling thousands at once). The UI fetches on mount + refresh
  // whenever the panel opens. Every save creates a new snapshot
  // automatically (throttled to one per 30s in useProjects).
  const[history,setHistory]=useState([]);
  const[historyLoading,setHistoryLoading]=useState(false);
  const[historyOffset,setHistoryOffset]=useState(0);
  const[historyMore,setHistoryMore]=useState(true);
  const reloadHistory=useCallback(async (reset=true)=>{
    if(!proj.id) return;
    setHistoryLoading(true);
    try {
      const { listBudgetSnapshots } = await import('../lib/budgetSnapshots.js');
      const offset = reset ? 0 : historyOffset;
      const rows = await listBudgetSnapshots(proj.id, { limit: 50, offset });
      setHistory(prev => reset ? rows : [...prev, ...rows]);
      setHistoryMore(rows.length === 50);
      setHistoryOffset(offset + rows.length);
    } catch (e) {
      console.warn('[budget-history] load failed:', e?.message);
    } finally { setHistoryLoading(false); }
  },[proj.id,historyOffset]);
  useEffect(()=>{ reloadHistory(true); /* eslint-disable-next-line */ },[proj.id]);
  // Refresh the panel whenever the user opens it (catches new
  // auto-saves that landed since last open).
  useEffect(()=>{ if(showHistory) reloadHistory(true); /* eslint-disable-next-line */ },[showHistory]);

  const saveSnapshot=async()=>{
    const label=prompt("Name this version (e.g. 'v1 - Initial estimate'):");
    if(!label)return;
    try {
      const { createBudgetSnapshot } = await import('../lib/budgetSnapshots.js');
      const { getSession } = await import('../lib/db.js');
      const session = await getSession().catch(() => null);
      const meta = session?.user?.user_metadata || {};
      await createBudgetSnapshot(proj.id, {
        userId: session?.user?.id || null,
        userName: meta.full_name || meta.name || session?.user?.email || null,
        userEmail: session?.user?.email || null,
        label,
        auto: false,
        data: {
          cats: p.cats || [],
          ag: p.ag || [],
          feeP: p.feeP,
          clientBudget: proj.clientBudget,
          budgets: proj.budgets || [],
        },
      });
      reloadHistory(true);
    } catch (e) { alert('Could not save version: ' + (e.message || 'unknown')); }
  };
  // Restore can target the entire project (every budget) OR just
  // one specific budget (the currently-viewed one). Defaults to
  // "active" so accidental clicks don't blow away alt budgets the
  // user didn't intend to touch.
  //   scope: 'full' | 'active'
  const restoreSnapshot=async(entry,scope='active')=>{
    const budgetLabel = scope === 'full'
      ? 'the entire project (primary + all alt budgets)'
      : (p.activeBudgetId
          ? `the "${(p.budgets||[]).find(b=>b.id===p.activeBudgetId)?.name||'alt'}" budget only`
          : 'the Primary budget only');
    if(!confirm(`Restore ${budgetLabel} from ${new Date(entry.at).toLocaleString()}${entry.label ? ` ("${entry.label}")` : ''}? Current state will be replaced (a new auto-snapshot is created first so you can undo).`))return;
    try {
      const { getBudgetSnapshot } = await import('../lib/budgetSnapshots.js');
      const full = await getBudgetSnapshot(entry.id);
      if (!full?.data) throw new Error('Snapshot data missing');
      if (scope === 'full') {
        p.onRestoreHistory(full.data);
      } else {
        // Active-only restore: extract the relevant slice from the
        // snapshot and apply it via onRestoreHistory using the
        // legacy {cats,ag,feeP} shape so the receiver routes it to
        // the currently-viewed budget.
        if (!p.activeBudgetId) {
          // Primary
          p.onRestoreHistory({ cats: full.data.cats, ag: full.data.ag, feeP: full.data.feeP });
        } else {
          const altSnap = (full.data.budgets || []).find(b => b.id === p.activeBudgetId);
          if (!altSnap) {
            alert("This snapshot doesn't include the currently-viewed alt budget. Pick a different snapshot or restore the full project.");
            return;
          }
          p.onRestoreHistory({ cats: altSnap.cats, ag: altSnap.ag, feeP: altSnap.feeP });
        }
      }
    } catch (e) { alert('Restore failed: ' + (e.message || 'unknown')); }
  };
  const deleteSnapshot=async(id)=>{
    if(!confirm("Delete this version?"))return;
    try {
      const { deleteBudgetSnapshot } = await import('../lib/budgetSnapshots.js');
      await deleteBudgetSnapshot(id);
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch (e) { alert('Delete failed: ' + (e.message || 'unknown')); }
  };
  const exportXLS=async()=>{
    const XLSX=await import('xlsx');
    const rows=[["Category","Item","Description","Vendor","Actual Cost","Margin %","Client Price","Variance"]];
    p.cats.forEach(c=>{
      c.items.forEach(it=>{const cp=it.actualCost===0?0:it.actualCost*(1+it.margin);const variance=cp-it.actualCost;
        const vendorName=(p.vendors||[]).find(v=>v.id===it.vendorId)?.name||"";
        rows.push([c.name,it.name,it.details||"",vendorName,it.actualCost,(it.margin*100)+"%",cp,variance])})});
    rows.push([]);rows.push(["","","","","PRODUCTION SUBTOTAL","",p.comp.productionSubtotal.clientPrice,""]);
    rows.push([]);rows.push(["Agency Role","","","","Days","Day Rate","Cost",""]);
    p.ag.forEach(it=>{const cp=it.actualCost===0?0:it.actualCost*(1+it.margin);rows.push([it.name,"","","",it.days||"",it.dayRate||"",cp,""])});
    rows.push(["","","","","AGENCY SUBTOTAL","",p.comp.agencyCostsSubtotal.clientPrice,""]);
    rows.push(["","","","","AGENCY FEE ("+(p.feeP*100).toFixed(0)+"%)","",p.comp.agencyFee.clientPrice,""]);
    rows.push(["","","","","GRAND TOTAL","",p.comp.grandTotal,""]);
    rows.push(["","","","","NET PROFIT","",p.comp.netProfit,""]);
    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws['!cols']=[{wch:18},{wch:24},{wch:20},{wch:16},{wch:14},{wch:10},{wch:14},{wch:14}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Production Budget");
    XLSX.writeFile(wb,(p.project?.name||"budget")+"-production-budget.xlsx");
  };
  const exportCSV=async()=>{
    const rows=[["Category","Item","Description","Vendor","Actual Cost","Margin %","Client Price","Variance"]];
    p.cats.forEach(c=>{c.items.forEach(it=>{const cp=it.actualCost===0?0:it.actualCost*(1+it.margin);const variance=cp-it.actualCost;const vendorName=(p.vendors||[]).find(v=>v.id===it.vendorId)?.name||"";rows.push([c.name,it.name,it.details||"",vendorName,it.actualCost,(it.margin*100)+"%",cp,variance])})});
    rows.push([]);rows.push(["","","","","GRAND TOTAL","",p.comp.grandTotal,""]);rows.push(["","","","","NET PROFIT","",p.comp.netProfit,""]);
    const csv=rows.map(r=>r.map(c=>typeof c==="string"&&c.includes(",")?`"${c}"`:c).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(p.project?.name||"budget")+"-production-budget.csv";a.click();URL.revokeObjectURL(url);setShowExportMenu(false);
  };
  const exportPDF=async()=>{
    const{exportBudgetPDF}=await import('../utils/pdfExport.js');
    await exportBudgetPDF(p.project,{cats:p.cats,ag:p.ag,comp:p.comp,feeP:p.feeP,vendors:p.vendors||[]},{filename:(p.project?.name||"budget")+"-production-budget.pdf"});
    setShowExportMenu(false);
  };
  const exportClientPNG=async()=>{
    const{exportClientBudgetPNG}=await import('../utils/clientBudgetPNG.js');
    const activeBudgetName=p.activeBudgetId
      ?((p.budgets||[]).find(b=>b.id===p.activeBudgetId)?.name||'Alt Budget')
      :'Primary Budget';
    await exportClientBudgetPNG(p.project,{cats:p.cats,ag:p.ag,comp:p.comp,feeP:p.feeP,activeBudgetName},{filename:(p.project?.name||"budget")+"-client-summary.png"});
    setShowExportMenu(false);
  };
  const[dragSection,setDragSection]=useState(null);
  const[overSection,setOverSection]=useState(null);
  const[showAddSection,setShowAddSection]=useState(false);
  const[editingBudget,setEditingBudget]=useState(false);
  const[budgetDraft,setBudgetDraft]=useState("");
  const[confirmBudget,setConfirmBudget]=useState(false);
  const[showMarginSlider,setShowMarginSlider]=useState(false);
  const[showExportMenu,setShowExportMenu]=useState(false);
  const[sheetsExporting,setSheetsExporting]=useState(false);
  const[showSheetImport,setShowSheetImport]=useState(false);
  const[showSheetSync,setShowSheetSync]=useState(false);
  const[showXlsxImport,setShowXlsxImport]=useState(false);
  const[sheetsUrl,setSheetsUrl]=useState(null);
  const runSheetsExport=async(token)=>{
    const result=await exportBudgetToSheets(token,p.project,p.cats,p.ag,p.comp,p.feeP,p.project?.driveFolders);
    if(result?.url){setSheetsUrl(result.url);window.open(result.url,"_blank")}
    return result;
  };
  const exportToSheets=async()=>{
    // The user is already signed into Morgan with Google, but the Sheets/Drive
    // API needs a separate access token that expires ~hourly. If we don't have
    // a live one, request it on the spot (same grant the calendar features use)
    // rather than telling them to "sign in" — that message confused producers
    // who were already signed in.
    let token=p.accessToken;
    if(!token&&p.requestCalendarAccess){token=await p.requestCalendarAccess();}
    if(!token){alert("Google needs permission to create the Sheet. Approve the Google pop-up, then click Export to Sheets again.");return}
    setSheetsExporting(true);setShowExportMenu(false);
    try{
      await runSheetsExport(token);
    }catch(e){
      console.error("[sheets]",e);
      // Most common failure is an expired/insufficient token — silently
      // re-request once and retry before surfacing an error.
      const msg=String(e?.message||e);
      let recovered=false;
      if(/401|403|invalid|token|auth|expire/i.test(msg)&&p.requestCalendarAccess){
        const fresh=await p.requestCalendarAccess();
        if(fresh){try{await runSheetsExport(fresh);recovered=true;}catch(e2){console.error("[sheets retry]",e2);}}
      }
      if(!recovered)alert("Couldn't export to Google Sheets — your Google access may have expired. Approve the Google pop-up and try again.");
    }
    setSheetsExporting(false);
  };
  const budgetRef=useRef(null);
  const startEditBudget=()=>{if(!canEdit)return;setBudgetDraft(String(p.clientBudget||""));setEditingBudget(true);setConfirmBudget(false);setTimeout(()=>budgetRef.current?.select(),50)};
  const proposeBudget=()=>{const v=parseFloat(budgetDraft.replace(/[^0-9.\-]/g,""))||0;if(v===(p.clientBudget||0)){setEditingBudget(false);return}setConfirmBudget(true)};
  const confirmBudgetChange=()=>{const v=parseFloat(budgetDraft.replace(/[^0-9.\-]/g,""))||0;p.onUpdateBudget(v);setEditingBudget(false);setConfirmBudget(false)};
  const cancelBudget=()=>{setEditingBudget(false);setConfirmBudget(false)};

  const cb=p.clientBudget||0;
  const gt=p.comp.grandTotal;
  const totalSpend=p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost+p.comp.agencyFee.actualCost;
  const balance=cb-gt;
  const overBudget=balance<0;
  const spendPct=cb>0?Math.min(Math.round((totalSpend/cb)*100),100):0;
  /* Remaining production spend capacity: how much actual cost can I add and stay within budget?
     Each $1 of actual cost becomes $(1+margin) at client price, then $(1+margin)*(1+feeP) after agency fee.
     Use blended margin from existing items to estimate. */
  const totalActual=p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost;
  const totalClient=p.comp.productionSubtotal.clientPrice+p.comp.agencyCostsSubtotal.clientPrice;
  const blendedMarkup=totalActual>0?(totalClient/totalActual):1.15;
  const effectiveMultiplier=blendedMarkup*(1+p.feeP);
  const remainingClientRoom=Math.max(0,cb-gt);
  const remainingSpendCapacity=effectiveMultiplier>0?remainingClientRoom/effectiveMultiplier:0;

  const budgets=p.budgets||[];
  const activeBudgetId=p.activeBudgetId;
  const isPrimary=!activeBudgetId;
  const activeBudget=activeBudgetId?budgets.find(b=>b.id===activeBudgetId):null;
  const[renamingId,setRenamingId]=useState(null);
  const[renameVal,setRenameVal]=useState("");
  const[showNewBudget,setShowNewBudget]=useState(false);
  const[newBudgetName,setNewBudgetName]=useState("");
  const[dragBudgetId,setDragBudgetId]=useState(null);
  const[dropTarget,setDropTarget]=useState(null); // null or "primary"

  return<div>
    {/* ── Budget tabs (drag alternate to Primary to swap) ── */}
    <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:20,borderBottom:`1px solid ${T.border}`,overflow:"auto",WebkitOverflowScrolling:"touch"}}>
      <button onClick={()=>p.onSwitchBudget(null)}
        onDragOver={e=>{if(dragBudgetId){e.preventDefault();setDropTarget("primary")}}}
        onDragLeave={()=>setDropTarget(null)}
        onDrop={e=>{e.preventDefault();if(dragBudgetId&&p.onMakePrimary){p.onMakePrimary(dragBudgetId)}setDragBudgetId(null);setDropTarget(null)}}
        style={{padding:"10px 18px",background:dropTarget==="primary"?T.goldSoft:"none",border:"none",borderBottom:isPrimary?`2px solid ${T.gold}`:dropTarget==="primary"?`2px solid ${T.gold}`:"2px solid transparent",color:isPrimary||dropTarget==="primary"?T.cream:T.dim,fontSize:12,fontWeight:isPrimary?600:400,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap",transition:"all .15s"}} onMouseEnter={e=>{if(!isPrimary&&!dropTarget)e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{if(!isPrimary&&!dropTarget)e.currentTarget.style.color=T.dim}}>
        {dropTarget==="primary"?"Drop to make primary":"Primary Budget"}
      </button>
      {budgets.map(b=>{
        const isActive=activeBudgetId===b.id;
        const isRenaming=renamingId===b.id;
        const isDragging=dragBudgetId===b.id;
        return<div key={b.id} draggable={canEdit&&!isRenaming} onDragStart={e=>{setDragBudgetId(b.id);e.dataTransfer.effectAllowed="move"}} onDragEnd={()=>{setDragBudgetId(null);setDropTarget(null)}} style={{display:"flex",alignItems:"center",position:"relative",opacity:isDragging?.4:1,cursor:canEdit?"grab":"default"}}>
          {isRenaming?<input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)} onBlur={()=>{if(renameVal.trim()&&p.onRenameBudget)p.onRenameBudget(b.id,renameVal.trim());setRenamingId(null)}} onKeyDown={e=>{if(e.key==="Enter"){if(renameVal.trim()&&p.onRenameBudget)p.onRenameBudget(b.id,renameVal.trim());setRenamingId(null)}if(e.key==="Escape")setRenamingId(null)}} style={{padding:"8px 14px",background:"transparent",border:"none",borderBottom:`2px solid ${T.ink}`,color:T.cream,fontSize:12,fontWeight:600,fontFamily:T.sans,outline:"none",width:140}}/>
          :<button onClick={()=>p.onSwitchBudget(b.id)} onDoubleClick={()=>{if(canEdit){setRenamingId(b.id);setRenameVal(b.name)}}} style={{padding:"10px 18px",paddingRight:canEdit?32:18,background:"none",border:"none",borderBottom:isActive?`2px solid ${T.gold}`:"2px solid transparent",color:isActive?T.cream:T.dim,fontSize:12,fontWeight:isActive?600:400,cursor:"inherit",fontFamily:T.sans,whiteSpace:"nowrap",transition:"all .15s"}} onMouseEnter={e=>{if(!isActive)e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.color=T.dim}} title="Drag to Primary to promote · Double-click to rename">
            {b.name}
          </button>}
          {canEdit&&isActive&&!isRenaming&&<button onClick={e=>{e.stopPropagation();if(p.onDeleteBudget)p.onDeleteBudget(b.id)}} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.dim,fontSize:14,cursor:"pointer",padding:"2px 4px",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=T.neg} onMouseLeave={e=>e.currentTarget.style.color=T.dim} title="Delete budget">×</button>}
        </div>})}
      {canEdit&&!showNewBudget&&<button onClick={()=>{setShowNewBudget(true);setNewBudgetName("")}} style={{padding:"10px 14px",background:"none",border:"none",borderBottom:"2px solid transparent",color:T.dim,fontSize:12,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}} onMouseEnter={e=>e.currentTarget.style.color=T.gold} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>
        <PlusI size={10} color="currentColor"/> Add Budget
      </button>}
      {canEdit&&!showNewBudget&&p.onDuplicateBudget&&<button onClick={()=>p.onDuplicateBudget(activeBudgetId||null)} title={`Duplicate the ${isPrimary?'Primary':'"'+(activeBudget?.name||'current')+'"'} budget into a new copy`} style={{padding:"10px 14px",background:"none",border:"none",borderBottom:"2px solid transparent",color:T.dim,fontSize:12,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}} onMouseEnter={e=>e.currentTarget.style.color=T.gold} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>
        <span style={{fontSize:13,lineHeight:1}}>⧉</span> Duplicate
      </button>}
      {showNewBudget&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
        <input autoFocus value={newBudgetName} onChange={e=>setNewBudgetName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newBudgetName.trim()){p.onAddBudget(newBudgetName.trim());setShowNewBudget(false)}if(e.key==="Escape")setShowNewBudget(false)}} placeholder="Budget name…" style={{padding:"6px 4px",background:"transparent",border:"none",borderBottom:`1px solid ${T.ink}`,color:T.ink,fontSize:13,fontFamily:T.sans,outline:"none",width:180}}/>
        <button onClick={()=>{if(newBudgetName.trim()){p.onAddBudget(newBudgetName.trim());setShowNewBudget(false)}}} disabled={!newBudgetName.trim()} className="btn-pill" style={{padding:"5px 12px",fontSize:11,opacity:newBudgetName.trim()?1:.5,cursor:newBudgetName.trim()?"pointer":"default"}}>Create</button>
        <button onClick={()=>setShowNewBudget(false)} style={{padding:"6px 8px",background:"none",border:"none",color:T.fadedInk,fontSize:16,cursor:"pointer",lineHeight:1}}>×</button>
      </div>}
    </div>

    {/* ── Header ── */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,flexWrap:"wrap",gap:12}}>
      <div>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:".10em",textTransform:"uppercase",color:T.ink,marginBottom:8}}>Production Budget</div>
        <h1 style={{fontSize:"clamp(28px,3.4vw,40px)",fontWeight:800,color:T.ink,letterSpacing:"-0.022em",lineHeight:1.04,margin:0}}>{activeBudget?activeBudget.name:"Internal view"}</h1>
        <p style={{fontSize:13,color:T.fadedInk,marginTop:8,maxWidth:"56ch",lineHeight:1.6}}>{canEdit?"Live cost · margin · client price.":"View-only"}</p>
        {canEdit&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}} title={rangesAllowed?"Line items and sections can be expressed as a min–max band. Turn off to display single numbers (range data stays saved).":"Allow line items and sections to be expressed as min–max bands — useful while pitching."}>
          <button onClick={toggleRanges} style={{width:32,height:18,borderRadius:9,border:`1px solid ${rangesAllowed?T.ink:T.faintRule}`,cursor:"pointer",background:rangesAllowed?T.ink:"transparent",position:"relative",padding:0,flexShrink:0,transition:"background .18s ease, border-color .18s ease"}}>
            <span style={{position:"absolute",top:2,left:rangesAllowed?16:2,width:12,height:12,borderRadius:6,background:rangesAllowed?T.paper:T.faintRule,transition:"left .18s ease"}}/>
          </button>
          <span style={{fontSize:10,fontWeight:700,color:rangesAllowed?T.ink:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em"}}>Use ranges in this budget</span>
        </div>}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {p.saving&&<Pill color={T.fadedInk} size="xs">Saving…</Pill>}
        {!p.saving&&p.lastSaved&&<Pill color={T.ink} size="xs">Saved</Pill>}
      </div>
    </div>

    {/* ── Top metrics with budget health ── */}
    <div className="budget-metrics" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
      <div style={{padding:"18px 20px",borderRadius:T.rS,background:T.paper,border:`1px solid ${T.faintRule}`,borderLeft:`2px solid ${T.ink70}`,cursor:canEdit&&!editingBudget?"pointer":"default"}} onClick={!editingBudget?startEditBudget:undefined}>
        <div style={{fontSize:10,fontWeight:700,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em",marginBottom:8}}>Client Budget</div>
        {editingBudget?<div>
          <input ref={budgetRef} autoFocus value={budgetDraft} onChange={e=>setBudgetDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")proposeBudget();if(e.key==="Escape")cancelBudget()}} style={{width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${T.ink}`,outline:"none",color:T.ink,fontSize:26,fontWeight:800,fontFamily:T.mono,padding:"2px 0",lineHeight:1,letterSpacing:"-0.022em"}}/>
          {confirmBudget?<div style={{marginTop:10}}>
            <div style={{fontSize:11,color:T.ink,marginBottom:8}}>Update to {f0(parseFloat(budgetDraft.replace(/[^0-9.\-]/g,""))||0)}?</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={confirmBudgetChange} className="btn-pill" style={{padding:"5px 14px",fontSize:10}}>Confirm</button>
              <button onClick={cancelBudget} style={{padding:"5px 14px",borderRadius:999,border:`1px solid ${T.faintRule}`,background:"transparent",color:T.fadedInk,fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
            </div>
          </div>:<div style={{marginTop:6,fontSize:10,color:T.fadedInk}}>Enter to update</div>}
        </div>:<div>
          <div className="num" style={{fontSize:28,fontWeight:800,color:T.ink,fontFamily:T.mono,lineHeight:1,letterSpacing:"-0.022em"}}>{cb>0?f0(cb):"\u2014"}</div>
          {canEdit&&<div style={{fontSize:10,color:T.fadedInk,marginTop:6}}>Click to edit</div>}
        </div>}
      </div>
      <div style={{padding:"18px 20px",borderRadius:T.rS,background:T.paper,border:`1px solid ${T.faintRule}`,borderLeft:`2px solid ${T.ink}`}}>
        <div style={{fontSize:10,fontWeight:700,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em",marginBottom:8}}>Grand Total</div>
        <div className="num" style={{fontSize:rangesAllowed&&Math.abs((p.comp.grandMax||0)-(p.comp.grandMin||0))>=0.5?22:28,fontWeight:800,color:T.ink,fontFamily:T.mono,lineHeight:1,letterSpacing:"-0.022em"}}>{rangesAllowed?fmtRange(p.comp.grandMin||0,p.comp.grandMax||0,f0):f0(gt)}</div>
        {cb>0&&<div style={{marginTop:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:10,color:T.fadedInk}}>{spendPct}% of budget</span><span style={{fontSize:10,color:T.fadedInk,fontFamily:T.mono}}>{f0(cb-totalSpend)} remaining</span></div>
          <div style={{height:4,background:T.faintRule,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${spendPct}%`,background:spendPct>90?T.alert:T.ink,borderRadius:2,transition:"width .4s cubic-bezier(.2,.8,.2,1)"}}/></div>
        </div>}
      </div>
      <div style={{padding:"18px 20px",borderRadius:T.rS,background:overBudget?T.alertSoft:T.paper,border:`1px solid ${overBudget?T.alert:T.faintRule}`,borderLeft:`2px solid ${overBudget?T.alert:T.ink}`}}>
        <div style={{fontSize:10,fontWeight:700,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em",marginBottom:8}}>Remaining Spend Capacity</div>
        <div className="num" style={{fontSize:28,fontWeight:800,color:overBudget?T.alert:T.ink,fontFamily:T.mono,lineHeight:1,letterSpacing:"-0.022em"}}>{overBudget?`-${f0(Math.abs(balance))}`:f0(remainingSpendCapacity)}</div>
        <div style={{fontSize:10,color:T.fadedInk,marginTop:6}}>{overBudget?<span style={{color:T.alert}}>Over budget by {f0(Math.abs(balance))}</span>:`${f0(remainingClientRoom)} client-side room`}</div>
      </div>
    </div>

    {/* ── Column headers + Add Section ── */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingRight:18}}>
      {canEdit&&<button onClick={()=>setShowAddSection(true)} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}><PlusI size={11} color="currentColor"/> Add Section</button>}
      {!canEdit&&<div/>}
      <div style={{display:"flex",gap:20}}>
        {(rangesAllowed?["Actual","Client"]:["Actual","Client","Variance"]).map(l=><span key={l} style={{fontSize:10,fontWeight:700,color:T.fadedInk,letterSpacing:".10em",textTransform:"uppercase"}}>{l}</span>)}
      </div>
    </div>

    {/* ── Categories (draggable sections) ── */}
    {(()=>{const contBase=p.cats.filter(c=>c.name.toLowerCase()!=="contingency").reduce((a,c)=>a+ct(c.items,c).totals.actualCost,0);
    // Build the "move to..." target list for each section. Excludes
    // the currently-active budget so we don't show "Move here" on
    // the place we already are.
    const moveTargets=[{id:null,name:"Primary Budget"},...budgets.map(b=>({id:b.id,name:b.name}))].filter(t=>t.id!==(activeBudgetId||null));
    return p.cats.map((c,ci2)=>{const isCont=c.name.toLowerCase()==="contingency";const accent=CAT_ACCENTS[ci2%CAT_ACCENTS.length];return<div key={c.id} draggable={canEdit} onDragStart={e=>{setDragSection(ci2);e.dataTransfer.effectAllowed="move"}} onDragOver={e=>{e.preventDefault();setOverSection(ci2)}} onDrop={e=>{e.preventDefault();if(dragSection!==null&&dragSection!==ci2&&p.reorderSection)p.reorderSection(dragSection,ci2);setDragSection(null);setOverSection(null)}} onDragEnd={()=>{setDragSection(null);setOverSection(null)}} style={{opacity:dragSection===ci2?.4:1,borderTop:overSection===ci2&&dragSection!==null?`2px solid ${accent}`:"2px solid transparent",transition:"opacity .15s"}}><Cat cat={c} comp={ct(c.items,c)} open={p.exp.has(c.id)} toggle={()=>p.tog(c.id)} onUp={(ii,u)=>p.uCat(ci2,ii,u)} onAdd={()=>p.aCat(ci2)} onRm={ii=>p.rCat(ci2,ii)} onRemoveCat={()=>p.rmCat(ci2)} onMoveCat={p.moveSection?(targetId)=>p.moveSection(ci2,targetId):null} moveTargets={moveTargets} canEdit={canEdit} docs={p.docs} vendors={p.vendors} vendorPool={p.vendorPool} onAddVendor={p.onAddVendor} onVendorClick={p.onVendorClick} isContingency={isCont} contBase={contBase} onReorder={(from,to)=>p.reorderCat(ci2,from,to)} accent={accent} rangesAllowed={rangesAllowed} onSetCatMargin={(margin)=>{if(p.updateProject){p.updateProject({cats:p.cats.map((cat,i)=>i===ci2?{...cat,items:cat.items.map(it=>({...it,margin}))}:cat)})}}} onSetCatOverlay={(rangeMin,rangeMax)=>{if(p.updateProject){p.updateProject({cats:p.cats.map((cat,i)=>i===ci2?{...cat,rangeMin,rangeMax}:cat)})}}}/></div>})})()}

    {/* ── Subtotals ── */}
    <div style={{marginTop:6}}><SB label="Production Subtotal" actual={p.comp.productionSubtotal.actualCost} client={p.comp.productionSubtotal.clientPrice} variance={p.comp.productionSubtotal.variance} {...(rangesAllowed?{clientMin:p.comp.productionSubtotal.clientMin,clientMax:p.comp.productionSubtotal.clientMax}:{})}/></div>

    <div style={{marginTop:20}}><Cat cat={{name:"Agency Production Costs"}} comp={ct(p.ag)} open={p.exp.has("agency")} toggle={()=>p.tog("agency")} onUp={p.uAg} onAdd={p.aAg} onRm={p.rAg} isAg canEdit={canEdit} accent={T.cyan} rangesAllowed={rangesAllowed}/></div>
    <SB label="Agency Costs Subtotal" actual={p.comp.agencyCostsSubtotal.actualCost} client={p.comp.agencyCostsSubtotal.clientPrice} variance={p.comp.agencyCostsSubtotal.variance} {...(rangesAllowed?{clientMin:p.comp.agencyCostsSubtotal.clientMin,clientMax:p.comp.agencyCostsSubtotal.clientMax}:{})}/>
    <SB label="Total Production & Agency Cost" actual={p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost} client={p.comp.productionSubtotal.clientPrice+p.comp.agencyCostsSubtotal.clientPrice} variance={p.comp.productionSubtotal.variance+p.comp.agencyCostsSubtotal.variance} {...(rangesAllowed?{clientMin:(p.comp.productionSubtotal.clientMin||0)+(p.comp.agencyCostsSubtotal.clientMin||0),clientMax:(p.comp.productionSubtotal.clientMax||0)+(p.comp.agencyCostsSubtotal.clientMax||0)}:{})}/>

    {/* ── Agency Fee ──
         The percentage and the dollar amount stay in sync: edit
         either one and the other adjusts. Typing a dollar amount
         derives the % from the production + agency-cost client-price
         base (so 25,000 on a 200,000 base = 12.5%). */}
    {(() => {
      const feeBase = (p.comp.productionSubtotal.clientPrice || 0) + (p.comp.agencyCostsSubtotal.clientPrice || 0);
      const onDollarBlur = (e) => {
        const target = parseFloat(String(e.target.value).replace(/[$,\s]/g, '')) || 0;
        if (feeBase <= 0) return;
        const newP = Math.max(0, Math.min(1, target / feeBase));
        p.setFeeP(newP);
      };
      return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",marginTop:5,borderRadius:T.rS,background:T.paper,border:`1px solid ${T.faintRule}`,flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:".10em",color:T.ink,textTransform:"uppercase",flexShrink:0}}>Agency Fee</span>
      {canEdit?<>
        <input type="range" min="0" max="40" step="any" value={p.feeP*100} onChange={e=>p.setFeeP(parseFloat(e.target.value)/100)} style={{flex:1,maxWidth:160}}/>
        <div style={{display:"flex",alignItems:"center",gap:2}}>
          <input value={Math.round(p.feeP*100)} onChange={e=>{const v=parseFloat(e.target.value)||0;p.setFeeP(Math.max(0,Math.min(100,v))/100)}} style={{width:40,padding:"4px",borderRadius:4,background:"transparent",border:"none",borderBottom:`1px solid ${T.faintRule}`,color:T.ink,fontSize:14,fontFamily:T.mono,fontWeight:800,textAlign:"center",outline:"none"}} onFocus={e=>e.currentTarget.style.borderBottomColor=T.ink} onBlur={e=>e.currentTarget.style.borderBottomColor=T.faintRule}/>
          <span style={{fontSize:14,fontWeight:800,color:T.ink}}>%</span>
        </div>
      </>:<div style={{marginLeft:12}}><NI value={p.feeP} fmt="%" onChange={()=>{}} disabled/></div>}
      <div style={{flex:1}}/>
      {canEdit ? (
        <div style={{ display: "inline-flex", alignItems: "baseline", borderBottom: `1px solid ${T.faintRule}` }}>
          <span style={{ fontSize: 13, fontFamily: T.mono, color: T.ink, fontWeight: 700, paddingRight: 2 }}>$</span>
          <input
            key={Math.round(p.comp.agencyFee.clientPrice)}
            defaultValue={Math.round(p.comp.agencyFee.clientPrice).toLocaleString('en-US')}
            onBlur={onDollarBlur}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            title="Type a dollar amount to override; percentage will adjust"
            style={{
              width: 100, padding: "4px 4px", borderRadius: 0,
              background: "transparent", border: "none",
              color: T.ink, fontSize: 13, fontFamily: T.mono,
              fontWeight: 700, textAlign: "right", outline: "none",
            }}
            onFocus={e => { e.currentTarget.parentElement.style.borderBottomColor = T.ink; e.currentTarget.select(); }}
            onBlurCapture={e => { e.currentTarget.parentElement.style.borderBottomColor = T.faintRule; }}
          />
        </div>
      ) : (
        <span className="num" style={{fontSize:13,fontFamily:T.mono,color:T.ink,fontWeight:700}}>{f0(p.comp.agencyFee.clientPrice)}</span>
      )}
    </div>
      );
    })()}

    {/* ── Rep Fee (toggleable) ── */}
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",marginTop:5,borderRadius:T.rS,background:proj.repFeeEnabled?T.inkSoft2:T.paper,border:`1px solid ${T.faintRule}`,transition:"background .18s ease"}}>
      <button onClick={()=>p.updateProject({repFeeEnabled:!proj.repFeeEnabled,repFeeP:proj.repFeeP||0.10})} style={{width:36,height:20,borderRadius:10,border:"none",cursor:"pointer",background:proj.repFeeEnabled?T.ink:T.faintRule,transition:"background .18s ease",position:"relative",flexShrink:0}}>
        <div style={{width:16,height:16,borderRadius:8,background:T.paper,position:"absolute",top:2,left:proj.repFeeEnabled?18:2,transition:"left .18s ease",boxShadow:`0 1px 2px rgba(15,82,186,.20)`}}/>
      </button>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:".10em",color:proj.repFeeEnabled?T.ink:T.fadedInk,textTransform:"uppercase",flexShrink:0,transition:"color .18s ease"}}>Rep Fee</span>
      {proj.repFeeEnabled&&canEdit?<>
        <input type="range" min="5" max="25" step="1" value={(proj.repFeeP||0.10)*100} onChange={e=>p.updateProject({repFeeP:parseInt(e.target.value)/100})} style={{flex:1,maxWidth:140}}/>
        <div style={{display:"flex",alignItems:"center",gap:2}}>
          <input value={Math.round((proj.repFeeP||0.10)*100)} onChange={e=>{const v=parseFloat(e.target.value)||0;p.updateProject({repFeeP:Math.max(5,Math.min(25,v))/100})}} style={{width:40,padding:"4px",borderRadius:4,background:"transparent",border:"none",borderBottom:`1px solid ${T.faintRule}`,color:T.ink,fontSize:14,fontFamily:T.mono,fontWeight:800,textAlign:"center",outline:"none"}} onFocus={e=>e.currentTarget.style.borderBottomColor=T.ink} onBlur={e=>e.currentTarget.style.borderBottomColor=T.faintRule}/>
          <span style={{fontSize:14,fontWeight:800,color:T.ink}}>%</span>
        </div>
        <span style={{fontSize:10,color:T.fadedInk}}>of agency fee</span>
      </>:proj.repFeeEnabled&&<span style={{fontSize:12,color:T.ink,fontFamily:T.mono,fontWeight:700}}>{fp(proj.repFeeP||0.10)}</span>}
      <div style={{flex:1}}/>
      {proj.repFeeEnabled&&<span className="num" style={{fontSize:13,fontFamily:T.mono,color:T.ink,fontWeight:700}}>−{f0(p.comp.repFee||0)}</span>}
    </div>

    {/* ── Grand Total & Net Profit ── */}
    {(()=>{const grandIsRange=rangesAllowed&&Math.abs((p.comp.grandMax||0)-(p.comp.grandMin||0))>=0.5;return<div style={{display:"flex",alignItems:"center",padding:"16px 20px",borderRadius:T.rS,marginTop:8,background:T.inkSoft2,border:`1px solid ${T.faintRule}`,borderTop:`2px solid ${T.ink}`}}>
      <span style={{flex:1,fontSize:12,fontWeight:700,letterSpacing:".10em",color:T.ink,textTransform:"uppercase"}}>Grand Total</span>
      <span className="num" style={{width:96,textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.fadedInk,fontWeight:600}}>{f0(p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost+p.comp.agencyFee.actualCost)}</span>
      <span className="num" style={{width:grandIsRange?220:96,textAlign:"right",fontSize:grandIsRange?15:18,fontFamily:T.mono,color:T.ink,fontWeight:800,marginLeft:8,letterSpacing:"-0.018em"}}>{rangesAllowed?fmtRange(p.comp.grandMin||0,p.comp.grandMax||0,f0):f0(gt)}</span>
      {!rangesAllowed&&<span className="num" style={{width:96,textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.ink,fontWeight:600,marginLeft:8}}>{f0(p.comp.productionSubtotal.variance+p.comp.agencyCostsSubtotal.variance+p.comp.agencyFee.variance)}</span>}
    </div>;})()}
    <div style={{display:"flex",alignItems:"center",padding:"22px 22px",borderRadius:T.rS,marginTop:6,background:T.paper,border:`1px solid ${T.faintRule}`,borderTop:`2px solid ${T.ink}`}}>
      <span style={{flex:1,fontSize:12,fontWeight:700,letterSpacing:".10em",color:T.ink,textTransform:"uppercase"}}>Net Profit{proj.repFeeEnabled&&<em style={{fontStyle:"italic",fontWeight:400,marginLeft:8,letterSpacing:"normal",textTransform:"none",fontSize:11}}>after rep fee</em>}</span>
      <span className="num" style={{fontSize:28,fontFamily:T.mono,color:p.comp.netProfit>=0?T.ink:T.alert,fontWeight:800,letterSpacing:"-0.022em"}}>{f0(p.comp.netProfit)}</span>
    </div>

    {/* ── Bottom tools: Margins + Export ── */}
    <div style={{display:"flex",gap:8,alignItems:"center",marginTop:24,flexWrap:"wrap"}}>
      {canEdit&&<button onClick={()=>setShowMarginSlider(!showMarginSlider)} className="btn-pill" style={{padding:"6px 14px",fontSize:11,...(showMarginSlider?{background:T.ink,color:T.paper}:{})}}>Margins</button>}
      {canEdit&&<button onClick={()=>setShowSheetImport(true)} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}>Import from Sheet</button>}
      {canEdit&&<button onClick={()=>setShowXlsxImport(true)} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}>Import XLSX</button>}
      {canEdit&&proj.sheetImport&&<button onClick={()=>setShowSheetSync(true)} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}>Sync from Sheet</button>}
      <div style={{position:"relative"}}>
        <button onClick={()=>setShowExportMenu(!showExportMenu)} className="btn-pill" style={{padding:"6px 14px",fontSize:11,...(showExportMenu?{background:T.ink,color:T.paper}:{})}}>Export &#9662;</button>
        {showExportMenu&&<div className="fc-panel" style={{position:"absolute",bottom:"100%",left:0,marginBottom:6,zIndex:20,minWidth:200,padding:4,borderRadius:12}}>
          {[["Google Sheets",exportToSheets,"Opens in Google Sheets"],["XLSX",()=>{exportXLS();setShowExportMenu(false)},"Spreadsheet"],["CSV",exportCSV,"Comma-separated"],["PDF",exportPDF,"Print to PDF"],["Client PNG",exportClientPNG,"Section totals only · landscape for decks"]].map(([label,fn,sub],i,arr)=>
            <button key={label} onClick={fn} style={{width:"100%",display:"flex",flexDirection:"column",padding:"10px 14px",background:"transparent",border:"none",borderRadius:8,cursor:"pointer",textAlign:"left",fontFamily:T.sans,gap:2}} onMouseEnter={e=>e.currentTarget.style.background=T.inkSoft} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:13,fontWeight:600,color:T.ink}}>{label}</span>
              <span style={{fontSize:11,color:T.fadedInk}}>{sub}</span>
            </button>)}
        </div>}
      </div>
    </div>

    {showMarginSlider&&canEdit&&<div style={{display:"flex",alignItems:"center",gap:14,padding:"12px 18px",marginTop:10,borderRadius:T.rS,background:T.paper,border:`1px solid ${T.faintRule}`}}>
      <span style={{fontSize:10,fontWeight:700,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em",flexShrink:0}}>Set All Margins</span>
      <input type="range" min="0" max="40" step="1" value={globalMargin} onChange={e=>setGlobalMargin(parseInt(e.target.value))} style={{flex:1,maxWidth:200}}/>
      <span className="num" style={{fontSize:18,fontWeight:800,color:T.ink,fontFamily:T.mono,minWidth:40}}>{globalMargin}%</span>
      <button onClick={()=>{p.setAllMargins(globalMargin/100);setShowMarginSlider(false)}} className="btn-pill" style={{padding:"5px 14px",fontSize:10}}>Apply</button>
    </div>}

    {/* ── Version History ── Every budget save creates a snapshot
         (throttled to one per 30s of editing). Labeled "Save labeled
         version" entries persist alongside autos, with the actor
         attributed on each row. Stored in the budget_snapshots table
         — kept from project creation onward. */}
    {canEdit&&<div style={{marginTop:32}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <button onClick={()=>setShowHistory(!showHistory)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:T.fadedInk,fontSize:11,fontWeight:700,letterSpacing:".10em",textTransform:"uppercase",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.ink} onMouseLeave={e=>e.currentTarget.style.color=T.fadedInk}>
          <span style={{transition:"transform .2s ease",transform:showHistory?"rotate(90deg)":"rotate(0)"}}>&#9656;</span>
          Version history ({history.length}{historyMore?'+':''})
          {history.length>0&&<span style={{fontSize:9,fontWeight:500,color:T.fadedInk,letterSpacing:0,textTransform:"none",marginLeft:6}}>· last save {new Date(history[0].at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}{history[0].user_name?` by ${history[0].user_name}`:''}</span>}
        </button>
        <button onClick={saveSnapshot} className="btn-pill" style={{padding:"6px 14px",fontSize:11}}>Save labeled version</button>
      </div>
      {showHistory&&<div style={{display:"flex",flexDirection:"column",gap:0,borderTop:`1px solid ${T.ink}`,maxHeight:520,overflowY:"auto"}}>
        {historyLoading && history.length===0 && <div style={{padding:24,textAlign:"center",color:T.fadedInk,fontSize:12}}>Loading…</div>}
        {!historyLoading && history.length===0 && <div style={{padding:24,textAlign:"center",color:T.fadedInk,fontSize:12,borderBottom:`1px solid ${T.faintRule}`,lineHeight:1.55}}>
          No saved versions yet. Make an edit — an auto-snapshot will appear here within seconds.
        </div>}
        {/* Active-budget label so the user knows which budget the
            totals + restores below refer to. Updates when they
            switch budget tabs at the top of the page. */}
        {history.length>0&&<div style={{padding:"10px 2px 8px",fontSize:10,color:T.fadedInk,letterSpacing:".06em"}}>
          Showing grand totals for <strong style={{color:T.ink}}>{p.activeBudgetId ? ((p.budgets||[]).find(b=>b.id===p.activeBudgetId)?.name || 'alt budget') : 'Primary Budget'}</strong>. Switch budget tabs above to see other budgets at each save.
        </div>}
        {history.map(h=>{
          const isAuto = h.auto === true;
          const actor = h.user_name || h.user_email || 'Unknown user';
          // Grand total for the currently-viewed budget at this
          // snapshot. budget_totals is keyed by 'primary' or alt id.
          const key = p.activeBudgetId || 'primary';
          const totalAtSnap = h.budget_totals?.[key];
          const hasTotal = totalAtSnap != null && Number.isFinite(Number(totalAtSnap));
          return <div key={h.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:`1px solid ${T.faintRule}`,gap:8}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {isAuto
                  ? <span style={{padding:"2px 7px",borderRadius:10,fontSize:9,fontWeight:700,background:T.inkSoft2,color:T.ink70,textTransform:"uppercase",letterSpacing:".06em"}}>auto</span>
                  : <span style={{padding:"2px 7px",borderRadius:10,fontSize:9,fontWeight:700,background:T.goldSoft,color:T.gold,textTransform:"uppercase",letterSpacing:".06em"}}>labeled</span>
                }
                <div style={{fontSize:isAuto?12:14,fontWeight:isAuto?500:600,color:isAuto?T.ink70:T.ink}}>{h.label || `Saved by ${actor}`}</div>
              </div>
              <div style={{fontSize:11,color:T.fadedInk,marginTop:3,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontFamily:T.mono}}>{new Date(h.at).toLocaleDateString()} · {new Date(h.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                <span>·</span>
                <span>{actor}</span>
                {hasTotal&&<>
                  <span>·</span>
                  <span style={{fontFamily:T.mono,fontWeight:700,color:T.ink}}>{f0(Number(totalAtSnap))} grand total</span>
                </>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
              <button
                onClick={()=>restoreSnapshot(h,'active')}
                className="btn-pill"
                style={{padding:"5px 12px",fontSize:10}}
                title={`Restore the ${p.activeBudgetId ? 'alt' : 'primary'} budget only`}
              >Restore this</button>
              <button
                onClick={()=>restoreSnapshot(h,'full')}
                style={{padding:"5px 12px",borderRadius:999,border:`1px solid ${T.faintRule}`,background:"transparent",color:T.ink70,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans,letterSpacing:".06em",textTransform:"uppercase"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.ink;e.currentTarget.style.color=T.ink}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.faintRule;e.currentTarget.style.color=T.ink70}}
                title="Restore the entire project (primary + all alt budgets)"
              >Restore all</button>
              <button onClick={()=>deleteSnapshot(h.id)} style={{padding:"5px 10px",borderRadius:999,border:`1px solid ${T.faintRule}`,background:"transparent",color:T.fadedInk,fontSize:14,cursor:"pointer",fontFamily:T.sans,lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.color=T.alert;e.currentTarget.style.borderColor=T.alert}} onMouseLeave={e=>{e.currentTarget.style.color=T.fadedInk;e.currentTarget.style.borderColor=T.faintRule}} title="Delete version">×</button>
            </div>
          </div>;
        })}
        {historyMore && history.length>0 && <button onClick={()=>reloadHistory(false)} disabled={historyLoading} style={{margin:"12px auto",padding:"6px 14px",borderRadius:999,background:"transparent",color:T.ink,border:`1px solid ${T.faintRule}`,fontSize:11,fontWeight:600,cursor:historyLoading?"wait":"pointer",fontFamily:T.sans,opacity:historyLoading?.6:1}}>{historyLoading?'Loading…':'Load more'}</button>}
      </div>}
    </div>}
    {showAddSection&&<AddSectionModal onClose={()=>setShowAddSection(false)} onAdd={p.addSection}/>}
    {showSheetImport&&<SheetImportModal onClose={()=>setShowSheetImport(false)} onImport={updates=>p.updateProject(updates)} accessToken={p.accessToken} project={proj}/>}
    {showSheetSync&&<SheetSyncModal onClose={()=>setShowSheetSync(false)} onSync={updates=>p.updateProject(updates)} accessToken={p.accessToken} project={proj}/>}
    {showXlsxImport&&<XlsxImportModal onClose={()=>setShowXlsxImport(false)} onImport={updates=>p.updateProject(updates)}/>}
  </div>;
}

export default BudgetV;
