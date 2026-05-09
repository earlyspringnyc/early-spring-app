import T from '../../theme/tokens.js';
import { f0 } from '../../utils/format.js';

// Subtotal band. Hierarchy: client (bold ink) > label (uppercase ink) >
// actual (faded) > variance (alert if negative, ink70 otherwise).
function SB({ label, actual, client, variance, v = "d" }) {
  const isP = v === "p", isG = v === "g";
  const negative = (variance || 0) < 0;
  return <div style={{ display: "flex", alignItems: "center", padding: isP ? "20px 24px" : "13px 18px", borderRadius: T.rS, marginTop: isG || isP ? 8 : 0,
    background: isP ? T.inkSoft2 : isG ? T.inkSoft3 : T.paper,
    border: `1px solid ${T.faintRule}`,
    borderTop: isP || isG ? `2px solid ${T.ink}` : `1px solid ${T.faintRule}`,
  }}>
    <span style={{ flex: 1, fontSize: isP ? 12 : 11, fontWeight: 700, letterSpacing: ".10em", color: T.ink, textTransform: "uppercase", fontFamily: T.sans }}>{label}</span>
    {actual !== undefined && <span className="num" style={{ width: 96, textAlign: "right", fontSize: 13, fontFamily: T.mono, color: T.fadedInk, fontWeight: 600 }}>{f0(actual)}</span>}
    {client !== undefined && <span className="num" style={{ width: 96, textAlign: "right", fontSize: isP ? 20 : 13, fontFamily: T.mono, color: T.ink, fontWeight: isP ? 800 : 700, marginLeft: 8, letterSpacing: isP ? "-0.018em" : "normal" }}>{f0(client)}</span>}
    {variance !== undefined && !isP && <span className="num" style={{ width: 96, textAlign: "right", fontSize: 13, fontFamily: T.mono, color: negative ? T.alert : T.ink70, fontWeight: 600, marginLeft: 8 }}>{f0(variance)}</span>}
  </div>;
}

export default SB;
