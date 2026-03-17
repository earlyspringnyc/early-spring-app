const dark={
  bg:"#09090B",bgGrad:"linear-gradient(180deg,#09090B 0%,#0A0A0D 100%)",
  surface:"rgba(255,255,255,.03)",surfEl:"rgba(255,255,255,.05)",surfHov:"rgba(255,255,255,.08)",
  border:"rgba(255,255,255,.07)",borderGlow:"rgba(255,234,151,.2)",
  gold:"#E8C547",goldSoft:"rgba(232,197,71,.08)",goldGlow:"0 0 20px rgba(232,197,71,.06)",
  brown:"#432D1C",cyan:"#38BDF8",magenta:"#A78BFA",
  cream:"#FAFAF9",dim:"rgba(250,250,249,.45)",dimH:"rgba(250,250,249,.7)",
  pos:"#4ADE80",neg:"#F87171",blue:"#60A5FA",
  colors:["#E8C547","#4ADE80","#38BDF8","#A78BFA","#F87171","#FB923C","#60A5FA","#A3E635","#FBBF24","#C084FC"],
  r:"16px",rS:"10px",shadow:"0 1px 2px rgba(0,0,0,.3),0 4px 16px rgba(0,0,0,.15)",
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
  bg:"#FAFAF9",bgGrad:"linear-gradient(180deg,#FAFAF9 0%,#F5F5F4 100%)",
  surface:"rgba(0,0,0,.02)",surfEl:"#FFFFFF",surfHov:"rgba(0,0,0,.04)",
  border:"rgba(0,0,0,.08)",borderGlow:"rgba(0,0,0,.15)",
  gold:"#B8860B",goldSoft:"rgba(184,134,11,.06)",goldGlow:"0 0 20px rgba(184,134,11,.05)",
  brown:"#432D1C",cyan:"#0284C7",magenta:"#7C3AED",
  cream:"#171717",dim:"rgba(23,23,23,.5)",dimH:"rgba(23,23,23,.75)",
  pos:"#16A34A",neg:"#DC2626",blue:"#2563EB",
  colors:["#B8860B","#16A34A","#0284C7","#7C3AED","#DC2626","#EA580C","#2563EB","#65A30D","#D97706","#6D28D9"],
  r:"16px",rS:"10px",shadow:"0 1px 2px rgba(0,0,0,.04),0 4px 12px rgba(0,0,0,.03)",
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
