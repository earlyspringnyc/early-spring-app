import { useState, useEffect, useMemo, useRef } from 'react';
import T from '../../theme/tokens.js';

function DatePick({ value, onChange, label, compact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = useMemo(() => { if (!value) return null; const p = value.split("/"); if (p.length === 3) { const d = new Date(p[2], p[0] - 1, p[1]); return isNaN(d) ? null : d; } return null; }, [value]);
  const [viewMonth, setViewMonth] = useState(() => { if (selected) return { y: selected.getFullYear(), m: selected.getMonth() }; const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const mNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const firstDay = new Date(viewMonth.y, viewMonth.m, 1).getDay();
  const daysInMonth = new Date(viewMonth.y, viewMonth.m + 1, 0).getDate();
  const today = new Date();
  const isToday = (d) => d === today.getDate() && viewMonth.m === today.getMonth() && viewMonth.y === today.getFullYear();
  const isSelected = (d) => selected && d === selected.getDate() && viewMonth.m === selected.getMonth() && viewMonth.y === selected.getFullYear();
  const prev = () => setViewMonth(p => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 });
  const next = () => setViewMonth(p => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 });
  const pick = (d) => { const mm = String(viewMonth.m + 1).padStart(2, "0"); const dd = String(d).padStart(2, "0"); onChange(`${mm}/${dd}/${viewMonth.y}`); setOpen(false); };
  const clear = () => { onChange(""); setOpen(false); };
  const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const displayVal = selected ? `${shortMonths[selected.getMonth()]} ${selected.getDate()}, ${selected.getFullYear()}` : "";
  useEffect(() => { if (!open) return; const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }, [open]);
  useEffect(() => { if (open && selected) setViewMonth({ y: selected.getFullYear(), m: selected.getMonth() }); }, [open]);
  const cells = []; for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) { const sel = isSelected(d); const tdy = isToday(d); cells.push(<div key={d} onClick={e => { e.stopPropagation(); pick(d); }} style={{ width: compact ? 24 : 28, height: compact ? 24 : 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: compact ? 10 : 11, fontWeight: sel ? 700 : tdy ? 600 : 400, cursor: "pointer", background: sel ? T.gold : tdy ? "rgba(255,234,151,.12)" : "transparent", color: sel ? T.brown : tdy ? T.gold : T.cream, transition: "all .1s" }} onMouseEnter={e => { if (!sel) e.currentTarget.style.background = T.surfHov; }} onMouseLeave={e => { if (!sel) e.currentTarget.style.background = tdy ? "rgba(255,234,151,.12)" : "transparent"; }}>{d}</div>); }
  return <div ref={ref} style={{ position: "relative" }}>
    {label && <label style={{ display: "block", fontSize: 9, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: compact ? 4 : 5 }}>{label}</label>}
    <button onClick={() => setOpen(!open)} style={{ width: "100%", padding: compact ? "6px 8px" : "9px 12px", borderRadius: T.rS, background: T.surface, border: `1px solid ${open ? T.borderGlow : T.border}`, color: displayVal ? T.cream : T.dim, fontSize: compact ? 11 : 13, fontFamily: T.sans, outline: "none", cursor: "pointer", textAlign: "left", transition: "border .15s" }}>{displayVal || "Select date"}</button>
    {open && <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 50, background: "rgba(12,10,20,.97)", border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: "0 12px 40px rgba(0,0,0,.5)", padding: compact ? "10px" : "14px", minWidth: compact ? 220 : 260, backdropFilter: "blur(20px)" }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button onClick={prev} style={{ background: "none", border: "none", cursor: "pointer", color: T.dim, fontSize: 14, padding: "2px 6px" }}>&larr;</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.cream }}>{mNames[viewMonth.m]} {viewMonth.y}</span>
        <button onClick={next} style={{ background: "none", border: "none", cursor: "pointer", color: T.dim, fontSize: 14, padding: "2px 6px" }}>&rarr;</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 4 }}>
        {dNames.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: T.dim, padding: "4px 0" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, justifyItems: "center" }}>
        {cells}
      </div>
      {value && <button onClick={clear} style={{ width: "100%", marginTop: 8, padding: "5px 0", background: "none", border: `1px solid ${T.border}`, borderRadius: T.rS, color: T.dim, fontSize: 10, cursor: "pointer", fontFamily: T.sans }}>Clear</button>}
    </div>}
  </div>;
}

export default DatePick;
