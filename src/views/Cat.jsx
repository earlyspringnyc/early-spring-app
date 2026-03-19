import { useState, useRef, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { getPayStatus } from '../utils/calc.js';
import { PAYMENT_COLORS, PAYMENT_LABELS } from '../constants/index.js';
import { Chev, PlusI, TrashI } from '../components/icons/index.js';
import { NI, VendorSelect } from '../components/primitives/index.js';

function EditableName({value,onChange}){
  const[ed,setEd]=useState(false);
  const[tmp,setTmp]=useState(value);
  const ref=useRef(null);
  useEffect(()=>{if(ed&&ref.current)ref.current.select()},[ed]);
  const start=()=>{setEd(true);setTmp(value)};
  const commit=()=>{setEd(false);if(tmp.trim()&&tmp!==value)onChange(tmp.trim())};
  if(ed)return<input ref={ref} autoFocus value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Tab")commit();if(e.key==="Escape")setEd(false)}} style={{background:"transparent",border:"none",borderBottom:`1.5px solid ${T.cyan}`,outline:"none",color:T.cream,fontSize:13,fontFamily:T.sans,padding:"2px 0",width:"100%",minWidth:80}}/>;
  return<span tabIndex={0} onClick={start} onFocus={start} style={{fontSize:13,color:T.cream,cursor:"pointer",borderRadius:4,padding:"2px 4px",outline:"none"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{value}</span>;
}

function DetailsInput({value,onChange,canEdit}){
  const[editing,setEditing]=useState(false);
  const[expanded,setExpanded]=useState(false);
  const[tmp,setTmp]=useState(value);
  const startEdit=()=>{if(!canEdit)return;setTmp(value||"");setEditing(true)};
  if(editing)return<input autoFocus value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={()=>{onChange(tmp);setEditing(false)}} onKeyDown={e=>{if(e.key==="Enter"){onChange(tmp);setEditing(false)}if(e.key==="Tab"){onChange(tmp);setEditing(false)}if(e.key==="Escape")setEditing(false)}} style={{width:"100%",padding:"5px 8px",fontSize:11,color:T.cream,background:T.surface,border:`1px solid ${T.cyan}`,borderRadius:T.rS,outline:"none",fontFamily:T.sans}}/>;
  if(value)return<div tabIndex={canEdit?0:-1} title={value} onClick={()=>{if(canEdit&&expanded)startEdit();else setExpanded(!expanded)}} onFocus={startEdit} style={{fontSize:11,color:T.dim,fontStyle:"italic",padding:"4px 0",cursor:"pointer",overflow:expanded?"visible":"hidden",textOverflow:expanded?"unset":"ellipsis",whiteSpace:expanded?"normal":"nowrap",lineHeight:expanded?1.5:undefined,background:expanded?T.surface:"transparent",borderRadius:expanded?T.rS:0,padding:expanded?"6px 8px":"4px 0",margin:expanded?"-2px -8px":"0",transition:"all .15s",outline:"none"}}>{value}</div>;
  if(canEdit)return<button tabIndex={0} onClick={startEdit} onFocus={startEdit} style={{fontSize:10,color:T.dim,opacity:.4,background:"none",border:"none",cursor:"pointer",padding:"4px 0",fontFamily:T.sans,fontStyle:"italic"}}>Add description...</button>;
  return<div style={{padding:"4px 0",fontSize:10,color:T.dim,opacity:.2}}>{"\u2014"}</div>;
}

function Cat({cat,comp,open,toggle,onUp,onAdd,onRm,onRemoveCat,isAg,canEdit,docs,vendors,onAddVendor,onVendorClick,isContingency,contBase,onReorder,accent,onSetCatMargin}){
  const{items,totals}=comp;
  const[dragItem,setDragItem]=useState(null);const[overItem,setOverItem]=useState(null);
  const[catMargin,setCatMargin]=useState(()=>{if(!items.length)return 15;return Math.round((items[0].margin||0)*100)});
  const applyCatMargin=()=>{if(onSetCatMargin)onSetCatMargin(catMargin/100)};
  const cols=isAg?"2.2fr .7fr .9fr .9fr .55fr .9fr .9fr":"1.6fr 1.2fr .8fr .7fr .45fr .7fr .7fr .5fr";
  const ac=accent||T.gold;
  return<div style={{marginBottom:5}}>
    <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",padding:"12px 18px",background:open?`${ac}0A`:T.surfEl,border:`1px solid ${open?`${ac}25`:T.border}`,borderLeft:`3px solid ${open?ac:"transparent"}`,borderRadius:open?`${T.rS} ${T.rS} 0 0`:T.rS,cursor:"pointer",transition:"all .2s"}}
      onMouseEnter={e=>{if(!open){e.currentTarget.style.background=T.surfHov;e.currentTarget.style.borderLeftColor=`${ac}60`}}} onMouseLeave={e=>{if(!open){e.currentTarget.style.background=T.surfEl;e.currentTarget.style.borderLeftColor="transparent"}}}>
      <span style={{color:ac,opacity:.6,marginRight:8,transition:"transform .2s",transform:open?"rotate(0)":"rotate(-90deg)",display:"flex"}}><Chev size={14}/></span>
      <span style={{flex:1,textAlign:"left",fontSize:11.5,fontWeight:600,letterSpacing:".07em",color:T.cream,textTransform:"uppercase"}}>{cat.name}</span>
      {canEdit&&onRemoveCat&&<span title="Remove section" onClick={e=>{e.stopPropagation();if(confirm(`Remove "${cat.name}" section?`))onRemoveCat()}} style={{marginRight:8,opacity:.15,cursor:"pointer",display:"flex",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></span>}
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.dim,width:88,textAlign:"right"}}>{f0(totals.actualCost)}</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.gold,width:88,textAlign:"right",marginLeft:8}}>{f0(totals.clientPrice)}</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:totals.variance>0?T.pos:T.dim,width:88,textAlign:"right",marginLeft:8}}>{f0(totals.variance)}</span>
    </button>
    {open&&isContingency?<div className="fade-up" style={{border:`1px solid ${T.border}`,borderTop:"none",borderLeft:`3px solid ${ac}`,borderRadius:`0 0 ${T.rS} ${T.rS}`,background:T.surface,padding:"18px 22px"}}>
      {items.map((it,idx)=>{
        const pct=contBase>0&&it.actualCost>0?Math.round((it.actualCost/contBase)*100):it.margin*100||0;
        return<div key={it.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:500,color:T.cream}}>Contingency Buffer</span>
            <div style={{display:"flex",alignItems:"baseline",gap:2}}><NI value={Math.round(pct)} fmt="" onChange={v=>{const p=Math.max(0,Math.min(20,v));const cost=contBase*(p/100);onUp(idx,{actualCost:cost,margin:0})}} disabled={!canEdit}/><span style={{fontSize:16,fontWeight:700,color:ac}}>%</span></div>
          </div>
          <div style={{marginBottom:10}}>
            <input type="range" min="0" max="20" step="1" value={Math.round(pct)} onChange={e=>{const p=parseInt(e.target.value);const cost=contBase*(p/100);onUp(idx,{actualCost:cost,margin:0})}} disabled={!canEdit} style={{width:"100%"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.dim,marginTop:4}}><span>0%</span><span>5%</span><span>10%</span><span>15%</span><span>20%</span></div>
          </div>
          <div style={{display:"flex",gap:20,alignItems:"center"}}>
            <div><span style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Based on </span><span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.cream}}>{f0(contBase)}</span><span style={{fontSize:10,color:T.dim}}> production subtotal</span></div>
            <div style={{flex:1}}/>
            <div><span style={{fontSize:10,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Amount: </span><span className="num" style={{fontSize:14,fontFamily:T.mono,fontWeight:600,color:ac}}>{f0(it.actualCost)}</span></div>
          </div>
        </div>})}
    </div>
    :open&&<div className="fade-up budget-scroll" style={{border:`1px solid ${T.border}`,borderTop:"none",borderLeft:`3px solid ${ac}`,borderRadius:`0 0 ${T.rS} ${T.rS}`,background:T.surface}}>
      {/* Category margin control */}
      {canEdit&&!isAg&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 18px",borderBottom:`1px solid ${T.border}`,background:`${ac}06`}}>
        <span style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em"}}>Category Margin</span>
        <input type="range" min="0" max="40" step="any" value={catMargin} onChange={e=>setCatMargin(parseFloat(e.target.value))} style={{flex:1,maxWidth:140}}/>
        <input value={Math.round(catMargin)} onChange={e=>{const v=parseFloat(e.target.value)||0;setCatMargin(Math.max(0,Math.min(100,v)))}} style={{width:36,padding:"3px 4px",borderRadius:4,background:T.surfEl,border:`1px solid ${T.border}`,color:T.gold,fontSize:12,fontFamily:T.mono,fontWeight:700,textAlign:"center",outline:"none"}}/>
        <span style={{fontSize:12,fontWeight:700,color:T.gold}}>%</span>
        <button onClick={applyCatMargin} style={{padding:"4px 10px",borderRadius:T.rS,background:T.goldSoft,color:T.gold,border:`1px solid ${T.borderGlow}`,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:T.sans}}>Apply</button>
      </div>}
      <div className="budget-scroll" style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><div className="cat-grid">
      <div style={{display:"grid",gridTemplateColumns:cols,padding:"10px 18px",borderBottom:`1px solid ${T.border}`}}>
        {["Item",...(isAg?["Days","Day Rate"]:["Description","Vendor"]),"Actual","Margin","Client","Variance",...(isAg?[]:["Status"])].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".1em",textAlign:i===0||(!isAg&&i===1)?"left":"right"}}>{h}</span>)}
      </div>
      {items.map((it,idx)=>{const isExcluded=!!it.excluded;return<div key={it.id} draggable={!!onReorder} onDragStart={e=>{setDragItem(idx);e.dataTransfer.effectAllowed="move"}} onDragOver={e=>{e.preventDefault();setOverItem(idx)}} onDrop={e=>{e.preventDefault();if(dragItem!==null&&dragItem!==idx&&onReorder)onReorder(dragItem,idx);setDragItem(null);setOverItem(null)}} onDragEnd={()=>{setDragItem(null);setOverItem(null)}} style={{display:"grid",gridTemplateColumns:cols,alignItems:"center",padding:"9px 18px",borderBottom:idx<items.length-1?`1px solid ${T.border}`:"none",transition:"all .15s",opacity:dragItem===idx?.5:isExcluded?.4:1,borderTop:overItem===idx&&dragItem!==null?`2px solid ${ac}`:"none",textDecoration:isExcluded?"line-through":"none"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.surfHov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {canEdit&&<button title={isExcluded?"Include in budget":"Exclude from budget"} onClick={()=>onUp(idx,{excluded:!isExcluded})} style={{background:isExcluded?"rgba(248,113,113,.1)":"none",border:`1px solid ${isExcluded?"rgba(248,113,113,.25)":"transparent"}`,borderRadius:4,cursor:"pointer",padding:"1px 4px",fontSize:9,fontWeight:600,color:isExcluded?T.neg:T.dim,fontFamily:T.mono,opacity:isExcluded?1:.2,transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=isExcluded?1:.2}>{isExcluded?"OFF":"ON"}</button>}
          {canEdit?<EditableName value={it.name} onChange={v=>onUp(idx,{name:v})}/>:<span style={{fontSize:13,color:T.cream}}>{it.name}</span>}
          {canEdit&&!isAg&&(()=>{const isQxr=it.qxr||(it.qty>0&&it.rate>0);return<button title={isQxr?"Switch to fixed price":"Switch to qty × rate"} onClick={()=>{if(isQxr){onUp(idx,{qxr:false,qty:0,rate:0,unit:""})}else{onUp(idx,{qxr:true,qty:1,rate:it.actualCost||0,unit:"day"})}}} style={{background:isQxr?`${T.cyan}18`:"none",border:`1px solid ${isQxr?`${T.cyan}40`:"transparent"}`,borderRadius:4,cursor:"pointer",opacity:isQxr?1:.25,padding:"1px 5px",transition:"all .15s",fontSize:9,fontWeight:600,color:isQxr?T.cyan:T.dim,fontFamily:T.mono,letterSpacing:".03em"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=isQxr?1:.25}>Q×R</button>})()}
          {canEdit&&<button title="Delete item" onClick={()=>onRm(idx)} style={{background:"none",border:"none",cursor:"pointer",opacity:.15,padding:2,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.15}><TrashI size={11} color={T.neg}/></button>}</div>
        {isAg?<><NI value={it.days||0} fmt="" onChange={v=>onUp(idx,{days:v,actualCost:v*(it.dayRate||0)})} disabled={!canEdit}/><NI value={it.dayRate||0} onChange={v=>onUp(idx,{dayRate:v,actualCost:(it.days||0)*v})} disabled={!canEdit}/></>
          :<><DetailsInput value={it.details||""} onChange={v=>onUp(idx,{details:v})} canEdit={canEdit}/><div style={{paddingRight:4}}><VendorSelect value={it.vendorId} onChange={v=>onUp(idx,{vendorId:v})} vendors={vendors} onAddVendor={onAddVendor} disabled={!canEdit} compact/></div></>}
        {!isAg&&(it.qxr||(it.qty>0&&it.rate>0))?<div style={{display:"flex",alignItems:"center",gap:2,justifyContent:"flex-end"}}>
          <NI value={it.qty} fmt="" onChange={v=>{const q=Math.max(0,v);onUp(idx,{qty:q,actualCost:q*(it.rate||0)})}} disabled={!canEdit}/>
          <span style={{fontSize:10,color:T.dim,padding:"0 2px"}}>×</span>
          <NI value={it.rate} onChange={v=>{const r=Math.max(0,v);onUp(idx,{rate:r,actualCost:(it.qty||0)*r})}} disabled={!canEdit}/>
          <select value={it.unit||"day"} onChange={e=>onUp(idx,{unit:e.target.value})} disabled={!canEdit} style={{background:"transparent",border:"none",color:T.dim,fontSize:9,fontFamily:T.mono,cursor:"pointer",outline:"none",padding:"2px 0",appearance:"none",WebkitAppearance:"none",width:28,textAlign:"center"}}>
            {["day","hr","ea","wk","mo","ft","sqft","mi"].map(u=><option key={u} value={u} style={{background:T.surface,color:T.cream}}>{u}</option>)}
          </select>
        </div>
        :<NI value={it.actualCost} onChange={v=>onUp(idx,{actualCost:v})} disabled={!canEdit}/>}
        <NI value={it.margin} fmt="%" onChange={v=>onUp(idx,{margin:v>1?v/100:v})} disabled={!canEdit}/>
        <NI value={it.clientPrice} onChange={v=>{const m=it.margin||0;const actual=m>0?v/(1+m):v;const upd={actualCost:actual};if(it.qxr&&it.qty>0){upd.rate=actual/it.qty}onUp(idx,upd)}} disabled={!canEdit} color={T.gold}/>
        <div className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:it.variance>0?T.pos:T.dim,fontWeight:500}}>{f$(it.variance)}</div>
        {!isAg&&(()=>{const ps=getPayStatus(it.id,docs);return<div style={{textAlign:"right"}}><span style={{fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:20,background:`${PAYMENT_COLORS[ps]}18`,color:PAYMENT_COLORS[ps],textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{PAYMENT_LABELS[ps]}</span></div>})()}
      </div>})}
      </div></div>
      {canEdit&&<button onClick={onAdd} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:"none",border:"none",borderTop:`1px solid ${T.border}`,color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}
        onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}><PlusI size={12}/> Add line item</button>}
    </div>}
  </div>;
}

export default Cat;
