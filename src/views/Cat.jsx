import { useState, useRef, useEffect } from 'react';
import T from '../theme/tokens.js';
import { f$, f0, fp } from '../utils/format.js';
import { getPayStatus, fmtRange } from '../utils/calc.js';
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
  if(ed)return<input ref={ref} autoFocus value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Tab")commit();if(e.key==="Escape")setEd(false)}} style={{background:"transparent",border:"none",borderBottom:`1px solid ${T.ink}`,outline:"none",color:T.ink,fontSize:13,fontFamily:T.sans,padding:"2px 0",width:"100%",minWidth:80}}/>;
  return<span tabIndex={0} onClick={start} onFocus={start} style={{fontSize:13,color:T.ink,cursor:"pointer",borderRadius:4,padding:"2px 4px",outline:"none"}} onMouseEnter={e=>e.currentTarget.style.background=T.inkSoft} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{value}</span>;
}

function DetailsInput({value,onChange,canEdit}){
  const[editing,setEditing]=useState(false);
  const[expanded,setExpanded]=useState(false);
  const[tmp,setTmp]=useState(value);
  const startEdit=()=>{if(!canEdit)return;setTmp(value||"");setEditing(true)};
  if(editing)return<input autoFocus value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={()=>{onChange(tmp);setEditing(false)}} onKeyDown={e=>{if(e.key==="Enter"){onChange(tmp);setEditing(false)}if(e.key==="Tab"){onChange(tmp);setEditing(false)}if(e.key==="Escape")setEditing(false)}} style={{width:"100%",padding:"5px 0",fontSize:11,color:T.ink,background:"transparent",border:"none",borderBottom:`1px solid ${T.ink}`,outline:"none",fontFamily:T.sans}}/>;
  if(value)return<div tabIndex={canEdit?0:-1} title={value} onClick={()=>{if(canEdit&&expanded)startEdit();else setExpanded(!expanded)}} onFocus={startEdit} style={{fontSize:11,color:T.fadedInk,fontStyle:"italic",cursor:"pointer",overflow:expanded?"visible":"hidden",textOverflow:expanded?"unset":"ellipsis",whiteSpace:expanded?"normal":"nowrap",lineHeight:expanded?1.5:undefined,background:expanded?T.inkSoft2:"transparent",borderRadius:expanded?T.rS:0,padding:expanded?"6px 8px":"4px 0",margin:expanded?"-2px -8px":"0",transition:"background .18s ease",outline:"none"}}>{value}</div>;
  if(canEdit)return<button tabIndex={0} onClick={startEdit} onFocus={startEdit} style={{fontSize:10,color:T.fadedInk,opacity:.6,background:"none",border:"none",cursor:"pointer",padding:"4px 0",fontFamily:T.sans,fontStyle:"italic"}}>Add description…</button>;
  return<div style={{padding:"4px 0",fontSize:10,color:T.fadedInk,opacity:.4}}>—</div>;
}

