import { useState } from 'react';
import T from '../../theme/tokens.js';

function Card({ children, style = {}, glow, hoverable, onClick }) {
  const [hov, setHov] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ background: T.surfEl, borderRadius: T.r, border: `1px solid ${hov && hoverable ? T.borderGlow : glow ? "rgba(255,234,151,.08)" : T.border}`, boxShadow: glow ? "0 0 24px rgba(255,234,151,.06),0 2px 8px rgba(0,0,0,.3)" : hov && hoverable ? "0 8px 32px rgba(0,0,0,.3),0 0 0 1px rgba(255,234,151,.08)" : "0 2px 8px rgba(0,0,0,.2)", cursor: onClick ? "pointer" : "default", transition: "all .3s cubic-bezier(.4,0,.2,1)", transform: hov && hoverable ? "translateY(-3px)" : "none", ...style }}>{children}</div>;
}

export default Card;
