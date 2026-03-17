const dark={
  // Dark charcoal — warm gray, not pure black
  bg:"#141417",bgGrad:"linear-gradient(180deg,#141417 0%,#15151A 100%)",
  surface:"rgba(255,255,255,.025)",surfEl:"rgba(255,255,255,.04)",surfHov:"rgba(255,255,255,.065)",
  border:"rgba(255,255,255,.06)",borderGlow:"rgba(148,163,184,.2)",
  // Steel blue as primary accent
  gold:"#94A3B8",goldSoft:"rgba(148,163,184,.08)",goldGlow:"0 0 20px rgba(148,163,184,.06)",
  brown:"#1E293B",
  // Cool accent palette
  cyan:"#7DD3FC",magenta:"#C4B5FD",
  cream:"#E8E8EC",dim:"rgba(232,232,236,.35)",dimH:"rgba(232,232,236,.6)",
  pos:"#4ADE80",neg:"#F87171",blue:"#7C8DB5",
  colors:["#94A3B8","#4ADE80","#7DD3FC","#C4B5FD","#F87171","#FDBA74","#7C8DB5","#BEF264","#94A3B8","#D8B4FE"],
  r:"12px",rS:"8px",
  shadow:"0 1px 2px rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.12)",
  // Fonts
  sans:"'Geist Sans','Lausanne',-apple-system,'SF Pro Display','Inter',system-ui,sans-serif",
  mono:"'Geist Mono','SF Mono','JetBrains Mono','Fira Code',monospace",
  serif:"'Newsreader','Century','Georgia',serif",
  sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
  fsXs:10,fsSm:12,fsMd:13,fsLg:16,fsXl:24,fs2xl:32,
  fwNormal:400,fwMedium:500,fwSemibold:600,fwBold:700,
};

const light={
  bg:"#F8F8FA",bgGrad:"linear-gradient(180deg,#F8F8FA 0%,#F0F0F4 100%)",
  surface:"rgba(0,0,0,.02)",surfEl:"#FFFFFF",surfHov:"rgba(0,0,0,.035)",
  border:"rgba(0,0,0,.07)",borderGlow:"rgba(0,0,0,.14)",
  gold:"#475569",goldSoft:"rgba(71,85,105,.06)",goldGlow:"0 0 20px rgba(71,85,105,.04)",
  brown:"#1E293B",
  cyan:"#0369A1",magenta:"#6D28D9",
  cream:"#18181B",dim:"rgba(24,24,27,.45)",dimH:"rgba(24,24,27,.7)",
  pos:"#15803D",neg:"#DC2626",blue:"#475569",
  colors:["#475569","#15803D","#0369A1","#6D28D9","#DC2626","#C2410C","#1D4ED8","#4D7C0F","#475569","#7C3AED"],
  r:"12px",rS:"8px",
  shadow:"0 1px 2px rgba(0,0,0,.03),0 2px 8px rgba(0,0,0,.02)",
  sans:"'Geist Sans','Lausanne',-apple-system,'SF Pro Display','Inter',system-ui,sans-serif",
  mono:"'Geist Mono','SF Mono','JetBrains Mono','Fira Code',monospace",
  serif:"'Newsreader','Century','Georgia',serif",
  sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
  fsXs:10,fsSm:12,fsMd:13,fsLg:16,fsXl:24,fs2xl:32,
  fwNormal:400,fwMedium:500,fwSemibold:600,fwBold:700,
};

const T={...dark};

export function setThemeMode(mode){
  const source=mode==='light'?light:dark;
  Object.assign(T,source);
}

export function getTheme(mode){return mode==='light'?light:dark;}

export default T;
