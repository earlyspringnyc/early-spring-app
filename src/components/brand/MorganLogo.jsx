// Morgan Wordmark — elegant, geometric sans-serif with a production feel
// The "M" has a subtle architectural quality

export function MorganWordmark({ height = 24, color = "#E8E8EC" }) {
  return <svg height={height} viewBox="0 0 420 60" fill={color} style={{ display: "inline-block" }}>
    {/* M */}
    <path d="M0 58V2h8l28 40L64 2h8v56h-7V14L39 50h-6L7 14v44H0z" />
    {/* O */}
    <path d="M102 0c17 0 30 13 30 30s-13 30-30 30-30-13-30-30S85 0 102 0zm0 7c-13 0-23 10-23 23s10 23 23 23 23-10 23-23-10-23-23-23z" />
    {/* R */}
    <path d="M142 58V2h26c14 0 22 8 22 18 0 8-5 15-14 17l16 21h-9l-15-20h-19v20h-7zm7-26h19c9 0 15-5 15-12s-6-12-15-12h-19v24z" />
    {/* G */}
    <path d="M226 0c17 0 30 13 30 30 0 17-13 30-30 30s-30-13-30-30S209 0 226 0zm0 7c-13 0-23 10-23 23s10 23 23 23 23-10 23-23v-2h-22v6h15c-2 9-9 13-16 13-13 0-23-7-23-17s10-23 23-23z" />
    {/* A */}
    <path d="M280 58l24-56h8l24 56h-8l-6-15h-28l-6 15h-8zm16-21h22l-11-28-11 28z" />
    {/* N */}
    <path d="M344 58V2h7l38 44V2h7v56h-7L351 14v44h-7z" />
  </svg>;
}

// Morgan Isotype — abstract "M" mark with production/architectural feel
export function MorganIsotype({ size = 28, color = "#E8E8EC" }) {
  return <svg width={size} height={size} viewBox="0 0 60 60" fill="none" style={{ display: "inline-block" }}>
    <rect x="2" y="2" width="56" height="56" rx="12" stroke={color} strokeWidth="2.5" fill="none" />
    <path d="M14 44V16h3l13 20 13-20h3v28h-3V22L30 40h-2L15 22v22h-1z" fill={color} />
  </svg>;
}

export default MorganWordmark;
