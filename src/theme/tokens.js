const dark={
  // Warm zinc — not pure black, slightly warm
  bg:"#0C0C0E",bgGrad:"linear-gradient(180deg,#0C0C0E 0%,#0D0D10 100%)",
  surface:"rgba(255,255,255,.025)",surfEl:"rgba(255,255,255,.04)",surfHov:"rgba(255,255,255,.07)",
  border:"rgba(255,255,255,.06)",borderGlow:"rgba(245,208,97,.18)",
  // Warm amber instead of harsh gold
  gold:"#F5D061",goldSoft:"rgba(245,208,97,.07)",goldGlow:"0 0 24px rgba(245,208,97,.05)",
  brown:"#3D2B1A",
  // Desaturated accents
  cyan:"#7DD3FC",magenta:"#C4B5FD",
  cream:"#F4F4F5",dim:"rgba(244,244,245,.4)",dimH:"rgba(244,244,245,.65)",
  pos:"#86EFAC",neg:"#FCA5A5",blue:"#93C5FD",
  colors:["#F5D061","#86EFAC","#7DD3FC","#C4B5FD","#FCA5A5","#FDBA74","#93C5FD","#BEF264","#FCD34D","#D8B4FE"],
  r:"14px",rS:"8px",
  shadow:"0 1px 2px rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.1)",
  // Geist Sans as primary, Lausanne as distinctive alternative
  sans:"'Geist Sans','Lausanne',-apple-system,'SF Pro Display','Inter',system-ui,sans-serif",
  mono:"'Geist Mono','SF Mono','JetBrains Mono','Fira Code',monospace",
  serif:"'Newsreader','Century','Georgia',serif",
  sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
  fsXs:10,fsSm:12,fsMd:14,fsLg:16,fsXl:24,fs2xl:32,
  fwNormal:400,fwMedium:500,fwSemibold:600,fwBold:700,
};

const light={
  bg:"#FAFAF9",bgGrad:"linear-gradient(180deg,#FAFAF9 0%,#F5F5F4 100%)",
  surface:"rgba(0,0,0,.015)",surfEl:"#FFFFFF",surfHov:"rgba(0,0,0,.03)",
  border:"rgba(0,0,0,.06)",borderGlow:"rgba(0,0,0,.12)",
  gold:"#A16207",goldSoft:"rgba(161,98,7,.05)",goldGlow:"0 0 20px rgba(161,98,7,.04)",
  brown:"#3D2B1A",
  cyan:"#0369A1",magenta:"#6D28D9",
  cream:"#18181B",dim:"rgba(24,24,27,.45)",dimH:"rgba(24,24,27,.7)",
  pos:"#15803D",neg:"#DC2626",blue:"#1D4ED8",
  colors:["#A16207","#15803D","#0369A1","#6D28D9","#DC2626","#C2410C","#1D4ED8","#4D7C0F","#A16207","#7C3AED"],
  r:"14px",rS:"8px",
  shadow:"0 1px 2px rgba(0,0,0,.03),0 2px 8px rgba(0,0,0,.02)",
  sans:"'Geist Sans','Lausanne',-apple-system,'SF Pro Display','Inter',system-ui,sans-serif",
  mono:"'Geist Mono','SF Mono','JetBrains Mono','Fira Code',monospace",
  serif:"'Newsreader','Century','Georgia',serif",
  sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
  fsXs:10,fsSm:12,fsMd:14,fsLg:16,fsXl:24,fs2xl:32,
  fwNormal:400,fwMedium:500,fwSemibold:600,fwBold:700,
};

const T={...dark};

export function setThemeMode(mode){
  const source=mode==='light'?light:dark;
  Object.assign(T,source);
}

export function getTheme(mode){return mode==='light'?light:dark;}

export default T;
