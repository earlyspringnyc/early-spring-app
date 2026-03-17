import { useState, useEffect, useRef } from 'react';
import T from '../../theme/tokens.js';
import { f$, fp } from '../../utils/format.js';

function NI({ value, onChange, fmt = "$", disabled }) {
  const [ed, setEd] = useState(false);
  const [tmp, setTmp] = useState("");
  const ref = useRef(null);
  const start = () => { if (disabled) return; setEd(true); setTmp(value === 0 ? "" : String(value)); };
  const commit = () => { setEd(false); const p = parseFloat(tmp.replace(/[^0-9.\-]/g, "")); onChange(isNaN(p) ? 0 : p); };
  useEffect(() => { if (ed && ref.current) ref.current.select(); }, [ed]);
  if (ed) return <input ref={ref} autoFocus value={tmp} onChange={e => setTmp(e.target.value)} onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()} style={{ background: "transparent", border: "none", borderBottom: `1.5px solid ${T.cyan}`, outline: "none", color: T.cream, textAlign: "right", width: "100%", padding: "2px 0", fontSize: 13, fontFamily: T.mono }} />;
  return <button onClick={start} disabled={disabled} style={{ background: "transparent", border: "none", color: value === 0 ? T.dim : T.cream, textAlign: "right", width: "100%", padding: "3px 0", fontSize: 13, fontFamily: T.mono, cursor: disabled ? "default" : "pointer", borderRadius: 4, opacity: disabled ? .5 : 1 }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = T.surfHov; }} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{fmt === "%" ? fp(value) : fmt === "" ? value : f$(value)}</button>;
}

export default NI;
