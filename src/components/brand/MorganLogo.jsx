// Morgan — clean wordmark + isotype with experiential/spatial hint
// The isotype is an abstract "stage" mark — two converging planes suggesting a venue/space

export function MorganWordmark({ height = 24, color = "#E8E8EC" }) {
  const h = height;
  const scale = h / 20;
  return <svg height={h} viewBox="0 0 140 20" fill={color} style={{ display: "inline-block" }}>
    {/* M — slightly wider, architectural */}
    <path d="M0 18V2h1.8L9 14.5 16.2 2H18v16h-1.6V4.5L9.5 16h-1L1.6 4.5V18H0z" />
    {/* O */}
    <path d="M28 1.2c4.8 0 8.5 3.8 8.5 8.8s-3.7 8.8-8.5 8.8-8.5-3.8-8.5-8.8S23.2 1.2 28 1.2zm0 1.6c-3.8 0-6.8 3.2-6.8 7.2s3 7.2 6.8 7.2 6.8-3.2 6.8-7.2-3-7.2-6.8-7.2z" />
    {/* R */}
    <path d="M40 18V2h7.5c4 0 6.3 2.3 6.3 5.2 0 2.4-1.5 4.3-4 5l4.5 5.8h-2l-4.3-5.6H41.6V18H40zm1.6-7.2h5.8c2.8 0 4.7-1.5 4.7-3.6S50.2 3.6 47.4 3.6H41.6v7.2z" />
    {/* G */}
    <path d="M63.5 1.2c4.8 0 8.5 3.8 8.5 8.8 0 5-3.7 8.8-8.5 8.8S55 15 55 10s3.7-8.8 8.5-8.8zm0 1.6c-3.8 0-6.8 3.2-6.8 7.2s3 7.2 6.8 7.2c3.5 0 6.3-2.8 6.7-6.4h-6.4V9.2h8v.8c0 5-3.7 8.8-8.3 8.8z" />
    {/* A */}
    <path d="M79 18l7-16h1.6l7 16h-1.8l-1.8-4.3h-8.4L80.8 18H79zm4.5-5.8h6.6L86.8 4 83.5 12.2z" />
    {/* N */}
    <path d="M97 18V2h1.6L109.8 15V2h1.6v16h-1.6L98.6 5V18H97z" />
    {/* small dot — experiential accent */}
    <circle cx="120" cy="10" r="1.8" opacity=".5" />
  </svg>;
}

// Isotype — abstract converging planes (like a stage/venue from above)
export function MorganIsotype({ size = 28, color = "#E8E8EC" }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ display: "inline-block" }}>
    {/* Outer frame — rounded square */}
    <rect x="2" y="2" width="36" height="36" rx="8" stroke={color} strokeWidth="1.5" />
    {/* Abstract M / converging stage planes */}
    <path d="M10 28V12l10 10 10-10v16" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Small accent dot — experiential spark */}
    <circle cx="20" cy="14" r="1.2" fill={color} opacity=".4" />
  </svg>;
}

export default MorganWordmark;
