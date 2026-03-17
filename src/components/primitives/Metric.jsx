import T from '../../theme/tokens.js';
import Card from './Card.jsx';

function Metric({ label, value, color = T.cream, sub, glow }) {
  return <Card style={{ padding: "24px 24px" }} glow={glow}>
    <div style={{ fontSize: 9, fontWeight: 600, color: T.dim, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12, fontFamily: T.sans }}>{label}</div>
    <div className="num" style={{ fontSize: 28, fontWeight: 700, color, fontFamily: T.mono, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.dim, marginTop: 12, fontFamily: T.serif, fontStyle: "italic" }}>{sub}</div>}
  </Card>;
}

export default Metric;
