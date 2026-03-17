import { useState } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { getPayStatus } from '../utils/calc.js';
import { PAYMENT_COLORS, PAYMENT_LABELS } from '../constants/index.js';
import { Chev, PlusI, TrashI } from '../components/icons/index.js';
import { NI, VendorSelect } from '../components/primitives/index.js';

function DetailsInput({value,onChange,canEdit}){
  const[editing,setEditing]=useState(false);
  const[tmp,setTmp]=useState(value);
  if(editing)return<input autoFocus value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={()=>{onChange(tmp);setEditing(false)}} onKeyDown={e=>{if(e.key==="Enter"){onChange(tmp);setEditing(false)}if(e.key==="Escape")setEditing(false)}} style={{width:"100%",padding:"2px 4px",marginTop:2,fontSize:10,fontStyle:"italic",color:T.dim,background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,outline:"none",fontFamily:T.sans}}/>;
  if(value)return<div onClick={()=>canEdit&&setEditing(true)} style={{fontSize:10,color:T.dim,fontStyle:"italic",marginTop:2,cursor:canEdit?"pointer":"default"}}>{value}</div>;
  if(canEdit)return<button onClick={()=>{setTmp("");setEditing(true)}} style={{fontSize:9,color:T.dim,opacity:.3,background:"none",border:"none",cursor:"pointer",padding:"1px 0",fontFamily:T.sans}}>+ details</button>;
  return null;
}

function Cat({cat,comp,open,toggle,onUp,onAdd,onRm,onRemoveCat,isAg,canEdit,docs,vendors,onAddVendor,onVendorClick,isContingency,contBase,onReorder}){
  const{items,totals}=comp;
  const[dragItem,setDragItem]=useState(null);const[overItem,setOverItem]=useState(null);
  const cols=isAg?"2.2fr .7fr .9fr .9fr .55fr .9fr .9fr":"1.8fr .8fr .7fr .7fr .7fr .45fr .7fr .7fr .5fr";
  return<div style={{marginBottom:5}}>
    <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",padding:"11px 18px",background:open?`linear-gradient(135deg,${T.brown},rgba(67,45,28,.8))`:T.surfEl,border:`1px solid ${open?"rgba(255,234,151,.1)":T.border}`,borderRadius:open?`${T.rS} ${T.rS} 0 0`:T.rS,cursor:"pointer",transition:"all .2s"}}
      onMouseEnter={e=>{if(!open){e.currentTarget.style.background="linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,234,151,.02))";e.currentTarget.style.borderColor="rgba(255,234,151,.08)"}}} onMouseLeave={e=>{if(!open){e.currentTarget.style.background=T.surfEl;e.currentTarget.style.borderColor=T.border}}}>
      <span style={{color:T.cream,opacity:.4,marginRight:8,transition:"transform .2s",transform:open?"rotate(0)":"rotate(-90deg)",display:"flex"}}><Chev size={14}/></span>
      <span style={{flex:1,textAlign:"left",fontSize:11.5,fontWeight:600,letterSpacing:".07em",color:T.cream,textTransform:"uppercase"}}>{cat.name}</span>
      {canEdit&&onRemoveCat&&<span onClick={e=>{e.stopPropagation();if(confirm(`Remove "${cat.name}" section?`))onRemoveCat()}} style={{marginRight:8,opacity:.15,cursor:"pointer",display:"flex",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></span>}
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.dim,width:88,textAlign:"right"}}>{f0(totals.actualCost)}</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.gold,width:88,textAlign:"right",marginLeft:8}}>{f0(totals.clientPrice)}</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:totals.variance>0?T.pos:T.dim,width:88,textAlign:"right",marginLeft:8}}>{f0(totals.variance)}</span>
    </button>
    {open&&isContingency?<div className="fade-up" style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:`0 0 ${T.rS} ${T.rS}`,background:T.surface,padding:"18px 22px"}}>
      {items.map((it,idx)=>{
        const pct=contBase>0&&it.actualCost>0?Math.round((it.actualCost/contBase)*100):it.margin*100||0;
        return<div key={it.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:500,color:T.cream}}>Contingency Buffer</span>
            <div style={{display:"flex",alignItems:"baseline",gap:2}}><NI value={Math.round(pct)} fmt="" onChange={v=>{const p=Math.max(0,Math.min(20,v));const cost=contBase*(p/100);onUp(idx,{actualCost:cost,margin:0})}} disabled={!canEdit}/><span style={{fontSize:16,fontWeight:700,color:T.gold}}>%</span></div>
          </div>
          <div style={{marginBottom:10}}>
            <input type="range" min="0" max="20" step="1" value={Math.round(pct)} onChange={e=>{const p=parseInt(e.target.value);const cost=contBase*(p/100);onUp(idx,{actualCost:cost,margin:0})}} disabled={!canEdit} style={{width:"100%"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.dim,marginTop:4}}><span>0%</span><span>5%</span><span>10%</span><span>15%</span><span>20%</span></div>
          </div>
          <div style={{display:"flex",gap:20,alignItems:"center"}}>
            <div><span style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Based on </span><span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.cream}}>{f0(contBase)}</span><span style={{fontSize:10,color:T.dim}}> production subtotal</span></div>
            <div style={{flex:1}}/>
            <div><span style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Amount: </span><span className="num" style={{fontSize:14,fontFamily:T.mono,fontWeight:600,color:T.gold}}>{f0(it.actualCost)}</span></div>
          </div>
        </div>})}
    </div>
    :open&&<div className="fade-up budget-scroll" style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:`0 0 ${T.rS} ${T.rS}`,background:T.surface}}>
      <div style={{display:"grid",gridTemplateColumns:cols,padding:"9px 18px",borderBottom:`1px solid ${T.border}`}}>
        {["Item",...(isAg?["Days","Day Rate"]:["Vendor","Budget","Est. Cost"]),"Actual","Margin","Client","Variance",...(isAg?[]:["Status"])].map((h,i)=><span key={i} style={{fontSize:9.5,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i===0?"left":"right"}}>{h}</span>)}
      </div>
      {items.map((it,idx)=><div key={it.id} draggable={!!onReorder} onDragStart={e=>{setDragItem(idx);e.dataTransfer.effectAllowed="move"}} onDragOver={e=>{e.preventDefault();setOverItem(idx)}} onDrop={e=>{e.preventDefault();if(dragItem!==null&&dragItem!==idx&&onReorder)onReorder(dragItem,idx);setDragItem(null);setOverItem(null)}} onDragEnd={()=>{setDragItem(null);setOverItem(null)}} style={{display:"grid",gridTemplateColumns:cols,alignItems:"center",padding:"7px 18px",borderBottom:idx<items.length-1?`1px solid ${T.border}`:"none",transition:"background .12s",opacity:dragItem===idx?.5:1,borderTop:overItem===idx&&dragItem!==null?`2px solid ${T.gold}`:"none"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:13,color:T.cream}}>{it.name}</span>
            {canEdit&&<button onClick={()=>onRm(idx)} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></button>}</div>
          <DetailsInput value={it.details||""} onChange={v=>onUp(idx,{details:v})} canEdit={canEdit}/>
        </div>
        {!isAg&&<div style={{paddingRight:4}}><VendorSelect value={it.vendorId} onChange={v=>onUp(idx,{vendorId:v})} vendors={vendors} onAddVendor={onAddVendor} disabled={!canEdit} compact/></div>}
        {isAg?<><NI value={it.days||0} fmt="" onChange={v=>onUp(idx,{days:v,actualCost:v*(it.dayRate||0)})} disabled={!canEdit}/><NI value={it.dayRate||0} onChange={v=>onUp(idx,{dayRate:v,actualCost:(it.days||0)*v})} disabled={!canEdit}/></>
          :<><NI value={it.budget} onChange={v=>onUp(idx,{budget:v})} disabled={!canEdit}/><NI value={it.estCost} onChange={v=>onUp(idx,{estCost:v})} disabled={!canEdit}/></>}
        <NI value={it.actualCost} onChange={v=>onUp(idx,{actualCost:v})} disabled={!canEdit}/>
        <NI value={it.margin} fmt="%" onChange={v=>onUp(idx,{margin:v>1?v/100:v})} disabled={!canEdit}/>
        <div className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.gold,fontWeight:500}}>{f$(it.clientPrice)}</div>
        <div className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:it.variance>0?T.pos:T.dim,fontWeight:500}}>{f$(it.variance)}</div>
        {!isAg&&(()=>{const ps=getPayStatus(it.id,docs);return<div style={{textAlign:"right"}}><span style={{fontSize:8,fontWeight:700,padding:"3px 7px",borderRadius:8,background:`${PAYMENT_COLORS[ps]}18`,color:PAYMENT_COLORS[ps],textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{PAYMENT_LABELS[ps]}</span></div>})()}
      </div>)}
      {canEdit&&<button onClick={onAdd} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"9px 18px",background:"none",border:"none",borderTop:`1px solid ${T.border}`,color:T.dim,fontSize:11.5,cursor:"pointer",fontFamily:T.sans}}
        onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}><PlusI size={12}/> Add line item</button>}
    </div>}
  </div>;
}

