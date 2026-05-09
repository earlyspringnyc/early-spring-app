import { useState, useRef, useCallback, useMemo } from 'react';
import T from '../theme/tokens.js';
import { f$, f0 } from '../utils/format.js';
import { uid } from '../utils/uid.js';
import { Card } from '../components/primitives/index.js';

/* ── palette for section borders ── */
const SEC_COLORS=["#6366F1","#14B8A6","#F59E0B","#EC4899","#8B5CF6","#06B6D4","#10B981","#F47264","#C4B5FD"];

const PHOTO_TAGS=["setup","event","breakdown","VIP","crowd","product","branding"];
const VIDEO_TYPES=["recap","raw","social","testimonial","speaker","livestream"];
const VIDEO_STATUS=["raw","rough cut","final"];
const SENTIMENT=["very positive","positive","neutral","negative"];
const FEEDBACK_CATS=["Venue","Food","Programming","Production Quality","Branding","Overall"];
const REPORT_STATUSES=["Draft","In Progress","Final"];
const NARRATIVE_FIELDS=[
  {key:"executiveSummary",label:"Executive Summary"},
  {key:"eventOverview",label:"Event Overview"},
  {key:"keyHighlights",label:"Key Highlights"},
  {key:"challenges",label:"Challenges"},
  {key:"recommendations",label:"Recommendations"},
  {key:"acknowledgments",label:"Acknowledgments"},
];

/* ── tiny primitives ── */
const Pill=({children,color=T.gold,active,onClick,size="sm"})=>{
  const bg=active?`${color}30`:`${color}18`;
  return <span onClick={onClick} style={{fontSize:size==="xs"?9:10,fontWeight:700,padding:size==="xs"?"2px 7px":"3px 10px",borderRadius:20,background:bg,color,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap",cursor:onClick?"pointer":"default",border:active?`1px solid ${color}`:"1px solid transparent",transition:"all .15s"}}>{children}</span>;
};

const Btn=({children,onClick,primary,small,disabled,style:sx})=>(
  <button disabled={disabled} onClick={onClick} style={{padding:small?"5px 12px":"8px 18px",borderRadius:T.rS,border:primary?`1px solid ${T.borderGlow}`:`1px solid ${T.border}`,background:primary?T.goldSoft:"transparent",color:primary?T.gold:T.dim,fontSize:small?11:12,fontWeight:600,fontFamily:T.sans,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.5:1,transition:"all .15s",...sx}}>{children}</button>
);

const Input=({value,onChange,placeholder,type="text",mono,style:sx})=>(
  <input type={type} value={value||""} onChange={e=>onChange(type==="number"?+e.target.value:e.target.value)} placeholder={placeholder} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.rS,padding:"7px 10px",color:T.cream,fontSize:12,fontFamily:mono?T.mono:T.sans,width:"100%",outline:"none",...sx}} />
);

const TextArea=({value,onChange,placeholder,rows=4,style:sx})=>(
  <textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.rS,padding:"10px 12px",color:T.cream,fontSize:12,fontFamily:T.sans,width:"100%",outline:"none",resize:"vertical",lineHeight:1.6,...sx}} />
);

const Label=({children})=><label style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4,display:"block"}}>{children}</label>;

const Badge=({children,color=T.gold})=><span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10,background:`${color}20`,color,marginLeft:6}}>{children}</span>;

const Chevron=({open})=><span style={{display:"inline-block",transition:"transform .2s",transform:open?"rotate(90deg)":"rotate(0deg)",fontSize:14,color:T.dim}}>&#9656;</span>;

const Select=({value,onChange,options,placeholder})=>(
  <select value={value||""} onChange={e=>onChange(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.rS,padding:"7px 10px",color:T.cream,fontSize:12,fontFamily:T.sans,width:"100%",outline:"none"}}>
    {placeholder&&<option value="">{placeholder}</option>}
    {options.map(o=><option key={o} value={o}>{o}</option>)}
  </select>
);

const ProgressBar=({value,max,color=T.gold})=>{
  const pct=max?Math.min((value/max)*100,100):0;
  return <div style={{height:8,borderRadius:4,background:T.surface,overflow:"hidden",width:"100%"}}>
    <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:4,transition:"width .3s"}} />
  </div>;
};

/* ── Section wrapper ── */
const Section=({num,title,color,count,open,onToggle,children,activeNum})=>{
  if(activeNum!==undefined&&activeNum!==null&&activeNum!==num)return null;
  return(<div style={{borderRadius:T.r,border:`1px solid ${T.border}`,background:T.surfEl,marginBottom:12,overflow:"hidden"}}>
    <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 18px",cursor:"pointer",borderLeft:`3px solid ${color}`,userSelect:"none"}}>
      <Chevron open={open} />
      <span style={{fontSize:10,fontWeight:700,color,fontFamily:T.mono,minWidth:18}}>0{num}</span>
      <span style={{fontSize:13,fontWeight:600,color:T.cream,flex:1}}>{title}</span>
      {count!=null&&<Badge color={color}>{count}</Badge>}
    </div>
    {open&&<div style={{padding:"0 18px 18px",borderLeft:`3px solid ${color}`,borderTop:`1px solid ${T.border}`}}>{children}</div>}
  </div>);
};

/* ── Drop zone ── */
const DropZone=({onFiles,accept,label="Drop files here or click to upload"})=>{
  const ref=useRef();
  const [over,setOver]=useState(false);
  const handle=useCallback(e=>{e.preventDefault();setOver(false);const f=e.dataTransfer?[...e.dataTransfer.files]:[...e.target.files];if(f.length)onFiles(f);},[onFiles]);
  return <div onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={handle} onClick={()=>ref.current.click()} style={{border:`2px dashed ${over?T.gold:T.border}`,borderRadius:T.r,padding:"28px 20px",textAlign:"center",cursor:"pointer",background:over?T.goldSoft:"transparent",transition:"all .15s"}}>
    <input ref={ref} type="file" multiple accept={accept} onChange={handle} style={{display:"none"}} />
    <div style={{fontSize:20,marginBottom:6}}>&#8593;</div>
    <div style={{fontSize:12,color:T.dim}}>{label}</div>
  </div>;
};

