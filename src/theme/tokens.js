/* ── Early Spring brand tokens ──
   Two colors. One typeface. Opacity variations only.
   Paper #FFFFFF · Sapphire #0F52BA · faint rule rgba(15,82,186,.18) · faded ink rgba(15,82,186,.42)
   Per Lab guidelines (earlyspring.nyc/lab/guidelines).

   Legacy keys (gold, cream, dim, cyan, magenta, pos, neg, etc.) are kept as
   aliases onto the paper/sapphire palette so existing views inherit the new
   look without requiring a one-shot rewrite. Each view will be re-skinned in
   turn. */

const paper="#FFFFFF";
const ink="#0F52BA";
const inkSoft="rgba(15,82,186,.08)";
const inkSoft2="rgba(15,82,186,.05)";
const inkSoft3="rgba(15,82,186,.03)";
const faintRule="rgba(15,82,186,.18)";
const fadedInk="rgba(15,82,186,.42)";
const ink70="rgba(15,82,186,.70)";
const ink60="rgba(15,82,186,.60)";
const ink25="rgba(15,82,186,.25)";
const alert="#7A1F1F"; // single off-system tone, sapphire-adjacent saturation, used sparingly for destructive/error only
const alertSoft="rgba(122,31,31,.08)";

const earlySpring={
  // Surfaces
  bg:paper,bgGrad:paper,
  surface:inkSoft3,surfEl:inkSoft2,surfHov:inkSoft,
  border:faintRule,borderGlow:"rgba(15,82,186,.32)",
  // Primary accent → ink (replaces "gold" from prior theme)
  gold:ink,goldSoft:inkSoft,goldGlow:"0 0 24px rgba(15,82,186,.10)",
  brown:ink,
  // Collapsed accent palette → all variants of ink
  cyan:ink,magenta:ink,
  // Text
  cream:ink,dim:fadedInk,dimH:ink70,
  // State
  pos:ink,neg:alert,negSoft:alertSoft,blue:ink,
  // Chart series — sapphire opacity ramp + a single off-tone for negative
  colors:[ink,ink70,ink60,fadedInk,ink25,alert,fadedInk,ink60,ink70,ink],
  // Geometry
  r:"14px",rS:"8px",
  shadow:"0 1px 2px rgba(15,82,186,.04),0 8px 32px rgba(15,82,186,.10)",
  // Typeface — TWK Lausanne, one family across roles
  sans:"'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
  mono:"'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
  serif:"'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif",
  // Spacing scale
  sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
  fsXs:10,fsSm:12,fsMd:13,fsLg:16,fsXl:24,fs2xl:32,
  fwNormal:400,fwMedium:600,fwSemibold:600,fwBold:800,
  // Brand primitives — exposed for components that want the raw values
  paper,ink,inkSoft,inkSoft2,inkSoft3,faintRule,fadedInk,ink70,ink60,ink25,alert,alertSoft,
};

const T={...earlySpring};

// Theme toggle is a no-op now — Early Spring is one system. Kept for backward
// compatibility with code that calls setThemeMode/getTheme.
export function setThemeMode(/*mode*/){
  Object.assign(T,earlySpring);
}

export function getTheme(/*mode*/){return earlySpring;}

export default T;
