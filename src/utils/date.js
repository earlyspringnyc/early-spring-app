export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseD(s) {
  if (!s) return null;
  const p = s.split("/");
  if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function fmtShort(d) {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[d.getMonth()]} ${d.getDate()}`;
}

export function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
