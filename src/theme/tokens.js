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
  bg:"#F5F4F1",bgGrad:"linear-gradient(180deg,#F5F4F1 0%,#EEECE7 50%,#F5F4F1 100%)",
  surface:"rgba(0,0,0,.03)",surfEl:"rgba(0,0,0,.04)",surfHov:"rgba(0,0,0,.07)",
  border:"rgba(0,0,0,.08)",borderGlow:"rgba(67,45,28,.2)",
  gold:"#B8860B",goldSoft:"rgba(184,134,11,.08)",goldGlow:"0 0 20px rgba(184,134,11,.08)",
  brown:"#432D1C",cyan:"#0891B2",magenta:"#9333EA",
  cream:"#1A1A1A",dim:"rgba(26,26,26,.45)",dimH:"rgba(26,26,26,.7)",
  pos:"#059669",neg:"#DC2626",blue:"#2563EB",
  colors:["#B8860B","#059669","#0891B2","#9333EA","#DC2626","#EA580C","#2563EB","#65A30D","#D97706","#7C3AED"],
  r:"12px",rS:"8px",shadow:"0 1px 4px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.04)",
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
