import T from '../../theme/tokens.js';

// Two-series bar chart. Per Lab guidelines: same hue at different
// opacities is hard to distinguish at small sizes, so the "actual"
// bar is outlined sapphire and the "client" bar is solid sapphire.
function BarChart({ data, height = 220 }) {
  const max = Math.max(...data.map(d => Math.max(d.actual || 0, d.client || 0)), 1);
  return <div style={{ height, display: "flex", alignItems: "flex-end", gap: 6, padding: "0 4px" }}>
    {data.map((d, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", width: "100%", justifyContent: "center", height: height - 30 }}>
        <div style={{ width: "35%", background: "transparent", border: `1px solid ${T.ink}`, borderBottom: "none", borderRadius: "3px 3px 0 0", height: `${(d.actual / max) * 100}%`, minHeight: d.actual > 0 ? 2 : 0, transition: "height .4s cubic-bezier(.2,.8,.2,1)" }} />
        <div style={{ width: "35%", background: T.ink, borderRadius: "3px 3px 0 0", height: `${(d.client / max) * 100}%`, minHeight: d.client > 0 ? 2 : 0, transition: "height .4s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
      <span style={{ fontSize: 10, color: T.fadedInk, textAlign: "center", lineHeight: 1.1, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
    </div>)}
  </div>;
}

export default BarChart;
