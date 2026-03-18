// Morgan — text-based wordmark for reliable rendering at all sizes

export function MorganWordmark({ height = 24, color = "#E8E8EC" }) {
  return <span style={{
    fontSize: height,
    fontWeight: 700,
    color,
    fontFamily: "'Geist Sans','Lausanne',-apple-system,'SF Pro Display','Inter',system-ui,sans-serif",
    letterSpacing: '-0.03em',
    lineHeight: 1,
    display: 'inline-block',
    userSelect: 'none',
  }}>MORGAN</span>;
}

// Isotype — abstract "M" stage mark
export function MorganIsotype({ size = 28, color = "#E8E8EC" }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ display: "inline-block" }}>
    <rect x="2" y="2" width="36" height="36" rx="8" stroke={color} strokeWidth="1.5" />
    <path d="M10 28V12l10 10 10-10v16" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>;
}

export default MorganWordmark;
