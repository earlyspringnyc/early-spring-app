/* ── Early Spring brand tokens ──
   Two colors. One typeface. Opacity variations only.
   Light mode: paper (#FFFFFF) canvas, sapphire (#0F52BA) ink.
   Dark mode: sapphire canvas, paper ink — paper-based opacity ramp.
   Per Lab guidelines (earlyspring.nyc/lab/guidelines).

   Legacy keys (gold, cream, dim, cyan, magenta, pos, neg, etc.) are
   kept as aliases that flip with the theme so existing inline styles
   inherit the correct palette automatically. */

const SAPPHIRE = "#0F52BA";
const PAPER = "#FFFFFF";

const buildLight = () => {
  const ink = SAPPHIRE;
  const paper = PAPER;
  const inkSoft = "rgba(15,82,186,.08)";
  const inkSoft2 = "rgba(15,82,186,.05)";
  const inkSoft3 = "rgba(15,82,186,.03)";
  const faintRule = "rgba(15,82,186,.18)";
  const fadedInk = "rgba(15,82,186,.42)";
  const ink80 = "rgba(15,82,186,.80)";
  const ink70 = "rgba(15,82,186,.70)";
  const ink60 = "rgba(15,82,186,.60)";
  const ink40 = "rgba(15,82,186,.40)";
  const ink25 = "rgba(15,82,186,.25)";
  const ink20 = "rgba(15,82,186,.20)";
  const alert = "#7A1F1F";
  const alertSoft = "rgba(122,31,31,.10)";
  return {
    mode: "light",
    paper, ink,
    bg: paper, bgGrad: paper,
    surface: inkSoft3, surfEl: inkSoft2, surfHov: inkSoft,
    border: faintRule, borderGlow: "rgba(15,82,186,.32)",
    inkSoft, inkSoft2, inkSoft3, faintRule, fadedInk, ink80, ink70, ink60, ink40, ink25, ink20,
    alert, alertSoft,
    gold: ink, goldSoft: inkSoft, goldGlow: "0 0 24px rgba(15,82,186,.10)",
    brown: ink,
    cyan: ink, magenta: ink,
    cream: ink, dim: fadedInk, dimH: ink70,
    pos: ink, neg: alert, negSoft: alertSoft, blue: ink,
    colors: [ink, ink80, ink60, ink40, ink20, ink70, fadedInk, ink25, ink, ink80],
    r: "14px", rS: "8px",
    shadow: "0 1px 2px rgba(15,82,186,.04),0 8px 32px rgba(15,82,186,.10)",
    sans: "'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
    mono: "'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
    serif: "'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
    sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
    fsXs:10,fsSm:12,fsMd:13,fsLg:16,fsXl:24,fs2xl:32,
    fwNormal:400,fwMedium:600,fwSemibold:600,fwBold:800,
  };
};

const buildDark = () => {
  // Canvas is sapphire; "ink" is paper. We keep the same key names so
  // existing components don't have to know which mode they're in —
  // T.paper is whatever the canvas is, T.ink is whatever the text is.
  const ink = PAPER;        // text + accent on sapphire
  const paper = SAPPHIRE;   // canvas
  const inkSoft = "rgba(255,255,255,.12)";
  const inkSoft2 = "rgba(255,255,255,.07)";
  const inkSoft3 = "rgba(255,255,255,.04)";
  const faintRule = "rgba(255,255,255,.22)";
  const fadedInk = "rgba(255,255,255,.55)";
  const ink80 = "rgba(255,255,255,.80)";
  const ink70 = "rgba(255,255,255,.70)";
  const ink60 = "rgba(255,255,255,.60)";
  const ink40 = "rgba(255,255,255,.42)";
  const ink25 = "rgba(255,255,255,.28)";
  const ink20 = "rgba(255,255,255,.20)";
  const alert = "#FFB3B3";  // pale rose reads on sapphire
  const alertSoft = "rgba(255,179,179,.18)";
  return {
    mode: "dark",
    paper, ink,
    bg: paper, bgGrad: paper,
    surface: inkSoft3, surfEl: inkSoft2, surfHov: inkSoft,
    border: faintRule, borderGlow: "rgba(255,255,255,.42)",
    inkSoft, inkSoft2, inkSoft3, faintRule, fadedInk, ink80, ink70, ink60, ink40, ink25, ink20,
    alert, alertSoft,
    gold: ink, goldSoft: inkSoft, goldGlow: "0 0 24px rgba(255,255,255,.20)",
    brown: ink,
    cyan: ink, magenta: ink,
    cream: ink, dim: fadedInk, dimH: ink70,
    pos: ink, neg: alert, negSoft: alertSoft, blue: ink,
    colors: [ink, ink80, ink60, ink40, ink20, ink70, fadedInk, ink25, ink, ink80],
    r: "14px", rS: "8px",
    shadow: "0 1px 2px rgba(0,0,0,.20),0 8px 32px rgba(0,0,0,.32)",
    sans: "'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
    mono: "'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
    serif: "'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
    sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
    fsXs:10,fsSm:12,fsMd:13,fsLg:16,fsXl:24,fs2xl:32,
    fwNormal:400,fwMedium:600,fwSemibold:600,fwBold:800,
  };
};

// Read initial mode from localStorage so the very first render uses the
// correct palette (avoids a paint flash).
const initialMode = (() => {
  try {
    const stored = localStorage.getItem("es_theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch (e) {}
  return "light";
})();

const T = initialMode === "dark" ? buildDark() : buildLight();

export function setThemeMode(mode) {
  const next = mode === "dark" ? buildDark() : buildLight();
  Object.assign(T, next);
  try { localStorage.setItem("es_theme", T.mode); } catch (e) {}
  if (typeof document !== "undefined") {
    document.body.classList.toggle("theme-dark", T.mode === "dark");
    document.body.classList.toggle("theme-light", T.mode === "light");
  }
}

export function getTheme(mode) {
  return mode === "dark" ? buildDark() : buildLight();
}

// Apply class on module load too (covers SSR-less mounts).
if (typeof document !== "undefined") {
  document.body?.classList.toggle("theme-dark", T.mode === "dark");
  document.body?.classList.toggle("theme-light", T.mode === "light");
}

export default T;
