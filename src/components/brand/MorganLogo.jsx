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

// Isotype — Morgan filled "M" letterform.
// strokeWidth is accepted for backward compatibility but ignored (filled glyph).
export function MorganIsotype({ size = 28, color = "#0F52BA" }) {
  return <svg width={size} height={size * (46 / 51)} viewBox="0 0 51 46" fill="none" style={{ display: "inline-block" }}>
    <path d="M0 45.696V0H16.448L25.856 31.36H25.92L34.688 0H51.008V45.696H40.064V15.424H39.936L31.04 45.696H20.032L11.072 15.424H11.008V45.696H0Z" fill={color}/>
  </svg>;
}

export default MorganWordmark;
