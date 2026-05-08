import { useState, useRef } from 'react';
import T from '../../theme/tokens.js';
import { PlusI } from '../icons/index.js';
import { DatePick } from '../primitives/index.js';
import { PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS } from '../../constants/index.js';

function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState(""); const [client, setClient] = useState(""); const [date, setDate] = useState(""); const [eventDate, setEventDate] = useState(""); const [logo, setLogo] = useState(""); const [budget, setBudget] = useState(""); const [stage, setStage] = useState("pitching");
  const fileRef = useRef(null);
  const handleLogo = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => setLogo(ev.target.result); reader.readAsDataURL(file); };
  const submit = () => { if (!name.trim()) return; onCreate(name.trim(), client.trim(), date, eventDate, logo, parseFloat(budget) || 0, stage); onClose(); };
  const fStyle = { width: "100%", padding: "11px 14px", borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: T.cream, fontSize: 13, fontFamily: T.sans, outline: "none" };
  const lStyle = { display: "block", fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 };
  return <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,82,186,.18)", backdropFilter: "blur(8px)" }}>
    <div className="slide-in modal-inner" style={{ width: 440, padding: 36, borderRadius: T.r, background: T.bg, border: `1px solid ${T.border}`, boxShadow: "0 24px 80px rgba(15,82,186,.14)", maxHeight: "90vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 600, color: T.cream }}>New Project</h2><button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: T.dim, fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>×</button></div>
      <div style={{ marginBottom: 16 }}><label style={lStyle}>Project Name</label><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="SeedAI House SXSW 2026" onKeyDown={e => e.key === "Enter" && submit()} style={fStyle} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 16 }}>
        <div><label style={lStyle}>Client</label><input value={client} onChange={e => setClient(e.target.value)} placeholder="SeedAI" onKeyDown={e => e.key === "Enter" && submit()} style={fStyle} /></div>
        <div><label style={lStyle}>Client Budget</label><input value={budget} onChange={e => setBudget(e.target.value)} placeholder="$50,000" onKeyDown={e => e.key === "Enter" && submit()} style={{ ...fStyle, fontFamily: T.mono }} /></div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Client Logo</label>
        <input ref={fileRef} type="file" accept="image/*,.svg" onChange={handleLogo} style={{ display: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {logo ? <div style={{ width: 48, height: 48, borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}><img src={logo} style={{ maxWidth: 44, maxHeight: 44, objectFit: "contain" }} /></div>
            : <div onClick={() => fileRef.current.click()} style={{ width: 48, height: 48, borderRadius: T.rS, background: T.surface, border: `2px dashed ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><PlusI size={16} color={T.dim} /></div>}
          <div style={{ flex: 1 }}>
            <button onClick={() => fileRef.current.click()} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: T.rS, padding: "8px 14px", color: T.cream, fontSize: 12, cursor: "pointer", fontFamily: T.sans }}>{logo ? "Replace" : "Upload logo"}</button>
            {logo && <button onClick={() => setLogo("")} style={{ background: "none", border: "none", color: T.neg, fontSize: 11, cursor: "pointer", marginLeft: 8 }}>Remove</button>}
          </div>
        </div>
        <p style={{ fontSize: 10, color: T.dim, marginTop: 6 }}>PNG, SVG, or JPG. Appears on project cards and client exports.</p>
      </div>
      <div style={{marginBottom:16}}><label style={lStyle}>Project Stage</label>
        <div style={{display:"flex",gap:4}}>{PROJECT_STAGES.map(s=><button key={s} onClick={()=>setStage(s)} style={{flex:1,padding:"9px 0",borderRadius:T.rS,border:"none",cursor:"pointer",fontSize:11,fontWeight:stage===s?700:400,fontFamily:T.sans,background:stage===s?`${STAGE_COLORS[s]}18`:"transparent",color:stage===s?STAGE_COLORS[s]:T.dim,transition:"all .15s"}}>{STAGE_LABELS[s]}</button>)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}><DatePick label="Start Date" value={date} onChange={setDate} /><DatePick label="Event Date" value={eventDate} onChange={setEventDate} /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} className="btn-rect" style={{ flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={!name.trim()} className="btn-rect btn-rect-solid" style={{ flex: 1, opacity: name.trim() ? 1 : 0.4, cursor: name.trim() ? "pointer" : "default" }}>Create Project</button>
      </div>
    </div>
  </div>;
}

export default NewProjectModal;
