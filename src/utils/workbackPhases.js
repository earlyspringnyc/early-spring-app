// Shared phase color palette for the workback schedule. Used by the
// table view, the project calendar, and the PDF export so the same
// phase reads in the same color everywhere.
//
// Colors are picked to be readable on a white paper background and
// far enough apart that adjacent phases never collide. RGB tuples
// are exposed alongside the CSS strings so the jsPDF exporter can
// consume them directly.

export const PHASE_PALETTE = [
  { fg: '#0F52BA', bg: 'rgba(15,82,186,.12)',  rgb: [15, 82, 186],  bgRgb: [231, 238, 250] },
  { fg: '#A56F00', bg: 'rgba(240,184,73,.22)', rgb: [165, 111, 0],  bgRgb: [253, 243, 220] },
  { fg: '#14948C', bg: 'rgba(20,148,140,.15)', rgb: [20, 148, 140], bgRgb: [225, 244, 242] },
  { fg: '#C0476C', bg: 'rgba(192,71,108,.15)', rgb: [192, 71, 108], bgRgb: [248, 230, 236] },
  { fg: '#367B43', bg: 'rgba(54,123,67,.15)',  rgb: [54, 123, 67],  bgRgb: [227, 240, 230] },
  { fg: '#6C4794', bg: 'rgba(108,71,148,.18)', rgb: [108, 71, 148], bgRgb: [238, 231, 244] },
  { fg: '#7A1F1F', bg: 'rgba(122,31,31,.12)',  rgb: [122, 31, 31],  bgRgb: [243, 226, 226] },
];

export const NEUTRAL = {
  fg: '#6B7480', bg: 'rgba(15,82,186,.05)', rgb: [107, 116, 128], bgRgb: [245, 247, 250],
};

// Build a stable name→color map based on first-appearance order so a
// phase keeps the same color even when rows are reordered, and so two
// phases that appear back-to-back never collide.
export function buildPhaseColorMap(items) {
  const map = new Map();
  let idx = 0;
  (items || []).forEach(r => {
    const phase = (r && r.phase) ? r.phase : '';
    if (!phase || map.has(phase)) return;
    map.set(phase, PHASE_PALETTE[idx % PHASE_PALETTE.length]);
    idx++;
  });
  return map;
}

export function phaseColor(phaseName, colorMap) {
  if (!phaseName) return NEUTRAL;
  return colorMap?.get(phaseName) || NEUTRAL;
}
