import T from '../../theme/tokens.js';

function DonutChart({ data, size = 160, thickness = 22 }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: T.surfEl, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 11, color: T.dim }}>No data</span></div>;
  let acc = 0; const segs = data.map((d, i) => { const pct = (d.value / total) * 100; const start = acc; acc += pct; return `${d.color || T.colors[i % T.colors.length]} ${start}% ${acc}%`; });
  return <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${segs.join(",")})`, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: size - thickness * 2, height: size - thickness * 2, borderRadius: "50%", background: T.surfEl }} /></div>;
}

export default DonutChart;
