import { useState, useMemo } from 'react';
import T from '../../theme/tokens.js';
import { mkVendor } from '../../data/factories.js';
import { uid } from '../../utils/uid.js';
import { VENDOR_TYPES, VENDOR_TYPE_LABELS } from '../../constants/index.js';

function AddVendorModal({onAdd,onClose}){
  const[name,setName]=useState("");
  const[contact,setContact]=useState("");
  const[email,setEmail]=useState("");
  const[phone,setPhone]=useState("");
  const[type,setType]=useState("other");
  const[notes,setNotes]=useState("");
  const submit=()=>{if(!name.trim())return;const v=mkVendor(name.trim(),email,phone,notes,"pending",type,contact);onAdd(v);onClose()};
  const Label=({children})=><div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{children}</div>;
  const inputStyle={width:"100%",padding:"8px 10px",borderRadius:T.rS,background:T.surface,border:`1px solid ${T.border}`,color:T.cream,fontSize:12,fontFamily:T.sans,outline:"none"};
  return<div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={onClose}>
    <div className="slide-in" onClick={e=>e.stopPropagation()} style={{width:480,maxWidth:"90vw",padding:"28px 32px",borderRadius:T.r,background:T.bg,border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h3 style={{fontSize:16,fontWeight:700,color:T.cream}}>Add Vendor</h3>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.dim,fontSize:18,cursor:"pointer",padding:4}}>×</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div><Label>Vendor Name</Label><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="ABC Productions" onKeyDown={e=>e.key==="Enter"&&submit()} style={inputStyle}/></div>
        <div><Label>Vendor Type</Label><select value={type} onChange={e=>setType(e.target.value)} style={{...inputStyle,appearance:"none",WebkitAppearance:"none",cursor:"pointer"}}>{VENDOR_TYPES.map(t=><option key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</option>)}</select></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div><Label>Contact Name</Label><input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Jane Smith" onKeyDown={e=>e.key==="Enter"&&submit()} style={inputStyle}/></div>
        <div><Label>Email</Label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="vendor@co.com" onKeyDown={e=>e.key==="Enter"&&submit()} style={inputStyle}/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div><Label>Phone</Label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(555) 000-0000" onKeyDown={e=>e.key==="Enter"&&submit()} style={inputStyle}/></div>
        <div><Label>Notes</Label><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional" onKeyDown={e=>e.key==="Enter"&&submit()} style={inputStyle}/></div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={submit} disabled={!name.trim()} style={{padding:"9px 20px",borderRadius:T.rS,background:name.trim()?T.goldSoft:T.inkSoft2,color:name.trim()?T.gold:T.fadedInk,border:`1px solid ${name.trim()?T.borderGlow:"transparent"}`,fontSize:11,fontWeight:700,cursor:name.trim()?"pointer":"default",fontFamily:T.sans}}>Add Vendor</button>
        <button onClick={onClose} style={{padding:"9px 14px",borderRadius:T.rS,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
      </div>
    </div>
  </div>;
}

function VendorSelect({ value, onChange, vendors, vendorPool, onAddVendor, disabled, compact }) {
  const [showModal, setShowModal] = useState(false);

  // De-dupe the pool against the current project's vendors so we don't
  // suggest the same vendor twice. Match case-insensitively on name
  // since IDs are project-scoped and won't line up.
  const filteredPool = useMemo(() => {
    if (!Array.isArray(vendorPool) || vendorPool.length === 0) return [];
    const seen = new Set((vendors || []).map(v => (v?.name || '').trim().toLowerCase()).filter(Boolean));
    const out = [];
    const taken = new Set(seen);
    vendorPool.forEach(v => {
      const key = (v?.name || '').trim().toLowerCase();
      if (!key || taken.has(key)) return;
      taken.add(key);
      out.push(v);
    });
    return out;
  }, [vendorPool, vendors]);

  const handleAdd = (v) => { onAddVendor(v); onChange(v.id); setShowModal(false); };

  const handleAddFromPool = (poolVendor) => {
    if (!poolVendor) return;
    // Fresh id + strip project-scoped attachments (W9s, POs, COIs) — the
    // vendor record itself carries over but the documents belong to the
    // project where they were uploaded.
    const { id: _ignored, documents: _docs, ...rest } = poolVendor;
    const copy = { ...rest, id: uid() };
    onAddVendor(copy);
    onChange(copy.id);
  };

  return <>
    <select
      value={value || ""}
      onChange={e => {
        const v = e.target.value;
        if (v === "__add__") setShowModal(true);
        else if (v.startsWith("__pool__:")) {
          const idx = parseInt(v.slice("__pool__:".length), 10);
          handleAddFromPool(filteredPool[idx]);
        }
        else onChange(v);
      }}
      disabled={disabled}
      style={{ width: "100%", padding: compact ? "6px 4px" : "9px 8px", borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: value ? T.cream : T.dim, fontSize: compact ? 11 : 13, fontFamily: T.sans, outline: "none", cursor: disabled ? "default" : "pointer", appearance: "none", WebkitAppearance: "none" }}
    >
      <option value="">No vendor</option>
      {(vendors || []).length > 0 && (
        <optgroup label="This project">
          {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </optgroup>
      )}
      {filteredPool.length > 0 && (
        <optgroup label="From your other projects · click to add">
          {filteredPool.map((v, idx) => (
            <option key={`pool_${idx}_${v.name}`} value={`__pool__:${idx}`}>
              {v.name}{v.contactName ? ` — ${v.contactName}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {!disabled && <option value="__add__">+ Add new vendor…</option>}
    </select>
    {showModal && <AddVendorModal onAdd={handleAdd} onClose={() => setShowModal(false)} />}
  </>;
}

export default VendorSelect;
