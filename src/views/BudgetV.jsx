import { useState, useRef } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { ct } from '../utils/calc.js';
import { uid } from '../utils/uid.js';
import { PlusI } from '../components/icons/index.js';
import { Card, NI, Metric, SB } from '../components/primitives/index.js';
import AddSectionModal from '../components/modals/AddSectionModal.jsx';
import Cat from './Cat.jsx';

const Pill=({children,color=T.gold,size="sm"})=><span style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:`${color}18`,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</span>;

/* Category accent colors — cycle per section */
const CAT_ACCENTS=["#6366F1","#14B8A6","#F59E0B","#EC4899","#06B6D4","#8B5CF6","#10B981","#F47264"];

function BudgetV(p){
  const canEdit=p.user.role!=="viewer";
  const[globalMargin,setGlobalMargin]=useState(15);
  const[showHistory,setShowHistory]=useState(false);
  const history=p.project?.budgetHistory||[];
  const saveSnapshot=()=>{
    const label=prompt("Name this version (e.g. 'v1 - Initial estimate'):");
    if(!label)return;
    const snapshot={cats:JSON.parse(JSON.stringify(p.cats)),ag:JSON.parse(JSON.stringify(p.ag)),feeP:p.feeP};
    const entry={id:uid(),date:new Date().toISOString(),label,snapshot};
    p.onSaveHistory([...history,entry]);
  };
  const restoreSnapshot=(entry)=>{
    if(!confirm(`Restore "${entry.label}"? Current budget will be replaced.`))return;
    p.onRestoreHistory(entry.snapshot);
  };
  const deleteSnapshot=(id)=>{
    if(!confirm("Delete this version?"))return;
    p.onSaveHistory(history.filter(h=>h.id!==id));
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
  const exportPDF=()=>{window.print();setShowExportMenu(false)};
  const[dragSection,setDragSection]=useState(null);
  const[overSection,setOverSection]=useState(null);
  const[showAddSection,setShowAddSection]=useState(false);
  const[editingBudget,setEditingBudget]=useState(false);
  const[budgetDraft,setBudgetDraft]=useState("");
  const[confirmBudget,setConfirmBudget]=useState(false);
  const[showMarginSlider,setShowMarginSlider]=useState(false);
  const[showExportMenu,setShowExportMenu]=useState(false);
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

  return<div>
    {/* ── Header ── */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}>
      <div>
        <h1 style={{fontSize:22,fontWeight:700,color:T.cream,letterSpacing:"-0.02em"}}>Production Budget</h1>
        <p style={{fontSize:12,color:T.dim,marginTop:6}}>{canEdit?"Internal view with live margins":"View-only"}</p>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {p.saving&&<Pill color={T.gold} size="xs">Saving...</Pill>}
        {!p.saving&&p.lastSaved&&<Pill color={T.pos} size="xs">Saved</Pill>}
      </div>
    </div>

    {/* ── Top metrics with budget health ── */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
      <div style={{padding:"18px 20px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:"3px solid "+T.cream,cursor:canEdit&&!editingBudget?"pointer":"default"}} onClick={!editingBudget?startEditBudget:undefined}>
        <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Client Budget</div>
        {editingBudget?<div>
          <input ref={budgetRef} autoFocus value={budgetDraft} onChange={e=>setBudgetDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")proposeBudget();if(e.key==="Escape")cancelBudget()}} style={{width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${confirmBudget?T.gold:T.cyan}`,outline:"none",color:T.cream,fontSize:26,fontWeight:700,fontFamily:T.mono,padding:"2px 0",lineHeight:1}}/>
          {confirmBudget?<div style={{marginTop:10}}>
            <div style={{fontSize:11,color:T.gold,marginBottom:8}}>Update to {f0(parseFloat(budgetDraft.replace(/[^0-9.\-]/g,""))||0)}?</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={confirmBudgetChange} style={{padding:"5px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Confirm</button>
              <button onClick={cancelBudget} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
            </div>
          </div>:<div style={{marginTop:6,fontSize:10,color:T.dim}}>Enter to update</div>}
        </div>:<div>
          <div className="num" style={{fontSize:28,fontWeight:700,color:T.cream,fontFamily:T.mono,lineHeight:1}}>{cb>0?f0(cb):"\u2014"}</div>
          {canEdit&&<div style={{fontSize:10,color:T.dim,marginTop:6}}>Click to edit</div>}
        </div>}
      </div>
      <div style={{padding:"18px 20px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,borderLeft:"3px solid "+T.gold}}>
        <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Grand Total</div>
        <div className="num" style={{fontSize:28,fontWeight:700,color:T.gold,fontFamily:T.mono,lineHeight:1}}>{f0(gt)}</div>
        {cb>0&&<div style={{marginTop:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:T.dim}}>{spendPct}% of budget</span><span style={{fontSize:9,color:T.dim,fontFamily:T.mono}}>{f0(cb-totalSpend)} remaining</span></div>
          <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${spendPct}%`,background:spendPct>90?`linear-gradient(90deg,${T.neg},#FF6B6B)`:`linear-gradient(90deg,${T.gold},${T.cyan})`,borderRadius:2,transition:"width .4s ease"}}/></div>
        </div>}
      </div>
      <div style={{padding:"18px 20px",borderRadius:T.rS,background:overBudget?"rgba(248,113,113,.04)":T.surfEl,border:`1px solid ${overBudget?"rgba(248,113,113,.15)":T.border}`,borderLeft:`3px solid ${overBudget?T.neg:T.pos}`}}>
        <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Balance</div>
        <div className="num" style={{fontSize:28,fontWeight:700,color:overBudget?T.neg:T.pos,fontFamily:T.mono,lineHeight:1}}>{f0(Math.abs(balance))}</div>
        <div style={{fontSize:10,color:overBudget?T.neg:T.pos,marginTop:6}}>{overBudget?"Over budget":"Under budget"}</div>
      </div>
    </div>

    {/* ── Column headers + Add Section ── */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingRight:18}}>
      {canEdit&&<button onClick={()=>setShowAddSection(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}><PlusI size={11} color={T.gold}/> Add Section</button>}
      {!canEdit&&<div/>}
      <div style={{display:"flex",gap:20}}>
        {[["Actual",T.dim],["Client",T.gold],["Variance",T.pos]].map(([l,c])=><span key={l} style={{fontSize:10,fontWeight:600,color:c,letterSpacing:".08em",textTransform:"uppercase",opacity:.6}}>{l}</span>)}
      </div>
    </div>

    {/* ── Categories (draggable sections) ── */}
    {(()=>{const contBase=p.cats.filter(c=>c.name.toLowerCase()!=="contingency").reduce((a,c)=>a+ct(c.items).totals.actualCost,0);return p.cats.map((c,ci2)=>{const isCont=c.name.toLowerCase()==="contingency";const accent=CAT_ACCENTS[ci2%CAT_ACCENTS.length];return<div key={c.id} draggable={canEdit} onDragStart={e=>{setDragSection(ci2);e.dataTransfer.effectAllowed="move"}} onDragOver={e=>{e.preventDefault();setOverSection(ci2)}} onDrop={e=>{e.preventDefault();if(dragSection!==null&&dragSection!==ci2&&p.reorderSection)p.reorderSection(dragSection,ci2);setDragSection(null);setOverSection(null)}} onDragEnd={()=>{setDragSection(null);setOverSection(null)}} style={{opacity:dragSection===ci2?.4:1,borderTop:overSection===ci2&&dragSection!==null?`2px solid ${accent}`:"2px solid transparent",transition:"opacity .15s"}}><Cat cat={c} comp={ct(c.items)} open={p.exp.has(c.id)} toggle={()=>p.tog(c.id)} onUp={(ii,u)=>p.uCat(ci2,ii,u)} onAdd={()=>p.aCat(ci2)} onRm={ii=>p.rCat(ci2,ii)} onRemoveCat={()=>p.rmCat(ci2)} canEdit={canEdit} docs={p.docs} vendors={p.vendors} onAddVendor={p.onAddVendor} onVendorClick={p.onVendorClick} isContingency={isCont} contBase={contBase} onReorder={(from,to)=>p.reorderCat(ci2,from,to)} accent={accent}/></div>})})()}

    {/* ── Subtotals ── */}
    <div style={{marginTop:6}}><SB label="Production Subtotal" actual={p.comp.productionSubtotal.actualCost} client={p.comp.productionSubtotal.clientPrice} variance={p.comp.productionSubtotal.variance}/></div>

    <div style={{marginTop:20}}><Cat cat={{name:"Agency Production Costs"}} comp={ct(p.ag)} open={p.exp.has("agency")} toggle={()=>p.tog("agency")} onUp={p.uAg} onAdd={p.aAg} onRm={p.rAg} isAg canEdit={canEdit} accent={T.cyan}/></div>
    <SB label="Agency Costs Subtotal" actual={p.comp.agencyCostsSubtotal.actualCost} client={p.comp.agencyCostsSubtotal.clientPrice} variance={p.comp.agencyCostsSubtotal.variance}/>
    <SB label="Total Production & Agency Cost" actual={p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost} client={p.comp.productionSubtotal.clientPrice+p.comp.agencyCostsSubtotal.clientPrice} variance={p.comp.productionSubtotal.variance+p.comp.agencyCostsSubtotal.variance}/>

    {/* ── Agency Fee ── */}
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",marginTop:5,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:T.cream,textTransform:"uppercase",flexShrink:0}}>Agency Fee</span>
      {canEdit?<>
        <input type="range" min="0" max="25" step="0.5" value={Math.round(p.feeP*100)} onChange={e=>p.setFeeP(parseInt(e.target.value)/100)} style={{flex:1,maxWidth:160}}/>
        <div style={{display:"flex",alignItems:"center",gap:2}}>
          <input value={Math.round(p.feeP*100)} onChange={e=>{const v=parseFloat(e.target.value)||0;p.setFeeP(Math.max(0,Math.min(100,v))/100)}} style={{width:36,padding:"4px 4px",borderRadius:4,background:T.surface,border:`1px solid ${T.border}`,color:T.gold,fontSize:14,fontFamily:T.mono,fontWeight:700,textAlign:"center",outline:"none"}}/>
          <span style={{fontSize:14,fontWeight:700,color:T.gold}}>%</span>
        </div>
      </>:<div style={{marginLeft:12}}><NI value={p.feeP} fmt="%" onChange={()=>{}} disabled/></div>}
      <div style={{flex:1}}/>
      <span className="num" style={{fontSize:13,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{f0(p.comp.agencyFee.clientPrice)}</span>
    </div>

    {/* ── Grand Total & Net Profit ── */}
    <div style={{display:"flex",alignItems:"center",padding:"16px 20px",borderRadius:T.rS,marginTop:8,background:`linear-gradient(135deg,rgba(99,102,241,.08),rgba(20,184,166,.06))`,border:`1px solid rgba(99,102,241,.15)`}}>
      <span style={{flex:1,fontSize:12,fontWeight:700,letterSpacing:".1em",color:T.cream,textTransform:"uppercase"}}>Grand Total</span>
      <span className="num" style={{width:96,textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.cream,fontWeight:500}}>{f0(p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost+p.comp.agencyFee.actualCost)}</span>
      <span className="num" style={{width:96,textAlign:"right",fontSize:16,fontFamily:T.mono,color:T.gold,fontWeight:700,marginLeft:8}}>{f0(gt)}</span>
      <span className="num" style={{width:96,textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.pos,fontWeight:500,marginLeft:8}}>{f0(p.comp.productionSubtotal.variance+p.comp.agencyCostsSubtotal.variance+p.comp.agencyFee.variance)}</span>
    </div>
    <div style={{display:"flex",alignItems:"center",padding:"20px 22px",borderRadius:T.rS,marginTop:6,background:`linear-gradient(135deg,rgba(74,222,128,.06),rgba(20,184,166,.04))`,border:`1px solid rgba(74,222,128,.12)`}}>
      <span style={{flex:1,fontSize:12,fontWeight:700,letterSpacing:".1em",color:T.pos,textTransform:"uppercase"}}>Net Profit</span>
      <span className="num" style={{fontSize:24,fontFamily:T.mono,color:T.pos,fontWeight:700}}>{f0(p.comp.netProfit)}</span>
    </div>

    {/* ── Bottom tools: Margins + Export ── */}
    <div style={{display:"flex",gap:10,alignItems:"center",marginTop:24,flexWrap:"wrap"}}>
      {canEdit&&<button onClick={()=>setShowMarginSlider(!showMarginSlider)} style={{padding:"8px 14px",background:"transparent",color:showMarginSlider?T.gold:T.dim,border:`1px solid ${showMarginSlider?T.borderGlow:T.border}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Margins</button>}
      <div style={{position:"relative"}}>
        <button onClick={()=>setShowExportMenu(!showExportMenu)} style={{padding:"8px 14px",background:"transparent",color:showExportMenu?T.cream:T.dim,border:`1px solid ${showExportMenu?T.borderGlow:T.border}`,borderRadius:T.rS,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Export &#9662;</button>
        {showExportMenu&&<div style={{position:"absolute",bottom:"100%",left:0,marginBottom:4,background:"rgba(12,10,20,.97)",border:`1px solid ${T.border}`,borderRadius:T.rS,boxShadow:"0 8px 24px rgba(0,0,0,.4)",overflow:"hidden",zIndex:20,minWidth:140}}>
          {[["XLSX",()=>{exportXLS();setShowExportMenu(false)},"Spreadsheet"],["CSV",exportCSV,"Comma-separated"],["PDF",exportPDF,"Print to PDF"]].map(([label,fn,sub])=>
            <button key={label} onClick={fn} style={{width:"100%",display:"flex",flexDirection:"column",padding:"10px 14px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,cursor:"pointer",textAlign:"left",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:12,fontWeight:600,color:T.cream}}>{label}</span>
              <span style={{fontSize:10,color:T.dim,marginTop:1}}>{sub}</span>
            </button>)}
        </div>}
      </div>
    </div>

    {showMarginSlider&&canEdit&&<div style={{display:"flex",alignItems:"center",gap:14,padding:"12px 18px",marginTop:10,borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
      <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",flexShrink:0}}>Set All Margins</span>
      <input type="range" min="0" max="40" step="1" value={globalMargin} onChange={e=>setGlobalMargin(parseInt(e.target.value))} style={{flex:1,maxWidth:200}}/>
      <span className="num" style={{fontSize:18,fontWeight:700,color:T.gold,fontFamily:T.mono,minWidth:40}}>{globalMargin}%</span>
      <button onClick={()=>{p.setAllMargins(globalMargin/100);setShowMarginSlider(false)}} style={{padding:"6px 14px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Apply</button>
    </div>}

    {/* ── Version History ── */}
    {canEdit&&<div style={{marginTop:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <button onClick={()=>setShowHistory(!showHistory)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:12,fontFamily:T.sans}}>
          <span style={{transition:"transform .2s",transform:showHistory?"rotate(90deg)":"rotate(0)"}}>&#9656;</span>
          Version History ({history.length})
        </button>
        <button onClick={saveSnapshot} style={{padding:"7px 16px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>Save Current Version</button>
      </div>
      {showHistory&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
        {history.length===0&&<div style={{padding:20,textAlign:"center",color:T.dim,fontSize:12,border:`1px dashed ${T.border}`,borderRadius:T.rS}}>No saved versions yet.</div>}
        {history.slice().reverse().map(h=><div key={h.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:T.cream}}>{h.label}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:2}}>{new Date(h.date).toLocaleDateString()} at {new Date(h.date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>restoreSnapshot(h)} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Restore</button>
            <button onClick={()=>deleteSnapshot(h.id)} style={{padding:"5px 8px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.neg} onMouseLeave={e=>e.currentTarget.style.color=T.dim} title="Delete version">×</button>
          </div>
        </div>)}
      </div>}
    </div>}
    {showAddSection&&<AddSectionModal onClose={()=>setShowAddSection(false)} onAdd={p.addSection}/>}
  </div>;
}

export default BudgetV;
