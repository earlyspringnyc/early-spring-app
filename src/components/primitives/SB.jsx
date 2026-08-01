import T from '../../theme/tokens.js';
import { f0 } from '../../utils/format.js';
import { fmtRange } from '../../utils/calc.js';

// Subtotal band. Hierarchy: client (bold ink) > label (uppercase ink) >
// actual (faded) > variance (alert if negative, ink70 otherwise).
// When `clientMin`/`clientMax` are passed and differ, the client cell
// renders as a band and variance is hidden (meaningless against a range).
function SB({ label, actual, client, variance, clientMin, clientMax, v = "d" }) {
  const isP = v === "p", isG = v === "g";
  const negative = (variance || 0) < 0;
  const isRange = typeof clientMin === 'number' && typeof clientMax === 'number' && Math.abs(clientMax - clientMin) >= 0.5;
  return <div style={{ display: "flex", alignItems: "center", padding: isP ? "20px 24px" : "13px 18px", borderRadius: T.rS, marginTop: isG || isP ? 8 : 0,
    background: isP ? T.inkSoft2 : isG ? T.inkSoft3 : T.paper,
    border: `1px solid ${T.faintRule}`,
    borderTop: isP || isG ? `2px solid ${T.ink}` : `1px solid ${T.faintRule}`,
  }}>
    <span style={{ flex: 1, fontSize: isP ? 12 : 11, fontWeight: 700, letterSpacing: ".10em", color: T.ink, textTransform: "uppercase", fontFamily: T.sans }}>{label}</span>
    {actual !== undefined && <span className="num" style={{ width: 96, textAlign: "right", fontSize: 13, fontFamily: T.mono, color: T.fadedInk, fontWeight: 600 }}>{f0(actual)}</span>}
    {(isRange || client !== undefined) && <span className="num" style={{ width: isRange ? 200 : 96, textAlign: "right", fontSize: isP ? (isRange ? 16 : 20) : 13, fontFamily: T.mono, color: T.ink, fontWeight: isP ? 800 : 700, marginLeft: 8, letterSpacing: isP ? "-0.018em" : "normal" }}>{isRange ? fmtRange(clientMin, clientMax, f0) : f0(client)}</span>}
    {!isRange && variance !== undefined && !isP && <span className="num" style={{ width: 96, textAlign: "right", fontSize: 13, fontFamily: T.mono, color: negative ? T.alert : T.ink70, fontWeight: 600, marginLeft: 8 }}>{f0(variance)}</span>}
  </div>;
}

export default SB;
