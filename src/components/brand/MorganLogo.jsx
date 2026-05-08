// Morgan — product mark for use inside Early Spring's house brand.
// Per Lab guidelines: ink #0F52BA on paper #FFFFFF, TWK Lausanne, no greys.

const FAMILY = "'TWK Lausanne',-apple-system,'Inter',system-ui,sans-serif";

export function MorganWordmark({ height = 18, color = "#0F52BA", weight = 800, tracking = "0.42em" }) {
  return <span style={{
    fontSize: height,
    fontWeight: weight,
    color,
    fontFamily: FAMILY,
    letterSpacing: tracking,
    textIndent: tracking,
    lineHeight: 1,
    display: 'inline-block',
    userSelect: 'none',
    textTransform: 'uppercase',
  }}>Morgan</span>;
}

// Isotype — abstract "M" stage mark.
export function MorganIsotype({ size = 28, color = "#0F52BA", strokeWidth = 1.5 }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ display: "inline-block" }}>
    <rect x="2" y="2" width="36" height="36" rx="6" stroke={color} strokeWidth={strokeWidth} />
    <path d="M10 28V12l10 10 10-10v16" stroke={color} strokeWidth={strokeWidth + 0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>;
}

export default MorganWordmark;
