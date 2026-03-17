import { useState } from 'react';
import T from '../../theme/tokens.js';

function Card({ children, style = {}, glow, hoverable, onClick }) {
  const [hov, setHov] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
    background: T.surfEl,
    borderRadius: T.r,
    border: `1px solid ${hov && hoverable ? T.borderGlow : T.border}`,
    boxShadow: hov && hoverable ? T.shadow : "none",
    cursor: onClick ? "pointer" : "default",
    transition: "all .2s cubic-bezier(.4,0,.2,1)",
    transform: hov && hoverable ? "translateY(-1px)" : "none",
    ...style
  }}>{children}</div>;
}

export default Card;
