import T from '../../theme/tokens.js';
import { f0 } from '../../utils/format.js';

function SB({ label, actual, client, variance, v = "d" }) {
  const isP = v === "p", isG = v === "g";
  return <div style={{ display: "flex", alignItems: "center", padding: isP ? "20px 24px" : "13px 18px", borderRadius: T.rS, marginTop: isG || isP ? 8 : 0,
    background: isP ? T.brown : isG ? `linear-gradient(135deg,${T.brown},rgba(67,45,28,.7))` : T.surfEl,
    border: isP ? "1px solid rgba(255,234,151,.12)" : isG ? "none" : `1px solid ${T.border}`,
    boxShadow: isP ? "0 0 60px rgba(255,234,151,.05)" : "none" }}>
    <span style={{ flex: 1, fontSize: isP ? 12 : 11, fontWeight: 700, letterSpacing: ".1em", color: isP ? T.gold : T.cream, textTransform: "uppercase", fontFamily: T.sans }}>{label}</span>
    {actual !== undefined && <span className="num" style={{ width: 96, textAlign: "right", fontSize: 13, fontFamily: T.mono, color: isP ? T.gold : T.cream, fontWeight: 500 }}>{f0(actual)}</span>}
    {client !== undefined && <span className="num" style={{ width: 96, textAlign: "right", fontSize: isP ? 20 : 13, fontFamily: T.mono, color: T.gold, fontWeight: isP ? 700 : 600, marginLeft: 8 }}>{f0(client)}</span>}
    {variance !== undefined && !isP && <span className="num" style={{ width: 96, textAlign: "right", fontSize: 13, fontFamily: T.mono, color: T.pos, fontWeight: 500, marginLeft: 8 }}>{f0(variance)}</span>}
  </div>;
}

export default SB;