function Cat({cat,comp,open,toggle,onUp,onAdd,onRm,onRemoveCat,onMoveCat,moveTargets,isAg,canEdit,docs,vendors,vendorPool,onAddVendor,onVendorClick,isContingency,contBase,onReorder,accent,onSetCatMargin,rangesAllowed,onSetCatOverlay}){
  const{items,totals}=comp;
  const[dragItem,setDragItem]=useState(null);const[overItem,setOverItem]=useState(null);
  const[catMargin,setCatMargin]=useState(()=>{if(!items.length)return 15;return Math.round((items[0].margin||0)*100)});
  const[movePopupOpen,setMovePopupOpen]=useState(false);
  const applyCatMargin=()=>{if(onSetCatMargin)onSetCatMargin(catMargin/100)};
  // Range mode: when on, the section header total shows the band and
  // individual items expose a min/max pair (when their isRange flag is set).
  const showRanges=!!rangesAllowed;
  const hasOverlay=showRanges&&typeof totals.hasOverlay==='boolean'&&totals.hasOverlay;
  const headerClient=showRanges?fmtRange(totals.clientMin,totals.clientMax,f0):f0(totals.clientPrice);
  // Margin + variance columns drop out when range mode is on for this
  // budget — margin lives at the section level instead, and variance
  // is meaningless against a band. Grid widens the Client column to
  // give min–max breathing room.
  const cols=isAg
    ? "2.2fr .7fr .9fr .9fr .55fr .9fr .9fr"
    : (showRanges
        ? "1.6fr 1.2fr .8fr .7fr 1.6fr .5fr"
        : "1.6fr 1.2fr .8fr .7fr .45fr .7fr .7fr .5fr");
  const ac=accent||T.ink;
  return<div style={{marginBottom:6}}>
    <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",padding:"14px 18px",background:open?T.inkSoft2:T.paper,border:`1px solid ${T.faintRule}`,borderLeft:`2px solid ${open?ac:T.faintRule}`,borderRadius:open?`${T.rS} ${T.rS} 0 0`:T.rS,cursor:"pointer",transition:"background .18s ease, border-color .18s ease"}}
      onMouseEnter={e=>{if(!open){e.currentTarget.style.background=T.inkSoft3;e.currentTarget.style.borderLeftColor=ac}}} onMouseLeave={e=>{if(!open){e.currentTarget.style.background=T.paper;e.currentTarget.style.borderLeftColor=T.faintRule}}}>
      <span style={{color:ac,marginRight:10,transition:"transform .2s ease",transform:open?"rotate(0)":"rotate(-90deg)",display:"flex"}}><Chev size={14}/></span>
      <span style={{flex:1,textAlign:"left",fontSize:11,fontWeight:700,letterSpacing:".10em",color:T.ink,textTransform:"uppercase"}}>{cat.name}</span>
      {canEdit&&onMoveCat&&Array.isArray(moveTargets)&&moveTargets.length>0&&<span title="Move section to another budget" onClick={e=>{e.stopPropagation();setMovePopupOpen(v=>!v)}} style={{position:"relative",marginRight:10,opacity:movePopupOpen?1:.3,cursor:"pointer",display:"flex",alignItems:"center",fontSize:13,color:T.ink,transition:"opacity .15s ease",userSelect:"none"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>{if(!movePopupOpen)e.currentTarget.style.opacity=.3}}>
        ⇆
        {movePopupOpen&&<span onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",right:0,marginTop:6,minWidth:180,background:T.paper,border:`1px solid ${T.faintRule}`,borderRadius:8,boxShadow:"0 10px 30px rgba(15,82,186,.18)",padding:6,zIndex:50,display:"flex",flexDirection:"column",gap:2}}>
          <span style={{fontSize:9,fontWeight:700,color:T.fadedInk,letterSpacing:".10em",textTransform:"uppercase",padding:"4px 8px"}}>Move to…</span>
          {moveTargets.map(t=>(
            <button key={t.id||"__primary"} type="button" onClick={ev=>{ev.stopPropagation();setMovePopupOpen(false);onMoveCat(t.id)}} style={{padding:"7px 10px",borderRadius:6,border:"none",background:"transparent",color:T.ink,fontFamily:T.sans,fontSize:12,fontWeight:500,textAlign:"left",cursor:"pointer",letterSpacing:"normal",textTransform:"none"}} onMouseEnter={e=>e.currentTarget.style.background=T.inkSoft} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{t.name}</button>
          ))}
        </span>}
      </span>}
      {canEdit&&onRemoveCat&&<span title="Remove section" onClick={e=>{e.stopPropagation();if(confirm(`Remove "${cat.name}" section?`))onRemoveCat()}} style={{marginRight:10,opacity:.3,cursor:"pointer",display:"flex",transition:"opacity .15s ease"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.3}><TrashI size={11} color={T.alert}/></span>}
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.fadedInk,width:88,textAlign:"right"}}>{f0(totals.actualCost)}</span>
      <span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.ink,width:showRanges?160:88,textAlign:"right",marginLeft:8,fontWeight:700}} title={hasOverlay?`Sum of items: ${fmtRange(totals.sumMin,totals.sumMax,f0)} · Overlay set on category`:undefined}>{headerClient}{hasOverlay&&<span style={{marginLeft:6,fontSize:9,fontWeight:700,color:accent||T.ink,letterSpacing:".06em"}}>OVR</span>}</span>
      {!showRanges&&<span className="num" style={{fontSize:12,fontFamily:T.mono,color:totals.variance>0?T.ink:T.fadedInk,width:88,textAlign:"right",marginLeft:8}}>{f0(totals.variance)}</span>}
    </button>
    {open&&isContingency?<div className="fade-up" style={{border:`1px solid ${T.faintRule}`,borderTop:"none",borderLeft:`2px solid ${ac}`,borderRadius:`0 0 ${T.rS} ${T.rS}`,background:T.paper,padding:"18px 22px"}}>
      {items.map((it,idx)=>{
        const pct=contBase>0&&it.actualCost>0?Math.round((it.actualCost/contBase)*100):it.margin*100||0;
        return<div key={it.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:600,color:T.ink}}>Contingency Buffer</span>
            <div style={{display:"flex",alignItems:"baseline",gap:2}}><NI value={Math.round(pct)} fmt="" onChange={v=>{const p=Math.max(0,Math.min(20,v));const cost=contBase*(p/100);onUp(idx,{actualCost:cost,margin:0})}} disabled={!canEdit}/><span style={{fontSize:16,fontWeight:800,color:T.ink}}>%</span></div>
          </div>
          <div style={{marginBottom:10}}>
            <input type="range" min="0" max="20" step="1" value={Math.round(pct)} onChange={e=>{const p=parseInt(e.target.value);const cost=contBase*(p/100);onUp(idx,{actualCost:cost,margin:0})}} disabled={!canEdit} style={{width:"100%"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.fadedInk,marginTop:4}}><span>0%</span><span>5%</span><span>10%</span><span>15%</span><span>20%</span></div>
          </div>
          <div style={{display:"flex",gap:20,alignItems:"center"}}>
            <div><span style={{fontSize:10,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em"}}>Based on </span><span className="num" style={{fontSize:12,fontFamily:T.mono,color:T.ink}}>{f0(contBase)}</span><span style={{fontSize:10,color:T.fadedInk}}> production subtotal</span></div>
            <div style={{flex:1}}/>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontSize:10,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em"}}>Amount</span>
              {canEdit?<div style={{display:"inline-flex",alignItems:"baseline",borderBottom:`1px solid ${T.faintRule}`}}>
                <span style={{fontSize:14,fontFamily:T.mono,color:T.ink,fontWeight:800,paddingRight:2}}>$</span>
                <input
                  key={Math.round(it.actualCost)}
                  defaultValue={Math.round(it.actualCost).toLocaleString('en-US')}
                  onBlur={e=>{const v=parseFloat(String(e.target.value).replace(/[$,\s]/g,''))||0;onUp(idx,{actualCost:Math.max(0,v),margin:0})}}
                  onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
                  onFocus={e=>{e.currentTarget.parentElement.style.borderBottomColor=T.ink;e.currentTarget.select()}}
                  onBlurCapture={e=>{e.currentTarget.parentElement.style.borderBottomColor=T.faintRule}}
                  title="Type a dollar amount to override; percentage will adjust"
                  style={{width:110,padding:"2px 0",background:"transparent",border:"none",color:T.ink,fontSize:14,fontFamily:T.mono,fontWeight:800,textAlign:"right",outline:"none"}}
                />
              </div>
              :<span className="num" style={{fontSize:14,fontFamily:T.mono,fontWeight:800,color:T.ink}}>{f0(it.actualCost)}</span>}
            </div>
          </div>
        </div>})}
    </div>
    :open&&<div className="fade-up budget-scroll" style={{border:`1px solid ${T.faintRule}`,borderTop:"none",borderLeft:`2px solid ${ac}`,borderRadius:`0 0 ${T.rS} ${T.rS}`,background:T.paper}}>
      {/* Category margin control */}
      {canEdit&&!isAg&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:`1px solid ${T.faintRule}`,background:T.inkSoft3}}>
        <span style={{fontSize:10,fontWeight:700,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em"}}>Category Margin</span>
        <input type="range" min="0" max="40" step="any" value={catMargin} onChange={e=>setCatMargin(parseFloat(e.target.value))} style={{flex:1,maxWidth:140}}/>
        <input value={Math.round(catMargin)} onChange={e=>{const v=parseFloat(e.target.value)||0;setCatMargin(Math.max(0,Math.min(100,v)))}} style={{width:36,padding:"3px 4px",background:"transparent",border:"none",borderBottom:`1px solid ${T.faintRule}`,color:T.ink,fontSize:12,fontFamily:T.mono,fontWeight:800,textAlign:"center",outline:"none"}} onFocus={e=>e.currentTarget.style.borderBottomColor=T.ink} onBlur={e=>e.currentTarget.style.borderBottomColor=T.faintRule}/>
        <span style={{fontSize:12,fontWeight:800,color:T.ink}}>%</span>
        <button onClick={applyCatMargin} className="btn-pill" style={{padding:"4px 12px",fontSize:10}}>Apply</button>
      </div>}
      {/* Section-level range overlay. Overrides the summed items in
          client-facing displays without erasing the underlying
          numbers — useful when the section is being pitched at a
          band rather than itemized. */}
      {canEdit&&!isAg&&showRanges&&onSetCatOverlay&&(()=>{
        const cur=hasOverlay;
        const liveMin=Number(cat.rangeMin)||0;
        const liveMax=Number(cat.rangeMax)||0;
        return<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:`1px solid ${T.faintRule}`,background:cur?T.goldSoft:T.inkSoft3}}>
          <span style={{fontSize:10,fontWeight:700,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em"}}>Section Range Overlay</span>
          <div style={{display:"inline-flex",alignItems:"baseline",gap:4}}>
            <span style={{fontSize:9,color:T.fadedInk,fontFamily:T.mono,letterSpacing:".06em"}}>MIN $</span>
            <input value={liveMin||""} placeholder="—" onChange={e=>{const v=parseFloat(String(e.target.value).replace(/[$,\s]/g,''))||0;onSetCatOverlay(v,liveMax)}} style={{width:90,padding:"3px 0",background:"transparent",border:"none",borderBottom:`1px solid ${T.faintRule}`,color:T.ink,fontSize:13,fontFamily:T.mono,fontWeight:700,textAlign:"right",outline:"none"}} onFocus={e=>e.currentTarget.style.borderBottomColor=T.ink} onBlur={e=>e.currentTarget.style.borderBottomColor=T.faintRule}/>
          </div>
          <div style={{display:"inline-flex",alignItems:"baseline",gap:4}}>
            <span style={{fontSize:9,color:T.fadedInk,fontFamily:T.mono,letterSpacing:".06em"}}>MAX $</span>
            <input value={liveMax||""} placeholder="—" onChange={e=>{const v=parseFloat(String(e.target.value).replace(/[$,\s]/g,''))||0;onSetCatOverlay(liveMin,v)}} style={{width:90,padding:"3px 0",background:"transparent",border:"none",borderBottom:`1px solid ${T.faintRule}`,color:T.ink,fontSize:13,fontFamily:T.mono,fontWeight:700,textAlign:"right",outline:"none"}} onFocus={e=>e.currentTarget.style.borderBottomColor=T.ink} onBlur={e=>e.currentTarget.style.borderBottomColor=T.faintRule}/>
          </div>
          <div style={{flex:1}}/>
          {cur?<>
            <span style={{fontSize:10,color:T.fadedInk,fontFamily:T.mono}} title="Sum of itemized lines">Items: {fmtRange(totals.sumMin,totals.sumMax,f0)}</span>
            <button onClick={()=>onSetCatOverlay(null,null)} className="btn-pill" style={{padding:"4px 12px",fontSize:10,background:"transparent",color:T.fadedInk,borderColor:T.faintRule}}>Clear overlay</button>
          </>:<span style={{fontSize:10,color:T.fadedInk,fontStyle:"italic"}}>Enter min & max to override the section total in client views</span>}
        </div>;
      })()}
      <div className="budget-scroll" style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><div className="cat-grid">
      <div style={{display:"grid",gridTemplateColumns:cols,padding:"10px 18px",borderBottom:`1px solid ${T.faintRule}`}}>
        {["Item",...(isAg?["Days","Day Rate"]:["Description","Vendor"]),"Actual",...(showRanges&&!isAg?[]:["Margin"]),"Client",...(showRanges&&!isAg?[]:["Variance"]),...(isAg?[]:["Status"])].map((h,i)=><span key={i} style={{fontSize:10,fontWeight:700,color:T.fadedInk,textTransform:"uppercase",letterSpacing:".10em",textAlign:i===0||(!isAg&&i===1)?"left":"right"}}>{h}</span>)}
      </div>
      {items.map((it,idx)=>{const isExcluded=!!it.excluded;return<div key={it.id} draggable={!!onReorder} onDragStart={e=>{setDragItem(idx);e.dataTransfer.effectAllowed="move"}} onDragOver={e=>{e.preventDefault();setOverItem(idx)}} onDrop={e=>{e.preventDefault();if(dragItem!==null&&dragItem!==idx&&onReorder)onReorder(dragItem,idx);setDragItem(null);setOverItem(null)}} onDragEnd={()=>{setDragItem(null);setOverItem(null)}} style={{display:"grid",gridTemplateColumns:cols,alignItems:"center",padding:"10px 18px",borderBottom:idx<items.length-1?`1px solid ${T.faintRule}`:"none",transition:"background .15s ease",opacity:dragItem===idx?.5:isExcluded?.4:1,borderTop:overItem===idx&&dragItem!==null?`2px solid ${ac}`:"none",textDecoration:isExcluded?"line-through":"none"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.inkSoft3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {canEdit&&<button title={isExcluded?"Include in budget":"Exclude from budget"} onClick={()=>onUp(idx,{excluded:!isExcluded})} style={{width:28,height:16,borderRadius:8,border:`1px solid ${isExcluded?T.faintRule:T.ink}`,cursor:"pointer",background:isExcluded?"transparent":T.ink,position:"relative",flexShrink:0,transition:"background .18s ease, border-color .18s ease",padding:0}}>
            <div style={{width:10,height:10,borderRadius:5,background:isExcluded?T.faintRule:T.paper,position:"absolute",top:2,left:isExcluded?2:14,transition:"left .18s ease"}}/>
          </button>}
          {canEdit?<EditableName value={it.name} onChange={v=>onUp(idx,{name:v})}/>:<span style={{fontSize:13,color:T.ink}}>{it.name}</span>}
          {canEdit&&!isAg&&(()=>{const isQxr=it.qxr||(it.qty>0&&it.rate>0);return<button title={isQxr?"Switch to fixed price":"Switch to qty × rate"} onClick={()=>{if(isQxr){onUp(idx,{qxr:false,qty:0,rate:0,unit:""})}else{onUp(idx,{qxr:true,qty:1,rate:it.actualCost||0,unit:"day"})}}} style={{background:isQxr?T.inkSoft:"transparent",border:`1px solid ${isQxr?T.ink:"transparent"}`,borderRadius:4,cursor:"pointer",opacity:isQxr?1:.4,padding:"1px 6px",transition:"all .15s ease",fontSize:9,fontWeight:700,color:T.ink,fontFamily:T.mono,letterSpacing:".06em"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=isQxr?1:.4}>Q×R</button>})()}
          {canEdit&&!isAg&&showRanges&&(()=>{const on=!!it.isRange;const isQxr=it.qxr||(it.qty>0&&it.rate>0);return<button title={on?"Switch back to single price":"Express as a min–max range"} onClick={()=>{
            if(on){
              const qty=Number(it.qty)||0;
              const rate=Number(it.rate)||0;
              onUp(idx,{isRange:false,minPrice:null,maxPrice:null,minRate:null,maxRate:null,...(isQxr?{actualCost:qty*rate}:{})});
            }else if(isQxr){
              // Seed the rate band off the existing rate (±15%). Quantity stays put.
              const baseR=Number(it.rate)||0;
              const loR=baseR>0?Math.round(baseR*0.85*100)/100:0;
              const hiR=baseR>0?Math.round(baseR*1.15*100)/100:0;
              const qty=Number(it.qty)||0;
              const mid=qty*((loR+hiR)/2);
              onUp(idx,{isRange:true,minRate:loR,maxRate:hiR,minPrice:qty*loR,maxPrice:qty*hiR,actualCost:mid});
            }else{
              const base=Number(it.clientPrice)||(it.actualCost*(1+(it.margin||0)))||0;
              const lo=base>0?Math.round(base*0.85):0;
              const hi=base>0?Math.round(base*1.15):0;
              onUp(idx,{isRange:true,minPrice:lo,maxPrice:hi});
            }
          }} style={{background:on?T.inkSoft:"transparent",border:`1px solid ${on?T.ink:"transparent"}`,borderRadius:4,cursor:"pointer",opacity:on?1:.4,padding:"1px 6px",transition:"all .15s ease",fontSize:9,fontWeight:700,color:T.ink,fontFamily:T.mono,letterSpacing:".06em"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=on?1:.4}>RNG</button>})()}
          {canEdit&&<button title="Delete item" onClick={()=>onRm(idx)} style={{background:"none",border:"none",cursor:"pointer",opacity:.25,padding:2,transition:"opacity .15s ease"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.25}><TrashI size={11} color={T.alert}/></button>}</div>
        {isAg?<><NI value={it.days||0} fmt="" onChange={v=>onUp(idx,{days:v,actualCost:v*(it.dayRate||0)})} disabled={!canEdit}/><NI value={it.dayRate||0} onChange={v=>onUp(idx,{dayRate:v,actualCost:(it.days||0)*v})} disabled={!canEdit}/></>
          :<><DetailsInput value={it.details||""} onChange={v=>onUp(idx,{details:v})} canEdit={canEdit}/><div style={{paddingRight:4}}><VendorSelect value={it.vendorId} onChange={v=>onUp(idx,{vendorId:v})} vendors={vendors} vendorPool={vendorPool} onAddVendor={onAddVendor} disabled={!canEdit} compact/></div></>}
        {!isAg&&(it.qxr||(it.qty>0&&it.rate>0))
          ? (showRanges&&it.isRange
              // Q×R + range: quantity stays single, rate becomes a band.
              // Client min/max are derived (qty × each rate). actualCost
              // tracks the midpoint so cost-side reports still aggregate
              // sensibly.
              ? <div style={{display:"flex",alignItems:"center",gap:2,justifyContent:"flex-end",flexWrap:"wrap"}}>
                  <NI value={it.qty} fmt="" onChange={v=>{const q=Math.max(0,v);const lo=q*(Number(it.minRate)||0);const hi=q*(Number(it.maxRate)||0);onUp(idx,{qty:q,minPrice:lo,maxPrice:hi,actualCost:(lo+hi)/2})}} disabled={!canEdit}/>
                  <span style={{fontSize:10,color:T.fadedInk,padding:"0 2px"}}>×</span>
                  <NI value={it.minRate||0} onChange={v=>{const r=Math.max(0,v);const qty=Number(it.qty)||0;const lo=qty*r;const hi=qty*(Number(it.maxRate)||0);onUp(idx,{minRate:r,minPrice:lo,maxPrice:hi,actualCost:(lo+hi)/2})}} disabled={!canEdit}/>
                  <span style={{fontSize:10,color:T.fadedInk,padding:"0 2px"}}>–</span>
                  <NI value={it.maxRate||0} onChange={v=>{const r=Math.max(0,v);const qty=Number(it.qty)||0;const hi=qty*r;const lo=qty*(Number(it.minRate)||0);onUp(idx,{maxRate:r,minPrice:lo,maxPrice:hi,actualCost:(lo+hi)/2})}} disabled={!canEdit}/>
                  <select value={it.unit||"day"} onChange={e=>onUp(idx,{unit:e.target.value})} disabled={!canEdit} style={{background:"transparent",border:"none",color:T.fadedInk,fontSize:9,fontFamily:T.mono,cursor:"pointer",outline:"none",padding:"2px 0",appearance:"none",WebkitAppearance:"none",width:28,textAlign:"center"}}>
                    {["day","hr","ea","wk","mo","ft","sqft","mi"].map(u=><option key={u} value={u} style={{background:T.paper,color:T.ink}}>{u}</option>)}
                  </select>
                </div>
              : <div style={{display:"flex",alignItems:"center",gap:2,justifyContent:"flex-end"}}>
                  <NI value={it.qty} fmt="" onChange={v=>{const q=Math.max(0,v);onUp(idx,{qty:q,actualCost:q*(it.rate||0)})}} disabled={!canEdit}/>
                  <span style={{fontSize:10,color:T.fadedInk,padding:"0 2px"}}>×</span>
                  <NI value={it.rate} onChange={v=>{const r=Math.max(0,v);onUp(idx,{rate:r,actualCost:(it.qty||0)*r})}} disabled={!canEdit}/>
                  <select value={it.unit||"day"} onChange={e=>onUp(idx,{unit:e.target.value})} disabled={!canEdit} style={{background:"transparent",border:"none",color:T.fadedInk,fontSize:9,fontFamily:T.mono,cursor:"pointer",outline:"none",padding:"2px 0",appearance:"none",WebkitAppearance:"none",width:28,textAlign:"center"}}>
                    {["day","hr","ea","wk","mo","ft","sqft","mi"].map(u=><option key={u} value={u} style={{background:T.paper,color:T.ink}}>{u}</option>)}
                  </select>
                </div>)
          : <NI value={it.actualCost} onChange={v=>onUp(idx,{actualCost:v})} disabled={!canEdit}/>}
        {!(showRanges&&!isAg)&&<NI value={it.margin} fmt="%" onChange={v=>onUp(idx,{margin:v>1?v/100:v})} disabled={!canEdit}/>}
        {showRanges&&!isAg
          ? (it.isRange
              ? ((it.qxr||(it.qty>0&&it.rate>0))
                  // Derived from qty × rate band — display only.
                  ? <div className="num" style={{textAlign:'right',fontSize:13,fontFamily:T.mono,color:T.ink,fontWeight:700}} title="Computed from quantity × rate range">{fmtRange(Number(it.minPrice)||0,Number(it.maxPrice)||0,f$)}</div>
                  : <div style={{display:'inline-flex',alignItems:'baseline',gap:6,justifyContent:'flex-end'}}>
                      <div style={{display:'inline-flex',alignItems:'baseline',gap:3}} title="Range min"><span style={{fontSize:9,color:T.fadedInk,fontFamily:T.mono,letterSpacing:'.06em'}}>MIN</span><NI value={it.minPrice||0} onChange={v=>onUp(idx,{minPrice:Math.max(0,v)})} disabled={!canEdit}/></div>
                      <span style={{fontSize:11,color:T.fadedInk}}>–</span>
                      <div style={{display:'inline-flex',alignItems:'baseline',gap:3}} title="Range max"><span style={{fontSize:9,color:T.fadedInk,fontFamily:T.mono,letterSpacing:'.06em'}}>MAX</span><NI value={it.maxPrice||0} onChange={v=>onUp(idx,{maxPrice:Math.max(0,v)})} disabled={!canEdit}/></div>
                    </div>)
              : (()=>{const hasOverride=typeof it.clientPriceOverride==='number'&&isFinite(it.clientPriceOverride)&&it.clientPriceOverride>=0;return<div style={{display:'inline-flex',alignItems:'center',gap:4,justifyContent:'flex-end',position:'relative'}} title={hasOverride?'Manually overridden — click × to recompute from cost × section margin':'Single price — section margin applied unless overridden'}>
                  <NI value={it.clientPrice} onChange={v=>onUp(idx,{clientPriceOverride:v})} disabled={!canEdit} color={T.ink}/>
                  {hasOverride&&canEdit&&<button onClick={()=>onUp(idx,{clientPriceOverride:null})} title="Clear override" style={{background:'transparent',border:'none',color:T.fadedInk,cursor:'pointer',fontSize:13,lineHeight:1,padding:'0 4px',fontFamily:T.sans}}>×</button>}
                </div>;})())
          : (()=>{const hasOverride=typeof it.clientPriceOverride==='number'&&isFinite(it.clientPriceOverride)&&it.clientPriceOverride>=0;return<div style={{display:'inline-flex',alignItems:'center',gap:4,position:'relative'}} title={hasOverride?'Manually overridden — click × to recompute from cost × margin':'Type to set a manual override that ignores cost × margin'}>
              <NI value={it.clientPrice} onChange={v=>onUp(idx,{clientPriceOverride:v})} disabled={!canEdit} color={hasOverride?T.ink:T.ink}/>
              {hasOverride&&canEdit&&<button onClick={()=>onUp(idx,{clientPriceOverride:null})} title="Clear override" style={{background:'transparent',border:'none',color:T.fadedInk,cursor:'pointer',fontSize:13,lineHeight:1,padding:'0 4px',fontFamily:T.sans}}>×</button>}
            </div>;})()}
        {!(showRanges&&!isAg)&&<div className="num" style={{textAlign:"right",fontSize:13,fontFamily:T.mono,color:it.variance>0?T.ink:T.fadedInk,fontWeight:600}}>{f$(it.variance)}</div>}
        {!isAg&&(()=>{const ps=getPayStatus(it.id,docs);return<div style={{textAlign:"right"}}><span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:999,background:"transparent",color:PAYMENT_COLORS[ps]||T.fadedInk,border:`1px solid ${PAYMENT_COLORS[ps]||T.faintRule}`,textTransform:"uppercase",letterSpacing:".06em",whiteSpace:"nowrap"}}>{PAYMENT_LABELS[ps]}</span></div>})()}
      </div>})}
      </div></div>
      {canEdit&&<button onClick={onAdd} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"12px 18px",background:"none",border:"none",borderTop:`1px solid ${T.faintRule}`,color:T.fadedInk,fontSize:11,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",fontFamily:T.sans,transition:"color .18s ease"}}
        onMouseEnter={e=>e.currentTarget.style.color=T.ink} onMouseLeave={e=>e.currentTarget.style.color=T.fadedInk}><PlusI size={11}/> Add line item</button>}
    </div>}
  </div>;
}

export default Cat;
