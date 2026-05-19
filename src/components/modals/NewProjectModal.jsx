import { useState, useEffect, useRef } from 'react';
import T from '../../theme/tokens.js';
import { PlusI } from '../icons/index.js';
import { DatePick } from '../primitives/index.js';
import { PROJECT_STAGES, STAGE_LABELS, STAGE_COLORS } from '../../constants/index.js';
import { listContacts } from '../../lib/contacts.js';
import { normalizeCompany } from '../../utils/companyDedup.js';

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
        <div><label style={lStyle}>Client</label><ClientPickerInline value={client} onChange={setClient} onSubmit={submit} fStyle={fStyle}/></div>
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

// Inline typeahead client picker. Same UX as SetV's ClientPicker
// — fetches distinct CRM company names, filters as you type. Free
// text still allowed so you can create a project for a brand-new
// client.
function ClientPickerInline({ value, onChange, onSubmit, fStyle }) {
  const [focused, setFocused] = useState(false);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listContacts({ limit: 1000 })
      .then(rows => {
        const byNorm = new Map();
        for (const c of (rows || [])) {
          const raw = (c.company || '').trim();
          if (!raw) continue;
          const norm = normalizeCompany(raw);
          if (!norm) continue;
          const prev = byNorm.get(norm) || { canonical: raw, count: 0, variants: new Map() };
          prev.count++;
          prev.variants.set(raw, (prev.variants.get(raw) || 0) + 1);
          let best = raw, bestN = 0;
          for (const [v, n] of prev.variants) { if (n > bestN) { best = v; bestN = n; } }
          prev.canonical = best;
          byNorm.set(norm, prev);
        }
        if (!cancelled) {
          setCompanies([...byNorm.entries()]
            .map(([norm, v]) => ({ name: v.canonical, count: v.count, normalized: norm }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const q = (value || '').trim().toLowerCase();
  const matches = q
    ? companies.filter(c => c.name.toLowerCase().includes(q) || c.normalized.includes(q)).slice(0, 8)
    : companies.slice(0, 8);
  const exact = q && matches.some(m => m.name.toLowerCase() === q);
  const showDropdown = focused && (matches.length > 0 || (q && !exact));

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={e => e.key === 'Enter' && onSubmit && onSubmit()}
        placeholder="SeedAI"
        autoComplete="off"
        style={fStyle}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rS,
          boxShadow: T.shadow, maxHeight: 240, overflow: 'auto', fontFamily: T.sans,
        }}>
          {matches.map(m => (
            <button
              key={m.normalized} type="button"
              onMouseDown={e => { e.preventDefault(); onChange(m.name); setFocused(false); }}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                width: '100%', padding: '8px 14px', background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left', fontFamily: T.sans, color: T.cream, fontSize: 13,
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ fontSize: 10, color: T.dim, whiteSpace: 'nowrap' }}>{m.count} contact{m.count === 1 ? '' : 's'}</span>
            </button>
          ))}
          {q && !exact && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setFocused(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 14px', background: 'transparent', border: 'none',
                borderTop: matches.length ? `1px solid ${T.border}` : 'none',
                cursor: 'pointer', textAlign: 'left', fontFamily: T.sans, color: T.dim, fontSize: 12,
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span>+ Use "<b style={{ color: T.cream }}>{value}</b>" as a new client</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default NewProjectModal;
