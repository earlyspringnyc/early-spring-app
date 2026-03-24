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
  // Warm parchment base — not stark white, not cold gray
  bg:"#F4F2EE",bgGrad:"linear-gradient(180deg,#F4F2EE 0%,#EDE9E3 100%)",
  surface:"rgba(0,0,0,.04)",surfEl:"#FDFCFA",surfHov:"rgba(0,0,0,.05)",
  border:"rgba(0,0,0,.10)",borderGlow:"rgba(100,80,50,.25)",
  // Warm slate primary
  gold:"#5C4F3A",goldSoft:"rgba(92,79,58,.09)",goldGlow:"0 0 20px rgba(92,79,58,.08)",
  brown:"#2C1F0E",
  cyan:"#1D6FA4",magenta:"#6D3AB5",
  cream:"#1C1917",dim:"rgba(28,25,23,.45)",dimH:"rgba(28,25,23,.65)",
  pos:"#1A6B3C",neg:"#C62828",blue:"#4A5568",
  colors:["#5C4F3A","#1A6B3C","#1D6FA4","#6D3AB5","#C62828","#B45309","#1D4ED8","#4D7C0F","#0E7490","#7C3AED"],
  r:"12px",rS:"8px",
  // Real depth — cards lift off the page
  shadow:"0 1px 3px rgba(0,0,0,.07),0 4px 16px rgba(0,0,0,.06)",
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
