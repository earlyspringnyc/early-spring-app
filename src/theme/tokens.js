const dark={
  bg:"#08080C",bgGrad:"linear-gradient(180deg,#08080C 0%,#0C0A14 50%,#08080C 100%)",
  surface:"rgba(255,255,255,.025)",surfEl:"rgba(255,255,255,.04)",surfHov:"rgba(255,255,255,.065)",
  border:"rgba(255,255,255,.06)",borderGlow:"rgba(255,234,151,.15)",
  gold:"#FFEA97",goldSoft:"rgba(255,234,151,.08)",goldGlow:"0 0 20px rgba(255,234,151,.08)",
  brown:"#432D1C",cyan:"#67E8F9",magenta:"#D8B4FE",
  cream:"#FAFAF9",dim:"rgba(250,250,249,.4)",dimH:"rgba(250,250,249,.65)",
  pos:"#6EE7B7",neg:"#FCA5A5",blue:"#93C5FD",
  colors:["#FFEA97","#34D399","#22D3EE","#E879F9","#F87171","#FB923C","#60A5FA","#A3E635","#FBBF24","#C084FC"],
  r:"12px",rS:"8px",shadow:"0 2px 8px rgba(0,0,0,.3),0 8px 32px rgba(0,0,0,.2)",
  sans:"'Lausanne',-apple-system,'SF Pro Display','Inter',system-ui,sans-serif",
  mono:"'SF Mono','JetBrains Mono','Fira Code','Menlo',monospace",
  serif:"'Century','Georgia','Times New Roman',serif",
  // Spacing scale
  sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
  // Typography
  fsXs:9,fsSm:11,fsMd:13,fsLg:16,fsXl:24,fs2xl:28,
  fwNormal:400,fwMedium:500,fwSemibold:600,fwBold:700,
};

const light={
  bg:"#F7F6F3",bgGrad:"linear-gradient(180deg,#F7F6F3 0%,#F0EDE8 50%,#F7F6F3 100%)",
  surface:"rgba(0,0,0,.04)",surfEl:"#FFFFFF",surfHov:"rgba(0,0,0,.06)",
  border:"rgba(0,0,0,.12)",borderGlow:"rgba(67,45,28,.25)",
  gold:"#96700A",goldSoft:"rgba(150,112,10,.1)",goldGlow:"0 0 20px rgba(150,112,10,.08)",
  brown:"#432D1C",cyan:"#0E7490",magenta:"#7E22CE",
  cream:"#1A1A1A",dim:"rgba(26,26,26,.55)",dimH:"rgba(26,26,26,.75)",
  pos:"#047857",neg:"#B91C1C",blue:"#1D4ED8",
  colors:["#96700A","#047857","#0E7490","#7E22CE","#B91C1C","#C2410C","#1D4ED8","#4D7C0F","#B45309","#6D28D9"],
  r:"12px",rS:"8px",shadow:"0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.05)",
  sans:"'Lausanne',-apple-system,'SF Pro Display','Inter',system-ui,sans-serif",
  mono:"'SF Mono','JetBrains Mono','Fira Code','Menlo',monospace",
  serif:"'Century','Georgia','Times New Roman',serif",
  // Spacing scale
  sp4:4,sp8:8,sp12:12,sp16:16,sp20:20,sp24:24,sp28:28,sp32:32,sp40:40,
  // Typography
  fsXs:9,fsSm:11,fsMd:13,fsLg:16,fsXl:24,fs2xl:28,
  fwNormal:400,fwMedium:500,fwSemibold:600,fwBold:700,
};

const T={...dark};

export function setThemeMode(mode){
  const source=mode==='light'?light:dark;
  Object.assign(T,source);
}

export function getTheme(mode){return mode==='light'?light:dark;}

export default T;
