import T from '../../theme/tokens.js';

function BarChart({ data, height = 220 }) {
  const max = Math.max(...data.map(d => Math.max(d.actual || 0, d.client || 0)), 1);
  return <div style={{ height, display: "flex", alignItems: "flex-end", gap: 6, padding: "0 4px" }}>
    {data.map((d, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", width: "100%", justifyContent: "center", height: height - 30 }}>
        <div style={{ width: "35%", background: T.dim, borderRadius: "3px 3px 0 0", height: `${(d.actual / max) * 100}%`, minHeight: d.actual > 0 ? 2 : 0, transition: "height .4s ease" }} />
        <div style={{ width: "35%", background: T.gold, borderRadius: "3px 3px 0 0", height: `${(d.client / max) * 100}%`, minHeight: d.client > 0 ? 2 : 0, transition: "height .4s ease", boxShadow: "0 0 8px rgba(255,234,151,.15)" }} />
      </div>
      <span style={{ fontSize: 9, color: T.dim, textAlign: "center", lineHeight: 1.1, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
    </div>)}
  </div>;
}

export default BarChart;
