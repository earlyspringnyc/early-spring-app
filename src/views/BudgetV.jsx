import { useState, useRef } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { ct } from '../utils/calc.js';
import { uid } from '../utils/uid.js';
import { PlusI } from '../components/icons/index.js';
import { Card, NI, Metric, SB } from '../components/primitives/index.js';
import AddSectionModal from '../components/modals/AddSectionModal.jsx';
import Cat from './Cat.jsx';

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
  const[showAddSection,setShowAddSection]=useState(false);
  const[editingBudget,setEditingBudget]=useState(false);
  const[budgetDraft,setBudgetDraft]=useState("");
  const[confirmBudget,setConfirmBudget]=useState(false);
  const budgetRef=useRef(null);
  const startEditBudget=()=>{if(!canEdit)return;setBudgetDraft(String(p.clientBudget||""));setEditingBudget(true);setConfirmBudget(false);setTimeout(()=>budgetRef.current?.select(),50)};
  const proposeBudget=()=>{const v=parseFloat(budgetDraft.replace(/[^0-9.\-]/g,""))||0;if(v===(p.clientBudget||0)){setEditingBudget(false);return}setConfirmBudget(true)};
  const confirmBudgetChange=()=>{const v=parseFloat(budgetDraft.replace(/[^0-9.\-]/g,""))||0;p.onUpdateBudget(v);setEditingBudget(false);setConfirmBudget(false)};
  const cancelBudget=()=>{setEditingBudget(false);setConfirmBudget(false)};
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>Production Budget</h1><p style={{fontSize:13,color:T.dim,marginTop:6,fontFamily:T.serif,fontStyle:"italic"}}>{canEdit?"Internal view with live margin calculations":"View-only mode"}</p></div>
      <div style={{display:"flex",gap:8}}>
        {p.saving&&<span style={{fontSize:10,color:T.gold,fontFamily:T.mono,alignSelf:"center"}}>Saving...</span>}
        {!p.saving&&p.lastSaved&&<span style={{fontSize:10,color:T.pos,fontFamily:T.mono,alignSelf:"center"}}>Saved</span>}
        {canEdit&&<button onClick={()=>setShowAddSection(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:"transparent",color:T.dim,border:`1px solid ${T.border}`,borderRadius:T.rS,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.color=T.cream}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.dim}}><PlusI size={12}/> Add Section</button>}
      </div>
    </div>
    {(()=>{const cb=p.clientBudget||0;const gt=p.comp.grandTotal;const balance=cb-gt;const overBudget=balance<0;return<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:24}}>
      <Card style={{padding:"20px 22px",cursor:canEdit&&!editingBudget?"pointer":"default"}} onClick={!editingBudget?startEditBudget:undefined}>
        <div style={{fontSize:10,fontWeight:600,color:T.dim,letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>Client Budget</div>
        {editingBudget?<div>
          <input ref={budgetRef} autoFocus value={budgetDraft} onChange={e=>setBudgetDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")proposeBudget();if(e.key==="Escape")cancelBudget()}} style={{width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${confirmBudget?T.gold:T.cyan}`,outline:"none",color:T.cream,fontSize:26,fontWeight:700,fontFamily:T.mono,padding:"2px 0",lineHeight:1}}/>
          {confirmBudget?<div style={{marginTop:10}}>
            <div style={{fontSize:11,color:T.gold,marginBottom:8}}>Update client budget from {cb>0?f0(cb):"$0"} to {f0(parseFloat(budgetDraft.replace(/[^0-9.\-]/g,""))||0)}?</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={confirmBudgetChange} style={{padding:"5px 14px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Confirm</button>
              <button onClick={cancelBudget} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
            </div>
          </div>:<div style={{marginTop:8,fontSize:10,color:T.dim}}>Press Enter to update</div>}
        </div>:<div>
          <div className="num" style={{fontSize:26,fontWeight:700,color:T.cream,fontFamily:T.mono,lineHeight:1}}>{cb>0?f0(cb):"\u2014"}</div>
          <div style={{fontSize:11,color:T.dim,marginTop:8}}>{canEdit?"Click to edit":"Set at project creation"}</div>
        </div>}
      </Card>
      <Metric label="Grand Total" value={f0(gt)} color={T.gold} glow/>
      <Metric label="Balance" value={f0(Math.abs(balance))} color={overBudget?T.neg:T.pos} sub={overBudget?"Over budget":"Under budget"} glow={overBudget}/>
    </div>})()}
    {canEdit&&<Card style={{padding:"14px 20px",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",flexShrink:0}}>Set All Margins</span>
        <input type="range" min="0" max="40" step="1" value={globalMargin} onChange={e=>setGlobalMargin(parseInt(e.target.value))} style={{flex:1,maxWidth:200}}/>
        <span className="num" style={{fontSize:16,fontWeight:700,color:T.gold,fontFamily:T.mono,minWidth:40}}>{globalMargin}%</span>
        <button onClick={()=>p.setAllMargins(globalMargin/100)} style={{padding:"6px 14px",borderRadius:T.rS,border:"none",background:`linear-gradient(135deg,${T.gold},#E8D080)`,color:T.brown,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Apply to All</button>
        <span style={{fontSize:10,color:T.dim,fontFamily:T.serif,fontStyle:"italic"}}>Individual margins adjustable per line item</span>
      </div>
    </Card>}
    <div style={{display:"flex",justifyContent:"flex-end",gap:20,marginBottom:10,paddingRight:18}}>
      {[["Actual",T.dim],["Client",T.gold],["Variance",T.pos]].map(([l,c])=><span key={l} style={{fontSize:9.5,fontWeight:600,color:c,letterSpacing:".08em",textTransform:"uppercase",opacity:.6}}>{l}</span>)}
    </div>
    {(()=>{const contBase=p.cats.filter(c=>c.name.toLowerCase()!=="contingency").reduce((a,c)=>a+ct(c.items).totals.actualCost,0);return p.cats.map((c,ci2)=>{const isCont=c.name.toLowerCase()==="contingency";return<Cat key={c.id} cat={c} comp={ct(c.items)} open={p.exp.has(c.id)} toggle={()=>p.tog(c.id)} onUp={(ii,u)=>p.uCat(ci2,ii,u)} onAdd={()=>p.aCat(ci2)} onRm={ii=>p.rCat(ci2,ii)} onRemoveCat={()=>p.rmCat(ci2)} canEdit={canEdit} docs={p.docs} vendors={p.vendors} onAddVendor={p.onAddVendor} onVendorClick={p.onVendorClick} isContingency={isCont} contBase={contBase} onReorder={(from,to)=>p.reorderCat(ci2,from,to)}/>})})()}
    <div style={{marginTop:4}}><SB label="Production Subtotal" actual={p.comp.productionSubtotal.actualCost} client={p.comp.productionSubtotal.clientPrice} variance={p.comp.productionSubtotal.variance}/></div>
    <div style={{marginTop:20}}><Cat cat={{name:"Agency Production Costs"}} comp={ct(p.ag)} open={p.exp.has("agency")} toggle={()=>p.tog("agency")} onUp={p.uAg} onAdd={p.aAg} onRm={p.rAg} isAg canEdit={canEdit}/></div>
    <SB label="Agency Costs Subtotal" actual={p.comp.agencyCostsSubtotal.actualCost} client={p.comp.agencyCostsSubtotal.clientPrice} variance={p.comp.agencyCostsSubtotal.variance}/>
    <SB label="Total Production & Agency Cost" actual={p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost} client={p.comp.productionSubtotal.clientPrice+p.comp.agencyCostsSubtotal.clientPrice} variance={p.comp.productionSubtotal.variance+p.comp.agencyCostsSubtotal.variance}/>
    <div style={{display:"flex",alignItems:"center",padding:"13px 18px",marginTop:5,borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:T.cream,textTransform:"uppercase"}}>Agency Fee</span>
      <div style={{marginLeft:12,width:56}}><NI value={p.feeP} fmt="%" onChange={v=>p.setFeeP(v>1?v/100:v)} disabled={!canEdit}/></div>
      <div style={{flex:1}}/>
      <span className="num" style={{fontSize:13,fontFamily:T.mono,color:T.gold,fontWeight:600}}>{f0(p.comp.agencyFee.clientPrice)}</span>
    </div>
    <SB label="Grand Total" v="g" actual={p.comp.productionSubtotal.actualCost+p.comp.agencyCostsSubtotal.actualCost+p.comp.agencyFee.actualCost} client={p.comp.grandTotal} variance={p.comp.productionSubtotal.variance+p.comp.agencyCostsSubtotal.variance+p.comp.agencyFee.variance}/>
    <SB label="Net Profit" v="p" client={p.comp.netProfit}/>
    {canEdit&&<div style={{marginTop:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <button onClick={()=>setShowHistory(!showHistory)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:12,fontFamily:T.sans}}>
          <span style={{transition:"transform .2s",transform:showHistory?"rotate(90deg)":"rotate(0)"}}>▸</span>
          Version History ({history.length})
        </button>
        <button onClick={saveSnapshot} style={{padding:"7px 16px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cream,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.background=T.surfHov}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent"}}>Save Current Version</button>
      </div>
      {showHistory&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
        {history.length===0&&<div style={{padding:20,textAlign:"center",color:T.dim,fontSize:12,border:`1px dashed ${T.border}`,borderRadius:T.rS}}>No saved versions yet. Click "Save Current Version" to create a snapshot.</div>}
        {history.slice().reverse().map(h=><Card key={h.id} style={{padding:"12px 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:T.cream}}>{h.label}</div>
              <div style={{fontSize:10,color:T.dim,marginTop:2}}>{new Date(h.date).toLocaleDateString()} at {new Date(h.date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>restoreSnapshot(h)} style={{padding:"5px 12px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Restore</button>
              <button onClick={()=>deleteSnapshot(h.id)} style={{padding:"5px 8px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,cursor:"pointer",fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.color=T.neg} onMouseLeave={e=>e.currentTarget.style.color=T.dim} title="Delete version">×</button>
            </div>
          </div>
        </Card>)}
      </div>}
    </div>}
    {showAddSection&&<AddSectionModal onClose={()=>setShowAddSection(false)} onAdd={p.addSection}/>}
  </div>;
}

export default BudgetV;
