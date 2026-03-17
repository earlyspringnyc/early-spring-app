import { useState, useEffect, useRef } from 'react';
import React from 'react';
import T from '../theme/tokens.js';
import { mkTask, mkDoc, mkTxn, mkROS, mkI } from '../data/factories.js';
import { isOverdue } from '../utils/calc.js';
import { Card } from '../components/primitives/index.js';
import { serializeProject, AI_SYSTEM } from '../ai/serialize.js';

function AIV({project,updateProject,comp}){
  const[messages,setMessages]=useState([{role:"assistant",content:"I have full context on **"+project.name+"**. Ask me anything about the budget, timeline, documents, or cashflow. I can also add tasks, flag risks, or help you optimize margins. What do you need?"}]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const chatEnd=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"})},[messages]);

  const executeActions=(text)=>{
    const actionRegex=/```action\s*\n([\s\S]*?)\n```/g;
    let match;const executed=[];
    while((match=actionRegex.exec(text))!==null){
      try{
        const action=JSON.parse(match[1]);
        if(action.type==="add_task"){
          updateProject({timeline:[...(project.timeline||[]),mkTask(action.name,action.category||"General",action.assignee||"",action.startDate||"",action.endDate||"")]});
          executed.push("Added task: "+action.name);
        }else if(action.type==="add_doc"){
          const doc=mkDoc(action.name,action.docType||"invoice",action.vendor||"",action.amount||0,action.dueDate||"");
          if(isOverdue(doc))doc.status="overdue";
          updateProject({docs:[...(project.docs||[]),doc]});
          executed.push("Added document: "+action.name);
        }else if(action.type==="add_txn"){
          updateProject({txns:[...(project.txns||[]),mkTxn(action.txnType||"expense",action.description,action.amount||0,action.date||"",action.category||"")]});
          executed.push("Added transaction: "+action.description);
        }else if(action.type==="add_ros"){
          updateProject({ros:[...(project.ros||[]),mkROS(action.time||"",action.item||"",action.location||"",action.lead||"",action.duration||"",action.notes||"")]});
          executed.push("Added ROS cue: "+action.item);
        }else if(action.type==="update_fee"){
          updateProject({feeP:action.feePercent});
          executed.push("Updated agency fee to "+(action.feePercent*100)+"%");
        }else if(action.type==="update_item"){
          const cats=(project.cats||[]).map(c=>{
            if(c.name.toLowerCase()!==action.category?.toLowerCase())return c;
            return{...c,items:c.items.map(it=>{
              if(it.name.toLowerCase()!==action.item?.toLowerCase())return it;
              const updates={};
              if(action.actualCost!==undefined)updates.actualCost=action.actualCost;
              if(action.margin!==undefined)updates.margin=action.margin;
              if(action.budget!==undefined)updates.budget=action.budget;
              if(action.estCost!==undefined)updates.estCost=action.estCost;
              return{...it,...updates};
            })};
          });
          updateProject({cats});
          executed.push("Updated "+action.item+" in "+action.category);
        }else if(action.type==="update_agency"){
          const ag=(project.ag||[]).map(it=>{
            if(it.name.toLowerCase()!==action.item?.toLowerCase())return it;
            const updates={};
            if(action.days!==undefined)updates.days=action.days;
            if(action.dayRate!==undefined)updates.dayRate=action.dayRate;
            if(action.margin!==undefined)updates.margin=action.margin;
            if(action.days!==undefined||action.dayRate!==undefined)updates.actualCost=(action.days??it.days)*(action.dayRate??it.dayRate);
            return{...it,...updates};
          });
          updateProject({ag});
          executed.push("Updated agency role: "+action.item);
        }else if(action.type==="add_item"){
          const cats=(project.cats||[]).map(c=>{
            if(c.name.toLowerCase()!==action.category?.toLowerCase())return c;
            return{...c,items:[...c.items,mkI(action.name||"New Item",action.actualCost||0,action.margin||0.15)]};
          });
          updateProject({cats});
          executed.push("Added "+action.name+" to "+action.category);
        }
      }catch(e){executed.push("Failed to parse action")}
    }
    return executed;
  };

  const send=async()=>{
    if(!input.trim()||loading)return;
    const userMsg={role:"user",content:input.trim()};
    const newMsgs=[...messages,userMsg];
    setMessages(newMsgs);setInput("");setLoading(true);

    const projectContext=serializeProject(project,comp);
    const apiMessages=newMsgs.map(m=>({role:m.role,content:m.content}));

    try{
      const res=await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2048,system:AI_SYSTEM+"\n\nCURRENT PROJECT DATA:\n"+projectContext,messages:apiMessages})
      });
      if(!res.ok){const err=await res.text();throw new Error(err)}
      const data=await res.json();
      const reply=data.content[0].text;
      const executed=executeActions(reply);
      const cleanReply=reply.replace(/```action\s*\n[\s\S]*?\n```/g,"").trim();
      const finalReply=executed.length>0?cleanReply+"\n\n✓ "+executed.join("\n✓ "):cleanReply;
      setMessages(prev=>[...prev,{role:"assistant",content:finalReply}]);
    }catch(e){
      setMessages(prev=>[...prev,{role:"assistant",content:"Error connecting to Claude: "+e.message+"\n\nWhen deployed, the AI assistant connects via the server proxy. For local testing, deploy to Vercel first."}]);
    }
    setLoading(false);
    setTimeout(()=>inputRef.current?.focus(),100);
  };

  const renderMarkdown=(text)=>{
    const parts=text.split(/(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\n)/g);
    return parts.map((p,i)=>{
      if(p==="\n")return React.createElement("br",{key:i});
      if(p.startsWith("**")&&p.endsWith("**"))return React.createElement("strong",{key:i,style:{color:T.cream,fontWeight:600}},p.slice(2,-2));
      if(p.startsWith("*")&&p.endsWith("*"))return React.createElement("em",{key:i,style:{color:T.dimH}},p.slice(1,-1));
      if(p.startsWith("`")&&p.endsWith("`"))return React.createElement("code",{key:i,style:{padding:"2px 6px",borderRadius:4,background:"rgba(255,255,255,.08)",fontFamily:T.mono,fontSize:11,color:T.cyan}},p.slice(1,-1));
      return p;
    });
  };

  return<div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 56px)",maxHeight:"calc(100vh - 56px)"}}>
    <div style={{marginBottom:16}}>
      <h1 style={{fontSize:24,fontWeight:600,color:T.cream,letterSpacing:"-0.02em"}}>AI Assistant</h1>
      <p style={{fontSize:13,color:T.dim,marginTop:6,fontFamily:T.serif,fontStyle:"italic"}}>Powered by Claude. Full project context loaded.</p>
    </div>
    <Card style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:0}}>
      <div style={{flex:1,overflow:"auto",padding:20}}>
        {messages.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:14}}>
          <div style={{maxWidth:"80%",padding:"12px 16px",borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:m.role==="user"?`linear-gradient(135deg,rgba(255,234,151,.12),rgba(255,234,151,.06))`:"rgba(255,255,255,.04)",border:`1px solid ${m.role==="user"?"rgba(255,234,151,.15)":T.border}`,fontSize:13,lineHeight:1.6,color:m.role==="user"?T.cream:T.dimH,fontFamily:T.sans}}>
            {m.role==="assistant"&&<div style={{fontSize:9,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Claude</div>}
            <div>{renderMarkdown(m.content)}</div>
          </div>
        </div>)}
        {loading&&<div style={{display:"flex",justifyContent:"flex-start",marginBottom:14}}>
          <div style={{padding:"12px 16px",borderRadius:"14px 14px 14px 4px",background:"rgba(255,255,255,.04)",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:9,fontWeight:600,color:T.cyan,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Claude</div>
            <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.dim,animation:`pulse 1.2s ease-in-out ${i*.2}s infinite`}}/>)}</div>
          </div>
        </div>}
        <div ref={chatEnd}/>
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,alignItems:"center"}}>
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask about budget, timeline, risks, or tell me to add something..." disabled={loading} style={{flex:1,padding:"12px 16px",borderRadius:T.r,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
        <button onClick={send} disabled={loading||!input.trim()} style={{padding:"10px 20px",borderRadius:T.rS,border:"none",background:input.trim()&&!loading?`linear-gradient(135deg,${T.gold},#E8D080)`:"rgba(255,255,255,.05)",color:input.trim()&&!loading?T.brown:"rgba(255,255,255,.2)",fontSize:12,fontWeight:700,cursor:input.trim()&&!loading?"pointer":"default",fontFamily:T.sans,flexShrink:0}}>Send</button>
      </div>
    </Card>
  </div>;
}

export default AIV;
