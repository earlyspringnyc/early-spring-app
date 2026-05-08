import { useState } from 'react';
import T from '../../theme/tokens.js';

function AddSectionModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const submit = () => { if (!name.trim()) return; onAdd(name.trim()); onClose(); };
  return <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,82,186,.18)", backdropFilter: "blur(8px)" }}>
    <div className="slide-in modal-inner" style={{ width: 400, padding: 32, borderRadius: T.r, background: T.bg, border: `1px solid ${T.border}`, boxShadow: "0 24px 80px rgba(15,82,186,.14)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h2 style={{ fontSize: 18, fontWeight: 600, color: T.cream }}>New Budget Section</h2><button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: T.dim, fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>×</button></div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Section Name</label>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Entertainment, Decor, Technology" onKeyDown={e => e.key === "Enter" && submit()} style={{ width: "100%", padding: "11px 14px", borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: T.cream, fontSize: 14, fontFamily: T.sans, outline: "none", marginBottom: 16 }} />
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: T.rS, border: `1px solid ${T.border}`, background: "transparent", color: T.dim, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>Cancel</button>
        <button onClick={submit} style={{ flex: 1, padding: 11, borderRadius: T.rS, border: "none", background: name.trim() ? `linear-gradient(135deg,${T.gold},#E8D080)` : "rgba(15,82,186,.05)", color: name.trim() ? T.brown : "rgba(15,82,186,.42)", fontSize: 13, fontWeight: 700, cursor: name.trim() ? "pointer" : "default", fontFamily: T.sans }}>Add Section</button>
      </div>
    </div>
  </div>;
}

export default AddSectionModal;
