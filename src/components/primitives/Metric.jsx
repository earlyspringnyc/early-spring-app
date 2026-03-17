import T from '../../theme/tokens.js';
import Card from './Card.jsx';

function Metric({ label, value, color = T.cream, sub, glow }) {
  return <Card style={{ padding: "20px 24px" }} glow={glow}>
    <div style={{ fontSize: 10, fontWeight: 500, color: T.dim, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 14, fontFamily: T.mono }}>{label}</div>
    <div className="num" style={{ fontSize: 32, fontWeight: 600, color, fontFamily: T.mono, lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.dim, marginTop: 12 }}>{sub}</div>}
  </Card>;
}

export default Metric;