/* ── Slider ── */
const Slider=({value,onChange,min=0,max=10,label})=>(
  <div style={{display:"flex",alignItems:"center",gap:10}}>
    {label&&<span style={{fontSize:11,color:T.dim,minWidth:110}}>{label}</span>}
    <input type="range" min={min} max={max} value={value||0} onChange={e=>onChange(+e.target.value)} style={{flex:1,accentColor:T.gold}} />
    <span style={{fontSize:13,fontWeight:700,color:T.cream,fontFamily:T.mono,minWidth:20,textAlign:"right"}}>{value||0}</span>
  </div>
);

/* ═══════════════════════════════════════════════ */
/*              MAIN COMPONENT                    */
/* ═══════════════════════════════════════════════ */
export default function ReportingV({project,updateProject,canEdit,comp}){
  const r=project.report||{};
  const set=useCallback((path,val)=>{
    const next={...project,report:{...r}};
    const keys=path.split(".");
    let obj=next.report;
    for(let i=0;i<keys.length-1;i++){obj[keys[i]]={...obj[keys[i]]};obj=obj[keys[i]];}
    obj[keys[keys.length-1]]=val;
    updateProject(next);
  },[project,r,updateProject]);

  const [openSections,setOpenSections]=useState({1:true});
  const toggle=n=>setOpenSections(p=>({...p,[n]:!p[n]}));
  const [viewMode,setViewMode]=useState("cards"); // "cards" | "sections"
  const [activeSection,setActiveSection]=useState(null);

  const [quoteInput,setQuoteInput]=useState("");
  const [csvText,setCsvText]=useState("");
  const [newHour,setNewHour]=useState({hour:"",count:""});
  const [newVariant,setNewVariant]=useState({name:"",count:""});
  const [feedbackText,setFeedbackText]=useState("");

  /* computed */
  const status=r.status||"Draft";
  const photos=r.photos||[];
  const videos=r.videos||[];
  const feedback=r.feedback||{scores:{},nps:0,entries:[],quotes:[]};
  const ambassadors=r.ambassadors||[];
  const attendance=r.attendance||{};
  const sampling=r.sampling||{variants:[],inventory:{}};
  const social=r.social||{ugc:[]};
  const narrative=r.narrative||{};
  const exportConfig=r.exportConfig||{sections:{1:true,2:true,3:true,4:true,5:true,6:true,7:true,8:true},format:"PDF",versions:[]};

  const daysSince=useMemo(()=>{
    if(!project.eventDate)return null;
    const d=new Date(project.eventDate);
    const now=new Date();
    return Math.floor((now-d)/(1000*60*60*24));
  },[project.eventDate]);

  const sectionsComplete=useMemo(()=>{
    let done=0,total=9;
    if(photos.length)done++;
    if(videos.length)done++;
    if(Object.keys(feedback.scores||{}).length>=3)done++;
    if(ambassadors.length)done++;
    if(attendance.totalAttendance)done++;
    if(sampling.totalSamples)done++;
    if(social.impressions||social.posts)done++;
    if(narrative.executiveSummary)done++;
    if(exportConfig.versions?.length)done++;
    return {done,total};
  },[photos,videos,feedback,ambassadors,attendance,sampling,social,narrative,exportConfig]);

  /* helpers */
  const addPhoto=useCallback(files=>{
    const newPhotos=files.map(f=>({id:uid(),name:f.name,size:f.size,caption:"",credit:"",tags:[],hero:false,url:URL.createObjectURL(f),ts:Date.now()}));
    set("photos",[...photos,...newPhotos]);
  },[photos,set]);

  const updatePhoto=useCallback((id,patch)=>{
    set("photos",photos.map(p=>p.id===id?{...p,...patch}:p));
  },[photos,set]);

  const removePhoto=useCallback(id=>{
    set("photos",photos.filter(p=>p.id!==id));
  },[photos,set]);

  const addVideo=useCallback(files=>{
    const newVids=files.map(f=>({id:uid(),name:f.name,size:f.size,title:"",type:"recap",status:"raw",channels:[],url:URL.createObjectURL(f),ts:Date.now()}));
    set("videos",[...videos,...newVids]);
  },[videos,set]);

  const updateVideo=useCallback((id,patch)=>{
    set("videos",videos.map(v=>v.id===id?{...v,...patch}:v));
  },[videos,set]);

  const removeVideo=useCallback(id=>{
    set("videos",videos.filter(v=>v.id!==id));
  },[videos,set]);

  const addAmbassador=useCallback(()=>{
    set("ambassadors",[...ambassadors,{id:uid(),name:"",role:"",shiftDate:"",hours:0,notes:"",sentiment:"neutral",topQuestions:"",photos:[]}]);
  },[ambassadors,set]);

  const updateAmbassador=useCallback((id,patch)=>{
    set("ambassadors",ambassadors.map(a=>a.id===id?{...a,...patch}:a));
  },[ambassadors,set]);

  const removeAmbassador=useCallback(id=>{
    set("ambassadors",ambassadors.filter(a=>a.id!==id));
  },[ambassadors,set]);

  const importCsv=useCallback(()=>{
    if(!csvText.trim())return;
    const lines=csvText.trim().split("\n");
    const newAmbs=lines.slice(1).map(line=>{
      const cols=line.split(",").map(c=>c.trim());
      return {id:uid(),name:cols[0]||"",role:cols[1]||"",shiftDate:cols[2]||"",hours:+(cols[3]||0),notes:"",sentiment:"neutral",topQuestions:"",photos:[]};
    });
    set("ambassadors",[...ambassadors,...newAmbs]);
    setCsvText("");
  },[csvText,ambassadors,set]);

  const addHourlyEntry=useCallback(()=>{
    if(!newHour.hour)return;
    const hourly=[...(attendance.hourly||[]),{id:uid(),hour:newHour.hour,count:+newHour.count||0}];
    set("attendance",{...attendance,hourly});
    setNewHour({hour:"",count:""});
  },[newHour,attendance,set]);

  const addVariant=useCallback(()=>{
    if(!newVariant.name)return;
    const variants=[...(sampling.variants||[]),{id:uid(),name:newVariant.name,count:+newVariant.count||0}];
    set("sampling",{...sampling,variants});
    setNewVariant({name:"",count:""});
  },[newVariant,sampling,set]);

  const addUgc=useCallback(files=>{
    const newUgc=files.map(f=>({id:uid(),name:f.name,url:URL.createObjectURL(f),ts:Date.now()}));
    set("social",{...social,ugc:[...(social.ugc||[]),...newUgc]});
  },[social,set]);

  const addFeedbackEntry=useCallback(()=>{
    if(!feedbackText.trim())return;
    const entries=[...(feedback.entries||[]),{id:uid(),text:feedbackText,ts:Date.now()}];
    set("feedback",{...feedback,entries});
    setFeedbackText("");
  },[feedbackText,feedback,set]);

  const saveQuote=useCallback(()=>{
    if(!quoteInput.trim())return;
    const quotes=[...(feedback.quotes||[]),{id:uid(),text:quoteInput,ts:Date.now()}];
    set("feedback",{...feedback,quotes});
    setQuoteInput("");
  },[quoteInput,feedback,set]);

  const cycleStatus=useCallback(()=>{
    const idx=REPORT_STATUSES.indexOf(status);
    set("status",REPORT_STATUSES[(idx+1)%REPORT_STATUSES.length]);
  },[status,set]);

  const addVersion=useCallback(()=>{
    const versions=[...(exportConfig.versions||[]),{id:uid(),status,ts:Date.now(),format:exportConfig.format||"PDF"}];
    set("exportConfig",{...exportConfig,versions});
  },[exportConfig,status,set]);

  const fmtBytes=(b)=>b>1048576?`${(b/1048576).toFixed(1)}MB`:`${(b/1024).toFixed(0)}KB`;
  const fmtDate=(ts)=>new Date(ts).toLocaleString();

  /* narrative data pull hints */
  const dataPullHints=useMemo(()=>{
    const hints=[];
    if(attendance.totalAttendance)hints.push(`${attendance.totalAttendance.toLocaleString()} attendees`);
    if(sampling.totalSamples)hints.push(`${sampling.totalSamples.toLocaleString()} samples distributed`);
    if(social.impressions)hints.push(`${social.impressions.toLocaleString()} impressions`);
    if(photos.length)hints.push(`${photos.length} photos captured`);
    if(feedback.nps)hints.push(`NPS: ${feedback.nps}`);
    if(ambassadors.length)hints.push(`${ambassadors.length} ambassadors`);
    return hints;
  },[attendance,sampling,social,photos,feedback,ambassadors]);

  const grid2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:10};
  const grid3={display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10};

  return (
    <div style={{padding:"0 0 60px",maxWidth:960,margin:"0 auto"}}>
      {/* ── HEADER ── */}
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            {activeSection!==null&&<button onClick={()=>setActiveSection(null)} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:14,fontFamily:T.sans,padding:0,display:"flex",alignItems:"center",gap:4}} onMouseEnter={e=>e.currentTarget.style.color=T.cream} onMouseLeave={e=>e.currentTarget.style.color=T.dim}>&larr; Back</button>}
            <h1 style={{fontSize:22,fontWeight:700,color:T.cream,fontFamily:T.sans,margin:0}}>Reporting</h1>
            <Pill color={status==="Final"?T.pos:status==="In Progress"?T.cyan:T.dim} active onClick={canEdit?cycleStatus:undefined} size="sm">{status}</Pill>
          </div>
          {activeSection===null&&<div style={{display:"flex",gap:2,background:T.surface,borderRadius:20,padding:2}}>
            {[["cards","Cards"],["sections","Sections"]].map(([k,l])=><button key={k} onClick={()=>setViewMode(k)} style={{padding:"5px 14px",borderRadius:18,border:"none",cursor:"pointer",fontSize:10,fontWeight:viewMode===k?600:400,fontFamily:T.sans,background:viewMode===k?T.goldSoft:"transparent",color:viewMode===k?T.gold:T.dim}}>{l}</button>)}
          </div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          <Card style={{padding:"14px 16px"}}>
            <div style={{fontSize:10,color:T.dim,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Sections Complete</div>
            <div style={{fontSize:20,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{sectionsComplete.done}<span style={{fontSize:13,color:T.dim}}>/{sectionsComplete.total}</span></div>
          </Card>
          <Card style={{padding:"14px 16px"}}>
            <div style={{fontSize:10,color:T.dim,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Event Date</div>
            <div style={{fontSize:14,fontWeight:600,color:T.cream}}>{project.eventDate||"Not set"}</div>
          </Card>
          <Card style={{padding:"14px 16px"}}>
            <div style={{fontSize:10,color:T.dim,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Days Since Event</div>
            <div style={{fontSize:20,fontWeight:700,color:daysSince!=null&&daysSince>=0?T.cream:T.dim,fontFamily:T.mono}}>{daysSince!=null?(daysSince>=0?daysSince:`In ${Math.abs(daysSince)}d`):"—"}</div>
          </Card>
        </div>
      </div>

      {/* ── CARD VIEW ── */}
      {viewMode==="cards"&&activeSection===null&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {[
          {n:1,title:"Event Photography",color:SEC_COLORS[0],count:photos.length,unit:"photos",icon:"\uD83D\uDCF7"},
          {n:2,title:"Video Content",color:SEC_COLORS[1],count:videos.length,unit:"videos",icon:"\uD83C\uDFA5"},
          {n:3,title:"Client Feedback",color:SEC_COLORS[2],count:feedback.quotes?.length||0,unit:"quotes",icon:"\uD83D\uDCAC"},
          {n:4,title:"Ambassador Feedback",color:SEC_COLORS[3],count:ambassadors.length,unit:"ambassadors",icon:"\uD83D\uDC65"},
          {n:5,title:"Throughput & Attendance",color:SEC_COLORS[4],count:attendance.totalAttendance||0,unit:"attendees",icon:"\uD83D\uDCCA"},
          {n:6,title:"Sampling & Distribution",color:SEC_COLORS[5],count:sampling.totalSamples||0,unit:"samples",icon:"\uD83E\uDD43"},
          {n:7,title:"Social & Digital",color:SEC_COLORS[6],count:social.impressions||0,unit:"impressions",icon:"\uD83D\uDCF1"},
          {n:8,title:"Financial Summary",color:"#F59E0B",count:comp?1:0,unit:"auto",icon:"\uD83D\uDCB0"},
          {n:9,title:"Recap Narrative",color:SEC_COLORS[7],count:NARRATIVE_FIELDS.filter(f=>narrative[f.key]).length,unit:"sections",icon:"\uD83D\uDCDD"},
          {n:10,title:"Report Builder",color:SEC_COLORS[8],count:exportConfig.versions?.length||0,unit:"versions",icon:"\uD83D\uDCE4"},
        ].map(s=>{
          const hasData=s.count>0;
          return<div key={s.n} onClick={()=>{setActiveSection(s.n);setOpenSections(p=>({...p,[s.n]:true}))}} style={{borderRadius:T.r,border:`1px solid ${T.border}`,borderLeft:`3px solid ${s.color}`,background:T.surfEl,cursor:"pointer",transition:"all .2s",overflow:"hidden"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGlow;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=T.shadow}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
            <div style={{padding:"22px 24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontSize:10,fontWeight:600,color:s.color,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>{s.title}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                    <span className="num" style={{fontSize:28,fontWeight:700,color:hasData?T.cream:T.dim,fontFamily:T.mono}}>{typeof s.count==="number"?s.count.toLocaleString():"—"}</span>
                    <span style={{fontSize:11,color:T.dim}}>{s.unit}</span>
                  </div>
                </div>
                <span style={{fontSize:24,opacity:.3}}>{s.icon}</span>
              </div>
              {!hasData&&<div style={{fontSize:10,color:T.dim,opacity:.6}}>Click to add data</div>}
            </div>
          </div>})}
      </div>}

      {/* ── SECTION DETAIL VIEW (when card is clicked) or SECTIONS VIEW ── */}
      {(viewMode==="sections"||activeSection!==null)&&<>

      {/* ══════ SECTION 1: EVENT PHOTOGRAPHY ══════ */}
      <Section num={1} title="Event Photography" color={SEC_COLORS[0]} count={photos.length} open={openSections[1]} activeNum={activeSection} onToggle={()=>toggle(1)}>
        {canEdit&&<div style={{marginBottom:16}}><DropZone onFiles={addPhoto} accept="image/*" label="Drop photos here or click to upload" /></div>}
        {photos.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
          {photos.map(p=>(
            <div key={p.id} style={{background:T.surface,borderRadius:T.rS,overflow:"hidden",border:`1px solid ${T.border}`}}>
              <div style={{position:"relative",height:130,background:T.bg}}>
                <img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                <div onClick={()=>updatePhoto(p.id,{hero:!p.hero})} style={{position:"absolute",top:6,right:6,cursor:"pointer",fontSize:16,color:p.hero?"#F59E0B":T.dim}}>&#9733;</div>
                {canEdit&&<div onClick={()=>removePhoto(p.id)} style={{position:"absolute",top:6,left:6,cursor:"pointer",fontSize:11,color:T.neg,background:"rgba(0,0,0,.6)",borderRadius:4,padding:"2px 6px"}}>&#10005;</div>}
              </div>
              <div style={{padding:10}}>
                <Input value={p.caption} onChange={v=>updatePhoto(p.id,{caption:v})} placeholder="Caption" style={{marginBottom:6,fontSize:11}} />
                <Input value={p.credit} onChange={v=>updatePhoto(p.id,{credit:v})} placeholder="Photographer" style={{marginBottom:8,fontSize:11}} />
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {PHOTO_TAGS.map(tag=><Pill key={tag} size="xs" color={SEC_COLORS[0]} active={p.tags?.includes(tag)} onClick={()=>{const tags=p.tags?.includes(tag)?p.tags.filter(t=>t!==tag):[...(p.tags||[]),tag];updatePhoto(p.id,{tags});}}>{tag}</Pill>)}
                </div>
                <div style={{marginTop:6,fontSize:9,color:T.dim}}>{fmtBytes(p.size)}</div>
              </div>
            </div>
          ))}
        </div>}
      </Section>

      {/* ══════ SECTION 2: VIDEO CONTENT ══════ */}
      <Section num={2} title="Video Content" color={SEC_COLORS[1]} count={videos.length} open={openSections[2]} activeNum={activeSection} onToggle={()=>toggle(2)}>
        {canEdit&&<div style={{marginBottom:16}}><DropZone onFiles={addVideo} accept="video/*" label="Drop videos here or click to upload" /></div>}
        {videos.map(v=>(
          <div key={v.id} style={{background:T.surface,borderRadius:T.rS,border:`1px solid ${T.border}`,padding:14,marginBottom:10}}>
            <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              <div style={{minWidth:180,maxWidth:180}}>
                <video src={v.url} controls style={{width:"100%",borderRadius:T.rS,background:T.bg}} />
              </div>
              <div style={{flex:1}}>
                <Input value={v.title} onChange={val=>updateVideo(v.id,{title:val})} placeholder="Video title" style={{marginBottom:8}} />
                <div style={grid2}>
                  <div><Label>Content Type</Label><Select value={v.type} onChange={val=>updateVideo(v.id,{type:val})} options={VIDEO_TYPES} /></div>
                  <div><Label>Status</Label><Select value={v.status} onChange={val=>updateVideo(v.id,{status:val})} options={VIDEO_STATUS} /></div>
                </div>
                <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                  {["Instagram","TikTok","YouTube","LinkedIn","Twitter","Website"].map(ch=><Pill key={ch} size="xs" color={SEC_COLORS[1]} active={v.channels?.includes(ch)} onClick={()=>{const channels=v.channels?.includes(ch)?v.channels.filter(c=>c!==ch):[...(v.channels||[]),ch];updateVideo(v.id,{channels});}}>{ch}</Pill>)}
                </div>
              </div>
              {canEdit&&<div onClick={()=>removeVideo(v.id)} style={{cursor:"pointer",color:T.neg,fontSize:12}}>&#10005;</div>}
            </div>
          </div>
        ))}
      </Section>

      {/* ══════ SECTION 3: CLIENT FEEDBACK ══════ */}
      <Section num={3} title="Client Feedback" color={SEC_COLORS[2]} count={(feedback.entries?.length||0)+(feedback.quotes?.length||0)} open={openSections[3]} activeNum={activeSection} onToggle={()=>toggle(3)}>
        <Label>Satisfaction Scores (1-10)</Label>
        <div style={{display:"grid",gap:8,marginBottom:16}}>
          {FEEDBACK_CATS.map(cat=><Slider key={cat} label={cat} value={feedback.scores?.[cat]||0} onChange={v=>set("feedback",{...feedback,scores:{...feedback.scores,[cat]:v}})} />)}
        </div>

        <div style={{marginBottom:16}}>
          <Label>Net Promoter Score (NPS)</Label>
          <Slider value={feedback.nps||0} onChange={v=>set("feedback",{...feedback,nps:v})} min={0} max={10} />
        </div>

        <div style={{marginBottom:16}}>
          <Label>Feedback Entries</Label>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <Input value={feedbackText} onChange={setFeedbackText} placeholder="Add feedback..." style={{flex:1}} />
            <Btn primary small onClick={addFeedbackEntry}>Add</Btn>
          </div>
          {(feedback.entries||[]).map(e=>(
            <div key={e.id} style={{background:T.surface,borderRadius:T.rS,padding:"8px 12px",marginBottom:6,fontSize:12,color:T.cream}}>
              <span style={{color:T.dim,fontSize:9,marginRight:8}}>{fmtDate(e.ts)}</span>{e.text}
            </div>
          ))}
        </div>

        <div>
          <Label>Quote Extraction</Label>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <Input value={quoteInput} onChange={setQuoteInput} placeholder="Paste a notable quote..." style={{flex:1}} />
            <Btn primary small onClick={saveQuote}>Save as Quote</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {(feedback.quotes||[]).map(q=>(
              <div key={q.id} style={{background:T.goldSoft,border:`1px solid ${T.borderGlow}`,borderRadius:T.r,padding:"14px 16px"}}>
                <div style={{fontSize:18,color:T.gold,lineHeight:1,marginBottom:4}}>&ldquo;</div>
                <div style={{fontSize:12,color:T.cream,fontStyle:"italic",lineHeight:1.5}}>{q.text}</div>
                <div style={{fontSize:9,color:T.dim,marginTop:6}}>{fmtDate(q.ts)}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ══════ SECTION 4: BRAND AMBASSADOR FEEDBACK ══════ */}
      <Section num={4} title="Brand Ambassador Feedback" color={SEC_COLORS[3]} count={ambassadors.length} open={openSections[4]} activeNum={activeSection} onToggle={()=>toggle(4)}>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {canEdit&&<Btn primary small onClick={addAmbassador}>+ Add Ambassador</Btn>}
        </div>

        {ambassadors.map(a=>(
          <div key={a.id} style={{background:T.surface,borderRadius:T.rS,border:`1px solid ${T.border}`,padding:14,marginBottom:10}}>
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <Input value={a.name} onChange={v=>updateAmbassador(a.id,{name:v})} placeholder="Name" style={{flex:1}} />
              <Input value={a.role} onChange={v=>updateAmbassador(a.id,{role:v})} placeholder="Role" style={{flex:1}} />
              <Input value={a.shiftDate} onChange={v=>updateAmbassador(a.id,{shiftDate:v})} placeholder="Shift date" type="date" style={{width:140}} />
              <Input value={a.hours} onChange={v=>updateAmbassador(a.id,{hours:v})} placeholder="Hours" type="number" mono style={{width:70}} />
              {canEdit&&<span onClick={()=>removeAmbassador(a.id)} style={{cursor:"pointer",color:T.neg,fontSize:12}}>&#10005;</span>}
            </div>
            <div style={grid2}>
              <div>
                <Label>Consumer Sentiment</Label>
                <Select value={a.sentiment} onChange={v=>updateAmbassador(a.id,{sentiment:v})} options={SENTIMENT} />
              </div>
              <div>
                <Label>Top Questions</Label>
                <TextArea value={a.topQuestions} onChange={v=>updateAmbassador(a.id,{topQuestions:v})} rows={2} placeholder="Most asked questions..." />
              </div>
            </div>
            <div style={{marginTop:8}}>
              <Label>Qualitative Notes</Label>
              <TextArea value={a.notes} onChange={v=>updateAmbassador(a.id,{notes:v})} rows={2} placeholder="Observations, anecdotes..." />
            </div>
          </div>
        ))}

        <div style={{marginTop:14,background:T.surface,borderRadius:T.rS,padding:14,border:`1px solid ${T.border}`}}>
          <Label>CSV Import (name,role,date,hours)</Label>
          <TextArea value={csvText} onChange={setCsvText} rows={3} placeholder={"name,role,date,hours\nJane Doe,Lead,2026-03-15,8\nJohn Smith,Support,2026-03-15,6"} />
          <div style={{marginTop:8}}><Btn small primary onClick={importCsv}>Import CSV</Btn></div>
        </div>
      </Section>

      {/* ══════ SECTION 5: THROUGHPUT & ATTENDANCE ══════ */}
      <Section num={5} title="Throughput & Attendance" color={SEC_COLORS[4]} count={attendance.hourly?.length||null} open={openSections[5]} activeNum={activeSection} onToggle={()=>toggle(5)}>
        <div style={{...grid3,marginBottom:16}}>
          <div><Label>Total Attendance</Label><Input type="number" mono value={attendance.totalAttendance} onChange={v=>set("attendance",{...attendance,totalAttendance:v})} /></div>
          <div><Label>Unique Check-Ins</Label><Input type="number" mono value={attendance.uniqueCheckIns} onChange={v=>set("attendance",{...attendance,uniqueCheckIns:v})} /></div>
          <div><Label>Avg Dwell Time (min)</Label><Input type="number" mono value={attendance.avgDwellTime} onChange={v=>set("attendance",{...attendance,avgDwellTime:v})} /></div>
          <div><Label>Peak Hourly Throughput</Label><Input type="number" mono value={attendance.peakHourly} onChange={v=>set("attendance",{...attendance,peakHourly:v})} /></div>
          <div><Label>Max Capacity</Label><Input type="number" mono value={attendance.maxCapacity} onChange={v=>set("attendance",{...attendance,maxCapacity:v})} /></div>
          <div><Label>Capacity Utilization %</Label><Input type="number" mono value={attendance.capacityUtil} onChange={v=>set("attendance",{...attendance,capacityUtil:v})} /></div>
        </div>

        {/* target vs actual */}
        <div style={{marginBottom:16}}>
          <Label>Target vs Actual</Label>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
            <Input type="number" mono value={attendance.target} onChange={v=>set("attendance",{...attendance,target:v})} placeholder="Target" style={{width:120}} />
            <span style={{fontSize:11,color:T.dim}}>target</span>
            <span style={{fontSize:11,color:T.dim,margin:"0 4px"}}>|</span>
            <span style={{fontSize:12,fontWeight:700,color:T.cream,fontFamily:T.mono}}>{attendance.totalAttendance||0}</span>
            <span style={{fontSize:11,color:T.dim}}>actual</span>
          </div>
          <ProgressBar value={attendance.totalAttendance||0} max={attendance.target||1} color={SEC_COLORS[4]} />
          {attendance.target>0&&<div style={{fontSize:10,color:T.dim,marginTop:4}}>{Math.round(((attendance.totalAttendance||0)/attendance.target)*100)}% of target</div>}
        </div>

        {/* hourly data */}
        <Label>Hourly Throughput Data</Label>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <Input value={newHour.hour} onChange={v=>setNewHour(p=>({...p,hour:v}))} placeholder="Hour (e.g. 10:00)" style={{width:120}} />
          <Input type="number" mono value={newHour.count} onChange={v=>setNewHour(p=>({...p,count:v}))} placeholder="Count" style={{width:100}} />
          <Btn small primary onClick={addHourlyEntry}>Add</Btn>
        </div>
        {(attendance.hourly||[]).length>0&&<div style={{display:"flex",gap:4,alignItems:"flex-end",height:100,marginTop:8}}>
          {(attendance.hourly||[]).map(h=>{
            const max=Math.max(...(attendance.hourly||[]).map(x=>x.count||1));
            const pct=max?(h.count/max)*100:0;
            return <div key={h.id} style={{flex:1,textAlign:"center"}}>
              <div style={{background:SEC_COLORS[4],borderRadius:"3px 3px 0 0",height:`${pct}%`,minHeight:2,transition:"height .2s"}} />
              <div style={{fontSize:8,color:T.dim,marginTop:3}}>{h.hour}</div>
              <div style={{fontSize:8,color:T.cream,fontFamily:T.mono}}>{h.count}</div>
            </div>;
          })}
        </div>}
      </Section>

      {/* ══════ SECTION 6: SAMPLING & DISTRIBUTION ══════ */}
      <Section num={6} title="Sampling & Distribution" color={SEC_COLORS[5]} count={sampling.variants?.length||null} open={openSections[6]} activeNum={activeSection} onToggle={()=>toggle(6)}>
        <div style={{...grid3,marginBottom:16}}>
          <div><Label>Total Samples</Label><Input type="number" mono value={sampling.totalSamples} onChange={v=>set("sampling",{...sampling,totalSamples:v})} /></div>
          <div><Label>Samples/Hour</Label><Input type="number" mono value={sampling.samplesPerHour} onChange={v=>set("sampling",{...sampling,samplesPerHour:v})} /></div>
          <div><Label>Cost/Sample ($)</Label><Input type="number" mono value={sampling.costPerSample} onChange={v=>set("sampling",{...sampling,costPerSample:v})} /></div>
        </div>

        <Label>Product Variants</Label>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <Input value={newVariant.name} onChange={v=>setNewVariant(p=>({...p,name:v}))} placeholder="Variant name" style={{flex:1}} />
          <Input type="number" mono value={newVariant.count} onChange={v=>setNewVariant(p=>({...p,count:v}))} placeholder="Count" style={{width:100}} />
          <Btn small primary onClick={addVariant}>Add</Btn>
        </div>
        {(sampling.variants||[]).length>0&&<div style={{border:`1px solid ${T.border}`,borderRadius:T.rS,overflow:"hidden",marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 100px",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",padding:"6px 12px",background:T.surface}}>
            <span>Variant</span><span style={{textAlign:"right"}}>Count</span>
          </div>
          {(sampling.variants||[]).map(v=>(
            <div key={v.id} style={{display:"grid",gridTemplateColumns:"1fr 100px",fontSize:12,padding:"8px 12px",borderTop:`1px solid ${T.border}`}}>
              <span style={{color:T.cream}}>{v.name}</span>
              <span style={{textAlign:"right",fontFamily:T.mono,color:T.cream}}>{v.count}</span>
            </div>
          ))}
        </div>}

        <Label>Inventory</Label>
        <div style={{...grid2,marginBottom:16}}>
          <div><Label>Starting Count</Label><Input type="number" mono value={sampling.inventory?.starting} onChange={v=>set("sampling",{...sampling,inventory:{...sampling.inventory,starting:v}})} /></div>
          <div><Label>Distributed</Label><Input type="number" mono value={sampling.inventory?.distributed} onChange={v=>set("sampling",{...sampling,inventory:{...sampling.inventory,distributed:v}})} /></div>
          <div><Label>Remaining</Label><Input type="number" mono value={sampling.inventory?.remaining} onChange={v=>set("sampling",{...sampling,inventory:{...sampling.inventory,remaining:v}})} /></div>
          <div><Label>Waste</Label><Input type="number" mono value={sampling.inventory?.waste} onChange={v=>set("sampling",{...sampling,inventory:{...sampling.inventory,waste:v}})} /></div>
        </div>

        <Label>Distribution Method</Label>
        <Select value={sampling.distributionMethod} onChange={v=>set("sampling",{...sampling,distributionMethod:v})} options={["Hand-to-hand","Self-serve","Staffed station","Roaming","Mixed"]} placeholder="Select method" />
      </Section>

      {/* ══════ SECTION 7: SOCIAL & DIGITAL METRICS ══════ */}
      <Section num={7} title="Social & Digital Metrics" color={SEC_COLORS[6]} count={social.ugc?.length||null} open={openSections[7]} activeNum={activeSection} onToggle={()=>toggle(7)}>
        <div style={{...grid3,marginBottom:16}}>
          <div><Label>Hashtag</Label><Input value={social.hashtag} onChange={v=>set("social",{...social,hashtag:v})} placeholder="#YourEvent" /></div>
          <div><Label>Impressions</Label><Input type="number" mono value={social.impressions} onChange={v=>set("social",{...social,impressions:v})} /></div>
          <div><Label>Posts</Label><Input type="number" mono value={social.posts} onChange={v=>set("social",{...social,posts:v})} /></div>
          <div><Label>Reach</Label><Input type="number" mono value={social.reach} onChange={v=>set("social",{...social,reach:v})} /></div>
          <div><Label>Social Mentions</Label><Input type="number" mono value={social.mentions} onChange={v=>set("social",{...social,mentions:v})} /></div>
          <div><Label>Influencer Content</Label><Input type="number" mono value={social.influencerContent} onChange={v=>set("social",{...social,influencerContent:v})} /></div>
          <div><Label>QR Scans</Label><Input type="number" mono value={social.qrScans} onChange={v=>set("social",{...social,qrScans:v})} /></div>
          <div><Label>Website Traffic</Label><Input type="number" mono value={social.websiteTraffic} onChange={v=>set("social",{...social,websiteTraffic:v})} /></div>
        </div>

        <Label>UGC Gallery</Label>
        <DropZone onFiles={addUgc} accept="image/*" label="Upload user-generated content" />
        {(social.ugc||[]).length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8,marginTop:10}}>
          {(social.ugc||[]).map(u=>(
            <div key={u.id} style={{borderRadius:T.rS,overflow:"hidden",height:100,background:T.bg}}>
              <img src={u.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
            </div>
          ))}
        </div>}
      </Section>

      {/* ══════ SECTION 8: FINANCIAL SUMMARY (auto-populated) ══════ */}
      <Section num={8} title="Financial Summary" color="#F59E0B" count={null} open={openSections[8]} activeNum={activeSection} onToggle={()=>toggle(8)} badge="Auto">
        {comp?<div>
          <div style={{fontSize:10,color:T.dim,marginBottom:14}}>Auto-populated from Budget and Finance data. <span style={{color:"#F59E0B",fontWeight:600}}>Internal only</span> — not included in client reports by default.</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:16}}>
            {[{l:"Client Budget",v:f$(project.clientBudget||0),c:T.cream},{l:"Grand Total",v:f$(comp.grandTotal),c:T.gold},{l:"Production Cost",v:f$(comp.productionSubtotal.actualCost),c:T.dim},{l:"Net Profit",v:f$(comp.netProfit),c:comp.netProfit>0?T.pos:T.neg},{l:"Margin",v:comp.grandTotal>0?`${((comp.netProfit/comp.grandTotal)*100).toFixed(1)}%`:"—",c:T.cyan}].map((m,i)=>
              <div key={i} style={{padding:"12px 14px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{m.l}</div>
                <div className="num" style={{fontSize:18,fontWeight:700,color:m.c,fontFamily:T.mono}}>{m.v}</div>
              </div>)}
          </div>
          {/* Budget vs Actual by category */}
          <div style={{fontSize:10,fontWeight:600,color:T.cream,marginBottom:8}}>Budget vs. Actual by Category</div>
          <Card style={{overflow:"hidden",marginBottom:16}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",padding:"10px 14px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
              {["Category","Actual","Client","Variance"].map((h,i)=><span key={i} style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",textAlign:i>0?"right":"left"}}>{h}</span>)}
            </div>
            {(project.cats||[]).map(c=>{const items=c.items||[];const actual=items.reduce((a,it)=>a+it.actualCost,0);const client=items.reduce((a,it)=>a+(it.actualCost*(1+(it.margin||0))),0);const variance=client-actual;
              return<div key={c.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",padding:"8px 14px",borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:12,color:T.cream}}>{c.name}</span>
                <span style={{fontSize:11,fontFamily:T.mono,color:T.dim,textAlign:"right"}}>{f$(actual)}</span>
                <span style={{fontSize:11,fontFamily:T.mono,color:T.gold,textAlign:"right"}}>{f$(client)}</span>
                <span style={{fontSize:11,fontFamily:T.mono,color:variance>0?T.pos:T.neg,textAlign:"right"}}>{f$(variance)}</span>
              </div>})}
          </Card>
          {/* Cost per attendee */}
          {(()=>{const att=r.attendance?.totalAttendance||0;const samples=r.sampling?.totalSamples||0;const totalCost=comp.productionSubtotal.actualCost+comp.agencyCostsSubtotal.actualCost;return(att>0||samples>0)&&<div style={{display:"flex",gap:12,marginBottom:16}}>
            {att>0&&<div style={{padding:"12px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,flex:1}}>
              <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:4}}>Cost per Attendee</div>
              <div className="num" style={{fontSize:18,fontWeight:700,color:T.cyan,fontFamily:T.mono}}>{f$(totalCost/att)}</div>
            </div>}
            {samples>0&&<div style={{padding:"12px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`,flex:1}}>
              <div style={{fontSize:9,color:T.dim,textTransform:"uppercase",marginBottom:4}}>Cost per Sample</div>
              <div className="num" style={{fontSize:18,fontWeight:700,color:T.cyan,fontFamily:T.mono}}>{f$(totalCost/samples)}</div>
            </div>}
          </div>})()}
          {/* Collection status */}
          {(()=>{const txns=project.txns||[];const collected=txns.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);const pct=comp.grandTotal>0?Math.round((collected/comp.grandTotal)*100):0;return<div style={{padding:"12px 16px",borderRadius:T.rS,background:T.surfEl,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:T.dim}}>Client Collection</span><span style={{fontSize:10,color:T.gold,fontFamily:T.mono}}>{f$(collected)} / {f$(comp.grandTotal)} ({pct}%)</span></div>
            <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:T.ink,borderRadius:2}}/></div>
          </div>})()}
        </div>:<div style={{padding:20,textAlign:"center",color:T.dim,fontSize:12}}>Budget data not available</div>}
      </Section>

      {/* ══════ SECTION 9: RECAP NARRATIVE ══════ */}
      <Section num={9} title="Recap Narrative" color={SEC_COLORS[7]} count={NARRATIVE_FIELDS.filter(f=>narrative[f.key]).length||null} open={openSections[9]} activeNum={activeSection} onToggle={()=>toggle(9)}>
        {dataPullHints.length>0&&<div style={{marginBottom:14}}>
          <Label>Data Pull Hints — click to copy</Label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {dataPullHints.map((h,i)=><Pill key={i} color={SEC_COLORS[7]} size="xs" onClick={()=>{navigator.clipboard?.writeText(h);}}>{h}</Pill>)}
          </div>
        </div>}
        {NARRATIVE_FIELDS.map(f=>(
          <div key={f.key} style={{marginBottom:14}}>
            <Label>{f.label}</Label>
            <TextArea value={narrative[f.key]} onChange={v=>set("narrative",{...narrative,[f.key]:v})} rows={5} placeholder={`Write the ${f.label.toLowerCase()}...`} />
          </div>
        ))}
      </Section>

      {/* ══════ SECTION 10: REPORT BUILDER & EXPORT ══════ */}
      <Section num={10} title="Report Builder & Export" color={SEC_COLORS[8]} count={exportConfig.versions?.length||null} open={openSections[10]} activeNum={activeSection} onToggle={()=>toggle(10)}>
        {/* Permissions */}
        <div style={{marginBottom:16,padding:"14px 16px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:600,color:T.cream,marginBottom:10}}>Section Permissions</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:4,marginBottom:6}}>
            <span style={{fontSize:9,color:T.dim}}>Section</span>
            {["Internal","Client","Public"].map(l=><span key={l} style={{fontSize:9,color:T.dim,textAlign:"center"}}>{l}</span>)}
          </div>
          {[{n:"Photography",d:"client"},{n:"Video",d:"client"},{n:"Client Feedback",d:"client"},{n:"Ambassador Feedback",d:"internal"},{n:"Throughput",d:"client"},{n:"Sampling",d:"client"},{n:"Social Metrics",d:"client"},{n:"Financial Summary",d:"internal"},{n:"Recap Narrative",d:"client"}].map(s=>{
            const perms=r.permissions||{};const val=perms[s.n]||s.d;
            return<div key={s.n} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:4,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:11,color:T.cream}}>{s.n}</span>
              {["internal","client","public"].map(p=><div key={p} style={{textAlign:"center"}}><button onClick={()=>{const perms={...(r.permissions||{})};perms[s.n]=p;set("permissions",perms)}} style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${val===p?T.gold:T.border}`,background:val===p?T.gold:"transparent",cursor:"pointer",transition:"all .15s"}}></button></div>)}
            </div>})}
          <div style={{fontSize:9,color:T.dim,marginTop:8}}>Internal = team only · Client = included in client report · Public = visible on shared link</div>
        </div>
        <Label>Include Sections</Label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:16}}>
          {["Event Photography","Video Content","Client Feedback","Ambassador Feedback","Throughput","Sampling","Social Metrics","Financial Summary","Recap Narrative"].map((name,i)=>(
            <label key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.cream,cursor:"pointer"}}>
              <input type="checkbox" checked={exportConfig.sections?.[i+1]!==false} onChange={e=>set("exportConfig",{...exportConfig,sections:{...exportConfig.sections,[i+1]:e.target.checked}})} style={{accentColor:T.gold}} />
              {name}
            </label>
          ))}
        </div>

        <Label>Export Format</Label>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {["PDF","PPTX","Link"].map(fmt=>(
            <Btn key={fmt} primary={exportConfig.format===fmt} small onClick={()=>set("exportConfig",{...exportConfig,format:fmt})}>{fmt}</Btn>
          ))}
        </div>

        <Label>Status Workflow</Label>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16}}>
          {REPORT_STATUSES.map((s,i)=>(
            <span key={s} style={{display:"flex",alignItems:"center",gap:6}}>
              <Pill color={s===status?T.pos:T.dim} active={s===status} onClick={canEdit?()=>set("status",s):undefined}>{s}</Pill>
              {i<REPORT_STATUSES.length-1&&<span style={{color:T.dim,fontSize:10}}>&rarr;</span>}
            </span>
          ))}
        </div>

        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <Btn primary onClick={addVersion}>Save Version</Btn>
        </div>

        {(exportConfig.versions||[]).length>0&&<>
          <Label>Version History</Label>
          <div style={{border:`1px solid ${T.border}`,borderRadius:T.rS,overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"60px 80px 80px 1fr",fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",padding:"6px 12px",background:T.surface}}>
              <span>#</span><span>Status</span><span>Format</span><span>Date</span>
            </div>
            {(exportConfig.versions||[]).map((v,i)=>(
              <div key={v.id} style={{display:"grid",gridTemplateColumns:"60px 80px 80px 1fr",fontSize:12,padding:"8px 12px",borderTop:`1px solid ${T.border}`,color:T.cream}}>
                <span style={{fontFamily:T.mono}}>v{i+1}</span>
                <Pill size="xs" color={v.status==="Final"?T.pos:T.dim}>{v.status}</Pill>
                <span>{v.format}</span>
                <span style={{fontSize:10,color:T.dim}}>{fmtDate(v.ts)}</span>
              </div>
            ))}
          </div>
        </>}
      </Section>
      </>}
    </div>
  );
}
