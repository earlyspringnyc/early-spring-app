import { useState } from 'react';
import T from '../../theme/tokens.js';
import { mkVendor } from '../../data/factories.js';

function VendorSelect({ value, onChange, vendors, onAddVendor, disabled, compact }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const quickAdd = () => { if (!newName.trim()) return; const v = mkVendor(newName.trim()); onAddVendor(v); onChange(v.id); setNewName(""); setAdding(false); };
  if (adding) return <div style={{ display: "flex", gap: 4 }}>
    <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Vendor name" onKeyDown={e => { if (e.key === "Enter") quickAdd(); if (e.key === "Escape") setAdding(false); }} style={{ flex: 1, padding: compact ? "5px 8px" : "8px 10px", borderRadius: T.rS, background: T.surface, border: `1px solid ${T.cyan}`, color: T.cream, fontSize: compact ? 11 : 12, fontFamily: T.sans, outline: "none" }} />
    <button onClick={quickAdd} style={{ padding: compact ? "5px 8px" : "8px 12px", borderRadius: T.rS, border: "none", background: T.cyan, color: "#000", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Add</button>
    <button onClick={() => setAdding(false)} style={{ padding: compact ? "5px 6px" : "8px 8px", borderRadius: T.rS, border: `1px solid ${T.border}`, background: "transparent", color: T.dim, fontSize: 10, cursor: "pointer" }}>×</button>
  </div>;
  return <select value={value || ""} onChange={e => { if (e.target.value === "__add__") setAdding(true); else onChange(e.target.value); }} disabled={disabled} style={{ width: "100%", padding: compact ? "6px 4px" : "9px 8px", borderRadius: T.rS, background: T.surface, border: `1px solid ${T.border}`, color: value ? T.cream : T.dim, fontSize: compact ? 11 : 13, fontFamily: T.sans, outline: "none", cursor: disabled ? "default" : "pointer", appearance: "none", WebkitAppearance: "none" }}>
    <option value="">No vendor</option>
    {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    {!disabled && <option value="__add__">+ Add vendor…</option>}
  </select>;
}

export default VendorSelect;