/* ══ SumBar ══ */
function SB({label,actual,client,variance,v="d"}){
  const isP=v==="p",isG=v==="g";
  return<div className={isP?"breathe":""} style={{display:"flex",alignItems:"center",padding:isP?"20px 24px":"13px 18px",borderRadius:T.rS,marginTop:isG||isP?8:0,
    background:isP?T.brown:isG?`linear-gradient(135deg,${T.brown},rgba(67,45,28,.7))`:T.surfEl,
    border:isP?"1px solid rgba(255,234,151,.12)":isG?"none":`1px solid ${T.border}`,
    boxShadow:isP?"0 0 60px rgba(255,234,151,.05)":"none"}}>
    <span style={{flex:1,fontSize:isP?12:11,fontWeight:700,letterSpacing:".1em",color:isP?T.gold:T.cream,textTransform:"uppercase",fontFamily:isP?T.sans:T.sans}}>{label}</span>
    {actual!==undefined&&<span className="num" style={{width:96,textAlign:"right",fontSize:13,fontFamily:T.mono,color:isP?T.gold:T.cream,fontWeight:500}}>{f0(actual)}</span>}
    {client!==undefined&&<span className="num" style={{width:96,textAlign:"right",fontSize:isP?20:13,fontFamily:T.mono,color:T.gold,fontWeight:isP?700:600,marginLeft:8}}>{f0(client)}</span>}
    {variance!==undefined&&!isP&&<span className="num" style={{width:96,textAlign:"right",fontSize:13,fontFamily:T.mono,color:T.pos,fontWeight:500,marginLeft:8}}>{f0(variance)}</span>}
  </div>;
}

export default Cat;
