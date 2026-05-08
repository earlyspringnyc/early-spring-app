import { useState } from 'react';
import T from '../../theme/tokens.js';

function Card({ children, style = {}, glow, hoverable, onClick }) {
  const [hov, setHov] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
    background: T.paper,
    borderRadius: T.r,
    border: `1px solid ${hov && hoverable ? T.ink : T.faintRule}`,
    boxShadow: hov && hoverable ? T.shadow : "none",
    cursor: onClick ? "pointer" : "default",
    transition: "border-color .18s ease, box-shadow .25s cubic-bezier(.2,.8,.2,1)",
    ...style
  }}>{children}</div>;
}

export default Card;
